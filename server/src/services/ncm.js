import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Conferência de NCM. Fonte principal: tabela oficial do Siscomex (baixada e guardada em arquivo por 30 dias);
 * se não der para baixá-la, consulta a BrasilAPI código a código. Sem nenhuma das duas, devolve ok: null (não conferido) — nunca bloqueia por falha de rede.
 */
const ARQ = () => process.env.NCM_CACHE_FILE || path.resolve(process.cwd(), 'ncm-tabela.json');
const URL_SISCOMEX = 'https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json?perfil=PUBLICO';
const VALIDADE_MS = 30 * 24 * 3600 * 1000;
let tabela; // Map(codigo8 -> { descricao, fim })
let falhouEm = 0;
const porCodigo = new Map();

const dig = (s) => String(s ?? '').replace(/\D/g, '');
const dataBr = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? '')); return m ? `${m[3]}-${m[2]}-${m[1]}` : String(s ?? '').slice(0, 10); };

/** Lê o JSON do Siscomex (objeto com array "Nomenclaturas" de { Codigo, Descricao, Data_Inicio, Data_Fim }) para um Map de códigos de 8 dígitos. */
export function parseTabela(json) {
  const lista = Array.isArray(json) ? json : Object.values(json ?? {}).find((v) => Array.isArray(v) && v[0] && typeof v[0] === 'object') ?? [];
  const m = new Map();
  for (const n of lista) {
    const c = dig(n.Codigo ?? n.codigo);
    if (c.length !== 8) continue;
    m.set(c, { descricao: String(n.Descricao ?? n.descricao ?? '').replace(/^[-\s]+/, ''), inicio: dataBr(n.Data_Inicio ?? n.dataInicio), fim: dataBr(n.Data_Fim ?? n.dataFim) });
  }
  return m;
}

async function carregaTabela() {
  if (tabela) return tabela;
  try {
    const st = await stat(ARQ());
    if (Date.now() - st.mtimeMs < VALIDADE_MS) { const m = parseTabela(JSON.parse(await readFile(ARQ(), 'utf8'))); if (m.size > 1000) return (tabela = m); }
  } catch { /* sem cache */ }
  if (Date.now() - falhouEm < 10 * 60 * 1000) return null; // não insiste a cada consulta
  try {
    const r = await fetch(URL_SISCOMEX, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    const m = parseTabela(json);
    if (m.size < 1000) throw new Error('tabela vazia');
    await writeFile(ARQ(), JSON.stringify(json)).catch(() => {});
    return (tabela = m);
  } catch { falhouEm = Date.now(); return null; }
}

/** @returns {Promise<{ok: boolean|null, descricao?: string, motivo?: string}>} */
export async function consultaNcm(codigo, hoje = new Date().toISOString().slice(0, 10)) {
  const c = dig(codigo);
  if (c.length !== 8) return { ok: false, motivo: 'O NCM precisa ter 8 dígitos.' };
  const t = await carregaTabela();
  if (t) {
    const n = t.get(c);
    if (!n) return { ok: false, motivo: `NCM ${c} não existe na tabela oficial (Siscomex).` };
    if (n.fim && n.fim < hoje) return { ok: false, descricao: n.descricao, motivo: `NCM ${c} não está mais vigente (encerrado em ${n.fim.split('-').reverse().join('/')}).` };
    return { ok: true, descricao: n.descricao };
  }
  if (porCodigo.has(c)) return porCodigo.get(c);
  try {
    const r = await fetch(`https://brasilapi.com.br/api/ncm/v1/${c}`, { signal: AbortSignal.timeout(8000) });
    let res;
    if (r.status === 404) res = { ok: false, motivo: `NCM ${c} não existe na tabela oficial.` };
    else if (r.ok) { const j = await r.json(); res = { ok: true, descricao: String(j.descricao ?? '') }; }
    if (res) { porCodigo.set(c, res); return res; }
  } catch { /* sem rede */ }
  return { ok: null, motivo: 'Não foi possível conferir o NCM agora (sem acesso à tabela).' };
}

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Pesquisa por código (início) ou palavras da descrição; até `limite` resultados vigentes. */
export async function pesquisaNcm(q, limite = 40, hoje = new Date().toISOString().slice(0, 10)) {
  const texto = String(q ?? '').trim();
  if (texto.length < 2) return { itens: [], fonte: null };
  const t = await carregaTabela();
  if (t) {
    const d = dig(texto);
    const palavras = norm(texto).split(/\s+/).filter(Boolean);
    const itens = [];
    for (const [codigo, n] of t) {
      if (n.fim && n.fim < hoje) continue;
      if (d && /^\d+$/.test(texto.replace(/[.\s]/g, '')) ? codigo.startsWith(d) : palavras.every((p) => norm(n.descricao).includes(p))) {
        itens.push({ codigo, descricao: n.descricao });
        if (itens.length >= limite) break;
      }
    }
    return { itens, fonte: 'Siscomex' };
  }
  try {
    const r = await fetch(`https://brasilapi.com.br/api/ncm/v1?search=${encodeURIComponent(texto)}`, { signal: AbortSignal.timeout(8000) });
    if (r.ok) { const j = await r.json(); return { itens: (Array.isArray(j) ? j : []).map((x) => ({ codigo: dig(x.codigo), descricao: String(x.descricao ?? '') })).filter((x) => x.codigo.length === 8).slice(0, limite), fonte: 'BrasilAPI' }; }
  } catch { /* sem rede */ }
  return { itens: [], fonte: null, motivo: 'Não foi possível consultar a tabela de NCM agora.' };
}
