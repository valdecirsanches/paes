import test from 'node:test';
import assert from 'node:assert/strict';
import { achaPorDigitacao } from './digitaNaLista.js';
const l = [{ t: 'Hotel Bela Vista' }, { t: 'Escola Pequeno Príncipe' }, { t: 'Padaria Bela' }];
const tx = (r) => r.t;
test('acha por palavras sem acento', () => {
  assert.equal(achaPorDigitacao(l, tx, 'principe').t, 'Escola Pequeno Príncipe');
  assert.equal(achaPorDigitacao(l, tx, 'bela vi').t, 'Hotel Bela Vista');
});
test('prefere quem começa com o texto', () => assert.equal(achaPorDigitacao(l, tx, 'pad').t, 'Padaria Bela'));
test('vazio ou sem resultado', () => { assert.equal(achaPorDigitacao(l, tx, ''), null); assert.equal(achaPorDigitacao(l, tx, 'zzz'), null); });
