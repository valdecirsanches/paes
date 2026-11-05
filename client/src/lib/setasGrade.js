// Setas ↑ ↓ (e PageUp/PageDown/Home/End) passeiam pelos registros de QUALQUER grade (<table>) do sistema:
// vale para a última grade em que o usuário clicou; o "passeio" é um clique na linha vizinha, então cada tela reage
// como se o usuário tivesse clicado (seleciona, carrega o registro, atualiza itens). Telas com tratamento próprio das
// setas (Produção, Cargas, itens da NFe…) chamam preventDefault e não são tocadas; campos de formulário, listas
// suspensas, calendário e janelas abertas também ficam de fora.
const IGNORA_LINHA = ['cd-esp', 'cd-vazio', 'l-novo', 'tot', 'total'];
const PASSOS = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10, Home: -Infinity, End: Infinity };

export const ehLinhaDeDado = (tr) => !!tr && tr.tagName === 'TR' && !!tr.closest('tbody') && !!tr.querySelector('td')
  && !IGNORA_LINHA.some((c) => tr.classList.contains(c)) && !tr.querySelector('td[colspan]:only-child');

/** Linha para onde ir, a partir de `atual`, andando `passo` linhas de dados (passos grandes param na última existente). */
export function destinoDaLinha(atual, passo) {
  const sobe = passo < 0; let r = atual; let n = Math.min(Math.abs(passo), 100000);
  while (n > 0) {
    let v = sobe ? r.previousElementSibling : r.nextElementSibling;
    while (v && !ehLinhaDeDado(v)) v = sobe ? v.previousElementSibling : v.nextElementSibling;
    if (!v) break;
    r = v; n -= 1;
  }
  return r;
}

export function instalaSetasGrade(doc = document) {
  let ativa = null; // última linha clicada
  const aoClicar = (e) => { const tr = e.target.closest?.('tbody > tr'); if (tr && ehLinhaDeDado(tr) && !tr.closest('.cal, .calendario')) ativa = tr; };
  const aoTeclar = (e) => {
    const passo = PASSOS[e.key];
    if (passo === undefined || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const t = e.target;
    if (t?.closest?.('input:not([type=checkbox]), select, textarea, [contenteditable=true], dialog[open], [role=listbox], [role=menu], .cal, .calendario')) return;
    if (doc.querySelector('dialog[open]')) return;
    let atual = ativa;
    if (!atual || !atual.isConnected) { // a linha foi recriada: volta pela marca de seleção da mesma grade
      const tabela = atual?.closest?.('table');
      atual = tabela?.isConnected ? tabela.querySelector('tbody tr.foco, tbody tr.sel, tbody tr.marc') : null;
      if (!atual) return;
    }
    const dest = destinoDaLinha(atual, passo);
    e.preventDefault();
    if (dest === atual) return;
    dest.click(); ativa = dest;
    dest.scrollIntoView?.({ block: 'nearest' });
    if (dest.tabIndex >= 0) dest.focus?.({ preventScroll: true });
  };
  doc.addEventListener('click', aoClicar, true);
  doc.addEventListener('keydown', aoTeclar);
  return () => { doc.removeEventListener('click', aoClicar, true); doc.removeEventListener('keydown', aoTeclar); };
}
