import test from 'node:test';
import assert from 'node:assert/strict';
import { limpaCampos } from '../src/services/campos.js';

const S = { nome: 'txt', preco: 'num', qtd: 'int', ativo: 'bool', nasc: 'data', pessoa: 'enum:FISICA,JURIDICA', ok: 'bool:ATIVO,INATIVO' };
test('lista branca e vazio vira NULL', () => {
  assert.deepEqual(limpaCampos({ nome: '  Ana ', x: 1, preco: '' }, S), { nome: 'Ana', preco: null });
});
test('números aceitam vírgula; inválidos falham', () => {
  assert.equal(limpaCampos({ preco: '1,25' }, S).preco, 1.25);
  assert.throws(() => limpaCampos({ preco: 'abc' }, S), /inválido/);
  assert.throws(() => limpaCampos({ qtd: 1.5 }, S), /inteiro/);
});
test('bool, data, enum e bool com valores customizados', () => {
  assert.equal(limpaCampos({ ativo: true }, S).ativo, 'True');
  assert.equal(limpaCampos({ ativo: 'False' }, S).ativo, 'False');
  assert.equal(limpaCampos({ nasc: '1990-12-31T00:00:00' }, S).nasc, '1990-12-31');
  assert.throws(() => limpaCampos({ nasc: '31/12/1990' }, S), /Data inválida/);
  assert.throws(() => limpaCampos({ pessoa: 'X' }, S), /Valor inválido/);
  assert.equal(limpaCampos({ ok: 'ATIVO' }, S).ok, 'ATIVO');
  assert.equal(limpaCampos({ ok: false }, S).ok, 'INATIVO');
});
