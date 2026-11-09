import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizaTema } from '../src/services/temaUsuario.js';

test('normalizaTema: aceita tema válido e aplica padrões', () => {
  assert.deepEqual(normalizaTema({ btn: '#C8742B', barra: '#1a73c9' }), { btn: '#c8742b', barra: '#1a73c9', modo: 'claro', fonte: 100 });
  assert.deepEqual(normalizaTema({ btn: '#111111', barra: '#222222', modo: 'escuro', fonte: 110 }).modo, 'escuro');
});
test('normalizaTema: rejeita cor, modo e fonte inválidos', () => {
  assert.throws(() => normalizaTema(null));
  assert.throws(() => normalizaTema({ btn: 'red', barra: '#1a73c9' }));
  assert.throws(() => normalizaTema({ btn: '#c8742b', barra: '#12' }));
  assert.throws(() => normalizaTema({ btn: '#c8742b', barra: '#1a73c9', modo: 'neon' }));
  assert.throws(() => normalizaTema({ btn: '#c8742b', barra: '#1a73c9', fonte: 500 }));
});
