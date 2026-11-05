import { Router } from 'express';
import { exigeAgente, proximo, responde } from '../services/tunelAgente.js';

// Rotas do AGENTE de impressão (sem login de usuário: autenticadas pelo token do agente).
const r = Router();
r.use(exigeAgente);
r.get('/proximo', proximo);
r.post('/resposta', (req, res) => res.json({ ok: responde(req.body ?? {}) }));
export default r;
