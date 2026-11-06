import { pool } from '../db.js';
import { addDays } from '../rules.js';

// O painel não mostra valores monetários: só quantidades e percentuais. Itens cancelados não entram nos totais.
const QTDE = '(p.qtde_original + p.qtde_alterada)';
const VALIDO = "coalesce(p.cancelado, 'False') <> 'True'";
const n = (v) => Number(v) || 0;
const r2 = (v) => Math.round(n(v) * 100) / 100;

/** Variação percentual do atual sobre o anterior (null quando não há base de comparação). */
export function variacao(atual, anterior) {
  const a = n(anterior);
  return a === 0 ? null : Math.round(((n(atual) - a) / Math.abs(a)) * 1000) / 10;
}

async function totaisDoDia(data) {
  const [[t]] = await pool.query(
    `select count(*) as itens, 
            coalesce(sum(case when ${VALIDO} then 1 else 0 end),0) as itens_validos,
            coalesce(sum(case when ${VALIDO} then ${QTDE} else 0 end),0) as qtde,
            coalesce(sum(case when ${VALIDO} and p.programacao_fixa = 'False' then 1 else 0 end),0) as avulsos,
            coalesce(sum(case when ${VALIDO} and p.programacao_fixa = 'True' and p.qtde_alterada <> 0 then 1 else 0 end),0) as fixos_alterados,
            coalesce(sum(case when ${VALIDO} then p.qtde_cobrado else 0 end),0) as qtde_cobrada,
            count(distinct case when ${VALIDO} then p.id_unidade end) as clientes
       from tb_diaria p where p.data = ?`, [data]);
  return {
    itens: n(t.itens_validos), cancelados: n(t.itens) - n(t.itens_validos), qtde: r2(t.qtde),
    avulsos: n(t.avulsos), fixos_alterados: n(t.fixos_alterados), qtde_cobrada: r2(t.qtde_cobrada), clientes: n(t.clientes),
  };
}

/** Notas fiscais do dia (pela data de emissão): contagem por situação, sem valores. */
async function notasDoDia(data) {
  const [r] = await pool.query('select status_e as s, count(*) as q from tb_nfe where data_emissao = ? group by status_e', [data]);
  const por = {}; let total = 0;
  for (const x of r) { por[String(x.s || '').toUpperCase()] = n(x.q); total += n(x.q); }
  return { emitidas: por.AUTORIZADA || 0, canceladas: por.CANCELADA || 0, devolvidas: por.DEVOLVIDO || 0, rejeitadas: por.REJEITADA || 0, pendentes: por.PENDENTE || 0, total };
}

/** Monta o painel do dia: totais, comparativos (dia anterior e mesmo dia da semana passada) e quebras. */
export async function montaDashboard(data) {
  const ontem = addDays(data, -1); const semanaPassada = addDays(data, -7);
  const [atual, dAnt, dSem] = await Promise.all([totaisDoDia(data), totaisDoDia(ontem), totaisDoDia(semanaPassada)]);
  const [nfAtual, nfOntem, nfSem] = await Promise.all([notasDoDia(data), notasDoDia(ontem), notasDoDia(semanaPassada)]);
  const q = (sql, args = [data]) => pool.query(sql, args).then(([r]) => r);
  const [status, porHora, porTurno, porCarga, topProdutos, topClientes] = await Promise.all([
    q('select status, count(*) as q from tb_status where data = ? group by status'),
    q(`select left(p.hora, 2) as hora, count(*) as itens, sum(${QTDE}) as qtde from tb_diaria p where p.data = ? and ${VALIDO} group by left(p.hora, 2) order by 1`),
    q(`select coalesce(nullif(p.producao_turno, ''), '—') as turno, count(*) as itens, sum(${QTDE}) as qtde from tb_diaria p where p.data = ? and ${VALIDO} group by 1 order by 1`),
    q(`select coalesce(nullif(p.acomodacao_carga, ''), '—') as acomodacao, count(*) as itens, sum(${QTDE}) as qtde from tb_diaria p where p.data = ? and ${VALIDO} group by 1 order by qtde desc`),
    q(`select p.produto_descricao_expedicao as produto, sum(${QTDE}) as qtde from tb_diaria p where p.data = ? and ${VALIDO} group by p.produto_descricao_expedicao order by qtde desc limit 8`),
    q(`select coalesce(u.nome, '—') as cliente, count(*) as itens, sum(${QTDE}) as qtde from tb_diaria p left join tb_unidades u on u.id = p.id_unidade where p.data = ? and ${VALIDO} group by p.id_unidade, u.nome order by qtde desc limit 8`),
  ]);
  const st = { nada: 0, normal: 0, alterado: 0, cancelado: 0 };
  for (const s of status) st[['nada', 'normal', 'alterado', 'cancelado'][n(s.status)] ?? 'nada'] += n(s.q);
  const pct = (v) => (atual.qtde > 0 ? Math.round((n(v) / atual.qtde) * 1000) / 10 : 0);
  const comp = (ref) => ({ itens: variacao(atual.itens, ref.itens), qtde: variacao(atual.qtde, ref.qtde), base: ref });
  return {
    data, ...atual, pendente: r2(atual.qtde - atual.qtde_cobrada), status: st,
    notas: { ...nfAtual, comparativo: { ontem: variacao(nfAtual.emitidas, nfOntem.emitidas), semana_passada: variacao(nfAtual.emitidas, nfSem.emitidas) } },
    comparativo: { ontem: comp(dAnt), semana_passada: comp(dSem) },
    por_hora: porHora.map((x) => ({ hora: `${x.hora}h`, itens: n(x.itens), qtde: r2(x.qtde) })),
    por_turno: porTurno.map((x) => ({ turno: String(x.turno), itens: n(x.itens), qtde: r2(x.qtde) })),
    por_acomodacao: porCarga.map((x) => ({ acomodacao: x.acomodacao, itens: n(x.itens), qtde: r2(x.qtde) })),
    top_produtos: topProdutos.map((x) => ({ produto: x.produto, qtde: r2(x.qtde), pct: pct(x.qtde) })),
    top_clientes: topClientes.map((x) => ({ cliente: x.cliente, itens: n(x.itens), qtde: r2(x.qtde), pct: pct(x.qtde) })),
  };
}
