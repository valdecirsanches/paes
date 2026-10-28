import { useEffect, useRef } from 'react';
import $ from 'jquery';
import toastr from 'toastr';
import 'toastr/build/toastr.min.css';

// Mensagens e perguntas do sistema, todas via toastr.
window.jQuery = window.$ = $;
toastr.options = { positionClass: 'toast-top-center', newestOnTop: true, preventDuplicates: false, progressBar: true, closeButton: true, escapeHtml: true, showDuration: 120, hideDuration: 200 };

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Um <dialog> modal deixa o resto da página inerte: com algum aberto, o contêiner dos toasts vai para dentro dele.
function contêiner() {
  const modais = [...document.querySelectorAll('dialog')].filter((d) => d.open && d.matches(':modal'));
  const pai = modais[modais.length - 1] ?? document.body;
  let c = document.getElementById('toast-container');
  if (!c) { c = document.createElement('div'); c.id = 'toast-container'; c.className = 'toast-top-center'; c.setAttribute('aria-live', 'polite'); }
  if (c.parentNode !== pai) pai.appendChild(c);
}

const TEMPOS = { ok: 3500, info: 5000, aviso: 7000, erro: 9000 };
/** tipo: 'ok' | 'erro' | 'aviso' | 'info' */
export function mensagem(tipo, texto) {
  if (!texto) return;
  contêiner();
  const fn = { ok: 'success', erro: 'error', aviso: 'warning', info: 'info' }[tipo] ?? 'info';
  if (tipo !== 'erro') { toastr[fn](String(texto), '', { timeOut: TEMPOS[tipo] ?? 5000, extendedTimeOut: 2000 }); return; }
  // erro: tem botão para copiar a mensagem (e fica mais tempo na tela)
  const $t = toastr.error(`<div class="tq-msg">${esc(texto)}</div><button type="button" class="tq-copiar" title="Copiar a mensagem">📋 Copiar</button>`, '', { timeOut: 20000, extendedTimeOut: 8000, escapeHtml: false, tapToDismiss: false });
  $t.find('.tq-copiar').on('click', function copia(e) {
    e.stopPropagation();
    const bt = this;
    copiaTexto(String(texto)).then(() => { bt.textContent = '✔ Copiado'; setTimeout(() => { bt.textContent = '📋 Copiar'; }, 1800); }, () => { bt.textContent = 'Não foi possível copiar'; });
  });
}
export async function copiaTexto(t) {
  try { await navigator.clipboard.writeText(t); return; } catch { /* sem permissão/contexto inseguro: usa o método antigo */ }
  const a = document.createElement('textarea'); a.value = t; a.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(a); a.select();
  const ok = document.execCommand('copy'); a.remove(); if (!ok) throw new Error('copy');
}

/** Pergunta com botões (Sim/Não ou opções próprias). Fica na tela até alguém responder; Esc cancela. Devolve função que a fecha. */
export function perguntar({ texto, opcoes, aoCancelar, campo }) {
  contêiner();
  const ops = opcoes ?? [{ rotulo: 'Sim' }, { rotulo: 'Não' }];
  const entrada = campo === undefined ? '' : `<input class="tq-in" value="${esc(campo)}" />`;
  const html = `<div class="tq-texto">${esc(texto)}</div>${entrada}<div class="tq-botoes">${ops.map((o, i) => `<button type="button" class="tq-bt" data-i="${i}">${esc(o.rotulo)}</button>`).join('')}</div>`;
  const $t = toastr.warning(html, '', { timeOut: 0, extendedTimeOut: 0, closeButton: false, tapToDismiss: false, progressBar: false, escapeHtml: false });
  let respondido = false;
  const fecha = () => { toastr.clear($t, { force: true }); };
  $t.find('.tq-bt').on('click', function clique() { respondido = true; fecha(); ops[Number(this.dataset.i)].acao?.($t.find('.tq-in').val()); });
  $t.find('.tq-in').on('keydown', (e) => { if (e.key === 'Enter') $t.find('.tq-bt').first().trigger('click'); });
  $t.on('keydown', (e) => { if (e.key === 'Escape') { respondido = true; fecha(); aoCancelar?.(); } });
  setTimeout(() => { const i = $t.find('.tq-in'); if (i.length) { i.trigger('focus'); i[0].select(); } else $t.find('.tq-bt').first().trigger('focus'); }, 30);
  return () => { if (!respondido) { respondido = true; fecha(); } };
}

/** Mostra `aviso` ({ tipo, m }) como toast sempre que o objeto mudar. Não desenha nada. */
export function Toast({ aviso }) {
  useEffect(() => { if (aviso) mensagem(aviso.tipo, aviso.m); }, [aviso]);
  return null;
}

/** Pergunta Sim/Não (substitui o MessageDlg). Some sozinha se o componente for desmontado. */
export function Confirma({ texto, onSim, onFechar }) {
  const r = useRef({ onSim, onFechar });
  r.current = { onSim, onFechar };
  useEffect(() => perguntar({
    texto,
    opcoes: [{ rotulo: 'Sim', acao: () => { r.current.onFechar?.(); r.current.onSim?.(); } }, { rotulo: 'Não', acao: () => r.current.onFechar?.() }],
    aoCancelar: () => r.current.onFechar?.(),
  }), [texto]);
  return null;
}

/** Pergunta com opções próprias: opcoes = [{ rotulo, acao }]. */
export function Pergunta({ texto, opcoes, onFechar }) {
  const r = useRef({ opcoes, onFechar });
  r.current = { opcoes, onFechar };
  useEffect(() => perguntar({
    texto,
    opcoes: r.current.opcoes.map((o) => ({ rotulo: o.rotulo, acao: () => { r.current.onFechar?.(); o.acao?.(); } })),
    aoCancelar: () => r.current.onFechar?.(),
  }), [texto]);
  return null;
}

/** Pergunta Sim/Não que devolve uma Promise<boolean> (substitui window.confirm). */
export const confirmar = (texto) => new Promise((ok) => {
  let fim = false;
  const r = (v) => { if (!fim) { fim = true; ok(v); } };
  perguntar({ texto, opcoes: [{ rotulo: 'Sim', acao: () => r(true) }, { rotulo: 'Não', acao: () => r(false) }], aoCancelar: () => r(false) });
});
/** Pede um valor (substitui window.prompt). Devolve o texto ou null se cancelar. */
export const entrada = (texto, padrao = '') => new Promise((ok) => {
  let fim = false;
  const r = (v) => { if (!fim) { fim = true; ok(v); } };
  perguntar({ texto, campo: padrao, opcoes: [{ rotulo: 'OK', acao: (v) => r(v) }, { rotulo: 'Cancelar', acao: () => r(null) }], aoCancelar: () => r(null) });
});
