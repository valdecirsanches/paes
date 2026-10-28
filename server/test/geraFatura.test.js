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
