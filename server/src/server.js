import 'dotenv/config';
import { app } from './app.js';
import { dbConfig, explicaErroDb, pool } from './db.js';
import { garanteIndices } from './services/indices.js';
import { preaquece } from './services/mercCache.js';
import { consultaLista } from './routes/mercadorias.js';

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
    garanteIndices(pool).catch((e) => console.warn(`[indices] ${e.message}`)).finally(() => {
      // Mercadorias de hoje/ontem/amanhã sempre quentes: a primeira abertura da tela não espera o banco
      const aquece = () => preaquece(consultaLista).catch(() => {});
      aquece(); setInterval(aquece, 60000).unref();
    });
  } catch (err) {
    console.error(`✗ Sem conexão com o banco: ${explicaErroDb(err)}`);
  }
});
