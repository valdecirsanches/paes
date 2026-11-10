import test from 'node:test';
import assert from 'node:assert/strict';
import { demonstrativoTexto } from './print.js';

const txt = (r) => r.linhas.map((l) => l.t);
test('demonstrativo no desenho da comanda antiga: sem "Data de Emissao:", sem coluna Data (um dia), qtde inteira, traço sob o cabeçalho', () => {
  const t = txt(demonstrativoTexto([{ data: '2026-11-10', qtde: 40, xpreco: 1.62, produto_descricao: 'PAO SEMI ITALIANO 80GR' }, { data: '2026-11-10', qtde: 20, xpreco: 1.62, produto_descricao: 'BAGUETE 80 GR C/PAR' }], '2026-11-09', 'FABIO 418/1187', 'ana'));
  assert.ok(!t.some((l) => l.includes('Data de Emissao')));
  const cab = t.findIndex((l) => l.includes('Descricao do produto'));
  assert.ok(!t[cab].includes('Data'));
  assert.match(t[cab + 1], /^- - /);
  assert.match(t[cab + 2], /^\s*40 PAO SEMI ITALIANO 80GR\s+1,620\s+64,800$/);
  assert.ok(t.some((l) => l.startsWith('Vr total') && l.includes('R$ 97,20')));
});
test('demonstrativo: com linhas de dias diferentes mantém a coluna Data', () => {
  const t = txt(demonstrativoTexto([{ data: '2026-11-10', qtde: 1, xpreco: 1, produto_descricao: 'A' }, { data: '2026-11-11', qtde: 1, xpreco: 1, produto_descricao: 'B' }], '2026-11-09', 'X', ''));
  assert.ok(t.find((l) => l.includes('Descricao do produto')).startsWith('Data'));
});
