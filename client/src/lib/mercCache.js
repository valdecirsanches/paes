// Cache de "Venda de mercadorias" por data: a tela mostra o que já tem NA HORA e confere com o servidor em segundo plano
// (stale-while-revalidate). Datas vizinhas e a de hoje são buscadas antecipadamente, então abrir a tela e trocar de dia
// quase nunca esperam o banco.
import { api } from '../api.js';
import { hoje } from './rules.js';

const cache = new Map(); // data -> { rows, em }
const voando = new Map();
export let ultima = null; // { ms, servidor, linhas } da última busca ao servidor (para diagnóstico na tela) // data -> Promise (uma consulta por data de cada vez)
const CHAVE = 'paes_merc_cache';
const MAX = 12;

try { for (const [d, v] of Object.entries(JSON.parse(sessionStorage.getItem(CHAVE) ?? '{}'))) cache.set(d, v); } catch { /* sem sessionStorage */ }
const grava = () => { try { const o = {}; [...cache.entries()].slice(-MAX).forEach(([d, v]) => { o[d] = v; }); sessionStorage.setItem(CHAVE, JSON.stringify(o)); } catch { /* cheio ou bloqueado */ } };

export const doCache = (data) => cache.get(data)?.rows ?? null;
export const invalida = (data) => { if (data) cache.delete(data); else cache.clear(); grava(); };

/** Busca no servidor (juntando chamadas simultâneas) e atualiza o cache. */
export function buscaMercadorias(data) {
  if (voando.has(data)) return voando.get(data);
  const t0 = performance.now();
  const p = api.get(`/mercadorias?data=${data}`).then((rows) => {
    ultima = { ms: Math.round(performance.now() - t0), servidor: api.ultimoTiming, linhas: rows.length };
    cache.delete(data); cache.set(data, { rows, em: Date.now() });
    while (cache.size > MAX) cache.delete(cache.keys().next().value);
    grava(); return rows;
  }).finally(() => voando.delete(data));
  voando.set(data, p);
  return p;
}

const mais = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
/** Antecipa a data e as vizinhas (ontem/amanhã) sem atrapalhar o que o usuário está fazendo. */
export function preaquece(data = hoje()) {
  const agenda = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 800));
  [data, mais(data, 1), mais(data, -1)].forEach((d, i) => { if (!cache.has(d)) agenda(() => setTimeout(() => buscaMercadorias(d).catch(() => {}), i * 300)); });
}
