import { Router } from 'express';
import { invalid } from '../errors.js';
import { gravaLayout, lerLayout } from '../services/layoutEtiquetas.js';

const r = Router();
r.get('/', async (_req, res) => res.json(await lerLayout()));
r.put('/:tipo', async (req, res) => {
  try { res.json(await gravaLayout(req.params.tipo, { ajuste: req.body?.ajuste, altura: req.body?.altura })); } catch (e) { throw invalid(e.message); }
});
export default r;
