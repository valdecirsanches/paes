import { useEffect, useRef } from 'react';
import { ehFabrica } from './perfil.js';

/** Fábrica: sempre que a tela volta a ser a aba ativa (as telas ficam montadas), chama `aoEntrar` — usado para reposicionar na data de hoje.
 *  Não dispara na primeira montagem (o estado já nasce com a data de hoje). */
export function useAoReativar(ativa, aoEntrar) {
  const jaAtiva = useRef(false);
  const fn = useRef(aoEntrar); fn.current = aoEntrar;
  useEffect(() => {
    if (ativa && jaAtiva.current && ehFabrica()) fn.current();
    jaAtiva.current = true;
  }, [ativa]);
}
