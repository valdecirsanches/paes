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

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { achaXmlLocal } from '../src/services/danfeLocal.js';
test('achaXmlLocal acha pela chave ou pelo nome do banco, em subpastas', async () => {
  const b = mkdtempSync(path.join(tmpdir(), 'xm-'));
  mkdirSync(path.join(b, '2026', '10'), { recursive: true }); const chave = '35261003707154000106550010000712361229244540';
  writeFileSync(path.join(b, '2026', '10', `${chave}-procNFe.xml`), '<nfeProc/>');
  writeFileSync(path.join(b, 'velho.xml'), '<NFe/>');
  assert.equal((await achaXmlLocal({ chave, bases: [b] })).toString(), '<nfeProc/>');
  assert.equal((await achaXmlLocal({ chave: '', arquivoBanco: '\\\\srv\\x\\VELHO.xml', bases: [b] })).toString(), '<NFe/>');
  assert.equal(await achaXmlLocal({ chave: '999', bases: [b] }), null);
});
