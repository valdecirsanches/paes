import test from 'node:test';
import assert from 'node:assert/strict';

test('devolução: item com CFOP de venda (5102 copiado) usa o CFOP da nota (1202)', async () => {
  const { cfopDoItem } = await import('../src/services/nfeJson.js');
  assert.equal(cfopDoItem({ cfop_codigo: '5102' }, { cfop_codigo: '1202' }), '1202');
  assert.equal(cfopDoItem({ cfop_codigo: '1202' }, { cfop_codigo: '1202' }), '1202');
  assert.equal(cfopDoItem({ cfop_codigo: '5102' }, { cfop_codigo: '5102' }), '5102'); // venda normal não muda
  assert.equal(cfopDoItem({ cfop_codigo: '5949' }, { cfop_codigo: '5102' }), '5949');
});
