import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Toast } from '../components/toast.jsx';
import { brData, hhmm, hoje } from '../lib/rules.js';

/** Reclamações/elogios de todos os clientes no período (u_reclamações da fábrica). A justificativa pode ser registrada aqui. */
export default function Reclamacoes({ onFechar }) {
  const [de, setDe] = useState(hoje());
  const [ate, setAte] = useState(hoje());
  const [linhas, setLinhas] = useState([]);
  const [sel, setSel] = useState(null);
  const [just, setJust] = useState('');
  const [aviso, setAviso] = useState(null);
  const carregar = useCallback(async () => {
    try {
      const rows = await api.get(`/reclamacoes?de=${de}&ate=${ate < de ? de : ate}`);
      setLinhas(rows); setSel((s) => (rows.some((r) => r.id === s) ? s : rows[0]?.id ?? null));
    } catch (e) { setLinhas([]); setAviso({ tipo: 'erro', m: e.message }); }
  }, [de, ate]);
  useEffect(() => { carregar(); }, [carregar]);
  const atual = linhas.find((r) => r.id === sel) ?? null;
  useEffect(() => { setJust(atual?.explicacao ?? ''); }, [atual?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!aviso) return undefined; const t = setTimeout(() => setAviso(null), 6000); return () => clearTimeout(t); }, [aviso]);
  const grava = async () => {
    if (!atual) return;
    try { await api.put(`/reclamacoes/${atual.id}`, { explicacao: just }); setAviso({ tipo: 'ok', m: 'Justificativa gravada.' }); await carregar(); } catch (e) { setAviso({ tipo: 'erro', m: e.message }); }
  };
  return (
    <div className="tela pr2">
      <Toast aviso={aviso} />
      <header className="pr2-topo">
        <div className="pr2-tit"><h1>💬 Reclamações / Elogios</h1><span className="pr2-data" style={{ textTransform: "none" }}>{linhas.length} no período</span></div>
        <button type="button" className="pr2-x" onClick={() => onFechar?.()}>✕ Fechar</button>
      </header>
      <section className="pr2-card fb-filtro">
        <label>De <input type="date" value={de} onChange={(e) => { setDe(e.target.value); if (ate < e.target.value) setAte(e.target.value); }} /></label>
        <label>Até <input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} /></label>
        <button type="button" className="bt" onClick={() => { setDe(hoje()); setAte(hoje()); }}>Hoje</button>
        <button type="button" className="bt" onClick={carregar}>⟳ Atualizar</button>
      </section>
      <div className="fb-corpo">
        <div className="pr2-card fb-grade rolagem">
          <table className="grade">
            <thead><tr><th>Data</th><th>Hora</th><th>Empresa</th><th>Reclamante</th><th>Reclamação</th><th>Justificativa</th></tr></thead>
            <tbody>
              {linhas.map((r) => (
                <tr key={r.id} className={`clicavel${sel === r.id ? ' sel' : ''}`} onClick={() => setSel(r.id)}>
                  <td>{brData(r.data)}</td><td>{hhmm(r.hora)}</td><td>{r.nome}</td><td>{r.reclamante}</td>
                  <td className="fb-txt">{r.reclamacao}</td><td className="fb-txt">{r.explicacao}</td>
                </tr>))}
              {!linhas.length && <tr className="semlinha"><td colSpan={6} className="vazio">Nenhuma reclamação neste período</td></tr>}
            </tbody>
          </table>
        </div>
        <fieldset className="pr2-card fb-det">
          <legend>{atual ? `${atual.nome ?? ''} — ${atual.reclamante ?? ''}${atual.telefone ? ` · ${atual.telefone}` : ''}` : 'Selecione uma reclamação'}</legend>
          <label>Reclamação / elogio<textarea rows={6} readOnly value={atual?.reclamacao ?? ''} /></label>
          <label>Justificativa<textarea rows={6} value={just} disabled={!atual} onChange={(e) => setJust(e.target.value)} /></label>
          <button type="button" className="bt prim" disabled={!atual || just === (atual?.explicacao ?? '')} onClick={grava}>Gravar justificativa</button>
        </fieldset>
      </div>
    </div>
  );
}
