import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.AGENTE_PONTE_FILE = path.join(mkdtempSync(path.join(tmpdir(), 'ponte-')), 'p.json');
delete process.env.AGENTE_TOKEN;
const { tokenAgente, novoTokenAgente, limpaCachePonte } = await import('../src/services/ponteAgente.js');

test('token do agente: gerado uma vez, gravado em disco, trocável', async () => {
  const t1 = await tokenAgente();
  assert.ok(t1.length >= 16 && /^[A-Za-z0-9_-]+$/.test(t1));
  limpaCachePonte();
  assert.equal(await tokenAgente(), t1); // relido do arquivo
  const t2 = await novoTokenAgente();
  assert.notEqual(t2, t1);
  limpaCachePonte();
  assert.equal(await tokenAgente(), t2);
});
