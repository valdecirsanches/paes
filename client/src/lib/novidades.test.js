import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lista = JSON.parse(readFileSync(new URL('../../novidades.json', import.meta.url), 'utf8'));
test('novidades.json: fases únicas, em ordem decrescente e com texto', () => {
  const fases = lista.map((n) => n.fase);
  assert.deepEqual(fases, [...fases].sort((a, b) => b - a));
  assert.equal(new Set(fases).size, fases.length);
  for (const n of lista) { assert.ok(n.itens.length > 0); for (const t of n.itens) assert.ok(String(t).trim().length > 5); }
});

test('a fase atual do vite.config.js tem novidade escrita (a cada entrega, acrescente em novidades.json)', () => {
  const fase = Number(/const FASE = '(\d+)'/.exec(readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8'))[1]);
  assert.equal(lista[0].fase, fase);
});
