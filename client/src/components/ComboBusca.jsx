import { useEffect, useMemo, useRef, useState } from 'react';

const norm = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Lista de seleção com pesquisa: digite parte do código ou da descrição para filtrar; ↑/↓ navegam, Enter escolhe, Esc fecha. */
export default function ComboBusca({ valor, lista, rotulo, onEscolher, disabled, placeholder = 'Digite para pesquisar…' }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [pos, setPos] = useState(0);
  const raiz = useRef(null);
  const atual = lista.find((o) => o.id === Number(valor));
  const rotAtual = atual ? rotulo(atual) : (valor != null && valor !== '' ? `${valor} - (fora da lista)` : '');
  const achados = useMemo(() => { const q = norm(texto).trim(); return lista.filter((o) => !q || norm(rotulo(o)).includes(q)).slice(0, 200); }, [lista, texto, rotulo]);
  useEffect(() => { setPos(0); }, [texto, aberto]);
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => { if (!raiz.current?.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);
  const escolhe = (o) => { onEscolher(o ? o.id : null); setAberto(false); setTexto(''); };
  const tecla = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAberto(true); setPos((p) => Math.min(p + 1, achados.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setPos((p) => Math.max(p - 1, 0)); }
    else if (e.key === 'Enter' && aberto) { e.preventDefault(); if (achados[pos]) escolhe(achados[pos]); }
    else if (e.key === 'Escape' && aberto) { e.stopPropagation(); setAberto(false); setTexto(''); }
  };
  return (
    <div className="cb" ref={raiz}>
      <input
        value={aberto ? texto : rotAtual} placeholder={aberto ? placeholder : ''} disabled={disabled} autoComplete="off" role="combobox" aria-expanded={aberto}
        onFocus={(e) => { setAberto(true); setTexto(''); e.target.select?.(); }}
        onChange={(e) => { setTexto(e.target.value); setAberto(true); }} onKeyDown={tecla}
      />
      {aberto && (
        <ul className="cb-lista" role="listbox">
          <li role="option" aria-selected={valor == null || valor === ''} className="cb-vazio" onMouseDown={(e) => { e.preventDefault(); escolhe(null); }}>(nenhuma)</li>
          {achados.map((o, i) => (
            <li key={o.id} role="option" aria-selected={o.id === Number(valor)} className={i === pos ? 'on' : ''} onMouseEnter={() => setPos(i)} onMouseDown={(e) => { e.preventDefault(); escolhe(o); }}>{rotulo(o)}</li>
          ))}
          {!achados.length && <li className="cb-nada">Nada encontrado para “{texto}”</li>}
        </ul>
      )}
    </div>
  );
}
