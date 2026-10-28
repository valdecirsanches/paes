import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.ETQ_LAYOUT_FILE = path.join(mkdtempSync(path.join(tmpdir(), 'etq-')), 'l.json');
const { gravaLayout, lerLayout, limpaCacheLayout, limpaAjuste } = await import('../src/services/layoutEtiquetas.js');

test('grava, relê do disco e remove', async () => {
  await gravaLayout('etiqueta-mercadorias', { ajuste: { dx: '1.5', dy: 0, el: { u: { x: 2, fs: '20', lixo: 9 } } }, altura: 41 });
  limpaCacheLayout();
  assert.deepEqual(await lerLayout(), { 'etiqueta-mercadorias': { ajuste: { dx: 1.5, dy: 0, el: { u: { x: 2, fs: 20 } } }, altura: 41 } });
  await gravaLayout('etiqueta-mercadorias', { ajuste: null, altura: null });
  assert.deepEqual(await lerLayout(), {});
});
test('rejeita tipo e ajuste inválidos; ignora valores absurdos', async () => {
  await assert.rejects(() => gravaLayout('../x', { ajuste: {} }), /Tipo/);
  assert.throws(() => limpaAjuste([1]), /inválido/);
  assert.equal(limpaAjuste({ dx: 99999 }).dx, 0);
});
