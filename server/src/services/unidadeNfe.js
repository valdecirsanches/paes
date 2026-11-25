// Unidade pode ser a destinatária da NFe (em vez do cliente/cozinha). Cria as colunas se faltarem; só ADICIONA, nunca altera dados:
// tb_unidades.emite_nfe_unidade ('True'/'False', padrão 'False' = continua emitindo para o cliente) e tb_unidades.razao_social.
const COLUNAS = [['emite_nfe_unidade', "varchar(5) not null default 'False'"], ['razao_social', 'varchar(120) null']];
export async function garanteColunasUnidadeNfe(pool, log = console) {
  try {
    for (const [col, def] of COLUNAS) {
      const [[r]] = await pool.query("select count(*) as n from information_schema.columns where table_schema = database() and table_name = 'tb_unidades' and column_name = ?", [col]);
      if (Number(r?.n)) continue;
      await pool.query(`alter table tb_unidades add column ${col} ${def}`);
      log.log(`✚ coluna criada: tb_unidades.${col}`);
    }
  } catch (e) { log.warn(`[unidades] colunas da NFe: ${e.message}`); }
}
