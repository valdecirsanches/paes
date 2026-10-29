import express from 'express';
import cors from 'cors';
import { dbConfig, explicaErroDb, pool } from './db.js';
import statusRoutes from './routes/status.js';
import diariaRoutes from './routes/diaria.js';
import fixaRoutes from './routes/fixa.js';
import apoioRoutes from './routes/apoio.js';
import relatoriosRoutes from './routes/relatorios.js';
import reclamacoesRoutes from './routes/reclamacoes.js';
import mercadoriasRoutes from './routes/mercadorias.js';
import producaoRoutes from './routes/producao.js';
import faturamentoRoutes from './routes/faturamento.js';
import nfeRoutes from './routes/nfe.js';
import comandasRoutes from './routes/comandas.js';
import cargasRoutes from './routes/cargas.js';
import itinerarioRoutes from './routes/itinerario.js';
import tributosRoutes from './routes/tributos.js';
import funcionariosRoutes from './routes/funcionarios.js';
import clientesRoutes from './routes/clientes.js';
import produtosRoutes from './routes/produtos.js';
import authRoutes from './routes/auth.js';
import agenteRoutes from './routes/agente.js';
import impressaoRoutes from './routes/impressao.js';
import layoutEtiquetasRoutes from './routes/layoutEtiquetas.js';
import nfsConfirmadasRoutes from './routes/nfsConfirmadas.js';
import { invalidaMercadorias } from './services/mercCache.js';
import { exigeLogin } from './services/auth.js';
import { exigeDispositivo } from './services/dispositivos.js';
import fabricaRoutes from './routes/fabrica.js';
import dispositivosAdmin, { publica as dispositivoPublico } from './routes/dispositivos.js';

export const app = express();
const origens = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origens.length ? origens : true }));
app.use(express.json({ limit: '6mb' })); // etiquetas em PNG/base64 vão para a ponte de impressão

// Dispositivo habilitado: antes do login (a tela de bloqueio mostra o código). /api/dispositivo e /api/health são livres.
app.use('/api', exigeDispositivo);
app.use('/api/dispositivo', dispositivoPublico);
app.use('/api/fabrica', fabricaRoutes); // só consulta; máquinas da fábrica entram sem login
// Login obrigatório em /api (menos /api/auth/login e /api/health). O usuário da sessão vira req.userId (logs de diária/fixa).
app.use('/api', exigeLogin);
// qualquer gravação feita por esta API esvazia o cache de Mercadorias (o resto é conferido a cada 8 s)
app.use('/api', (req, res, next) => { if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) invalidaMercadorias(); }); next(); });
app.use('/api/auth', authRoutes);
app.use('/api/dispositivos', dispositivosAdmin);
app.use('/api/agente', agenteRoutes);
app.use('/api/impressao', impressaoRoutes);
app.use('/api/layout-etiquetas', layoutEtiquetasRoutes);

// Teste rápido de conexão: abra http://localhost:5071/api/health
app.get('/api/health', async (_req, res) => {
  try {
    const [[r]] = await pool.query('select version() as versao, database() as banco');
    res.json({ ok: true, host: dbConfig.host, banco: r.banco, mysql: r.versao });
  } catch (err) {
    res.status(503).json({ ok: false, host: dbConfig.host, banco: dbConfig.database, message: explicaErroDb(err), code: err.code });
  }
});

app.use('/api/status', statusRoutes);
app.use('/api/mercadorias', mercadoriasRoutes);
app.use('/api/producao', producaoRoutes);
app.use('/api/faturamento', faturamentoRoutes);
app.use('/api/nfe', nfeRoutes);
app.use('/api/comandas', comandasRoutes);
app.use('/api/cargas', cargasRoutes);
app.use('/api/itinerario', itinerarioRoutes);
app.use('/api/tributos', tributosRoutes);
app.use('/api/nfs', nfsConfirmadasRoutes);
app.use('/api/cadastros/funcionarios', funcionariosRoutes);
app.use('/api/cadastros/clientes', clientesRoutes);
app.use('/api/cadastros/produtos', produtosRoutes);
app.use('/api', diariaRoutes);
app.use('/api', fixaRoutes);
app.use('/api', apoioRoutes);
app.use('/api', relatoriosRoutes);
app.use('/api', reclamacoesRoutes);

app.use((req, res) => res.status(404).json({ message: 'Rota não encontrada.' }));

// Express 5 já encaminha erros de handlers async para cá.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  // O Cloudflare troca qualquer 502/504 vindo da origem pela página "Bad gateway" e esconde a mensagem; falhas da API de NF-e saem como 424.
  if (err.status) return res.status([502, 504].includes(err.status) ? 424 : err.status).json({ message: err.message, ...err.extra });
  console.error(`[${req.method} ${req.originalUrl}]`, err);
  // Erro de banco/servidor: mostra o motivo (a rede é interna) em vez de um "erro interno" mudo.
  return res.status(500).json({ message: explicaErroDb(err), code: err.code });
});
