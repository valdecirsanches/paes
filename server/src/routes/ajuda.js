import { Router, json } from 'express';
import { invalid } from '../errors.js';
import { TELAS, statusIa, perguntar, narrar } from '../services/ajudaIa.js';

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

router.get('/status', (_req, res) => res.json(statusIa()));
router.get('/telas', (_req, res) => res.json(TELAS)); // texto da ajuda F1 (sem IA)
router.post('/chat', json({ limit: '30kb' }), async (req, res) => {
  limite(req);
  res.json({ resposta: await perguntar(String(req.body?.tela ?? ''), req.body?.mensagens) });
});
router.post('/voz', json({ limit: '20kb' }), async (req, res) => {
  limite(req, 30);
  res.type('audio/mpeg').send(await narrar(req.body?.texto));
});
export default router;
