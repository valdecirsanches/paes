import test from 'node:test';
import assert from 'node:assert/strict';
import { bitsDeRgba, cupomEscPos, escposImagem, tsplImagem, zplImagem } from './rasterizar.js';

// 10x2: primeira linha toda preta, segunda toda branca
const rgba = (w, h, f) => { const a = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y) ? 0 : 255; a.set([v, v, v, 255], (y * w + x) * 4); } return a; };
const img = bitsDeRgba(rgba(10, 2, (x, y) => y === 0), 10, 2);

test('bits: 10 px → 2 bytes por linha, preto = 1, sobra zerada', () => {
  assert.equal(img.bytesPorLinha, 2);
  assert.deepEqual([...img.bits], [0xff, 0xc0, 0x00, 0x00]);
});
test('transparente conta como branco', () => {
  const a = new Uint8ClampedArray([0, 0, 0, 0]);
  assert.deepEqual([...bitsDeRgba(a, 1, 1).bits], [0]);
});
test('ESC/POS raster: cabeçalho GS v 0, dimensões e corte', () => {
  const b = escposImagem(img, { cortar: true, avanco: 3 });
  assert.deepEqual([...b.slice(0, 2)], [0x1b, 0x40]);
  assert.deepEqual([...b.slice(2, 10)], [0x1d, 0x76, 0x30, 0, 2, 0, 2, 0]);
  assert.deepEqual([...b.slice(10, 14)], [0xff, 0xc0, 0, 0]);
  assert.deepEqual([...b.slice(-4)], [0x1d, 0x56, 0x42, 0]);
});
test('ESC/POS raster: imagem alta é dividida em faixas de 255 linhas', () => {
  const alta = bitsDeRgba(rgba(8, 300, () => true), 8, 300);
  const b = escposImagem(alta);
  const cabecalhos = []; for (let i = 0; i < b.length - 7; i++) if (b[i] === 0x1d && b[i + 1] === 0x76 && b[i + 2] === 0x30) cabecalhos.push(b[i + 6]);
  assert.deepEqual(cabecalhos, [255, 45]);
});
test('ZPL: ^GFA com total/linha corretos e cópias', () => {
  const z = Buffer.from(zplImagem(img, { copias: 2 })).toString();
  assert.match(z, /^\^XA\^CI28\^PW10\^LL2/);
  assert.match(z, /\^GFA,4,4,2,FFC00000\^FS\^PQ2\^XZ$/);
});
test('TSPL: SIZE/BITMAP/PRINT e bits invertidos', () => {
  const t = tsplImagem(img, { larguraMm: 62, alturaMm: 45, copias: 3 });
  const txt = Buffer.from(t).toString('latin1');
  assert.match(txt, /^SIZE 62 mm,45 mm\r\nGAP 2 mm,0\r\nDIRECTION 1\r\nCLS\r\nBITMAP 0,0,2,2,0,/);
  assert.match(txt, /\r\nPRINT 3,1\r\n$/);
  const ini = txt.indexOf('BITMAP 0,0,2,2,0,') + 'BITMAP 0,0,2,2,0,'.length;
  assert.deepEqual([...t.slice(ini, ini + 4)], [0x00, 0x3f, 0xff, 0xff]);
  const dir = tsplImagem(img, { larguraMm: 62, alturaMm: 45, invertido: false });
  assert.deepEqual([...dir.slice(ini, ini + 4)], [0xff, 0xc0, 0, 0]);
});
test('cupom ESC/POS: cp1252 (acentos), limite de colunas, corte', () => {
  const b = cupomEscPos(['AÇÃO ÀS 5', 'x'.repeat(60)], { colunas: 10, cortar: true });
  assert.deepEqual([...b.slice(0, 7)], [0x1b, 0x40, 0x1b, 0x74, 16, 0x1b, 0x45]);
  assert.ok([...b].includes(0xc7)); // Ç
  assert.ok([...b].includes(0xc3)); // Ã
  assert.ok(![...b].some((_, i) => b.slice(i, i + 11).every((v) => v === 0x78)));
  assert.deepEqual([...b.slice(-4)], [0x1d, 0x56, 0x42, 0]);
});

test('cupomEscPos aceita linhas com estilo (g/n/c) e limita as colunas de cada estilo', () => {
  const b = cupomEscPos([{ e: 'g', t: 'COMANDA 1' }, { e: 'c', t: 'x'.repeat(80) }, { e: 'n', t: 'ok' }], { cortar: false });
  const t = Buffer.from(b).toString('latin1');
  assert.ok(t.includes('COMANDA 1\n')); assert.ok(t.includes(`${'x'.repeat(64)}\n`)); assert.ok(!t.includes('x'.repeat(65)));
  assert.ok(Buffer.from(b).includes(Buffer.from([0x1b, 0x4d, 1]))); // fonte B no condensado
});
