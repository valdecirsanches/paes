import test from 'node:test';
import assert from 'node:assert/strict';
import { amanha, hoje, somaDias } from './rules.js';

test('amanha() é o dia seguinte a hoje(), inclusive na virada de mês/ano', () => {
  assert.equal(amanha(), somaDias(hoje(), 1));
  assert.equal(somaDias('2026-11-30', 1), '2026-12-01');
  assert.equal(somaDias('2026-12-31', 1), '2027-01-01');
});

import { descricaoExpedicao } from './rules.js';
test('descricaoExpedicao: referência + opções marcadas, na ordem do cadastro', () => {
  assert.equal(descricaoExpedicao('PAO DE HOT DOG 50 GR', { extra_plastico: 'True' }), 'PAO DE HOT DOG 50 GR EMB/IND/PLASTICO');
  assert.equal(descricaoExpedicao('PAO', { extra_cortado: 'True', extra_coco: 'True', extra_papel: 'False' }), 'PAO CORTADO C/COCO');
  assert.equal(descricaoExpedicao('PAO', {}), 'PAO');
});

import { comOpcoes } from './rules.js';
test('comOpcoes: troca só o rabo das opções, sem duplicar nem perder o texto digitado', () => {
  assert.equal(comOpcoes('PAO DE HOT DOG 50 GR', { extra_plastico: 'True' }), 'PAO DE HOT DOG 50 GR EMB/IND/PLASTICO');
  assert.equal(comOpcoes('PAO DE HOT DOG 50 GR EMB/IND/PLASTICO', { extra_plastico: 'True' }), 'PAO DE HOT DOG 50 GR EMB/IND/PLASTICO');
  assert.equal(comOpcoes('PAO DE HOT DOG 50 GR EMB/IND/PLASTICO', { extra_plastico: 'False', extra_cortado: 'True' }), 'PAO DE HOT DOG 50 GR CORTADO');
  assert.equal(comOpcoes('PAO CORTADO C/COCO', {}), 'PAO');
  assert.equal(comOpcoes('', { extra_cortado: 'True' }), 'CORTADO');
});
