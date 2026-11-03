import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitiza, descreve, deveRegistrar } from '../src/services/auditoria.js';

test('sanitiza: esconde segredos, encurta base64 e textos longos, limita listas', () => {
  const r = sanitiza({ usuario: 'ana', senha: '123', nested: { token: 'abc', ok: 1 }, arquivo: 'QUJD'.repeat(500), txt: 'x'.repeat(400), lista: Array.from({ length: 60 }, (_, i) => i) });
  assert.equal(r.senha, '***'); assert.equal(r.nested.token, '***'); assert.equal(r.nested.ok, 1); assert.equal(r.usuario, 'ana');
  assert.match(r.arquivo, /arquivo\/base64 de 2000/); assert.match(r.txt, /400 caracteres/); assert.equal(r.lista.length, 51);
});
test('descreve: entidade, ação genérica e id', () => {
  assert.deepEqual(descreve('POST', '/api/nfe/6492/cancelar'), { entidade: 'nfe', acao: 'POST nfe/:id/cancelar', idRegistro: '6492' });
  assert.deepEqual(descreve('PUT', '/api/cadastros/clientes/225?x=1'), { entidade: 'clientes', acao: 'PUT cadastros/clientes/:id', idRegistro: '225' });
});
test('deveRegistrar: toda gravação; só GET relevante; ignora ruído e a própria auditoria', () => {
  assert.ok(deveRegistrar('POST', '/api/status/1/fixa', 200)); assert.ok(deveRegistrar('DELETE', '/api/nfe/3', 404)); assert.ok(deveRegistrar('POST', '/api/auth/login', 401));
  assert.ok(deveRegistrar('GET', '/api/nfe/12/danfe', 200)); assert.ok(deveRegistrar('GET', '/api/relatorios/x', 200)); assert.ok(deveRegistrar('GET', '/api/status', 500));
  assert.ok(!deveRegistrar('GET', '/api/status', 200)); assert.ok(!deveRegistrar('GET', '/api/health', 200)); assert.ok(!deveRegistrar('POST', '/api/auditoria/evento', 201)); assert.ok(!deveRegistrar('GET', '/api/auth/me', 200));
});
