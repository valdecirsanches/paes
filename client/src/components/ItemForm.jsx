import { useEffect, useRef, useState } from 'react';
// Peças do formulário moderno de item (programação diária e fixa): cartão, hora em destaque, pílulas e atalhos.
export const diaDaSemana = (iso) => {
  const d = new Date(`${String(iso ?? '').slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { weekday: 'long' });
};

/** Faixa de cima: o que se está fazendo, onde, e as teclas que valem. */
export function TopoItem({ novo, contexto, sujo, lateral = false, data, cliente }) {
  return (
    <header className={`if-topo${lateral ? ' lat' : ''}`}>
      <span className={`if-badge ${novo ? 'novo' : 'alt'}`}>{novo ? '＋ Novo item' : '✎ Alterando item'}</span>
      {cliente && <span className="if-cli" title="Cliente">{cliente}</span>}
      {contexto && <span className="if-ctx">{contexto}</span>}
      {data && <span className="if-ctx-d">{data}</span>}
      {sujo && <span className="if-sujo" title="Há alterações ainda não salvas">● não salvo</span>}
      <span className="if-dicas"><kbd>F5</kbd> salva<span>·</span><kbd>Esc</kbd> cancela</span>
    </header>
  );
}

/** Hora digitada só com números: "6" vira 06:00, "07" vira 07:00, "073" vira 07:30, "0745" vira 07:45 (o ":00" já vem preenchido). */
const horaDeDigitos = (d) => (d.length === 0 ? '' : d.length === 1 ? `0${d}:00` : d.length === 2 ? `${d}:00` : d.length === 3 ? `${d.slice(0, 2)}:${d[2]}0` : `${d.slice(0, 2)}:${d.slice(2)}`);
const mostraDigitos = (d) => (d.length === 1 ? d : horaDeDigitos(d)); // com 1 dígito (0, 1 ou 2) ainda pode ser 10–23: só mostra o dígito
const digitosDaHora = (h) => String(h ?? '').replace(/\D/g, '').slice(0, 4);
const aceitaDigito = (d, c) => (d.length === 0 ? true : d.length === 1 ? Number(d + c) <= 23 : d.length === 2 ? Number(c) <= 5 : d.length < 4);
function CampoHora({ refHora, valor, onChange }) {
  const [dig, setDig] = useState(() => digitosDaHora(valor));
  const [novo, setNovo] = useState(false); // logo ao entrar no campo, o primeiro dígito substitui o valor que já estava
  const emFoco = useRef(false);
  useEffect(() => { if (!emFoco.current) setDig(digitosDaHora(valor)); }, [valor]);
  const poe = (d) => { setDig(d); if (d) onChange(horaDeDigitos(d)); };
  const tecla = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      const base = novo ? '' : dig;
      setNovo(false);
      if (base === '' && Number(e.key) > 2) poe(`0${e.key}`); // 3–9 só pode ser hora com zero na frente: "6" → 06
      else if (aceitaDigito(base, e.key)) poe(base + e.key);
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault(); setNovo(false); const d = novo ? '' : dig.slice(0, -1); setDig(d); onChange(d ? horaDeDigitos(d) : '');
    }
  };
  const cola = (e) => { e.preventDefault(); const d = (e.clipboardData.getData('text').match(/\d/g) ?? []).join('').slice(0, 4); if (d) poe(d); };
  return (
    <input type="text" inputMode="numeric" autoComplete="off" placeholder="00:00" ref={refHora} value={novo && emFoco.current ? horaDeDigitos(dig) : mostraDigitos(dig)}
      onChange={() => {}} onKeyDown={tecla} onPaste={cola}
      onFocus={(e) => { emFoco.current = true; setNovo(dig.length > 0); e.target.select(); }}
      onBlur={() => { emFoco.current = false; setNovo(false); }} />
  );
}

/** Horário grande (foco inicial) + atalhos com os horários que o dia já tem. */
export function HoraGrande({ refHora, valor, onChange, sugestoes = [], rotulo = 'Hora da entrega' }) {
  return (
    <div className="if-hora">
      <label className="if-grande"><span>{rotulo}</span>
        <CampoHora refHora={refHora} valor={valor} onChange={onChange} />
      </label>
      {sugestoes.length > 0 && (
        <div className="if-chips" aria-label="Horários já usados neste dia">
          <small>Horários do dia</small>
          <div>{sugestoes.map((h) => <button type="button" tabIndex={-1} key={h} className={`if-chip${h === valor ? ' on' : ''}`} onClick={() => onChange(h)}>{h}</button>)}</div>
        </div>
      )}
    </div>
  );
}

export const Campo = ({ rotulo, className = '', children, dica }) => (
  <label className={`if-campo ${className}`}><span>{rotulo}{dica && <em>{dica}</em>}</span>{children}</label>
);

export const Pilula = ({ marcado, onChange, children, tabIndex }) => (
  <label className={`if-pill${marcado ? ' on' : ''}`}>
    <input type="checkbox" checked={marcado} onChange={onChange} tabIndex={tabIndex} /><span>{children}</span>
  </label>
);

/** Horários distintos (HH:MM) de uma lista de itens, em ordem. */
export const horasDoDia = (itens, max = 8) => [...new Set((itens ?? []).map((i) => String(i.hora ?? '').slice(0, 5)).filter(Boolean))].sort().slice(0, max);
