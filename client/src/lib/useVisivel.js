import { useEffect, useRef } from 'react';

/** As telas do app ficam montadas (só escondidas) ao trocar de aba. Este hook chama `aoVisivel` toda vez que a tela volta a ser exibida,
 *  para ela recarregar os dados em vez de mostrar o que carregou na primeira abertura. Devolve o ref que vai no elemento raiz da tela. */
export function useAoFicarVisivel(aoVisivel) {
  const ref = useRef(null);
  const cb = useRef(aoVisivel);
  cb.current = aoVisivel;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    let viu = false; // a primeira exibição já é carregada pela própria tela
    const io = new IntersectionObserver((es) => {
      const v = es.some((e) => e.isIntersecting);
      if (v && viu) cb.current(); // voltou a aparecer
      if (v) viu = true;
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}
