// Peças do formulário moderno de item (programação diária e fixa): cartão, hora em destaque, pílulas e atalhos.
export const diaDaSemana = (iso) => {
  const d = new Date(`${String(iso ?? '').slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { weekday: 'long' });
};

/** Faixa de cima: o que se está fazendo, onde, e as teclas que valem. */
export function TopoItem({ novo, contexto, sujo }) {
  return (
    <header className="if-topo">
      <span className={`if-badge ${novo ? 'novo' : 'alt'}`}>{novo ? '＋ Novo item' : '✎ Alterando item'}</span>
      {contexto && <span className="if-ctx">{contexto}</span>}
      {sujo && <span className="if-sujo" title="Há alterações ainda não salvas">● não salvo</span>}
      <span className="if-dicas"><kbd>Enter</kbd> próximo campo<span>·</span><kbd>Tab</kbd> avança<span>·</span>botão <b>Salvar</b> grava</span>
    </header>
  );
}

/** Horário grande (foco inicial) + atalhos com os horários que o dia já tem. */
export function HoraGrande({ refHora, valor, onChange, sugestoes = [], rotulo = 'Hora da entrega' }) {
  return (
    <div className="if-hora">
      <label className="if-grande"><span>{rotulo}</span>
        <input type="time" ref={refHora} value={valor ?? ''} onChange={(e) => onChange(e.target.value)} />
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
