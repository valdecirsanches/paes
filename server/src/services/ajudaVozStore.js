import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Voz do assistente escolhida pelo administrador (arquivo, sem mexer no banco). Tem prioridade sobre ELEVENLABS_VOICE_ID do .env. */
const dir = () => process.env.AJUDA_DIR || process.env.NFE_DANFE_DIR || process.cwd();
const arq = () => path.join(dir(), 'ajuda-voz.json');
export const MODELOS = ['eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_flash_v2_5'];
const num = (v, min, max, pad) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : pad; };

export const normaliza = (c = {}) => ({
  voiceId: String(c.voiceId ?? '').replace(/[^\w-]/g, '').slice(0, 64),
  voiceNome: String(c.voiceNome ?? '').slice(0, 80),
  modelo: MODELOS.includes(c.modelo) ? c.modelo : (process.env.ELEVENLABS_MODEL || MODELOS[0]),
  estabilidade: num(c.estabilidade, 0, 1, 0.5),
  similaridade: num(c.similaridade, 0, 1, 0.75),
  velocidade: num(c.velocidade, 0.7, 1.2, 1),
});
export async function lerVozCfg() {
  let c = {}; try { c = JSON.parse(await readFile(arq(), 'utf8')); } catch { /* ainda não escolhida */ }
  const n = normaliza(c);
  if (!n.voiceId) { n.voiceId = process.env.ELEVENLABS_VOICE_ID || ''; n.padraoEnv = Boolean(n.voiceId); }
  return n;
}
export async function gravarVozCfg(c) {
  const n = normaliza(c);
  if (!n.voiceId) throw Object.assign(new Error('Escolha uma voz.'), { status: 422 });
  await writeFile(arq(), JSON.stringify({ ...n, atualizadoEm: new Date().toISOString() }, null, 2));
  return n;
}
