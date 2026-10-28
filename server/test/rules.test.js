import test from 'node:test';
import assert from 'node:assert/strict';
import * as r from '../src/rules.js';

test('dia da semana: domingo=1, segunda=2', () => {
  assert.equal(r.semanaDia('2026-10-25'), 1);
  assert.equal(r.semanaDia('2026-10-26'), 2);
});

test('addDays atravessa virada de ano e fevereiro', () => {
  assert.equal(r.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(r.addDays('2026-03-01', -1), '2026-02-28');
});

test('turno de produção pela hora', () => {
  assert.deepEqual(
    ['07:00:00', '07:00:01', '10:00:00', '10:00:01', '00:30:00'].map(r.turnoPorHora),
    [1, 2, 2, 3, 1]);
});

test('carga pela hora', () => {
  assert.deepEqual(
    ['00:30:00', '07:59:30', '08:00:00', '10:59:59', '11:00:00'].map(r.cargaPorHora),
    [1, 1, 2, 2, 3]);
});

test('descrição para expedição junta referência e opções marcadas', () => {
  assert.equal(
    r.descricaoExpedicao('PAO FRANCES', { extra_cortado: 'True', extra_coco: 'False', extra_pacote: 'True' }),
    'PAO FRANCES CORTADO EMB/PCT/PLASTICO');
});

test('preço unitário com divisor zero cai para 1', () => {
  assert.equal(r.unitario(10, 0), 10);
  assert.equal(r.unitario(10, 4), 2.5);
});

test('hhmmss completa segundos', () => {
  assert.equal(r.hhmmss('08:30'), '08:30:00');
  assert.equal(r.hhmmss('08:30:15'), '08:30:15');
});

test('isIsoDate rejeita datas inexistentes', () => {
  assert.equal(r.isIsoDate('2026-02-30'), false);
  assert.equal(r.isIsoDate('lixo'), false);
  assert.equal(r.isIsoDate('2026-10-26'), true);
});

import { linhaDeAlteracao } from '../src/rules.js';
test('lista de alterações: fixa sem mudança fica de fora; extra, avulso e cancelado entram', () => {
  const base = { produto_producao: 'True', status_x: 1, programacao_fixa: 'True', qtde_alterada: 0, cancelado: 'False' };
  assert.equal(linhaDeAlteracao(base), false);
  assert.equal(linhaDeAlteracao({ ...base, qtde_alterada: 5 }), true);
  assert.equal(linhaDeAlteracao({ ...base, programacao_fixa: 'False' }), true);
  assert.equal(linhaDeAlteracao({ ...base, cancelado: 'True' }), true);
  assert.equal(linhaDeAlteracao({ ...base, status_x: 0, qtde_alterada: 5 }), false);
  assert.equal(linhaDeAlteracao(base, true), true);
  assert.equal(linhaDeAlteracao({ ...base, imprimir_toda_programacao: 'True' }), true);
});
