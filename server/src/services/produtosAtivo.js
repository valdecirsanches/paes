// Produto ativo/inativo: cria a coluna tb_produtos.ativo ('True'/'False', como os demais campos lógicos) se ainda não existir.
// Todos os produtos já cadastrados ficam ATIVOS. Só ADICIONA a coluna; nunca altera dados.
export const SQL_ATIVO = "coalesce(p.ativo, 'True') <> 'False'";

export async function garanteColunaAtivo(pool, log = console) {
  try {
    const [[r]] = await pool.query("select count(*) as n from information_schema.columns where table_schema = database() and table_name = 'tb_produtos' and column_name = 'ativo'");
    if (Number(r?.n)) return false;
    await pool.query("alter table tb_produtos add column ativo varchar(5) not null default 'True'");
    log.log('✚ coluna criada: tb_produtos.ativo (todos os produtos ficam ativos)');
    return true;
  } catch (e) { log.warn(`[produtos] coluna ativo: ${e.message}`); return false; }
}
