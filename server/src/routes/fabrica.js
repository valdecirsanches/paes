// Área da fábrica: SOMENTE CONSULTA. Máquinas liberadas só para a fábrica entram aqui sem usuário/senha
// (exigeDispositivo já barrou o que não é da área); as demais precisam de login. Qualquer método que não seja GET é recusado.
import { Router } from 'express';
import { exigeLogin } from '../services/auth.js';
import { AppError } from '../errors.js';
import producaoRoutes from './producao.js';

const router = Router();
router.use((req, res, next) => (req.fabricaSemLogin ? next() : exigeLogin(req, res, next)));
router.use((req, _res, next) => (req.method === 'GET' ? next() : next(new AppError(403, 'A área da fábrica é somente para consulta.'))));
router.use('/producao', producaoRoutes);
export default router;
