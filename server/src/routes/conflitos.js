import { Router } from 'express';
import { invalid } from '../errors.js';
import { verificaProgramacao } from '../services/conflitos.js';

const router = Router();
// Verificar possíveis problemas de programação (somente leitura): ?de=AAAA-MM-DD&ate=AAAA-MM-DD (até 31 dias)
router.get('/', async (req, res) => {
  try { res.json(await verificaProgramacao(String(req.query.de ?? ''), req.query.ate ? String(req.query.ate) : '')); } catch (e) {
    if (e.status === 422) throw invalid(e.message);
    throw e;
  }
});
export default router;
