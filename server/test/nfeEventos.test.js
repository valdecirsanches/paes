import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/services/nfeApi.js';

function simulaApi(handler) {
  const original = globalThis.fetch; const chamadas = [];
  process.env.NFE_API_TOKEN = 't'; process.env.NFE_API_URL = 'http://api.test';
  globalThis.fetch = async (url, opt) => { chamadas.push({ url: String(url), metodo: opt.method, corpo: opt.body, h: opt.headers }); return handler(String(url), opt); };
  return { chamadas, restaura: () => { globalThis.fetch = original; } };
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

test('reenviar usa POST /api/nfe/{id}/reenviar com ?contingencia só quando pedido', async () => {
  const s = simulaApi(() => json({ chaveAcesso: 'x' }));
  try {
    await api.reenviar('d1', false); await api.reenviar('d1', true);
    assert.equal(s.chamadas[0].url, 'http://api.test/api/nfe/d1/reenviar');
    assert.equal(s.chamadas[0].metodo, 'POST');
    assert.equal(s.chamadas[1].url, 'http://api.test/api/nfe/d1/reenviar?contingencia=true');
  } finally { s.restaura(); }
});
test('séries, inutilizações e consulta de protocolo seguem os caminhos da documentação', async () => {
  const s = simulaApi(() => json([]));
  try {
    await api.listaSeries('e1'); await api.gravaSerie('e1', { modelo: 55, serie: 1, ambiente: 2, proximoNumero: 10 });
    await api.listaInutilizacoes('e1'); await api.consultarProtocolo('e1', { chaveAcesso: '1', ambiente: 2 });
    assert.deepEqual(s.chamadas.map((c) => `${c.metodo} ${c.url.replace('http://api.test', '')}`), [
      'GET /api/empresas/e1/series', 'PUT /api/empresas/e1/series', 'GET /api/empresas/e1/inutilizacoes', 'POST /api/empresas/e1/nfe/consultar']);
    assert.deepEqual(JSON.parse(s.chamadas[1].corpo), { modelo: 55, serie: 1, ambiente: 2, proximoNumero: 10 });
  } finally { s.restaura(); }
});
test('arquivo do evento: carta-correcao.xml leva ?seq', async () => {
  const s = simulaApi(() => new Response('<x/>', { status: 200 }));
  try {
    const r = await api.arquivoEvento('d1', 'carta-correcao.xml', { seq: 2 });
    assert.equal(r.status, 200);
    assert.equal(s.chamadas[0].url, 'http://api.test/api/nfe/d1/carta-correcao.xml?seq=2');
  } finally { s.restaura(); }
});
