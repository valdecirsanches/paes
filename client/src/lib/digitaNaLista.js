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
export function useDigitaNaLista({ itens, texto, onAchar, pausa = 1800 }) {
  const [digitado, setDigitado] = useState('');
  const buf = useRef(''); const timer = useRef(null);
  const ref = useRef({}); ref.current = { itens, texto, onAchar };
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
    if (e.key === 'Escape' && buf.current) { e.preventDefault(); define(''); return; }
    if (e.key === 'Backspace' && buf.current) { e.preventDefault(); define(buf.current.slice(0, -1)); return; }
    if (e.key.length !== 1) return;
    if (e.key === ' ' && !buf.current) return; // espaço inicial: deixa o comportamento normal (ex.: acionar botão)
    e.preventDefault();
    define(buf.current + e.key);
  }, [define]);
  return { digitado, props: { tabIndex: 0, onKeyDown } };
}
