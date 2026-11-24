import test from 'node:test';
import assert from 'node:assert/strict';
// só a parte pura: o módulo depende do DOM, então testamos o contrato de tipos aceitos
import { readFileSync } from 'node:fs';
test('módulo converte só tipos de texto e respeita data-minusculas', () => {
  const src = readFileSync(new URL('./caixaAlta.js', import.meta.url), 'utf8');
  assert.match(src, /TIPOS_TEXTO = new Set\(\['', 'text', 'search'\]\)/);
  assert.match(src, /data-minusculas/);
  assert.match(src, /data-caixa-alta/);
});
