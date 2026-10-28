import {
  EXTRAS_COLS, acomodacaoPadrao, addDays, bool, brDate, dbBool, money, semanaDia, unitario,
} from '../rules.js';
import { logDiaria } from './log.js';

/** Campos de tb_diaria copiados (snapshot) de uma linha da programação fixa. */
function snapshotDaFixa(f, data) {
  const especial = bool(f.produto_especial);
  const unit = unitario(f.preco, f.divisor_basico);
  const qtde = Number(f.produto_qtde) || 0;
  const snap = {
    id_roteiro: f.id_roteiro || 0,
    hora: f.hora,
    data,
    qtde_original: qtde,
    id_produto: f.id_produto,
    produto_codigo: f.produto_codigo || f.pr_codigo,
    produto_descricao: f.pr_descricao,
    produto_descricao_original: f.pr_descricao,
    produto_descricao_reduzida: f.descricao_reduzida,
    produto_descricao_expedicao: f.produto_descricao_expedicao,
    referencia_descricao: f.referencia_descricao,
    produto_especial: dbBool(f.produto_especial),
    produto_producao: dbBool(f.produto_producao),
    producao_data: addDays(data, -(Number(f.producao_dias) || 0)),
    producao_turno: f.producao_turno || 0,
    produto_preco: f.preco ?? 0,
    produto_preco_cada: f.divisor_basico ?? 1,
    produto_preco_unitario: money(unit),
    preco_total: money(qtde * unit),
    cobrado: '1',
    carga: f.carga || 0,
    acomodacao_carga: f.acomodacao_carga || acomodacaoPadrao(especial),
  };
  for (const col of EXTRAS_COLS) snap[col] = dbBool(f[col]);
  return snap;
}

/**
 * Copia a programação fixa do dia da semana para a diária de uma unidade.
 * `manual` = botão "Ativar" da tela (reativa itens sem comanda e marca registro_alterado=1);
 * sem `manual` = ativação em lote para todas as empresas (não mexe nos itens existentes).
 */
export async function ativarFixaDaUnidade(c, st, { userId, manual }) {
  const [fixas] = await c.query(
    `select f.*, pr.codigo as pr_codigo, pr.descricao as pr_descricao, pr.descricao_reduzida,
            pr.preco, pr.divisor_basico, pr.produto_producao,
            r.descricao as referencia_descricao, r.produto_especial
       from tb_fixa f
       left join tb_produtos pr on pr.id = f.id_produto
       left join tb_referencias r on r.id = pr.id_referencia
      where f.id_unidade = ? and f.semana_dia = ? order by f.hora`,
    [st.id_unidade, semanaDia(st.data)]);

  let criados = 0;
  let atualizados = 0;
  for (const f of fixas) {
    const [[existente]] = await c.query(
      `select id, comandas from tb_diaria
        where id_status = ? and programacao_fixa = 'True' and hora = ? and id_produto = ? limit 1`,
      [st.id, f.hora, f.id_produto]);
    const snap = snapshotDaFixa(f, st.data);
    const resumo = `Data: ${brDate(st.data)}\nHora: ${String(f.hora).slice(0, 5)}\nQtde: ${f.produto_qtde}`;

    if (!existente) {
      const [r] = await c.query('insert into tb_diaria set ?', [{
        ...snap,
        id_status: st.id, id_programacao_status: st.id,
        id_cliente: st.id_cliente, id_unidade: st.id_unidade,
        programacao_fixa: 'True', cancelado: 'False',
        qtde_alterada: 0, qtde_cobrado: 0, qtde_quitado: 0, comandas: '',
        notificado_sn: 'False', quitado_manualmente: 'False', cobranca_cancelada: 'False',
        id_produto_conversao: 0, registro_alterado: manual ? 1 : 0,
      }]);
      await logDiaria(c, r.insertId, userId, `Ativou programacao fixa\n${resumo}`);
      criados += 1;
    } else if (manual && !String(existente.comandas || '').trim()) {
      // Só reatualiza o que ainda não foi cobrado (sem comanda).
      await c.query('update tb_diaria set ? where id = ?', [{ ...snap, registro_alterado: 1 }, existente.id]);
      await logDiaria(c, existente.id, userId, `Reativou programacao fixa\n${resumo}`);
      atualizados += 1;
    }
  }
  return { criados, atualizados, totalFixa: fixas.length };
}

/** Recalcula comandas/qtde_cobrado/qtde_quitado de um item a partir de tb_comandas_detalhes. */
export async function ajustaCobranca(c, idDiaria) {
  const [rows] = await c.query(
    'select id_comanda, qtde from tb_comandas_detalhes where id_diaria = ? order by id_comanda', [idDiaria]);
  const comandas = rows.map((r) => `${r.id_comanda}/${r.qtde}`).join(' # ');
  const total = rows.reduce((s, r) => s + (Number(r.qtde) || 0), 0);
  await c.query(
    `update tb_diaria set comandas = ?, qtde_cobrado = ?, qtde_quitado = ?,
            cobrado = if((qtde_original + qtde_alterada) <> ?, '1', cobrado)
      where id = ?`, [comandas, total, total, total, idDiaria]);
}

const ROTULOS = [
  ['data', 'data entrega'], ['hora', 'hora entrega'], ['id_produto', 'produto'],
  ['produto_descricao_expedicao', 'descricao'], ['qtde_alterada', 'qtde extra'],
  ['producao_data', 'Producao'], ['producao_turno', 'turno de producao'], ['cancelado', 'Item cancelado'],
];
/** Texto de log com o que mudou entre o registro antigo e o novo. Vazio = nada mudou. */
export function diffDiaria(antes, depois) {
  return ROTULOS
    .filter(([k]) => String(antes[k] ?? '') !== String(depois[k] ?? ''))
    .map(([k, rotulo]) => `Alterou ${rotulo} para ${k === 'cancelado' ? (bool(depois[k]) ? 'SIM' : 'NAO') : depois[k]}`)
    .join('\n');
}
