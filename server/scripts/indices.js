// Uso: npm run indices            -> só diagnostica (tempos, EXPLAIN e índices que faltam)
//      npm run indices -- --aplicar -> cria os índices que faltam (ALTER TABLE ... ADD INDEX, idempotente)
// Foco: telas lentas (Mercadorias). Não altera dados, só adiciona índices.
import mysql from 'mysql2/promise';
import { dbConfig, explicaErroDb } from '../src/db.js';

const aplicar = process.argv.includes('--aplicar');
// [tabela, nome do índice, colunas] — o índice só é considerado "existente" se alguma já começar pelas mesmas colunas
const DESEJADOS = [
  ['tb_diaria', 'idx_diaria_data', ['data']],
  ['tb_etiquetas_log', 'idx_etiq_log_diaria', ['id_diaria']],
];
const SQL_LISTA = `select p.id, p.data, p.hora, p.produto_descricao_expedicao, (p.qtde_original + p.qtde_alterada) as qtde, u.nome
  from tb_diaria p join tb_produtos pd on pd.id = p.id_produto left join tb_unidades u on u.id = p.id_unidade
 where p.data = ? and pd.produto_producao <> 'True' and p.cancelado <> 'True'`;

async function tempo(c, sql, params, vezes = 3) {
  const ms = [];
  for (let i = 0; i < vezes; i++) { const t = process.hrtime.bigint(); await c.query(sql, params); ms.push(Number(process.hrtime.bigint() - t) / 1e6); }
  return ms.map((x) => `${x.toFixed(0)} ms`).join(' · ');
}

let c;
try {
  c = await mysql.createConnection(dbConfig);
  console.log(`Conectado em ${dbConfig.host}/${dbConfig.database}\n`);
  const t = process.hrtime.bigint(); await c.query('select 1'); console.log(`Latência de uma consulta vazia: ${(Number(process.hrtime.bigint() - t) / 1e6).toFixed(1)} ms (rede + banco)\n`);

  const [[{ n }]] = await c.query('select count(*) n from tb_diaria');
  console.log(`tb_diaria: ${n} linhas`);
  const [dias] = await c.query('select data, count(*) q from tb_diaria group by data order by data desc limit 3');
  const data = dias[0]?.data ?? new Date().toISOString().slice(0, 10);
  console.log(`Data de teste: ${data} (${dias[0]?.q ?? 0} linhas no dia)\n`);

  console.log('Consulta da tela Mercadorias:', await tempo(c, SQL_LISTA, [data]));
  const [plano] = await c.query(`explain ${SQL_LISTA}`, [data]);
  console.table(plano.map((r) => ({ tabela: r.table, tipo: r.type, chave: r.key, linhas: r.rows })));
  if (plano.some((r) => r.table === 'p' && r.type === 'ALL')) console.log('⚠ varredura completa de tb_diaria (type=ALL): falta índice em "data".\n');

  let faltam = 0;
  for (const [tabela, nome, cols] of DESEJADOS) {
    let existe = false;
    try {
      const [idx] = await c.query(`show index from ${tabela}`);
      const porNome = new Map();
      for (const i of idx) { if (!porNome.has(i.Key_name)) porNome.set(i.Key_name, []); porNome.get(i.Key_name)[i.Seq_in_index - 1] = i.Column_name; }
      existe = [...porNome.values()].some((k) => cols.every((col, i) => k[i] === col));
    } catch (e) { console.log(`- ${tabela}: não consegui listar índices (${e.message})`); continue; }
    if (existe) { console.log(`✔ ${tabela}(${cols.join(', ')}) já tem índice`); continue; }
    faltam++;
    const sql = `alter table ${tabela} add index ${nome} (${cols.join(', ')})`;
    if (aplicar) { const t1 = Date.now(); await c.query(sql); console.log(`✚ criado: ${sql}  (${Date.now() - t1} ms)`); } else console.log(`✖ falta índice: ${sql}`);
  }
  if (faltam && !aplicar) console.log('\nPara criar: npm run indices -- --aplicar  (InnoDB cria sem bloquear; faça fora do horário de pico se a tabela for grande)');
  if (aplicar && faltam) console.log('\nRode de novo sem --aplicar para ver os tempos depois.');
} catch (e) { console.error(explicaErroDb ? explicaErroDb(e) : e.message); process.exitCode = 1; } finally { await c?.end(); }
