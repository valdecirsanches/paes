// Ordenação crescente/decrescente escolhida pelo usuário. Valores vazios ficam sempre no final, em qualquer direção.
const vazio = (v) => v === null || v === undefined || v === '';
/** Ordena uma cópia de `rows` por `chave(row)`; dir = 1 (crescente) ou -1 (decrescente); empate pela ordem original. */
export function ordenaPor(rows, chave, dir = 1) {
  return rows.map((r, i) => [r, i]).sort(([a, ia], [b, ib]) => {
    const x = chave(a); const y = chave(b);
    if (vazio(x) !== vazio(y)) return vazio(x) ? 1 : -1;
    const c = vazio(x) ? 0 : String(x).localeCompare(String(y), 'pt-BR', { numeric: true, sensitivity: 'base' });
    return (c * (dir < 0 ? -1 : 1)) || (ia - ib);
  }).map(([r]) => r);
}
const CH = 'paes_ordem_';
export function lerOrdem(nome, padrao) { try { const o = JSON.parse(localStorage.getItem(CH + nome) ?? 'null'); return o && typeof o.campo === 'string' && (o.dir === 1 || o.dir === -1) ? o : padrao; } catch { return padrao; } }
export function gravaOrdem(nome, o) { try { localStorage.setItem(CH + nome, JSON.stringify(o)); } catch { /* ok */ } }
