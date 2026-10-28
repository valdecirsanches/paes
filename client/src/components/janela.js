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
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const mede = () => setJ((x) => (x.h === el.clientHeight ? x : { ...x, h: el.clientHeight || 600 }));
    mede();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(mede) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
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
