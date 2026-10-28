import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from './faturamento.js';
test('exporta funções de filtro e cor', () => {
  assert.equal(typeof F.passaFiltro, 'function');
  assert.equal(typeof F.corLinha, 'function');
  assert.equal(typeof F.rodape, 'function');
  assert.ok(F.CORES);
});
