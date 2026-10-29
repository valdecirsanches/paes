// Unidade/cliente selecionado, compartilhado entre Faturamento e Controle de comandas (as duas telas ficam montadas ao mesmo tempo).
let atual = null;
const ouvintes = new Set();
export const unidadeSelecionada = () => atual;
/** Anuncia a unidade escolhida pelo usuário; as outras telas acompanham. */
export function publicaUnidade(id) {
  if (id == null || id === atual) return;
  atual = id;
  ouvintes.forEach((f) => f(id));
}
export function assinaUnidade(f) { ouvintes.add(f); return () => ouvintes.delete(f); }
