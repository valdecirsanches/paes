import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TELAS, statusIa, promptSistema, perguntar, narrar, listarVozes } from '../src/services/ajudaIa.js';
import { lerVozCfg, gravarVozCfg, normaliza } from '../src/services/ajudaVozStore.js';

const salva = { ...process.env }; const fetchOrig = globalThis.fetch;
test.beforeEach(() => { process.env.AJUDA_DIR = mkdtempSync(path.join(tmpdir(), 'ajuda-')); delete process.env.ELEVENLABS_VOICE_ID; });
test.afterEach(() => { process.env = { ...salva }; globalThis.fetch = fetchOrig; });

test('base de ajuda: toda tela tem título, resumo, passos e dicas', () => {
  for (const [k, t] of Object.entries(TELAS)) { assert.ok(t.titulo && t.resumo, k); assert.ok(Array.isArray(t.passos) && t.passos.length, k); assert.ok(Array.isArray(t.dicas), k); }
  for (const k of ['geral', 'nfe', 'diaria', 'producao', 'cargas', 'faturamento']) assert.ok(TELAS[k], k);
});
test('prompt traz a tela atual e proíbe inventar', () => {
  const p = promptSistema('nfe');
  assert.match(p, /Nota Fiscal Eletrônica/); assert.match(p, /Nunca invente/);
});
test('status reflete as chaves; sem chave → 503', async () => {
  delete process.env.OPENAI_API_KEY; delete process.env.ELEVENLABS_API_KEY;
  assert.deepEqual(await statusIa(), { chat: false, voz: false });
  await assert.rejects(perguntar('nfe', [{ role: 'user', content: 'oi' }]), { status: 503 });
  await assert.rejects(narrar('oi'), { status: 503 });
});
test('perguntar monta a chamada à OpenAI e devolve o texto', async () => {
  process.env.OPENAI_API_KEY = 'k';
  let corpo, cab;
  globalThis.fetch = async (u, o) => { corpo = JSON.parse(o.body); cab = o.headers; return new Response(JSON.stringify({ choices: [{ message: { content: ' Clique em Autorizar. ' } }] }), { status: 200 }); };
  const r = await perguntar('nfe', [{ role: 'user', content: 'como autorizo?' }]);
  assert.equal(r, 'Clique em Autorizar.'); assert.equal(cab.Authorization, 'Bearer k');
  assert.equal(corpo.messages[0].role, 'system'); assert.equal(corpo.messages.at(-1).content, 'como autorizo?');
  await assert.rejects(perguntar('nfe', [{ role: 'assistant', content: 'x' }]), { status: 422 });
});
test('narrar chama a ElevenLabs e guarda em cache', async () => {
  process.env.ELEVENLABS_API_KEY = 'k'; process.env.ELEVENLABS_VOICE_ID = 'voz1';
  let n = 0, url;
  globalThis.fetch = async (u) => { n += 1; url = String(u); return new Response(Buffer.from([1, 2, 3]), { status: 200 }); };
  const a = await narrar('Olá  mundo'); const b = await narrar('Olá mundo');
  assert.equal(a.length, 3); assert.equal(n, 1); assert.match(url, /text-to-speech\/voz1/); assert.equal(b, a);
});

test('voz escolhida pelo administrador: grava, limita valores e vale mais que o .env', async () => {
  process.env.ELEVENLABS_VOICE_ID = 'doEnv';
  assert.equal((await lerVozCfg()).voiceId, 'doEnv');
  await assert.rejects(gravarVozCfg({ voiceId: '' }), { status: 422 });
  await gravarVozCfg({ voiceId: 'abc 123!', voiceNome: 'Ana', estabilidade: 9, velocidade: 0.1, modelo: 'xx' });
  const c = await lerVozCfg();
  assert.equal(c.voiceId, 'abc123'); assert.equal(c.estabilidade, 1); assert.equal(c.velocidade, 0.7); assert.equal(c.modelo, 'eleven_multilingual_v2');
  process.env.ELEVENLABS_API_KEY = 'k';
  let corpo, url;
  globalThis.fetch = async (u, o) => { url = String(u); corpo = JSON.parse(o.body); return new Response(Buffer.from([9]), { status: 200 }); };
  await narrar('Teste de voz');
  assert.match(url, /text-to-speech\/abc123/); assert.equal(corpo.voice_settings.stability, 1);
  assert.equal(normaliza({ voiceId: 'x' }).similaridade, 0.75);
});
test('listarVozes devolve as vozes da conta em ordem alfabética', async () => {
  process.env.ELEVENLABS_API_KEY = 'k';
  globalThis.fetch = async () => new Response(JSON.stringify({ voices: [{ voice_id: 'b', name: 'Bia', labels: { language: 'pt', gender: 'female' } }, { voice_id: 'a', name: 'Ana', category: 'premade' }] }), { status: 200 });
  const v = await listarVozes();
  assert.deepEqual(v.map((x) => x.nome), ['Ana', 'Bia']); assert.equal(v[1].idioma, 'pt');
});
