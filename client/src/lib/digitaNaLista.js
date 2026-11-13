import { useCallback, useEffect, useRef, useState } from 'react';

const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Acha o primeiro item cujo texto contém todas as palavras digitadas (sem acento/maiúsculas). Palavra no início do texto
 *  tem preferência sobre uma que só aparece no meio. */
export function achaPorDigitacao(itens, texto, termo) {
  const ws = semAcento(termo).split(/\s+/).filter(Boolean);
  if (!ws.length) return null;
  const ok = itens.filter((r) => { const t = semAcento(texto(r)); return ws.every((w) => t.includes(w)); });
  return ok.find((r) => semAcento(texto(r)).startsWith(ws[0])) ?? ok[0] ?? null;
}

/** Digitar direto na lista/grade: cada letra vai montando o texto e a linha correspondente já é selecionada (sem campo de pesquisa).
 *  Backspace apaga, Esc limpa; o texto some sozinho depois de uma pausa. Use `props` no contêiner (ganha tabIndex) e `digitado` para exibir. */
export function useDigitaNaLista({ itens, texto, onAchar, idAtual, pausa = 1800 }) {
  const [digitado, setDigitado] = useState('');
  const buf = useRef(''); const timer = useRef(null);
  const ref = useRef({}); ref.current = { itens, texto, onAchar, idAtual };
  useEffect(() => () => clearTimeout(timer.current), []);
  const define = useCallback((v) => {
    buf.current = v; setDigitado(v);
    clearTimeout(timer.current);
    if (v) timer.current = setTimeout(() => { buf.current = ''; setDigitado(''); }, pausa);
    const { itens: it, texto: tx, onAchar: oa } = ref.current;
    const r = v ? achaPorDigitacao(it, tx, v) : null;
    if (r) oa(r);
  }, [pausa]);
  const onKeyDown = useCallback((e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t?.closest?.('input, select, textarea, [contenteditable=true], dialog')) return; // campos mantêm o teclado
    const passo = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8, Home: -Infinity, End: Infinity }[e.key];
    if (passo !== undefined) { // setas: passam de uma linha para a outra
      const { itens: it, idAtual: ia, onAchar: oa } = ref.current;
      if (!it.length || e.shiftKey) return;
      e.preventDefault();
      const i = it.findIndex((r) => r.id === ia);
      const n = it[Math.min(it.length - 1, Math.max(0, i < 0 ? (passo > 0 ? 0 : it.length - 1) : i + passo))];
      buf.current = ''; setDigitado(''); oa(n);
      requestAnimationFrame(() => document.querySelector('.cmd-g-uni tr.sel, .fp-lista tr.sel')?.scrollIntoView({ block: 'nearest' }));
      return;
    }
    if (e.key === 'Escape' && buf.current) { e.preventDefault(); define(''); return; }
    if (e.key === 'Backspace' && buf.current) { e.preventDefault(); define(buf.current.slice(0, -1)); return; }
    if (e.key.length !== 1) return;
    if (e.key === ' ' && !buf.current) return; // espaço inicial: deixa o comportamento normal (ex.: acionar botão)
    e.preventDefault();
    define(buf.current + e.key);
  }, [define]);
  return { digitado, props: { tabIndex: 0, onKeyDown } };
}
