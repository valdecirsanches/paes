import test from 'node:test';
import assert from 'node:assert/strict';
import { COR_STATUS, CORPO_LINHAS, alternaPeriodo, corLinha, fmtBr, parseBr, temMarca, foiMarcado } from './nfeCampos.js';

test('cores da grade: BGR do Delphi convertido, variante selecionada', () => {
  assert.deepEqual(corLinha('PENDENTE', false), { background: '#ffff00', color: '#ff0000' });
  assert.deepEqual(corLinha('PENDENTE', true), { background: '#ffd700', color: '#000000' });
  assert.equal(COR_STATUS.AUTORIZADA[0], '#008000');
  assert.equal(corLinha('INUTILIZADA', false), null);
});
test('parseBr / fmtBr', () => {
  assert.equal(parseBr('1.234,56'), 1234.56);
  assert.equal(parseBr('12,5'), 12.5);
  assert.equal(parseBr(''), null);
  assert.ok(Number.isNaN(parseBr('abc')));
  assert.equal(fmtBr(1234.5, 2), '1.234,50');
  assert.equal(fmtBr(null), '');
});
test('temMarca aceita as formas do legado', () => {
  assert.ok(temMarca('True') && temMarca(1) && temMarca('S'));
  assert.ok(!temMarca('False') && !temMarca(0) && !temMarca(null));
});
test('BitBtn3: alterna hoje <-> mês corrente', () => {
  assert.deepEqual(alternaPeriodo('2026-02-10', '2026-02-10', '2026-02-10'), ['2026-02-01', '2026-02-28']);
  assert.deepEqual(alternaPeriodo('2026-02-01', '2026-02-28', '2026-02-10'), ['2026-02-10', '2026-02-10']);
});
test('vertical grid: categorias do DFM presentes', () => {
  const cats = CORPO_LINHAS.filter((l) => l[0] === '#').map((l) => l[1]);
  assert.deepEqual(cats, ['Dados do Destinatário', 'Valores/Pagamento', 'Tributos', 'Tributos Substituição', 'Frete/Transportadora', 'Informações fiscais', 'Dados complementares', 'Endereço de entrega', 'NF-e', 'Final']);
});

test('foiMarcado aceita qualquer valor preenchido que não seja negação', () => {
  for (const v of ['True', 1, 'S', 'SIM', 'IMPRESSO', '2026-10-29 10:00:00', { type: 'Buffer', data: [1] }]) assert.ok(foiMarcado(v), String(v));
  for (const v of [null, undefined, '', 'False', 0, 'N', 'não', { type: 'Buffer', data: [0] }]) assert.ok(!foiMarcado(v), String(v));
});
