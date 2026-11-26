import test from 'node:test';
import assert from 'node:assert/strict';
import { periodo, verificaProgramacao, REGRAS } from '../src/services/conflitos.js';

test('periodo: valida datas e limita a 31 dias', () => {
  assert.deepEqual(periodo('2026-11-05'), { de: '2026-11-05', ate: '2026-11-05', dias: 1 });
  assert.equal(periodo('2026-11-01', '2026-11-30').dias, 30);
  assert.throws(() => periodo('lixo'), /data inicial/);
  assert.throws(() => periodo('2026-11-05', '2026-11-01'), /anterior/);
  assert.throws(() => periodo('2026-01-01', '2026-03-01'), /31 dias/);
});

test('só as 3 regras do sistema antigo, na ordem: fixa não consta na diária, fixa fora do esquema, diária fora do esquema', async () => {
  assert.deepEqual(Object.keys(REGRAS), ['fixa_ausente', 'fixa_fora_producao', 'fora_producao']);
  const consultas = [];
  const db = { query: async (sql) => {
    consultas.push(sql);
    if (/tb_fixa f on f\.id_unidade/.test(sql) && /not exists/.test(sql)) return [[{ id_item: 5, id_status: 9, id_unidade: 9, data: '2026-11-05', unidade: 'BENASSI 409/1167', hora: '04:00', produto: 'PAO FRANCES KG', qtde: 280, dias_prod: 0, especial: 'False' }]];
    if (/tb_fixa f on f\.id_unidade/.test(sql) && /f\.producao_dias <> 0/.test(sql)) return [[{ id_item: 6, id_status: 8, id_unidade: 8, data: '2026-11-05', unidade: 'G', hora: '06:00', produto: 'Bolo', qtde: 10, dias_prod: 0, especial: 'True' }]];
    if (/datediff\(p\.data, p\.producao_data\) <> 0\)\s+or \(rf\.produto_especial/.test(sql) && !/tb_fixa/.test(sql)) return [[{ id_item: 20, id_status: 1, id_unidade: 1, data: '2026-11-05', hora: '06:00', unidade: 'A', produto: 'Pão', qtde: 30, dias_prod: 2, especial: 'False' }]];
    return [[]];
  } };
  const r = await verificaProgramacao('2026-11-05', '', db);
  assert.equal(consultas.length, 3, 'apenas 3 consultas (nada de conferências extras)');
  assert.deepEqual(r.problemas.map((p) => p.tipo), ['fixa_ausente', 'fixa_fora_producao', 'fora_producao']);
  assert.equal(r.total, 3);
  const a = r.problemas[0];
  assert.equal(a.detalhe, 'Não consta na diária.');
  assert.equal(a.qtde, 280); assert.equal(a.hora, '04:00'); assert.equal(a.id_item, null); assert.equal(a.destino, 'diaria');
  assert.equal(r.problemas[1].destino, 'fixa');
  assert.match(r.problemas[1].detalhe, /1 dia antes.*o mesmo dia/);
  assert.match(r.problemas[2].detalhe, /mesmo dia.*2 dia\(s\) antes/);
  assert.equal(r.periodo.rotulo, '05/11/2026');
});

test('sem nada a apontar: lista vazia', async () => {
  const r = await verificaProgramacao('2026-11-05', '', { query: async () => [[]] });
  assert.equal(r.total, 0); assert.deepEqual(r.problemas, []);
});
