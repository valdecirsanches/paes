import { Router, json } from 'express';
import { AppError, invalid } from '../errors.js';
import { lerVozCfg, gravarVozCfg, normaliza, MODELOS } from '../services/ajudaVozStore.js';
import { TELAS, statusIa, perguntar, narrar, listarVozes } from '../services/ajudaIa.js';

const router = Router();
// limite simples por usuário/dispositivo: protege o custo das APIs de IA e voz
const uso = new Map();
function limite(req, max = 40) {
  const k = `${req.userId ?? req.dispositivo ?? req.ip}`, agora = Date.now();
  const l = (uso.get(k) ?? []).filter((t) => agora - t < 60000);
  if (l.length >= max) throw invalid('Muitas perguntas seguidas. Aguarde um minuto.');
  l.push(agora); uso.set(k, l);
  if (uso.size > 2000) uso.clear();
}

router.get('/status', async (_req, res) => res.json(await statusIa()));
router.get('/telas', (_req, res) => res.json(TELAS)); // texto da ajuda F1 (sem IA)
router.post('/chat', json({ limit: '30kb' }), async (req, res) => {
  limite(req);
  res.json({ resposta: await perguntar(String(req.body?.tela ?? ''), req.body?.mensagens) });
});
router.post('/voz', json({ limit: '20kb' }), async (req, res) => {
  limite(req, 30);
  res.type('audio/mpeg').send(await narrar(req.body?.texto));
});

// Escolha da voz: só o administrador (SANCHES)
const soAdmin = (req, _res, next) => (String(req.user?.usuario ?? '').toUpperCase() === 'SANCHES' ? next() : next(new AppError(403, 'Só o administrador escolhe a voz do assistente.')));
router.get('/voz/config', soAdmin, async (_req, res) => res.json({ ...(await lerVozCfg()), modelos: MODELOS, chaveConfigurada: Boolean(process.env.ELEVENLABS_API_KEY) }));
router.get('/voz/vozes', soAdmin, async (_req, res) => res.json(await listarVozes()));
router.put('/voz/config', soAdmin, json({ limit: '10kb' }), async (req, res) => res.json(await gravarVozCfg(req.body)));
router.post('/voz/teste', soAdmin, json({ limit: '10kb' }), async (req, res) => {
  limite(req, 20);
  const aj = normaliza(req.body);
  if (!aj.voiceId) throw invalid('Escolha uma voz para testar.');
  res.type('audio/mpeg').send(await narrar(String(req.body?.texto || 'Olá! Eu sou o assistente do sistema. Posso explicar como usar cada tela.'), aj));
});
export default router;
