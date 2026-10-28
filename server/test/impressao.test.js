import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chamaAgente } from '../src/routes/impressao.js';

const sobe = (handler) => new Promise((ok) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => ok(s)); });

test('ponte: repassa ao agente com token e X-Agente', async () => {
  let visto;
  const s = await sobe((req, res) => { let t = ''; req.on('data', (c) => { t += c; }); req.on('end', () => { visto = { auth: req.headers.authorization, ag: req.headers['x-agente'], corpo: t }; res.end('{"ok":true}'); }); });
  process.env.AGENTE_URL = `http://127.0.0.1:${s.address().port}/`; process.env.AGENTE_TOKEN = ' tok-123456789012345 ';
  try {
    assert.deepEqual(await chamaAgente('POST', '/imprimir', { destino: 'etq' }), { ok: true });
    assert.equal(visto.auth, 'Bearer tok-123456789012345'); assert.equal(visto.ag, 'paes'); assert.equal(visto.corpo, '{"destino":"etq"}');
  } finally { s.close(); }
});
test('ponte: token recusado, agente fora do ar e falta de configuração viram erros claros', async () => {
  const s = await sobe((_q, res) => { res.statusCode = 401; res.end('{"message":"Token inválido."}'); });
  process.env.AGENTE_URL = `http://127.0.0.1:${s.address().port}`; process.env.AGENTE_TOKEN = 'x'.repeat(20);
  await assert.rejects(() => chamaAgente('GET', '/status'), /recusou o token/);
  s.close();
  await assert.rejects(() => chamaAgente('GET', '/status', undefined, 1500), (e) => e.status === 502 && /Não consegui falar/.test(e.message));
  delete process.env.AGENTE_URL;
  await assert.rejects(() => chamaAgente('GET', '/status'), (e) => e.status === 503);
});
