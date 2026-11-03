import { api } from '../api.js';

/** Registra na auditoria algo que só acontece no navegador (impressão direta, gravação no N:…). Nunca atrapalha o fluxo. */
export function audita(acao, { entidade = 'app', idRegistro = '', ok = true, erro = '', detalhes = null, tela = '' } = {}) {
  try { api.post('/auditoria/evento', { acao, entidade, idRegistro: String(idRegistro ?? ''), ok, erro, detalhes, tela }).catch(() => {}); } catch { /* sem auditoria do cliente */ }
}
