// Caixa alta ao digitar/colar nos campos de texto das telas marcadas com [data-caixa-alta] (Diária/Fixa e Cadastros).
// Escuta o evento "input" na captura, antes do React: converte o valor com o setter nativo (para o React ainda enxergar a mudança
// e chamar o onChange já com o texto em maiúsculas) e preserva a posição do cursor. Campos com [data-minusculas], e-mail, senha,
// número, data, somente leitura etc. ficam como estão.
const TIPOS_TEXTO = new Set(['', 'text', 'search']);
const setNativo = (el) => Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set;

export function converteCaixaAlta(el) {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  if (el instanceof HTMLInputElement && !TIPOS_TEXTO.has(el.type)) return false;
  if (el.readOnly || el.disabled || el.inputMode === 'decimal' || el.inputMode === 'numeric' || el.closest('[data-minusculas]') || !el.closest('[data-caixa-alta]')) return false;
  const v = el.value; const up = v.toUpperCase();
  if (up === v) return false;
  let ini = null; let fim = null;
  try { ini = el.selectionStart; fim = el.selectionEnd; } catch { /* tipo sem seleção */ }
  setNativo(el).call(el, up);
  try { if (ini !== null) el.setSelectionRange(ini, fim); } catch { /* idem */ }
  return true;
}

let ligado = false;
export function ligaCaixaAlta() {
  if (ligado || typeof document === 'undefined') return;
  ligado = true;
  document.addEventListener('input', (e) => { if (!e.isComposing) converteCaixaAlta(e.target); }, true);
}
