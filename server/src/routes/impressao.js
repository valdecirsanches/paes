import { Router } from 'express';
import { AppError } from '../errors.js';
import { novoTokenAgente, tokenAgente } from '../services/ponteAgente.js';
import { estadoAgente, pedeAoAgente, zeraTunel } from '../services/tunelAgente.js';

/**
 * Impressão pelo agente que roda em OUTRA máquina (o computador das impressoras). O navegador só fala direto com o agente no
 * próprio 127.0.0.1; quando isso não é possível ele usa estas rotas e o servidor entrega o pedido ao agente pelo túnel reverso
 * (o agente é quem conecta ao sistema, com o token — services/tunelAgente.js).
 */
const r = Router();
export const chamaAgente = (metodo, caminho, corpo, timeoutMs = 30000) => pedeAoAgente(metodo, caminho, corpo, timeoutMs);

const ehAdmin = (req) => String(req.user?.usuario ?? '').toUpperCase() === 'SANCHES';
const soAdmin = (req, _res, next) => (ehAdmin(req) ? next() : next(new AppError(403, 'Só o administrador vê ou troca o token do agente.')));

// Estado do agente conectado ao sistema. O token só aparece para o administrador (e vai embutido no instalador).
r.get('/config', async (req, res) => res.json({ ...estadoAgente(), token: ehAdmin(req) ? await tokenAgente() : undefined }));
r.post('/config/novo-token', soAdmin, async (_req, res) => { const token = await novoTokenAgente(); zeraTunel(); res.json({ ...estadoAgente(), token }); });
r.get('/status', async (_req, res) => res.json(await chamaAgente('GET', '/status', undefined, 4000)));
r.get('/destinos', async (_req, res) => res.json(await chamaAgente('GET', '/destinos', undefined, 6000)));
r.post('/imprimir', async (req, res) => res.json(await chamaAgente('POST', '/imprimir', req.body ?? {})));
r.post('/testar', async (req, res) => res.json(await chamaAgente('POST', '/testar', { destino: req.body?.destino }, 25000)));
export default r;
