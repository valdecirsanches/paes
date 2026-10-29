import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { danfeDoXml } from '../src/services/danfeLocal.js';

const AMOSTRA = new URL('./fixtures/nfe-amostra.xml', import.meta.url).pathname;
test('rejeita XML que não é NF-e', async () => {
  await assert.rejects(() => danfeDoXml('<x/>'), /XML inválido/);
  await assert.rejects(() => danfeDoXml(''), /XML inválido/);
});
test('gera PDF a partir de nfeProc', { skip: !existsSync(AMOSTRA) }, async () => {
  const pdf = await danfeDoXml(readFileSync(AMOSTRA));
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdf.length > 5000);
});
