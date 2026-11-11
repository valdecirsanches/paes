// Tema do app (cores dos botões e da barra, modo claro/escuro, tamanho da letra). Aplica na hora; fica salvo neste navegador (cópia local)
// e no servidor, por usuário — ao entrar, o tema do usuário vem do servidor (api: GET/PUT/DELETE /tema).
const CHAVE = 'paes_tema';
export const PADRAO = { btn: '#c8742b', barra: '#1a73c9', modo: 'claro', fonte: 100 };
export const FONTES = [90, 100, 110, 120, 130];
export const PREDEFINIDOS = [
  { nome: 'Padrão', btn: '#c8742b', barra: '#1a73c9' },
  { nome: 'Verde', btn: '#2f8a3e', barra: '#2c7a4b' },
  { nome: 'Roxo', btn: '#7a3fb0', barra: '#5b3a9a' },
  { nome: 'Vermelho', btn: '#c0392b', barra: '#a93226' },
  { nome: 'Grafite', btn: '#4a5560', barra: '#3b4650' },
  { nome: 'Turquesa', btn: '#16929a', barra: '#117a8b' },
  { nome: 'Azul', btn: '#1f6fd1', barra: '#1d4f91' },
  { nome: 'Rosa', btn: '#d6336c', barra: '#a61e4d' },
  { nome: 'Laranja', btn: '#e8590c', barra: '#b34700' },
  { nome: 'Oliva', btn: '#6b8e23', barra: '#4f6b1a' },
  { nome: 'Marrom', btn: '#9c6b3c', barra: '#6f4a28' },
  { nome: 'Índigo', btn: '#4263eb', barra: '#364fc7' },
];
const rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h ?? ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const hex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
/** Mistura a cor com branco (t>0) ou preto (t<0). */
export const mistura = (h, t) => { const c = rgb(h); if (!c) return h; const alvo = t >= 0 ? 255 : 0; return hex(c.map((v) => v + (alvo - v) * Math.abs(t))); };
const limpa = (t) => ({ btn: rgb(t?.btn) ? t.btn : PADRAO.btn, barra: rgb(t?.barra) ? t.barra : PADRAO.barra, modo: t?.modo === 'escuro' ? 'escuro' : 'claro', fonte: FONTES.includes(Number(t?.fonte)) ? Number(t.fonte) : 100 });
export function lerTema() { try { return limpa(JSON.parse(localStorage.getItem(CHAVE) ?? 'null')); } catch { return { ...PADRAO }; } }
export function gravarTema(t) { try { localStorage.setItem(CHAVE, JSON.stringify(limpa(t))); } catch { /* vale só nesta sessão */ } }
export function limparTema() { try { localStorage.removeItem(CHAVE); } catch { /* ok */ } }
/** Aplica as cores ao documento (variáveis CSS), derivando os tons de apoio. */
export function aplicarTema(t = lerTema()) {
  t = limpa(t);
  const r = document.documentElement.style;
  document.documentElement.classList.toggle('escuro', t.modo === 'escuro');
  r.zoom = t.fonte === 100 ? '' : String(t.fonte / 100); // tamanho da letra/da tela
  r.setProperty('--zoom', String(t.fonte / 100)); // a altura da janela compensa o zoom (senão sobra faixa vazia embaixo)
  r.setProperty('--cor-btn', t.btn); r.setProperty('--cor-btn-esc', mistura(t.btn, -0.18));
  r.setProperty('--azul-barra', t.barra); r.setProperty('--azul-barra-2', mistura(t.barra, -0.3));
  r.setProperty('--bt-1', mistura(t.barra, 0.93)); r.setProperty('--bt-2', mistura(t.barra, 0.62));
  r.setProperty('--bt-borda', mistura(t.barra, -0.1)); r.setProperty('--bt-texto', mistura(t.barra, -0.6));
}

// ---- por usuário, no servidor ----
let tempo = null;
/** Ao entrar: traz o tema do usuário do servidor (se já escolheu) e aplica; sem escolha, mantém o local. Falha de rede não atrapalha. */
export async function carregarTemaDoUsuario(api) {
  try { const r = await api.get('/tema'); if (r?.tema) { gravarTema(r.tema); aplicarTema(r.tema); } } catch { /* sem servidor: fica o tema local */ }
}
/** Aplica, guarda local e envia ao servidor (agrupa mudanças rápidas, como arrastar o seletor de cor). */
export function salvarTema(api, t) {
  const n = limpa(t); aplicarTema(n); gravarTema(n);
  clearTimeout(tempo); tempo = setTimeout(() => { api.put('/tema', n).catch(() => {}); }, 500);
}
export function restaurarTema(api) {
  clearTimeout(tempo); limparTema(); aplicarTema({ ...PADRAO }); api.del?.('/tema')?.catch?.(() => {});
}
