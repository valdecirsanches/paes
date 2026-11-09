import test from 'node:test';
import assert from 'node:assert/strict';
import { ordenaPor } from './ordena.js';

test('ordenaPor: crescente, decrescente e vazios sempre no fim', () => {
  const r = [{ h: '07:00' }, { h: '' }, { h: '05:30' }, { h: '10:00' }];
  assert.deepEqual(ordenaPor(r, (x) => x.h, 1).map((x) => x.h), ['05:30', '07:00', '10:00', '']);
  assert.deepEqual(ordenaPor(r, (x) => x.h, -1).map((x) => x.h), ['10:00', '07:00', '05:30', '']);
});
test('ordenaPor: descrição ignora maiúsculas/acentos e mantém a ordem original no empate', () => {
  const r = [{ d: 'pão', i: 1 }, { d: 'Bolo', i: 2 }, { d: 'PAO', i: 3 }];
  assert.deepEqual(ordenaPor(r, (x) => x.d, 1).map((x) => x.i), [2, 1, 3]);
});
