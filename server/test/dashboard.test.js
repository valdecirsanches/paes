import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { montaDashboard, variacao } from '../src/services/dashboard.js';

test('variacao: percentual sobre o anterior; sem base devolve null', () => {
  assert.equal(variacao(120, 100), 20);
  assert.equal(variacao(50, 100), -50);
  assert.equal(variacao(5, 0), null);
  assert.equal(variacao('abc', 10), -100);
});

test('montaDashboard: soma totais, status e comparativos a partir das consultas', async () => {
  const orig = pool.query; const datas = [];
  pool.query = async (sql, args = []) => {
    if (/count\(distinct case/.test(sql)) { // totais do dia: hoje, ontem, semana passada
      datas.push(args[0]);
      const hoje = args[0] === '2026-11-05';
      return [[{ itens: hoje ? 12 : 10, itens_validos: hoje ? 10 : 10, qtde: hoje ? '150.5' : '100', valor: hoje ? '300' : '200', avulsos: 2, fixos_alterados: 1, qtde_cobrada: '50', clientes: 4 }]];
    }
    if (/from tb_status/.test(sql)) return [[{ status: 0, q: 1 }, { status: 1, q: 5 }, { status: 2, q: 3 }, { status: 3, q: 1 }]];
    if (/left\(p\.hora, 2\)/.test(sql)) return [[{ hora: '05', itens: 4, qtde: '60' }]];
    if (/producao_turno/.test(sql)) return [[{ turno: '1', itens: 6, qtde: '90' }]];
    if (/acomodacao_carga/.test(sql)) return [[{ acomodacao: 'SACARIA', itens: 8, qtde: '120' }]];
    if (/left join tb_unidades/.test(sql)) return [[{ cliente: 'Padaria A', itens: 3, qtde: '40', valor: '99.999' }]];
    return [[{ produto: 'Pão francês', qtde: '80', valor: '120' }]];
  };
  try {
    const d = await montaDashboard('2026-11-05');
    assert.deepEqual(datas.sort(), ['2026-10-29', '2026-11-04', '2026-11-05']);
    assert.equal(d.itens, 10); assert.equal(d.cancelados, 2); assert.equal(d.qtde, 150.5); assert.equal(d.valor, 300);
    assert.equal(d.pendente, 100.5); assert.deepEqual(d.status, { nada: 1, normal: 5, alterado: 3, cancelado: 1 });
    assert.equal(d.comparativo.ontem.valor, 50); assert.equal(d.comparativo.semana_passada.qtde, 50.5);
    assert.equal(d.por_hora[0].hora, '05h'); assert.equal(d.top_clientes[0].valor, 100);
    assert.equal(d.top_produtos[0].produto, 'Pão francês');
  } finally { pool.query = orig; }
});
