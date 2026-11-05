import { Router } from 'express';
import { invalid } from '../errors.js';
import { isIsoDate } from '../rules.js';
import { montaDashboard } from '../services/dashboard.js';

const router = Router();
// Resumos do dia para o painel inicial (somente leitura).
router.get('/', async (req, res) => {
  const data = String(req.query.data ?? '');
  if (!isIsoDate(data)) throw invalid('Informe a data (AAAA-MM-DD).');
  res.json(await montaDashboard(data));
});
export default router;
