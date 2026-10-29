import { useEffect, useRef } from 'react';

// Unidade/cliente selecionado, compartilhado entre Faturamento e Controle de comandas (as duas telas ficam montadas ao mesmo tempo).
let atual = null;
const ouvintes = new Set();
export const unidadeSelecionada = () => atual;
/** Anuncia a unidade escolhida pelo usuário; as outras telas acompanham (a tela de `origem` ignora o próprio aviso). */
export function publicaUnidade(id, origem) {
  if (id == null || id === atual) return;
  atual = id;
  ouvintes.forEach((f) => f(id, origem));
}
export function assinaUnidade(f) { ouvintes.add(f); return () => ouvintes.delete(f); }

/** Ref para o contêiner de rolagem da lista de unidades: leva a linha selecionada (`tr.sel`) à vista quando a unidade muda
 *  ou a tela volta a ficar visível (uma tela escondida não rola). */
export function useRolarParaSelecionada(chave) {
  const ref = useRef(null); const feito = useRef({ el: null, chave: null });
  useEffect(() => {
    const el = ref.current;
    if (!el || el.offsetParent === null) return;
    if (feito.current.el === el && feito.current.chave === chave) return;
    const s = el.querySelector('tr.sel'); if (!s) return;
    feito.current = { el, chave };
    el.scrollTop = Math.max(0, el.scrollTop + s.getBoundingClientRect().top - el.getBoundingClientRect().top - el.clientHeight / 2);
  });
  return ref;
}
