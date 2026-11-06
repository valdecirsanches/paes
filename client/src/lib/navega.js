// Pedido de navegação entre telas ({ data, id_unidade, id_status, id_item, destino: 'diaria' | 'fixa' }) (ex.: "Verificar problemas" → abrir a Programação diária na data/empresa do problema).
let pendente = null;
const EVENTO = 'abrir-diaria';
export const pedeAbrirDiaria = (alvo) => { pendente = alvo; window.dispatchEvent(new CustomEvent(EVENTO)); };
export const pegaPedidoDiaria = () => { const p = pendente; pendente = null; return p; };
export const aoPedirDiaria = (fn) => { window.addEventListener(EVENTO, fn); return () => window.removeEventListener(EVENTO, fn); };

// "Ações do dia ▸ Verificar problemas de programação" abre a tela de verificação já na data da programação
let pendConf = null;
const EV_CONF = 'abrir-conflitos';
export const pedeAbrirConflitos = (alvo) => { pendConf = alvo; window.dispatchEvent(new CustomEvent(EV_CONF)); };
export const pegaPedidoConflitos = () => { const p = pendConf; pendConf = null; return p; };
export const aoPedirConflitos = (fn) => { window.addEventListener(EV_CONF, fn); return () => window.removeEventListener(EV_CONF, fn); };
