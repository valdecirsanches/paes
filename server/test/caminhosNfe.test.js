import test from 'node:test';
import assert from 'node:assert/strict';
import { paraBanco, paraLocal } from '../src/services/caminhosNfe.js';

test('sem prefixo: caminho local com barras normais', () => {
  delete process.env.NFE_XML_DB_PREFIXO; process.env.NFE_XML_DIR = '/srv/nfe';
  assert.equal(paraBanco('/srv/nfe/0370/producao/a.xml'), '/srv/nfe/0370/producao/a.xml');
  assert.equal(paraLocal('/srv/nfe/0370/producao/a.xml'), '/srv/nfe/0370/producao/a.xml');
});
test('prefixo de rede Windows: banco recebe \\\\servidor\\nfe\\… e a leitura volta para a pasta local', () => {
  process.env.NFE_XML_DIR = '/srv/nfe'; process.env.NFE_XML_DB_PREFIXO = '\\\\192.168.15.8\\nfe';
  const b = paraBanco('/srv/nfe/0370/producao/a.xml');
  assert.equal(b, '\\\\192.168.15.8\\nfe\\0370\\producao\\a.xml');
  assert.equal(paraLocal(b), '/srv/nfe/0370/producao/a.xml');
  assert.equal(paraLocal('/outro/b.xml'), '/outro/b.xml');
});
test('prefixo com letra de unidade', () => {
  process.env.NFE_XML_DIR = '/srv/nfe'; process.env.NFE_XML_DB_PREFIXO = 'Z:\\NFe\\';
  assert.equal(paraBanco('/srv/nfe/x/y.pdf'), 'Z:\\NFe\\x\\y.pdf');
  assert.equal(paraLocal('z:\\nfe\\x\\y.pdf'), '/srv/nfe/x/y.pdf');
  delete process.env.NFE_XML_DB_PREFIXO; delete process.env.NFE_XML_DIR;
});

import { caminhoXmlLegado } from '../src/services/caminhosNfe.js';
test('XML no padrão do sistema antigo: pasta ddmmaaaa e <chave>-nfe.xml, banco com N:/', () => {
  process.env.NFE_ARQUIVOS_DIR = '/mnt/arqs'; delete process.env.NFE_ARQUIVOS_DB_PREFIXO;
  const chave = '35261003707154000106550010000712361229244540';
  const c = caminhoXmlLegado({ cnpj: '03.707.154/0001-06', dataEmissao: '2026-10-29', chave });
  assert.equal(c.banco, `N:/EDSMonitorPLUS/Arqs/03707154000106/NFe/29102026/NFe/${chave}-nfe.xml`);
  assert.equal(c.local, `/mnt/arqs/03707154000106/NFe/29102026/NFe/${chave}-nfe.xml`);
  assert.equal(paraLocal(c.banco), c.local);
  assert.equal(paraLocal(c.banco.replaceAll('/', '\\')), c.local);
  assert.throws(() => caminhoXmlLegado({ cnpj: '1', dataEmissao: null, chave }), /data de emissão/);
  delete process.env.NFE_ARQUIVOS_DIR;
});
