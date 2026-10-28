import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.AGENTE_PONTE_FILE = path.join(mkdtempSync(path.join(tmpdir(), 'ponte-')), 'p.json');
delete process.env.AGENTE_URL; delete process.env.AGENTE_TOKEN;
const { normalizaUrl, gravaPonte, configPonte, limpaCachePonte } = await import('../src/services/ponteAgente.js');

test('normaliza o endereço do agente', () => {
  assert.equal(normalizaUrl('192.168.15.8'), 'http://192.168.15.8:9101');
  assert.equal(normalizaUrl(' 192.168.15.8:9200/ '), 'http://192.168.15.8:9200');
  assert.equal(normalizaUrl('http://pc-loja:9101'), 'http://pc-loja:9101');
  assert.equal(normalizaUrl(''), '');
  assert.throws(() => normalizaUrl('http://a b'), /inválido/);
});
test('grava, relê do disco, mantém token quando vazio e valida tamanho', async () => {
  assert.equal((await configPonte()).origem, 'nenhuma');
  await gravaPonte({ url: '192.168.15.8', token: 'x'.repeat(24) });
  limpaCachePonte();
  assert.deepEqual(await configPonte(), { url: 'http://192.168.15.8:9101', token: 'x'.repeat(24), origem: 'arquivo' });
  await gravaPonte({ url: '10.0.0.5:9101', token: '' });
  assert.equal((await configPonte()).token, 'x'.repeat(24));
  await assert.rejects(() => gravaPonte({ token: 'curto' }), /16/);
});
