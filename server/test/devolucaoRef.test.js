import test from 'node:test';
import assert from 'node:assert/strict';
import { devolucoesDe, chaveValida, analisaReferencias, candidatasOriginal, errosDaAnalise } from '../src/services/devolucaoRef.js';

// gera uma chave de 44 dígitos com DV correto
function chave(base43) {
  let soma = 0; let peso = 2;
  for (let i = 42; i >= 0; i -= 1) { soma += Number(base43[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = soma % 11; return base43 + (r === 0 || r === 1 ? 0 : 11 - r);
}
const OK = chave('3526111234567800019055001000001234100000123');

test('chaveValida confere 44 dígitos e o dígito verificador', () => {
  assert.equal(chaveValida(OK), true);
  assert.equal(chaveValida(OK.slice(0, 43) + ((Number(OK[43]) + 1) % 10)), false);
  assert.equal(chaveValida('123'), false);
  assert.equal(chaveValida(''), false);
});

const dbCom = (orig, outras = [], itensOrig = []) => ({
  async query(sql) {
    if (/from tb_nfe where nfe_chave/.test(sql)) return [[orig]];
    if (/from tb_nfe_referencia/.test(sql)) return [outras];
    if (/from tb_nfe_itens/.test(sql)) return [itensOrig];
    return [[]];
  },
});
const dev = { id: 50, cliente_cnpj: '12.345.678/0001-90' };

test('analisaReferencias: original certa não gera erro; quantidade maior e devolução duplicada geram aviso', async () => {
  const orig = { id: 7, nfe_numero: 1234, nfe_serie: 1, data_emissao: '2026-11-05', cliente_razao_social: 'X', cliente_cnpj: '12345678000190', nf_valor_total: 100, status_e: 'DEVOLVIDO' };
  const [a] = await analisaReferencias(dev, [{ refNFe: OK }], [{ produto_codigo: 'A', qtde: 12 }], dbCom(orig, [{ id: 40, nfe_numero: 99, status_e: 'AUTORIZADA' }], [{ produto_codigo: 'A', qtde: 10 }]));
  assert.equal(a.erros.length, 0);
  assert.equal(a.avisos.length, 2);
  assert.equal(a.original.numero, 1234);
});
test('analisaReferencias: chave inválida, cliente diferente e original cancelada bloqueiam', async () => {
  const [inv] = await analisaReferencias(dev, [{ refNFe: '1'.repeat(44) }], [], dbCom(null));
  assert.equal(inv.valida, false); assert.equal(inv.erros.length, 1);
  const o = { id: 7, status_e: 'CANCELADA', cliente_cnpj: '99999999000199' };
  const [b] = await analisaReferencias(dev, [{ refNFe: OK }], [], dbCom(o));
  assert.equal(b.erros.length, 2);
  assert.match(errosDaAnalise([b])[0], /NFe referenciada/);
});
test('analisaReferencias: nota que não está na base só avisa', async () => {
  const [a] = await analisaReferencias(dev, [{ refNFe: OK }], [], dbCom(undefined));
  assert.equal(a.encontrada, false); assert.equal(a.erros.length, 0); assert.equal(a.avisos.length, 1);
});
test('candidatasOriginal: sem CNPJ não busca', async () => {
  assert.deepEqual(await candidatasOriginal({ id: 1 }, { query: async () => { throw new Error('não deveria consultar'); } }), []);
});

test('devolucoesDe: lista as devoluções que referenciam a nota; sem chave válida não consulta', async () => {
  const k = chave('3'.repeat(43));
  const db = { query: async (sql, p) => { assert.equal(p[0], k); return [[{ id: 9, nfe_numero: 55, nfe_serie: 1, data_emissao: '2026-11-01', nf_valor_total: 10, status_e: 'AUTORIZADA' }]]; } };
  const r = await devolucoesDe({ id: 1, nfe_chave: k }, db);
  assert.equal(r.length, 1); assert.equal(r[0].id, 9); assert.equal(r[0].numero, 55);
  assert.deepEqual(await devolucoesDe({ id: 1, nfe_chave: '' }, { query: () => { throw new Error('não deveria consultar'); } }), []);
});
