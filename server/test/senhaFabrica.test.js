import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { cifra, decifra, hashNovo, confereHash } from '../src/services/senhaFabrica.js';

const k = crypto.randomBytes(32);
test('cifra/decifra da senha da Fábrica: volta igual, é aleatória e falha com chave errada ou texto adulterado', () => {
  const c = cifra('Pão@2026', k);
  assert.notEqual(c, cifra('Pão@2026', k));
  assert.equal(decifra(c, k), 'Pão@2026');
  assert.equal(decifra(c, crypto.randomBytes(32)), null);
  assert.equal(decifra(c.slice(0, -2) + '00', k), null);
  assert.equal(decifra('lixo', k), null);
  assert.ok(!c.includes('Pão'));
});
test('hash continua conferindo a senha', () => { assert.ok(confereHash('abc1', hashNovo('abc1'))); assert.ok(!confereHash('abc2', hashNovo('abc1'))); });
