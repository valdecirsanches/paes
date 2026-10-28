// Cache em memória da lista de "Venda de mercadorias" por data, no servidor:
//  - fresco (< 8 s): responde sem ir ao banco;
//  - velho (até 2 min): responde na hora e atualiza em segundo plano (stale-while-revalidate);
//  - chamadas simultâneas para a mesma data dividem uma única consulta;
//  - qualquer gravação feita por esta API (POST/PUT/DELETE em /api) esvazia o cache.
// Um pré-aquecimento periódico (server.js) mantém hoje/ontem/amanhã quentes, então a primeira abertura da tela não espera o banco.
const FRESCO_MS = 8000;
const VELHO_MS = 120000;
const MAX = 40;
const cache = new Map(); // data -> { rows, em, ms }
const voando = new Map();

export const invalidaMercadorias = () => cache.clear();
export const estatisticaCache = () => ({ entradas: cache.size });

function busca(data, consulta) {
  if (voando.has(data)) return voando.get(data);
  const p = (async () => {
    const t0 = process.hrtime.bigint();
    const rows = await consulta(data);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    cache.delete(data); cache.set(data, { rows, em: Date.now(), ms });
    while (cache.size > MAX) cache.delete(cache.keys().next().value);
    return { rows, ms };
  })().finally(() => voando.delete(data));
  voando.set(data, p);
  return p;
}

/** { rows, ms, origem: 'cache' | 'velho' | 'banco' } */
export async function mercadoriasDaData(data, consulta, agora = Date.now()) {
  const c = cache.get(data);
  if (c && agora - c.em < FRESCO_MS) return { rows: c.rows, ms: c.ms, origem: 'cache' };
  if (c && agora - c.em < VELHO_MS) { busca(data, consulta).catch(() => {}); return { rows: c.rows, ms: c.ms, origem: 'velho' }; }
  const r = await busca(data, consulta);
  return { ...r, origem: 'banco' };
}

const soma = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
/** Aquece hoje e os vizinhos, de forma sequencial (não disputa o banco com o usuário). */
export async function preaquece(consulta, hoje = new Date().toISOString().slice(0, 10)) {
  for (const d of [hoje, soma(hoje, 1), soma(hoje, -1)]) { try { await busca(d, consulta); } catch { /* banco fora: tenta no próximo ciclo */ } }
}
