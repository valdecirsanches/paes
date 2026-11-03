import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acharArquivoNota, partesData, nomesPastaData } from '../src/services/arquivosApi.js';

const CH = '35261003707154000106550010000012341000012345';
const base = mkdtempSync(path.join(os.tmpdir(), 'arqs-'));
process.env.NFE_ARQUIVOS_DIR = base;
const nfeDir = (...p) => { const d = path.join(base, '03707154000106', 'NFe', ...p); mkdirSync(d, { recursive: true }); return d; };

test('partesData entende formatos', () => {
  assert.deepEqual(partesData('2026-10-28 15:00:00'), { a: '2026', m: '10', d: '28' });
  assert.deepEqual(partesData('28/10/2026'), { a: '2026', m: '10', d: '28' });
  assert.deepEqual(partesData(new Date(2026, 9, 28)), { a: '2026', m: '10', d: '28' });
  assert.equal(partesData(null), null);
  assert.ok(nomesPastaData({ a: '2026', m: '10', d: '28' }).includes('20261028'));
});
test('acha pelo formato de data aaaa-mm-dd / NFe', async () => {
  writeFileSync(path.join(nfeDir('2026-10-28', 'NFe'), `${CH}-procNFe.xml`), '<x/>');
  writeFileSync(path.join(nfeDir('2026-10-28', 'Evento'), `${CH}-110111-canc.xml`), '<e/>');
  const r = await acharArquivoNota({ chave: CH, cnpj: '03.707.154/0001-06', datas: ['2026-10-28 10:00:00'] });
  assert.ok(r.arquivo.endsWith(`${CH}-procNFe.xml`), r.arquivo);
});
test('acha por varredura quando a data não bate e ignora evento', async () => {
  const ch2 = '35261003707154000106550010000012351000012346';
  writeFileSync(path.join(nfeDir('20261101', 'NFe'), `${ch2}.xml`), '<x/>');
  writeFileSync(path.join(nfeDir('20261101', 'Evento'), `${ch2}-ev.xml`), '<e/>');
  const r = await acharArquivoNota({ chave: ch2, cnpj: '03707154000106', datas: ['2026-01-01'] });
  assert.ok(r.arquivo.endsWith(`${ch2}.xml`), r.arquivo);
});
test('não achou: explica', async () => {
  const r = await acharArquivoNota({ chave: '1'.repeat(44), cnpj: '03707154000106', datas: [] });
  assert.equal(r.arquivo, null); assert.match(r.motivo, /Nenhum XML/);
  const r2 = await acharArquivoNota({ chave: CH, cnpj: '99999999999999', datas: [] });
  assert.match(r2.motivo, /Não achei a pasta do CNPJ 99999999999999/);
});

import { achaRaizCnpj } from '../src/services/arquivosApi.js';
test('achaRaizCnpj: base direta, base já é o CNPJ, base com NFe/ e CNPJ mais fundo', async () => {
  const b = mkdtempSync(path.join(os.tmpdir(), 'raiz-'));
  const fundo = path.join(b, 'a', 'EDSMonitorPLUS', 'Arqs', '03707154000106'); mkdirSync(fundo, { recursive: true });
  assert.equal(await achaRaizCnpj(b, '03707154000106'), fundo);
  assert.equal(await achaRaizCnpj(fundo, '03707154000106'), fundo);
  const plano = path.join(b, 'plano'); mkdirSync(path.join(plano, 'NFe'), { recursive: true });
  assert.equal(await achaRaizCnpj(plano, '03707154000106'), plano);
  assert.equal(await achaRaizCnpj(path.join(b, 'nao-existe'), '03707154000106'), null);
  assert.equal(await achaRaizCnpj(path.join(b, 'a'), '99999999999999'), null);
});
