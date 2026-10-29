import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export const ALT_LINHA = 31; // px — altura fixa das linhas (necessária para a janela de rolagem)
/**
 * Rolagem virtual: só as linhas visíveis (+ margem) existem no DOM. Com milhares de produtos o navegador
 * continua desenhando ~40 linhas, então clicar, marcar e rolar são instantâneos.
 */
export function useJanela(total, alt = ALT_LINHA) {
  const ref = useRef(null);
  const [j, setJ] = useState({ top: 0, h: 600 });
  const quadro = useRef(0);
  // O elemento da grade pode sumir e voltar (troca de aba): a cada render confere se mudou e, se sim, mede de novo e
  // refaz o observador — senão a janela guarda a rolagem/altura do elemento antigo e a grade volta vazia.
  const visto = useRef(null); const ro = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === visto.current) return;
    visto.current = el; ro.current?.disconnect(); ro.current = null;
    if (!el) return;
    const mede = () => setJ((x) => (x.h === (el.clientHeight || 600) ? x : { ...x, h: el.clientHeight || 600 }));
    setJ({ top: el.scrollTop, h: el.clientHeight || 600 });
    if (typeof ResizeObserver !== 'undefined') { ro.current = new ResizeObserver(mede); ro.current.observe(el); }
  });
  useEffect(() => () => ro.current?.disconnect(), []);
  const onScroll = useCallback((e) => {
    const top = e.currentTarget.scrollTop;
    if (quadro.current) return;
    quadro.current = requestAnimationFrame(() => { quadro.current = 0; setJ((x) => (Math.abs(x.top - top) < 1 ? x : { ...x, top })); });
  }, []);
  useEffect(() => () => cancelAnimationFrame(quadro.current), []);
  const ini = Math.max(0, Math.floor(j.top / alt) - 12);
  const fim = Math.min(total, Math.ceil((j.top + j.h) / alt) + 12);
  return { ref, onScroll, ini, fim, acima: ini * alt, abaixo: Math.max(0, total - fim) * alt };
}
