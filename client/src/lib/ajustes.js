// Ajustes milimétricos do layout das etiquetas (por estação, no localStorage): deslocamento geral,
// deslocamento e fonte de cada elemento. São aplicados como CSS por cima do layout padrão, tanto no
// navegador quanto na impressão pelo agente (que desenha a mesma HTML).
import { api } from '../api.js';
export const CHAVE_AJ = 'paes_etq_ajustes';
const CHAVE_MAPA = 'paes_impressoras'; // mesmo localStorage de lib/impressora.js (destino é por estação; a altura da etiqueta é compartilhada)

/** Elementos ajustáveis de cada etiqueta: [classe, rótulo, fonte padrão em pt (ou null)]. */
export const ELEMENTOS = {
  'etiqueta-mercadorias': [['u', 'Nome da unidade', 24], ['ln', 'Traço', null], ['dt', 'Dia - data', 12], ['hr', 'Hora', 16], ['q', 'Quantidade', 16], ['ds', 'Descrição', 12], ['cf', 'Favor conferir', 8]],
  'etiqueta-item': [['nome', 'Nome da unidade', 16], ['l1', 'Traço', null], ['dt', 'Dia - data', 11], ['hora', 'Hora', 12], ['qt', 'Quantidades', 12], ['ds', 'Descrição', 8], ['ob', 'Observação', 8], ['in', 'Informação', 6], ['ct', 'Contador', 6]],
  'etiqueta-carga': [['nome', 'Nome da unidade', 16], ['l1', 'Traço', null], ['dt', 'Dia - data', 11], ['hora', 'Hora', 12], ['qt', 'Quantidades', 12], ['ds', 'Descrição', 8], ['ob', 'Observação', 8], ['in', 'Informação', 6], ['ct', 'Contador', 6]],
  'etiqueta-validade': [['bx', 'Moldura', null], ['t', 'Título', 12], ['p', 'Peso', 8], ['tr', 'Tara', 8], ['il', 'Ingredientes (rótulo)', 5], ['ing', 'Ingredientes', 4], ['f', 'Fabricação (rótulo)', 6], ['fd', 'Fabricação (data)', 6], ['v', 'Validade (rótulo)', 6], ['vd', 'Validade (data)', 6], ['fb', 'Fabricante', 5], ['cn', 'CNPJ', 5]],
  'etiqueta-nutricionista': [['et img', 'Logotipo', null], ['h', 'Homenagem', 10], ['n', 'Nome da unidade', 16], ['l', 'Traço', null], ['x', 'Nutricionista', 20]],
};
/** Raiz de cada etiqueta (seletor do contêiner posicionado). */
const RAIZ = { 'etiqueta-nutricionista': '.et' };

export function lerAjustes() { try { return JSON.parse(localStorage.getItem(CHAVE_AJ) ?? '{}') || {}; } catch { return {}; } }
export function gravarAjustes(a) { try { localStorage.setItem(CHAVE_AJ, JSON.stringify(a)); } catch { /* vale só nesta sessão */ } }

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const mm = (v) => `${Math.round(v * 1000) / 1000}mm`;

/** CSS que desloca/redimensiona os elementos conforme os ajustes do tipo (vazio se não há ajustes). */
export function cssAjustes(tipo, todos = lerAjustes()) {
  const a = todos[tipo]; if (!a) return '';
  const gx = n(a.dx), gy = n(a.dy); const raiz = RAIZ[tipo] ?? '.e';
  const els = ELEMENTOS[tipo] ?? [];
  let css = '';
  const rolo = !els.length && (gx || gy);
  if (rolo) css += `${raiz}>*{margin-left:${mm(gx)}!important;margin-top:${mm(gy)}!important}`;
  for (const [cls] of els) {
    const e = a.el?.[cls] ?? {}; const x = gx + n(e.x), y = gy + n(e.y);
    const sel = `.${cls}`;
    const regras = [];
    if (x || y) regras.push(`margin-left:${mm(x)}!important`, `margin-top:${mm(y)}!important`);
    if (n(e.fs) > 0) regras.push(`font-size:${n(e.fs)}pt!important`);
    if (regras.length) css += `${sel}{${regras.join(';')}}`;
  }
  return css;
}
/** Há algum ajuste gravado para o tipo? */
export const temAjuste = (tipo) => Boolean(cssAjustes(tipo));

// ---- compartilhamento entre estações: o servidor guarda o layout (arquivo, sem banco); o localStorage é só cache local.
const lerMapaLocal = () => { try { return JSON.parse(localStorage.getItem(CHAVE_MAPA) ?? '{}') || {}; } catch { return {}; } };
const gravaMapaLocal = (m) => { try { localStorage.setItem(CHAVE_MAPA, JSON.stringify(m)); } catch { /* só nesta sessão */ } };
let ultimaSync = 0;
/** Traz o layout do servidor para esta estação. Se o servidor ainda não tem nada, envia o que esta estação já ajustou. */
export async function sincronizaLayout({ forcar = false, espera = 4000 } = {}) {
  if (!forcar && Date.now() - ultimaSync < 5000) return;
  ultimaSync = Date.now();
  try {
    const srv = await Promise.race([api.get('/layout-etiquetas'), new Promise((_, rej) => setTimeout(() => rej(new Error('tempo')), espera))]);
    const tipos = Object.keys(srv ?? {});
    if (!tipos.length) { // migração: a estação que já tinha ajustes os publica
      const aj = lerAjustes(); const mapa = lerMapaLocal();
      for (const t of new Set([...Object.keys(aj), ...Object.keys(mapa).filter((k) => Number(mapa[k]?.altura) > 0)])) await api.put(`/layout-etiquetas/${t}`, { ajuste: aj[t] ?? null, altura: mapa[t]?.altura ?? null }).catch(() => {});
      return;
    }
    const aj = {}; const mapa = lerMapaLocal();
    for (const t of tipos) if (srv[t].ajuste) aj[t] = srv[t].ajuste;
    for (const t of new Set([...tipos, ...Object.keys(mapa)])) {
      const h = srv[t]?.altura;
      if (h) mapa[t] = { ...mapa[t], altura: h };
      else if (mapa[t]?.altura !== undefined) { delete mapa[t].altura; if (!mapa[t].destino) delete mapa[t]; }
    }
    gravarAjustes(aj); gravaMapaLocal(mapa);
  } catch { /* servidor fora: usa o cache local */ }
}
const filaEnvio = {};
/** Publica o layout atual de um tipo (ajuste + altura) para as outras estações; agrupa gravações rápidas do editor. */
export function publicaLayout(tipo) {
  clearTimeout(filaEnvio[tipo]);
  filaEnvio[tipo] = setTimeout(() => {
    api.put(`/layout-etiquetas/${tipo}`, { ajuste: lerAjustes()[tipo] ?? null, altura: lerMapaLocal()[tipo]?.altura ?? null }).catch(() => {});
  }, 500);
}
