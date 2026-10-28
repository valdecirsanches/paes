import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

/**
 * Ajustes milimétricos das etiquetas compartilhados por TODAS as estações (antes ficavam só no localStorage de cada
 * navegador). Guardados em arquivo (sem mexer no banco): { "etiqueta-mercadorias": { ajuste: {dx,dy,el:{...}}, altura: 41 } }.
 */
const arquivo = () => process.env.ETQ_LAYOUT_FILE || path.resolve(process.cwd(), 'etiquetas-layout.json');
const TIPO = /^etiqueta-[a-z]{2,30}$/;
let cache;
let fila = Promise.resolve();

export async function lerLayout() {
  if (cache !== undefined) return cache;
  try { cache = JSON.parse(await readFile(arquivo(), 'utf8')) || {}; } catch { cache = {}; }
  return cache;
}
const num = (v) => (Number.isFinite(Number(v)) && Math.abs(Number(v)) <= 1000 ? Number(v) : 0);

/** Normaliza o ajuste (só números nos campos conhecidos). Lança Error se o formato for inválido. */
export function limpaAjuste(a) {
  if (a == null) return null;
  if (typeof a !== 'object' || Array.isArray(a)) throw new Error('Ajuste inválido.');
  const r = {};
  if (a.dx !== undefined) r.dx = num(a.dx);
  if (a.dy !== undefined) r.dy = num(a.dy);
  if (a.el && typeof a.el === 'object') {
    r.el = {};
    for (const [cls, e] of Object.entries(a.el).slice(0, 40)) {
      if (!/^[a-z0-9 ]{1,20}$/.test(cls) || !e || typeof e !== 'object') continue;
      const x = {}; for (const k of ['x', 'y', 'fs']) if (e[k] !== undefined) x[k] = num(e[k]);
      if (Object.keys(x).length) r.el[cls] = x;
    }
  }
  return r;
}

/** Grava (ou remove, com ajuste/altura nulos) o layout de um tipo de etiqueta. */
export async function gravaLayout(tipo, { ajuste, altura }) {
  if (!TIPO.test(tipo)) throw new Error('Tipo de etiqueta inválido.');
  const p = fila.then(async () => {
    const todos = { ...(await lerLayout()) };
    const aj = limpaAjuste(ajuste); const h = num(altura) > 0 ? num(altura) : undefined;
    if (!aj && !h) delete todos[tipo]; else todos[tipo] = { ...(aj ? { ajuste: aj } : {}), ...(h ? { altura: h } : {}) };
    const tmp = `${arquivo()}.tmp`;
    await writeFile(tmp, JSON.stringify(todos, null, 2)); await rename(tmp, arquivo());
    cache = todos; return todos;
  });
  fila = p.catch(() => {});
  return p;
}
export const limpaCacheLayout = () => { cache = undefined; };
