import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Toast } from '../components/toast.jsx';
import { brData, hhmm } from '../lib/rules.js';

const ja = (r) => String(r.digitado) === 'True';

/** Pedidos extras (faturamento/Outros): lista o que a fábrica digitou; o "DG" marca o pedido como já digitado na programação diária (baixa). */
export default function ExtrasBaixa({ onFechar }) {
  const [linhas, setLinhas] = useState([]);
  const [mudou, setMudou] = useState({}); // id -> novo valor de DG (só o que difere do banco)
  const [todos, setTodos] = useState(false); // Visualizar (já digitados) / Esconder
  const [aviso, setAviso] = useState(null);
  const erro = (e) => setAviso({ tipo: 'erro', m: e.message });
  const carregar = useCallback(async (t = todos) => {
    try { setLinhas(await api.get(`/extras${t ? '?todos=1' : ''}`)); setMudou({}); } catch (e) { erro(e); }
  }, [todos]);
  useEffect(() => { carregar(todos); }, [todos]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!aviso) return undefined; const t = setTimeout(() => setAviso(null), 6000); return () => clearTimeout(t); }, [aviso]);
  const dg = (r) => (r.id in mudou ? mudou[r.id] : ja(r));
  const alterados = useMemo(() => Object.keys(mudou).length, [mudou]);
  const marca = (r) => setMudou((m) => {
    const novo = !dg(r); const n = { ...m };
    if (novo === ja(r)) delete n[r.id]; else n[r.id] = novo;
    return n;
  });
  const salvar = async () => {
    try {
      const ids = Object.keys(mudou).map(Number);
      await api.put('/extras/digitado', { marcar: ids.filter((i) => mudou[i]), desmarcar: ids.filter((i) => !mudou[i]) });
      setAviso({ tipo: 'ok', m: 'Baixa salva.' }); await carregar();
    } catch (e) { erro(e); }
  };
  const fechar = () => { if (alterados && !window.confirm('Há marcações não salvas. Fechar mesmo assim?')) return; onFechar?.(); };
  return (
    <div className="tela pr2">
      <Toast aviso={aviso} />
      <header className="pr2-topo">
        <div className="pr2-tit"><h1>🛍 Pedidos extras</h1><span className="pr2-data" style={{ textTransform: 'none' }}>{linhas.length} pedido(s){alterados ? ` · ${alterados} alteração(ões) não salva(s)` : ''}</span></div>
        <button type="button" className="pr2-x" onClick={fechar}>✕ Fechar</button>
      </header>
      <section className="pr2-card fb-filtro">
        <button type="button" className="bt prim" disabled={!alterados} onClick={salvar}>💾 Salvar</button>
        <button type="button" className="bt" disabled={!alterados} onClick={() => setMudou({})}>↶ Desfazer</button>
        <button type="button" className="bt" onClick={() => setTodos((t) => !t)}>{todos ? '🙈 Esconder digitados' : '👁 Visualizar digitados'}</button>
        <span className="pr2-data" style={{ textTransform: 'none' }}>Lista de pedidos extras digitados pelos funcionários da fábrica, deverão ser digitados na programação diária. Marque DG ao digitar.</span>
      </section>
      <div className="pr2-card fb-grade rolagem fb-solo">
        <table className="grade">
          <thead><tr><th>Empresa</th><th>Solicitante</th><th>Descrição do pedido</th><th>Data</th><th>Hora</th><th>Funcionário</th><th title="Digitado na programação diária">DG</th></tr></thead>
          <tbody>
            {linhas.map((r) => (
              <tr key={r.id} className={r.id in mudou ? 'sel' : ''} style={dg(r) ? { opacity: 0.6 } : undefined}>
                <td>{r.empresa}</td><td>{r.contato}</td><td className="fb-txt">{r.descricao}</td><td>{brData(r.data)}</td><td>{hhmm(r.hora)}</td><td>{r.funcionario}</td>
                <td style={{ textAlign: 'center' }}><input type="checkbox" checked={dg(r)} onChange={() => marca(r)} aria-label="Digitado na programação" /></td>
              </tr>))}
            {!linhas.length && <tr className="semlinha"><td colSpan={7} className="vazio">Nenhum pedido extra pendente</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
