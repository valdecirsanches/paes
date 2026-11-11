import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { migraPastasXml, pastaDiaParaMes } from '../src/services/migraXmlPastas.js';

test('pastaDiaParaMes: dia+mês+ano vira ano+mês; outros caminhos não mudam', () => {
  assert.equal(pastaDiaParaMes('N:/EDSMonitorPLUS/Arqs/03707154000106/NFe/11112026/NFe/35-nfe.xml'), 'N:/EDSMonitorPLUS/Arqs/03707154000106/NFe/202611/NFe/35-nfe.xml');
  assert.equal(pastaDiaParaMes('N:\\EDS\\Arqs\\1\\NFe\\29102026\\NFe\\35-nfe.xml'), 'N:\\EDS\\Arqs\\1\\NFe\\202610\\NFe\\35-nfe.xml');
  assert.equal(pastaDiaParaMes('N:/EDS/Arqs/1/NFe/202611/NFe/35-nfe.xml'), null);
  assert.equal(pastaDiaParaMes(''), null);
});

test('migraPastasXml: simula sem mexer; executa movendo o arquivo e acertando o banco', async () => {
  const base = mkdtempSync(path.join(tmpdir(), 'mig-'));
  process.env.NFE_ARQUIVOS_DIR = base; process.env.NFE_ARQUIVOS_DB_PREFIXO = 'N:/EDS/Arqs';
  const dia = path.join(base, '1', 'NFe', '11112026', 'NFe'); mkdirSync(dia, { recursive: true });
  writeFileSync(path.join(dia, 'k-nfe.xml'), '<x/>');
  const linhas = [{ id: 1, nfe_numero: 5, nfe_xml_file: 'N:/EDS/Arqs/1/NFe/11112026/NFe/k-nfe.xml', nfe_xml_app: '' }, { id: 2, nfe_numero: 6, nfe_xml_file: 'N:/EDS/Arqs/1/NFe/12112026/NFe/z-nfe.xml', nfe_xml_app: '' }];
  const ups = [];
  const db = { query: async (sql, p) => (/^select/.test(sql) ? [linhas] : (ups.push(p), [{}])) };
  const sim = await migraPastasXml(db, { executar: false });
  assert.equal(sim.aMover, 1); assert.equal(sim.invisiveis, 1); assert.equal(ups.length, 0); assert.ok(existsSync(path.join(dia, 'k-nfe.xml')));
  const ex = await migraPastasXml(db, { executar: true });
  assert.equal(ex.movidos, 1); assert.deepEqual(ups[0][0], { nfe_xml_file: 'N:/EDS/Arqs/1/NFe/202611/NFe/k-nfe.xml' });
  assert.ok(existsSync(path.join(base, '1', 'NFe', '202611', 'NFe', 'k-nfe.xml'))); assert.ok(!existsSync(path.join(dia, 'k-nfe.xml')));
  delete process.env.NFE_ARQUIVOS_DIR; delete process.env.NFE_ARQUIVOS_DB_PREFIXO;
});
