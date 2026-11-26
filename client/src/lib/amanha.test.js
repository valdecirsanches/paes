import test from 'node:test';
import assert from 'node:assert/strict';
import { amanha, hoje, somaDias } from './rules.js';

test('amanha() é o dia seguinte a hoje(), inclusive na virada de mês/ano', () => {
  assert.equal(amanha(), somaDias(hoje(), 1));
  assert.equal(somaDias('2026-11-30', 1), '2026-12-01');
  assert.equal(somaDias('2026-12-31', 1), '2027-01-01');
});
