// Tema do app (cores dos botões e da barra). Vale neste navegador; aplica na hora e fica salvo.
const CHAVE = 'paes_tema';
export const PADRAO = { btn: '#c8742b', barra: '#1a73c9' };
export const PREDEFINIDOS = [
  { nome: 'Padrão', btn: '#c8742b', barra: '#1a73c9' },
  { nome: 'Verde', btn: '#2f8a3e', barra: '#2c7a4b' },
  { nome: 'Roxo', btn: '#7a3fb0', barra: '#5b3a9a' },
  { nome: 'Vermelho', btn: '#c0392b', barra: '#a93226' },
  { nome: 'Grafite', btn: '#4a5560', barra: '#3b4650' },
  { nome: 'Turquesa', btn: '#16929a', barra: '#117a8b' },
];
const rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h ?? ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const hex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
/** Mistura a cor com branco (t>0) ou preto (t<0). */
export const mistura = (h, t) => { const c = rgb(h); if (!c) return h; const alvo = t >= 0 ? 255 : 0; return hex(c.map((v) => v + (alvo - v) * Math.abs(t))); };
export function lerTema() { try { const t = JSON.parse(localStorage.getItem(CHAVE) ?? 'null'); return { btn: rgb(t?.btn) ? t.btn : PADRAO.btn, barra: rgb(t?.barra) ? t.barra : PADRAO.barra }; } catch { return { ...PADRAO }; } }
export function gravarTema(t) { try { localStorage.setItem(CHAVE, JSON.stringify(t)); } catch { /* vale só nesta sessão */ } }
export function limparTema() { try { localStorage.removeItem(CHAVE); } catch { /* ok */ } }
/** Aplica as cores ao documento (variáveis CSS), derivando os tons de apoio. */
export function aplicarTema(t = lerTema()) {
  const r = document.documentElement.style;
  r.setProperty('--cor-btn', t.btn); r.setProperty('--cor-btn-esc', mistura(t.btn, -0.18));
  r.setProperty('--azul-barra', t.barra); r.setProperty('--azul-barra-2', mistura(t.barra, -0.3));
  r.setProperty('--bt-1', mistura(t.barra, 0.93)); r.setProperty('--bt-2', mistura(t.barra, 0.62));
  r.setProperty('--bt-borda', mistura(t.barra, -0.1)); r.setProperty('--bt-texto', mistura(t.barra, -0.6));
}
