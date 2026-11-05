import test from 'node:test';
import assert from 'node:assert/strict';
import { mistura } from './tema.js';

test('mistura clareia e escurece, ignora cor inválida', () => {
  assert.equal(mistura('#000000', 1), '#ffffff');
  assert.equal(mistura('#ffffff', -1), '#000000');
  assert.equal(mistura('#808080', 0), '#808080');
  assert.equal(mistura('xyz', 0.5), 'xyz');
});
