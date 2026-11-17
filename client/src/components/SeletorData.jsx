import { useEffect, useRef, useState } from 'react';
import Calendario from './Calendario.jsx';
import { brData, hoje } from '../lib/rules.js';

/** Data grande com seta: clique abre o calendário num painel flutuante (como na Produção da Fábrica), com atalho "Hoje". */
export default function SeletorData({ data, onChange }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    const esc = (e) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('pointerdown', fora); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);
  return (
    <div className="sd" ref={ref}>
      <button type="button" className="sd-txt" onClick={() => setAberto((a) => !a)} aria-haspopup="dialog" aria-expanded={aberto} title="Clique para escolher a data">{brData(data)}</button>
      <button type="button" className="sd-seta" aria-label="Abrir calendário" onClick={() => setAberto((a) => !a)}>▾</button>
      {aberto && (
        <div className="sd-pop" role="dialog" aria-label="Calendário">
          <Calendario data={data} onChange={(d) => { onChange(d); setAberto(false); }} />
          <div className="sd-bt"><button type="button" onClick={() => { onChange(hoje()); setAberto(false); }}>Hoje</button></div>
        </div>
      )}
    </div>
  );
}
