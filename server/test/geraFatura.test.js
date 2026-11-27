import test from 'node:test';
import assert from 'node:assert/strict';
import { ufIbge, trunc3, num, limpaMask, fone, cfopDoCliente, impostos } from '../src/services/geraFatura.js';

test('cfop por UF do cliente', () => {
  assert.equal(cfopDoCliente('SP').codigo, '5102');
  assert.equal(cfopDoCliente('RJ').codigo, '6102');
});
test('códigos IBGE e máscaras', () => {
  assert.equal(ufIbge('sp'), '35'); assert.equal(ufIbge('XX'), '0');
  assert.equal(limpaMask('12.345.678/0001-90'), '12345678000190'); assert.equal(limpaMask(''), '0');
  assert.equal(fone('(11) 3333-4444'), '1133334444');
});
test('num não repete o bug do ".0" ("10.05" ≠ 105)', () => {
  assert.equal(num('10.05'), 10.05); assert.equal(num('18,5'), 18.5); assert.equal(num(''), 0);
});
test('trunc3 trunca (não arredonda)', () => { assert.equal(trunc3(1.23999), 1.239); assert.equal(trunc3(0.9), 0.9); });
test('impostos: redução de base de ICMS e alíquotas em %', () => {
  const t = impostos(100, { red_b_c_icms: '20', aliq_icms: '18', aliq_ipi: '0', aliq_pis: '1.65', aliq_cofins: '7.6' });
  assert.equal(t.bIcms, 80);
  assert.ok(Math.abs(t.icms - 14.4) < 1e-9);
  assert.ok(Math.abs(t.pis - 1.65) < 1e-9); assert.ok(Math.abs(t.cofins - 7.6) < 1e-9); assert.equal(t.ipi, 0);
});

import { codigoMunicipio, normaliza } from '../src/services/municipios.js';
test('município: sem acento/caixa, 7 dígitos; inexistente → null', () => {
  assert.equal(codigoMunicipio('SP', 'SÃO PAULO'), '3550308');
  assert.equal(codigoMunicipio('sp', 'sao paulo'), '3550308');
  assert.equal(codigoMunicipio('MS', "Paraíso das Águas"), '5006275');
  assert.equal(codigoMunicipio('SP', 'Cidade Que Não Existe'), null);
  assert.equal(codigoMunicipio('XX', 'São Paulo'), null);
  assert.equal(normaliza("Sant'Ana do Livramento"), 'SANTANADOLIVRAMENTO');
});

import { desfazNfe } from '../src/services/geraFatura.js';
import { listaIncompletas, limpaIncompletas } from '../src/services/nfeResiduos.js';

test('desfazNfe: apaga a nota e devolve as comandas ao estado anterior, sem esconder erro de limpeza', async () => {
  const sqls = [];
  const c = { query: async (sql, a) => { sqls.push([sql, a]); if (/tb_nfe_itens/.test(sql)) throw new Error('falha qualquer'); return [[]]; } };
  await desfazNfe(c, 77, [{ id: 5, status: 'PROCESSADO', id_nfe: 0, id_nota_fiscal: 0 }]);
  const txt = sqls.map((x) => x[0]).join('\n');
  for (const t of ['tb_receita', 'tb_nfe_itens', 'tb_nfe_detalhes', 'delete from tb_nfe where id', 'update tb_comandas']) assert.match(txt, new RegExp(t));
  assert.deepEqual(sqls.at(-1)[1], ['PROCESSADO', 0, 0, 5]);
  await desfazNfe(c, 0, []); // sem id: não faz nada
});

test('notas incompletas: só as sem status/número/chave e recentes entram; limpeza solta as comandas e registra', async () => {
  const sqls = [];
  const db = {
    query: async (sql, a) => { sqls.push(sql); if (/from tb_nfe n where/.test(sql)) return [[{ id: 9, data_geracao: '2026-11-27 14:00:00' }]]; return [[]]; },
    getConnection: async () => ({ query: async (sql) => { sqls.push(sql); return /from tb_comandas/.test(sql) ? [[{ id: 3 }, { id: 4 }]] : [[]]; }, release() {} }),
  };
  await listaIncompletas(db);
  assert.match(sqls[0], /status_e is null or n\.status_e = ''/); assert.match(sqls[0], /nfe_numero, 0\) = 0/); assert.match(sqls[0], /nfe_chave, ''\) = ''/); assert.match(sqls[0], /interval 30 day/);
  const feitas = await limpaIncompletas({ minutos: 0, db });
  assert.deepEqual(feitas, [{ id: 9, comandas: [3, 4] }]);
  assert.ok(sqls.some((q) => /update tb_comandas set status = \?/.test(q)));
});

import { consultaCep, soDigitosCep } from '../src/services/cep.js';
const resp = (status, corpo) => ({ status, ok: status >= 200 && status < 300, json: async () => corpo });
test('consultaCep: ViaCEP traz o IBGE; cai na BrasilAPI e completa o IBGE pela tabela; CEP inexistente e falha de rede têm mensagens diferentes', async () => {
  assert.equal(soDigitosCep('06226-000'), '06226000'); assert.equal(soDigitosCep('123'), null);
  const via = await consultaCep('06226000', async () => resp(200, { logradouro: 'Av Cruzeiro do Sul', bairro: 'Rochdalle', localidade: 'Osasco', uf: 'SP', ibge: '3534401' }));
  assert.deepEqual(via, { cep: '06226-000', endereco: 'Av Cruzeiro do Sul', bairro: 'Rochdalle', cidade: 'Osasco', uf: 'SP', ibge: '3534401', fonte: 'ViaCEP' });
  const brasil = await consultaCep('06226000', async (u) => (/viacep/.test(u) ? resp(500, {}) : resp(200, { street: 'AV X', neighborhood: 'Y', city: 'Osasco', state: 'SP' })));
  assert.equal(brasil.fonte, 'BrasilAPI'); assert.equal(brasil.ibge, '3534401');
  await assert.rejects(() => consultaCep('99999999', async () => resp(404, {})), /CEP não encontrado/);
  await assert.rejects(() => consultaCep('99999999', async () => { throw new Error('rede'); }), /Não consegui consultar o CEP/);
  await assert.rejects(() => consultaCep('12'), /8 dígitos/);
});
