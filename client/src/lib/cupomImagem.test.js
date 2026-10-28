import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { cupomComoImagem } = await import('./impressora.js');

test('cupom como imagem: uma única raiz, fonte cabe em 80 mm e altura cresce com as linhas', () => {
  const a = cupomComoImagem([{ e: 'g', t: 'COMANDA: 1' }, { e: 'c', t: 'x'.repeat(59) }, { e: 'n', t: '' }], 80);
  const b = cupomComoImagem(Array.from({ length: 40 }, () => ({ e: 'c', t: 'linha' })), 80);
  assert.match(a.corpo, /^<div><div class="g">COMANDA: 1<\/div>/); assert.ok(!a.corpo.includes('&nbsp;') && a.corpo.includes('<div class="n"> </div>'));
  assert.ok(b.altura > a.altura && b.altura <= 600);
  const pt = Number(/\.c\{font-size:([\d.]+)pt/.exec(a.css)[1]);
  assert.ok(pt * 0.3528 * 0.6 * 59 <= 80 - 6 + 0.01, 'a linha de 59 colunas cabe na largura útil');
});
