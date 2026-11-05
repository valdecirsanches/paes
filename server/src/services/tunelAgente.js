import crypto from 'node:crypto';
import { AppError } from '../errors.js';
import { tokenAgente } from './ponteAgente.js';

/**
 * Túnel reverso com o agente de impressão. O agente (no computador das impressoras) chama GET /api/agente-tunel/proximo
 * (long-poll) e recebe, um a um, os pedidos que o sistema quer fazer a ele (status, destinos, imprimir, testar); executa no
 * próprio 127.0.0.1 e devolve o resultado por POST /api/agente-tunel/resposta. Só o agente abre conexão — funciona através de
 * NAT/roteador, sem porta liberada nem IP fixo, esteja o servidor onde estiver.
 */
const ESPERA_MS = 25_000; // quanto o servidor segura o "proximo" antes de responder vazio (o agente chama de novo)
const CONECTADO_MS = ESPERA_MS + 10_000;
export const ROTAS = new Set(['GET /status', 'GET /destinos', 'POST /imprimir', 'POST /testar']);

const fila = []; // pedidos esperando o agente
const aguardando = []; // conexões "proximo" abertas
const pendentes = new Map(); // id -> { ok, falha, t }
let visto = 0; let versao = null;

export const agenteConectado = () => Date.now() - visto < CONECTADO_MS;
export const estadoAgente = () => ({ conectado: agenteConectado(), visto_ha_s: visto ? Math.round((Date.now() - visto) / 1000) : null, versao });
export const zeraTunel = () => { for (const w of aguardando.splice(0)) { clearTimeout(w.t); try { w.res.status(204).end(); } catch { /* conexão já fechada */ } } visto = 0; versao = null; };

function entrega(w, job) { clearTimeout(w.t); w.res.json(job); }
/** Pede ao agente e espera a resposta. */
export function pedeAoAgente(metodo, caminho, corpo, timeoutMs = 30_000) {
  if (!ROTAS.has(`${metodo} ${caminho}`)) return Promise.reject(new AppError(403, 'Rota de agente não liberada.'));
  if (!agenteConectado()) return Promise.reject(new AppError(503, 'Nenhum agente de impressão conectado ao sistema. Abra o agente no computador das impressoras (Ferramentas › Configurar impressoras explica como instalar e conectar).'));
  return new Promise((ok, falha) => {
    const id = crypto.randomUUID();
    const t = setTimeout(() => { pendentes.delete(id); const i = fila.findIndex((j) => j.id === id); if (i >= 0) fila.splice(i, 1); falha(new AppError(504, 'O agente de impressão não respondeu a tempo. Confira se o computador das impressoras está ligado e com internet.')); }, timeoutMs);
    pendentes.set(id, { ok, falha, t });
    const job = { id, metodo, caminho, corpo };
    const w = aguardando.shift();
    if (w) entrega(w, job); else fila.push(job);
  });
}
/** Agente pedindo trabalho (long-poll). */
export function proximo(req, res) {
  visto = Date.now(); if (req.query.versao) versao = String(req.query.versao).slice(0, 20);
  const job = fila.shift();
  if (job) return res.json(job);
  const w = { res, t: setTimeout(() => { const i = aguardando.indexOf(w); if (i >= 0) aguardando.splice(i, 1); visto = Date.now(); res.status(204).end(); }, ESPERA_MS) };
  aguardando.push(w);
  res.on('close', () => { clearTimeout(w.t); const i = aguardando.indexOf(w); if (i >= 0) aguardando.splice(i, 1); });
}
/** Agente devolvendo o resultado de um pedido. */
export function responde({ id, status, corpo }) {
  visto = Date.now();
  const p = pendentes.get(id); if (!p) return false;
  pendentes.delete(id); clearTimeout(p.t);
  if (Number(status) >= 400) p.falha(new AppError(Number(status) >= 500 ? 502 : Number(status), corpo?.message || `O agente respondeu ${status}.`));
  else p.ok(corpo ?? {});
  return true;
}
/** Middleware: só o agente com o token certo. */
export async function exigeAgente(req, res, next) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
  const esperado = await tokenAgente();
  const a = Buffer.from(m?.[1] ?? ''); const b = Buffer.from(esperado);
  if (!m || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ message: 'Token do agente inválido.' });
  next();
}
