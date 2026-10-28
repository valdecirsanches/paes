// Garante, no start da API, os índices que a tela de Mercadorias precisa — só se o EXPLAIN provar que falta
// (varredura completa de tb_diaria). Desligue com AUTO_INDICES=0. Só ADICIONA índices; nunca altera dados.
export const SQL_PLANO = `explain select p.id from tb_diaria p join tb_produtos pd on pd.id = p.id_produto
  where p.data = ? and pd.produto_producao <> 'True' and p.cancelado <> 'True'`;

async function temIndice(pool, tabela, colunas) {
  const [idx] = await pool.query(`show index from ${tabela}`);
  const por = new Map();
  for (const i of idx) { if (!por.has(i.Key_name)) por.set(i.Key_name, []); por.get(i.Key_name)[i.Seq_in_index - 1] = i.Column_name; }
  return [...por.values()].some((k) => colunas.every((c, i) => k[i] === c));
}

/** Índices da tela de NFe: cada clique na grade busca itens/eventos/duplicatas/referências/comandas por id_nfe; sem índice, com
 *  muitas notas, cada busca varre a tabela inteira. [tabela, colunas, nome] */
export const INDICES_NFE = [
  ['tb_nfe_itens', ['id_nfe'], 'idx_nfe_itens_nfe'], ['tb_nfe_eventos', ['id_nfe'], 'idx_nfe_eventos_nfe'], ['tb_receita', ['id_nfe'], 'idx_receita_nfe'],
  ['tb_nfe_referencia', ['id_nfe'], 'idx_nfe_ref_nfe'], ['tb_comandas', ['id_nota_fiscal'], 'idx_comandas_nota'], ['tb_comandas_itens', ['id_comanda'], 'idx_comandas_it_cmd'],
  ['tb_nfe', ['status_e', 'data_emissao'], 'idx_nfe_status_emissao'], ['tb_nfe', ['nfe_numero'], 'idx_nfe_numero'],
  // eliminar comanda: cada DELETE/UPDATE filtra por id_comanda (ou id_diaria no recálculo da baixa); sem índice varre a tabela e trava com muitos registros
  ['tb_comandas_detalhes', ['id_comanda'], 'idx_cmd_det_cmd'], ['tb_comandas_detalhes', ['id_diaria'], 'idx_cmd_det_diaria'],
  ['tb_comandas_mercadorias', ['id_comanda'], 'idx_cmd_merc_cmd'], ['tb_diaria_comandas', ['id_comanda'], 'idx_diaria_cmd_cmd'],
  ['tb_diaria', ['id_comanda'], 'idx_diaria_comanda'], ['tb_diaria_log', ['id_diaria'], 'idx_diaria_log_diaria'],
];
export async function garanteIndicesNfe(pool, log = console) {
  const feitos = [];
  for (const [tabela, colunas, nome] of INDICES_NFE) {
    try {
      if (await temIndice(pool, tabela, colunas)) continue;
      const t = Date.now(); await pool.query(`alter table ${tabela} add index ${nome} (${colunas.join(', ')})`);
      feitos.push(`${tabela}(${colunas.join(',')})`); log.log(`✚ índice criado: ${tabela}(${colunas.join(', ')}) em ${Date.now() - t} ms`);
    } catch (e) { log.warn(`[indices] ${tabela}: ${e.message}`); }
  }
  return feitos;
}

export async function garanteIndices(pool, log = console) {
  if (process.env.AUTO_INDICES === '0') return [];
  const feitos = [];
  const [[u]] = await pool.query('select max(data) as d from tb_diaria');
  if (u?.d) {
    const [plano] = await pool.query(SQL_PLANO, [u.d]);
    const varre = plano.some((r) => r.table === 'p' && r.type === 'ALL');
    if (varre && !(await temIndice(pool, 'tb_diaria', ['data']))) {
      const t = Date.now(); await pool.query('alter table tb_diaria add index idx_diaria_data (data)');
      feitos.push('tb_diaria(data)'); log.log(`✚ índice criado: tb_diaria(data) em ${Date.now() - t} ms (a consulta de Mercadorias varria a tabela toda)`);
    }
  }
  try {
    if (!(await temIndice(pool, 'tb_etiquetas_log', ['id_diaria']))) {
      await pool.query('alter table tb_etiquetas_log add index idx_etiq_log_diaria (id_diaria)');
      feitos.push('tb_etiquetas_log(id_diaria)'); log.log('✚ índice criado: tb_etiquetas_log(id_diaria)');
    }
  } catch (e) { log.warn(`[indices] tb_etiquetas_log: ${e.message}`); }
  feitos.push(...await garanteIndicesNfe(pool, log));
  return feitos;
}
