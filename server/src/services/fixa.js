import { EXTRAS_COLS, dbBool } from '../rules.js';
import { logFixa } from './log.js';

const CAMPOS_REPLICADOS = [
  'id_roteiro', 'carga', 'acomodacao_carga', 'produto_qtde', 'produto_descricao_expedicao',
  'producao_turno', 'producao_dias', ...EXTRAS_COLS,
];

/**
 * Replica um item da fixa para outros dias da semana (1=Dom ... 7=Sáb).
 * Se o dia já tem o mesmo produto no mesmo horário, atualiza; senão cria.
 */
export async function replicarFixa(c, item, dias, userId, descricaoLog) {
  const valores = {};
  for (const k of CAMPOS_REPLICADOS) valores[k] = item[k] ?? null;
  for (const col of EXTRAS_COLS) valores[col] = dbBool(item[col]);
  valores.id_roteiro = item.id_roteiro || 0;
  valores.carga = item.carga || 0;

  for (const dia of dias) {
    const [[existente]] = await c.query(
      `select id from tb_fixa where id_unidade = ? and hora = ? and id_produto = ? and semana_dia = ? limit 1`,
      [item.id_unidade, item.hora, item.id_produto, dia]);
    if (existente) {
      await c.query('update tb_fixa set ? where id = ?', [valores, existente.id]);
    } else {
      await c.query('insert into tb_fixa set ?', [{
        ...valores,
        id_cliente: item.id_cliente, id_unidade: item.id_unidade, id_produto: item.id_produto,
        produto_codigo: item.produto_codigo, hora: item.hora, semana_dia: dia,
      }]);
    }
  }
  await logFixa(c, item.id, userId,
    `${descricaoLog}\nhorario: ${String(item.hora).slice(0, 5)}\nproduto: ${item.produto_codigo}/${item.produto_descricao}`);
}
