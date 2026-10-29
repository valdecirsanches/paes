// Perfil da máquina: na área da fábrica, os botões de ajustes (etiqueta, preço, cobrança, configurações) não aparecem.
let fabrica = false;
export const setFabrica = (v) => { fabrica = Boolean(v); };
export const ehFabrica = () => fabrica;
