import test from 'node:test';
import assert from 'node:assert/strict';
import { TELAS, statusIa, promptSistema, perguntar, narrar } from '../src/services/ajudaIa.js';

const salva = { ...process.env }; const fetchOrig = globalThis.fetch;
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
  assert.deepEqual(statusIa(), { chat: false, voz: false });
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
