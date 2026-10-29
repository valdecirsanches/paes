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
