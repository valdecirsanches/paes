import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { lerPlanilha, lerTexto, nfDe, numeroBr } from '../src/services/nfsConfirmadas.js';

test('numeroBr: número puro, texto BR e sinal descartado', () => {
  assert.equal(numeroBr(12.5), 12.5);
  assert.equal(numeroBr('1.234,56'), 1234.56);
  assert.equal(numeroBr('1.234'), 1234);
  assert.equal(numeroBr('-87,10'), 87.1);
  assert.equal(numeroBr('R$ 90,00'), 90);
  assert.equal(numeroBr(''), null);
  assert.equal(numeroBr('abc'), null);
});
test('nfDe: com traço perde os 4 últimos caracteres', () => {
  assert.equal(nfDe('167778-001'), '167778');
  assert.equal(nfDe(167778), '167778');
  assert.equal(nfDe(' 4321 '), '4321');
});
const planilha = (linhas) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), 'P1'); return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }); };
test('planilha: NF | bruto | líquido ignora cabeçalho e calcula desconto', () => {
  const buf = planilha([['NF', 'Bruto', 'Líquido'], ['167778-001', '1.000,00', 880], [167779, 500, 440.5], ['x', 1, 2]]);
  assert.deepEqual(lerPlanilha(buf, 'planilha'), [
    { nf: '167778', bruto: 1000, liquido: 880, desconto: 120 },
    { nf: '167779', bruto: 500, liquido: 440.5, desconto: 59.5 },
  ]);
});
test('planilha2: cabeçalho na linha 1, NF na 3ª coluna, bruto 6ª, líquido 7ª', () => {
  const buf = planilha([['a', 'b', 'NF', 'd', 'e', 'bruto', 'liq'], [1, 2, '123456-9', 4, 5, 100, 88]]);
  assert.deepEqual(lerPlanilha(buf, 'planilha2'), [{ nf: '123456', bruto: 100, liquido: 88, desconto: 12 }]);
});
test('txt: colunas fixas, só linhas iniciadas por dígito', () => {
  const l = (s, n) => s.padEnd(n);
  const linha = l('1234567', 36) + l('1.000,00', 14) + l('120,00', 10) + l('880,00', 13);
  assert.deepEqual(lerTexto(`CABEC\n${linha}\n`, 'txt'), [{ nf: '1234567', bruto: 1000, liquido: 880, desconto: 120 }]);
});
