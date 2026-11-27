import 'dotenv/config';
import { app } from './app.js';
import { dbConfig, explicaErroDb, pool } from './db.js';
import { garanteIndices } from './services/indices.js';
import { garanteColunaAtivo } from './services/produtosAtivo.js';
import { garanteColunasUnidadeNfe } from './services/unidadeNfe.js';
import { preaquece } from './services/mercCache.js';
import { consultaLista } from './routes/mercadorias.js';
import { limpaIncompletas } from './services/nfeResiduos.js';

const port = Number(process.env.PORT || 5071);
app.listen(port, async () => {
  console.log(`API da programação rodando em http://localhost:${port}`);
  if (!dbConfig.host || !dbConfig.user || !dbConfig.database) {
    console.error('✗ Falta configurar o banco: copie server/.env.example para server/.env e preencha DB_*.');
    return;
  }
  try {
    const [[r]] = await pool.query('select version() as v, database() as d');
    console.log(`✓ MySQL ${r.v} em ${dbConfig.host}, banco "${r.d}".`);
    garanteColunaAtivo(pool);
    garanteColunasUnidadeNfe(pool);
    // notas que ficaram pela metade (geração interrompida) são desfeitas sozinhas depois de 15 min, ao subir e a cada 10 min
    const limpa = () => limpaIncompletas({ minutos: 15 }).then((f) => { if (f.length) console.warn(`[nfe] ${f.length} nota(s) incompleta(s) desfeita(s): ${f.map((x) => x.id).join(', ')}`); }).catch((e) => console.warn(`[nfe] limpeza de incompletas: ${e.message}`));
    limpa(); setInterval(limpa, 10 * 60000).unref();
    garanteIndices(pool).catch((e) => console.warn(`[indices] ${e.message}`)).finally(() => {
      // Mercadorias de hoje/ontem/amanhã sempre quentes: a primeira abertura da tela não espera o banco
      const aquece = () => preaquece(consultaLista).catch(() => {});
      aquece(); setInterval(aquece, 60000).unref();
    });
  } catch (err) {
    console.error(`✗ Sem conexão com o banco: ${explicaErroDb(err)}`);
  }
});
