import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.AGENTE_PONTE_FILE = path.join(mkdtempSync(path.join(tmpdir(), 'tunel-')), 'p.json');
const { chamaAgente } = await import('../src/routes/impressao.js');
const { proximo, responde, agenteConectado, exigeAgente, zeraTunel } = await import('../src/services/tunelAgente.js');
const { tokenAgente } = await import('../src/services/ponteAgente.js');

// "res" mínimo para o long-poll
const fakeRes = () => { const r = { dados: null, codigo: 200, fechou: false, ouvintes: {}, json(d) { r.dados = d; r.fim?.(); return r; }, status(c) { r.codigo = c; return r; }, end() { r.fim?.(); return r; }, on(e, f) { r.ouvintes[e] = f; } }; return r; };
const espera = (res) => new Promise((ok) => { if (res.dados || res.codigo === 204) ok(); else res.fim = ok; });

test('túnel: sem agente conectado o erro é claro (503)', async () => {
  zeraTunel();
  await assert.rejects(() => chamaAgente('GET', '/status'), (e) => e.status === 503 && /Nenhum agente/.test(e.message));
});
test('túnel: o agente busca o pedido, executa e devolve o resultado', async () => {
  zeraTunel();
  const res = fakeRes(); proximo({ query: { versao: '1.2.0' } }, res); // agente conecta e fica esperando
  assert.equal(agenteConectado(), true);
  const p = chamaAgente('POST', '/imprimir', { destino: 'etq' });
  await espera(res);
  assert.equal(res.dados.metodo, 'POST'); assert.equal(res.dados.caminho, '/imprimir'); assert.deepEqual(res.dados.corpo, { destino: 'etq' });
  assert.equal(responde({ id: res.dados.id, status: 200, corpo: { ok: true } }), true);
  assert.deepEqual(await p, { ok: true });
});
test('túnel: pedido que chega antes do agente fica na fila; erro do agente vira erro com a mensagem dele', async () => {
  zeraTunel();
  responde({ id: 'nenhum' }); // marca o agente como visto agora, sem conexão aberta: o pedido fica na fila
  const p = chamaAgente('POST', '/testar', { destino: 'x' });
  const res = fakeRes(); proximo({ query: {} }, res); await espera(res); // pega da fila
  responde({ id: res.dados.id, status: 404, corpo: { message: 'Destino não encontrado.' } });
  await assert.rejects(() => p, (e) => e.status === 404 && /Destino/.test(e.message));
});
test('túnel: só as rotas liberadas passam', async () => {
  proximo({ query: {} }, fakeRes());
  await assert.rejects(() => chamaAgente('POST', '/gravar', {}), (e) => e.status === 403);
});
test('token do agente: certo passa, errado ou ausente é 401', async () => {
  const tok = await tokenAgente();
  const roda = (auth) => new Promise((ok) => { let proxChamado = false; const res = { status(c) { this.c = c; return this; }, json() { ok({ c: this.c, proxChamado }); } }; exigeAgente({ headers: { authorization: auth } }, res, () => { proxChamado = true; ok({ c: 200, proxChamado }); }); });
  assert.equal((await roda(`Bearer ${tok}`)).proxChamado, true);
  assert.equal((await roda('Bearer errado')).c, 401);
  assert.equal((await roda(undefined)).c, 401);
});
