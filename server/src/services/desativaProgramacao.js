// Ao DESATIVAR uma unidade (ou cliente), a programação diária futura dela deixa de existir: apaga os itens de hoje em diante
// (tenha ou não programação) e as linhas do dia em tb_status. Item que já tem comanda/cobrança é preservado (histórico fiscal) e o dia dele fica.
// A programação FIXA (tb_fixa) não é tocada: se a unidade voltar a ser ativada, ela continua valendo.
import { logDiaria } from './log.js';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** @returns {Promise<{itens:number, dias:number, preservados:number}>} */
export async function limpaProgramacaoFutura(c, idsUnidade, userId, hoje = new Date()) {
  const ids = (idsUnidade ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return { itens: 0, dias: 0, preservados: 0 };
  const dia = iso(hoje);
  const [itens] = await c.query('select * from tb_diaria where id_unidade in (?) and data >= ? for update', [ids, dia]);
  const cobrado = (i) => Number(i.qtde_cobrado) > 0 || String(i.comandas ?? '').trim() !== '';
  const apagar = itens.filter((i) => !cobrado(i));
  const preservados = itens.length - apagar.length;
  if (apagar.length) {
    await logDiaria(c, apagar[0].id, userId, `Exclusao automática da programação diária futura (unidade/cliente desativado) — ${apagar.length} item(ns) a partir de ${dia}\n`
      + apagar.slice(0, 200).map((i) => `${String(i.data).slice(0, 10)} ${String(i.hora).slice(0, 5)} ${i.id_produto} ${i.produto_descricao_expedicao}`).join('\n'));
    await c.query('delete from tb_diaria where id in (?)', [apagar.map((i) => i.id)]);
  }
  // dia sem nenhum item restante: sai da lista do dia (tb_status)
  const [r] = await c.query(
    'delete s from tb_status s where s.id_unidade in (?) and s.data >= ? and not exists (select 1 from tb_diaria d where d.id_status = s.id)', [ids, dia]);
  return { itens: apagar.length, dias: r.affectedRows ?? 0, preservados };
}

export const textoDesativacao = (r) => (r.itens || r.dias
  ? `Programação futura removida: ${r.itens} item(ns) em ${r.dias} dia(s)${r.preservados ? `; ${r.preservados} item(ns) com comanda/cobrança foram preservados` : ''}.`
  : r.preservados ? `${r.preservados} item(ns) futuros têm comanda/cobrança e foram preservados.` : null);
