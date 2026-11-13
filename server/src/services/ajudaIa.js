import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { AppError } from '../errors.js';

/** Base de conhecimento: uma única fonte (data/ajuda-telas.json) usada pela ajuda F1 do app e como contexto da IA. */
export const TELAS = JSON.parse(readFileSync(new URL('../data/ajuda-telas.json', import.meta.url), 'utf8'));

export const statusIa = () => ({ chat: Boolean(process.env.OPENAI_API_KEY), voz: Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID) });

const textoTela = (id) => { const t = TELAS[id]; return t ? `Tela "${t.titulo}": ${t.resumo} Passos: ${t.passos.join(' ')} Dicas: ${t.dicas.join(' ')}` : ''; };
/** Instruções da IA: só ajuda de uso do sistema, em português, sem inventar. Nenhum dado de clientes/notas é enviado. */
export function promptSistema(telaId) {
  const todas = Object.entries(TELAS).filter(([k]) => k !== 'geral').map(([, t]) => `- ${t.titulo}: ${t.resumo}`).join('\n');
  return `Você é o assistente de ajuda do sistema Gestor WinBakery (AppBakery) de uma padaria. Responda sempre em português do Brasil, de forma curta, clara e com passos numerados quando for ensinar algo. `
    + `Use somente o que está no conhecimento abaixo; se a resposta não estiver nele, diga que não sabe e sugira falar com o suporte. Nunca invente botões, menus ou regras. Você não tem acesso aos dados da padaria (clientes, notas, valores) e não deve pedi-los.\n\n`
    + `${textoTela('geral')}\n\nTela em que o usuário está agora: ${textoTela(telaId) || 'não informada'}\n\nTodas as telas:\n${todas}`;
}

const msgsLimpas = (m) => (Array.isArray(m) ? m : []).slice(-10).map((x) => ({ role: x?.role === 'assistant' ? 'assistant' : 'user', content: String(x?.content ?? '').slice(0, 1500) })).filter((x) => x.content.trim());

export async function perguntar(telaId, mensagens) {
  const chave = process.env.OPENAI_API_KEY;
  if (!chave) throw new AppError(503, 'A IA de ajuda não está configurada: defina OPENAI_API_KEY no server/.env.');
  const msgs = msgsLimpas(mensagens);
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') throw new AppError(422, 'Escreva a pergunta.');
  let r;
  try {
    r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(45000),
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature: 0.2, max_tokens: 600, messages: [{ role: 'system', content: promptSistema(telaId) }, ...msgs] }),
    });
  } catch (e) { throw new AppError(502, `Não consegui falar com a OpenAI: ${e.name === 'TimeoutError' ? 'tempo esgotado' : e.message}`); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new AppError(502, `OpenAI recusou (HTTP ${r.status}): ${j?.error?.message ?? 'erro'}`);
  return String(j?.choices?.[0]?.message?.content ?? '').trim() || 'Não consegui responder agora.';
}

const cacheVoz = new Map(); // narrações repetidas (ajuda das telas) não gastam créditos de novo
export async function narrar(texto) {
  const chave = process.env.ELEVENLABS_API_KEY, voz = process.env.ELEVENLABS_VOICE_ID;
  if (!chave || !voz) throw new AppError(503, 'A narração não está configurada: defina ELEVENLABS_API_KEY e ELEVENLABS_VOICE_ID no server/.env.');
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim().slice(0, 2500);
  if (!t) throw new AppError(422, 'Sem texto para narrar.');
  const k = createHash('sha1').update(`${voz}|${t}`).digest('hex');
  if (cacheVoz.has(k)) return cacheVoz.get(k);
  let r;
  try {
    r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voz)}?output_format=mp3_44100_64`, {
      method: 'POST', headers: { 'xi-api-key': chave, 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, signal: AbortSignal.timeout(45000),
      body: JSON.stringify({ text: t, model_id: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2' }),
    });
  } catch (e) { throw new AppError(502, `Não consegui falar com a ElevenLabs: ${e.name === 'TimeoutError' ? 'tempo esgotado' : e.message}`); }
  if (!r.ok) throw new AppError(502, `ElevenLabs recusou (HTTP ${r.status}).`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (cacheVoz.size >= 60) cacheVoz.delete(cacheVoz.keys().next().value);
  cacheVoz.set(k, buf);
  return buf;
}
