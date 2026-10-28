import { memo } from 'react';
import { useJanela, ALT_LINHA } from './janela.js';
import { brData } from '../lib/rules.js';

const m2 = (v) => Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const ehData = (v) => typeof v === 'string' && /^\d{4}-\d\d-\d\d/.test(v);
function celula(tipo, v) {
  if (v === null || v === undefined) return '';
  if (tipo === 'chk') return <span className={`cd-ok${['True', 'ATIVO'].includes(String(v)) ? ' on' : ''}`}>{['True', 'ATIVO'].includes(String(v)) ? '✔' : ''}</span>;
  if (tipo === 'm') return m2(v);
  if (['True', 'False'].includes(String(v))) return String(v) === 'True' ? '✔' : '';
  if (ehData(v)) return brData(v.slice(0, 10));
  return String(v);
}
const Linha = memo(function Linha({ r, cols, sel, onSel, onDbl }) {
  return (
    <tr className={sel ? 'sel' : ''} onClick={() => onSel(r.id)} onDoubleClick={onDbl ? () => onDbl(r.id) : undefined}>
      {cols.map(([k, , t]) => <td key={k} className={t === 'm' ? 'd' : t === 'chk' ? 'c' : ''} title={t ? undefined : String(r[k] ?? '')}>{celula(t, r[k])}</td>)}
    </tr>
  );
});

/**
 * Grade dos cadastros: cabeçalho fixo, linhas de altura fixa e rolagem virtual (só ~40 linhas no DOM).
 * cols: [campo, rótulo, tipo?] — tipo 'm' (número) | 'chk' (marca). `foco` = id selecionado.
 */
export default function GradeCad({ cols, rows, foco, onSel, onDbl, vazio = 'Nenhum registro' }) {
  const j = useJanela(rows.length);
  return (
    <div className="cd-tab" ref={j.ref} onScroll={j.onScroll}>
      <table>
        <thead><tr>{cols.map(([k, r, t]) => <th key={k} className={t === 'm' ? 'd' : t === 'chk' ? 'c' : ''}>{r}</th>)}</tr></thead>
        <tbody style={{ '--alt': `${ALT_LINHA}px` }}>
          {j.acima > 0 && <tr className="cd-esp" style={{ height: j.acima }}><td colSpan={cols.length} /></tr>}
          {rows.slice(j.ini, j.fim).map((r) => <Linha key={r.id} r={r} cols={cols} sel={r.id === foco} onSel={onSel} onDbl={onDbl} />)}
          {j.abaixo > 0 && <tr className="cd-esp" style={{ height: j.abaixo }}><td colSpan={cols.length} /></tr>}
          {rows.length === 0 && <tr className="cd-vazio"><td colSpan={cols.length}>{vazio}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
