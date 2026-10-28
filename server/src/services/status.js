import { notFound } from '../errors.js';

export async function getStatus(c, id) {
  const [[st]] = await c.query('select * from tb_status where id = ?', [id]);
  if (!st) throw notFound('Movimento do dia');
  return st;
}

/**
 * Recalcula tb_status.status a partir dos itens (AtualizaStatus do legado).
 *   2 ALTERADA : há item avulso, fixo com qtde extra ou cancelado
 *   1 NORMAL   : só itens fixos sem alteração
 *   0 NADA     : sem itens
 * DECISÃO: status 3 (CANCELADA) é manual e é preservado. No Delphi qualquer
 * gravação de item sobrescrevia o 3. Para voltar ao comportamento antigo, remova o 'if'.
 */
export async function atualizaStatus(c, statusId) {
  const [[st]] = await c.query('select id, data, id_unidade, status from tb_status where id = ?', [statusId]);
  if (!st) return null;
  if (Number(st.status) === 3) return 3;

  const [[alt]] = await c.query(
    `select count(*) as q from tb_diaria p where p.data = ? and p.id_unidade = ?
       and (p.programacao_fixa = 'False'
            or (p.programacao_fixa = 'True' and p.qtde_alterada <> 0)
            or p.cancelado = 'True')`, [st.data, st.id_unidade]);
  const [[fix]] = await c.query(
    `select count(*) as q from tb_diaria p where p.data = ? and p.id_unidade = ?
       and p.programacao_fixa = 'True' and p.qtde_alterada = 0`, [st.data, st.id_unidade]);

  const novo = alt.q > 0 ? 2 : fix.q > 0 ? 1 : 0;
  await c.query('update tb_status set status = ? where id = ?', [novo, st.id]);
  return novo;
}
