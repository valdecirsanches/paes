import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gravarImagem, lerImagem, lerMeta, removerImagem, tipoImagem } from '../src/services/telaPrincipal.js';

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(20)]);
test('tipoImagem reconhece png/jpeg/webp pelos bytes e recusa o resto', () => {
  assert.equal(tipoImagem(PNG), 'image/png');
  assert.equal(tipoImagem(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)])), 'image/jpeg');
  assert.equal(tipoImagem(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(10)])), 'image/webp');
  assert.equal(tipoImagem(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(tipoImagem(Buffer.from('MZ...........')), null);
});
test('grava, lê e remove a imagem', async () => {
  process.env.NFE_DANFE_DIR = mkdtempSync(path.join(os.tmpdir(), 'tp-'));
  assert.equal(await lerMeta(), null);
  const m = await gravarImagem(PNG, 'pao.png', 'image/png');
  assert.equal(m.tipo, 'image/png'); assert.ok((await lerImagem()).equals(PNG));
  await removerImagem(); assert.equal(await lerMeta(), null); assert.equal(await lerImagem(), null);
  delete process.env.NFE_DANFE_DIR;
});
