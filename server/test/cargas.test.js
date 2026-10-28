import test from 'node:test';
import assert from 'node:assert/strict';
import { filtroDiaria, filtroFixa, REGIOES } from '../src/services/cargas.js';

test('diária: padrão ("Tudo") só filtra data/status/ativo', () => {
  const f = filtroDiaria({ data: '2026-10-26' });
  assert.deepEqual(f.params, ['2026-10-26']);
  assert.match(f.where, /ps\.status in \(1, 2\)/);
  assert.doesNotMatch(f.where, /especial/);
});
test('diária: região, carga e tipo viram parâmetros/condições fechadas', () => {
  const f = filtroDiaria({ data: '2026-10-26', regiao: '1', carga: '2', tipo: '0', modal: '2' });
  assert.deepEqual(f.params, ['2026-10-26', 3, 'RAPOSO TAVARES']);
  assert.match(f.where, /produto_especial = 'True'/);
  assert.match(f.where, /p\.cancelado = 'True'/);
});
test('diária: data e índices inválidos → 422', () => {
  assert.throws(() => filtroDiaria({ data: 'x' }), { status: 422 });
  assert.throws(() => filtroDiaria({ data: '2026-10-26', regiao: '99' }), { status: 422 });
  assert.throws(() => filtroDiaria({ data: '2026-10-26', extra: "1;drop" }), { status: 422 });
});
test('diária: extras usam coluna da lista fixa', () => {
  assert.match(filtroDiaria({ data: '2026-10-26', extra: '4' }).where, /p\.extra_plastico = 'True'/);
});
test('fixa: caixas desmarcadas excluem o grupo (com parâmetros)', () => {
  const f = filtroFixa({ dia: '2', desmarcados: 'osasco,h2,carga3,coco,sacaria' });
  assert.deepEqual(f.params, [2, '2', 'OSASCO', 3]);
  assert.match(f.where, /f\.extra_coco/);
  assert.match(f.where, /acomodacao_carga, ''\) <> 'SACARIA'/);
});
test('fixa: dia e chaves inválidos → 422', () => {
  assert.throws(() => filtroFixa({ dia: '0' }), { status: 422 });
  assert.throws(() => filtroFixa({ dia: '3', desmarcados: "osasco,x'--" }), { status: 422 });
});
test('regiões do rgRegiao são 12', () => assert.equal(REGIOES.length, 12));
