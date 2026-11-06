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

test('verificaProgramacao: classifica, ordena por gravidade e conta por regra', async () => {
  const linha = (o) => ({ id_item: 1, id_status: 10, id_unidade: 3, data: '2026-11-05', hora: '06:00', unidade: 'Padaria A', produto: 'Pão', ...o });
  const db = {
    query: async (sql) => {
      if (/datediff\(p\.data, p\.producao_data\) <> 0\)\s+or \(rf\.produto_especial/.test(sql) && !/tb_fixa/.test(sql)) return [[linha({ id_item: 20, dias_prod: 2, especial: 'False' })]];
      if (/tb_fixa f on f\.id_unidade/.test(sql) && /not exists/.test(sql)) return [[{ id_status: 9, id_unidade: 9, data: '2026-11-05', unidade: 'F', hora: '05:00', produto: 'Pão', qtde: 40, dias_prod: 0, especial: 'False' }]];
      if (/tb_fixa f on f\.id_unidade/.test(sql) && /f\.producao_dias <> 0/.test(sql)) return [[{ id_status: 8, id_unidade: 8, data: '2026-11-05', unidade: 'G', hora: '06:00', produto: 'Bolo', qtde: 10, dias_prod: 0, especial: 'True' }]];
      if (/hora = '00:00:00'/.test(sql)) return [[linha({ id_item: 7, hora: null })]];
      if (/<= 0 and|\) <= 0/.test(sql) && /qtde_original \+ p\.qtde_alterada\) <= 0/.test(sql)) return [[]];
      if (/produto_preco, 0\) <= 0/.test(sql)) return [[linha({ id_item: 8 })]];
      if (/id_roteiro, 0\) = 0/.test(sql)) return [[linha({ id_item: 9 })]];
      if (/having count\(\*\) > 1/.test(sql)) return [[linha({ id_item: 11, vezes: 2 })]];
      if (/amostras >= 3/.test(sql)) return [[linha({ id_item: 12, qtde: 90, media: 20, amostras: 4 })]];
      if (/from tb_status ps left join tb_diaria/.test(sql)) return [[
        { id_status: 1, id_unidade: 1, data: '2026-11-05', status: 3, unidade: 'A', validos: 2, alterados: 0, fixos: 2 },
        { id_status: 2, id_unidade: 2, data: '2026-11-05', status: 1, unidade: 'B', validos: 0, alterados: 0, fixos: 0 },
        { id_status: 3, id_unidade: 3, data: '2026-11-05', status: 1, unidade: 'C', validos: 3, alterados: 1, fixos: 2 },
        { id_status: 4, id_unidade: 4, data: '2026-11-05', status: 2, unidade: 'D', validos: 2, alterados: 1, fixos: 1 },
      ]];
      if (/f\.semana_dia = dayofweek/.test(sql)) return [[{ id_status: 5, id_unidade: 5, data: '2026-11-05', unidade: 'E' }]];
      return [[]];
    },
  };
  const r = await verificaProgramacao('2026-11-05', '', db);
  const tipos = r.problemas.map((p) => p.tipo);
  for (const t of ['fora_producao', 'fixa_fora_producao', 'fixa_ausente', 'sem_hora', 'preco_zero', 'sem_roteiro', 'duplicado', 'qtde_atipica', 'cancelada_com_itens', 'sem_itens', 'status_incoerente', 'fixa_nao_ativada']) assert.ok(tipos.includes(t), t);
  assert.ok(!tipos.includes('qtde_zero'));
  assert.equal(tipos.filter((t) => t === 'status_incoerente').length, 1); // só a empresa C (D está coerente: alterada)
  const g = r.problemas.map((p) => p.gravidade);
  assert.deepEqual(g, [...g].sort((a, b) => ({ erro: 0, aviso: 1, info: 2 }[a] - { erro: 0, aviso: 1, info: 2 }[b])));
  assert.equal(r.totais.erro + r.totais.aviso + r.totais.info, r.problemas.length);
  assert.equal(r.por_regra.length, Object.keys(REGRAS).length);
  assert.match(r.problemas.find((p) => p.tipo === 'qtde_atipica').detalhe, /90.*20/);
  assert.equal(r.periodo.rotulo, '05/11/2026');
});

test('regras do Delphi: mensagens de produção fora do esquema', async () => {
  const db = { query: async (sql) => {
    if (/datediff\(p\.data, p\.producao_data\) <> 0\)\s+or \(rf\.produto_especial/.test(sql)) return [[{ id_item: 1, id_status: 1, id_unidade: 1, data: '2026-11-05', hora: '06:00', unidade: 'A', produto: 'Pão', dias_prod: 1, especial: 'False' }, { id_item: 2, id_status: 1, id_unidade: 1, data: '2026-11-05', hora: '07:00', unidade: 'A', produto: 'Bolo', dias_prod: 0, especial: 'True' }]];
    return [[]];
  } };
  const r = await verificaProgramacao('2026-11-05', '', db);
  const f = r.problemas.filter((p) => p.tipo === 'fora_producao');
  assert.equal(f.length, 2);
  assert.match(f.find((p) => p.produto === 'Pão').detalhe, /mesmo dia.*1 dia\(s\) antes/);
  assert.match(f.find((p) => p.produto === 'Bolo').detalhe, /1 dia antes.*o mesmo dia/);
});
