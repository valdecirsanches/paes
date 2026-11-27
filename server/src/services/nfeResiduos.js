import { pool } from '../db.js';
import { desfazNfe } from './geraFatura.js';
import { registra } from './auditoria.js';

// Notas que ficaram pela metade na geração (queda de conexão, reinício da API no meio, erro de cadastro em banco sem rollback): nascem sem status_e
// e por isso não aparecem na grade. Aqui elas são achadas, mostradas ao usuário e limpas (sem risco fiscal: nunca tiveram número nem foram enviadas).
// Trava de segurança: só nota SEM status, SEM número e SEM chave (nunca emitida) e gerada nos últimos 30 dias — nunca mexe em nota fiscal real nem em histórico antigo.
const SEM_STATUS = "(n.status_e is null or n.status_e = '') and coalesce(n.nfe_numero, 0) = 0 and coalesce(n.nfe_chave, '') = '' and n.data_geracao is not null and n.data_geracao >= now() - interval 30 day";

export async function listaIncompletas(db = pool) {
  const [rows] = await db.query(
    `select n.id, n.data_geracao, n.comandas_faturadas, n.cliente_razao_social, n.id_cliente,
            (select count(*) from tb_nfe_itens i where i.id_nfe = n.id) as itens, (select count(*) from tb_receita r where r.id_nfe = n.id) as receitas
       from tb_nfe n where ${SEM_STATUS} order by n.id`);
  return rows;
}

/** Apaga as incompletas (e solta as comandas: voltam a PROCESSADO, como no "apagar nota"). minutos = carência para não pegar uma geração em andamento. */
export async function limpaIncompletas({ minutos = 15, usuario = 'sistema', ip = '', db = pool } = {}) {
  const [rows] = await db.query(
    `select n.id, n.data_geracao from tb_nfe n where ${SEM_STATUS} and n.data_geracao < now() - interval ? minute order by n.id`, [Number(minutos) || 0]);
  const feitas = [];
  for (const n of rows) {
    const c = await db.getConnection();
    try {
      const [cmds] = await c.query('select id from tb_comandas where id_nfe = ? or id_nota_fiscal = ?', [n.id, n.id]);
      await desfazNfe(c, n.id, cmds.map((x) => ({ id: x.id, status: 'PROCESSADO', id_nfe: 0, id_nota_fiscal: 0 })));
      feitas.push({ id: n.id, comandas: cmds.map((x) => x.id) });
      await registra({ usuario, ip, metodo: 'AUTO', rota: '/nfe/incompletas', entidade: 'nfe', acao: 'Limpou nota incompleta (geração interrompida)', idRegistro: n.id, status: 200, detalhes: { geracao: n.data_geracao, comandas: cmds.map((x) => x.id) }, origem: 'sistema' });
    } finally { c.release(); }
  }
  return feitas;
}
