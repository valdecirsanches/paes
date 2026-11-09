import { Router } from 'express';
import { invalid } from '../errors.js';
import { normalizaTema, lerTemaUsuario, gravaTemaUsuario, apagaTemaUsuario } from '../services/temaUsuario.js';

// Aparência do usuário logado: GET (null = ainda não escolheu), PUT { btn, barra, modo, fonte }, DELETE (volta ao padrão).
const router = Router();
const quem = (req) => { const id = Number(req.user?.id); if (!Number.isInteger(id) || id <= 0) throw invalid('Usuário sem cadastro para guardar a aparência.'); return id; };
router.get('/', async (req, res) => res.json({ tema: await lerTemaUsuario(quem(req)) }));
router.put('/', async (req, res) => { const t = normalizaTema(req.body); await gravaTemaUsuario(quem(req), t); res.json({ tema: t }); });
router.delete('/', async (req, res) => { await apagaTemaUsuario(quem(req)); res.json({ tema: null }); });
export default router;
