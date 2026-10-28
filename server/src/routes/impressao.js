import { Router } from 'express';
import { AppError, invalid } from '../errors.js';
import { configPonte, gravaPonte } from '../services/ponteAgente.js';

/**
 * Ponte para o agente de impressão que roda em OUTRA máquina (ex.: o servidor é Linux e a impressora está no Windows).
 * O navegador só consegue falar com o agente no próprio 127.0.0.1; quando isso não é possível ele usa estas rotas e o
 * servidor repassa ao agente pela rede, com o token. Variáveis: AGENTE_URL (ex.: http://192.168.15.8:9101) e AGENTE_TOKEN.
 */
const r = Router();

export async function chamaAgente(metodo, caminho, corpo, timeoutMs = 30000) {
  const { url: base, token } = await configPonte();
  if (!base || !token) throw new AppError(503, 'Ponte de impressão não configurada: informe o IP e o token do agente em Ferramentas › Configurar impressoras.');
  let resp;
  try {
    resp = await fetch(base + caminho, {
      method: metodo, signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Bearer ${token}`, 'X-Agente': 'paes', ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
  } catch (e) {
    throw new AppError(502, `Não consegui falar com o agente de impressão (${base}): ${e.name === 'TimeoutError' ? 'tempo esgotado' : e.cause?.code || e.message}. Confira se o computador está ligado, o agente rodando e a porta liberada no firewall.`);
  }
  const d = await resp.json().catch(() => ({}));
  if (resp.status === 401) throw new AppError(502, 'O agente recusou o token: confira o token (deve ser igual ao que aparece na página do agente, em "Acesso pela rede").');
  if (!resp.ok) throw new AppError(resp.status >= 500 ? 502 : resp.status, d.message || `O agente respondeu ${resp.status}.`);
  return d;
}

// Endereço/token do agente usados pelo servidor (gravados em arquivo; o token nunca volta para a tela).
r.get('/config', async (_req, res) => { const c = await configPonte(); res.json({ url: c.url, tem_token: Boolean(c.token), origem: c.origem }); });
r.put('/config', async (req, res) => {
  try { await gravaPonte({ url: req.body?.url, token: req.body?.token }); } catch (e) { throw invalid(e.message); }
  const c = await configPonte(); res.json({ url: c.url, tem_token: Boolean(c.token), origem: c.origem });
});
r.get('/status', async (_req, res) => res.json(await chamaAgente('GET', '/status', undefined, 4000)));
r.get('/destinos', async (_req, res) => res.json(await chamaAgente('GET', '/destinos', undefined, 4000)));
r.post('/imprimir', async (req, res) => res.json(await chamaAgente('POST', '/imprimir', req.body ?? {})));
r.post('/testar', async (req, res) => res.json(await chamaAgente('POST', '/testar', { destino: req.body?.destino }, 25000)));
export default r;
