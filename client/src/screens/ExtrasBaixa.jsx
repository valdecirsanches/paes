import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Toast } from '../components/toast.jsx';
import { brData, hhmm } from '../lib/rules.js';

const ja = (r) => String(r.digitado) === 'True';

/** Pedidos extras (faturamento/Outros): lista o que a fábrica digitou. O ícone da linha pergunta "Processado?"; se sim, salva e o pedido sai da lista. */
export default function ExtrasBaixa({ onFechar }) {
  const [linhas, setLinhas] = useState([]);
  const [todos, setTodos] = useState(false); // mostra também os já processados (para desfazer)
  const [aviso, setAviso] = useState(null);
  const erro = (e) => setAviso({ tipo: 'erro', m: e.message });
  const carregar = useCallback(async () => {
    try { setLinhas(await api.get(`/extras${todos ? '?todos=1' : ''}`)); } catch (e) { erro(e); }
  }, [todos]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { if (!aviso) return undefined; const t = setTimeout(() => setAviso(null), 6000); return () => clearTimeout(t); }, [aviso]);
  const processar = async (r) => {
    const desfaz = ja(r);
    if (!window.confirm(desfaz ? 'Voltar este pedido para a lista de pendentes?' : 'Processado?')) return;
    try {
      await api.put('/extras/digitado', desfaz ? { desmarcar: [r.id] } : { marcar: [r.id] });
      setAviso({ tipo: 'ok', m: desfaz ? 'Pedido voltou para a lista.' : 'Pedido processado.' }); await carregar();
    } catch (e) { erro(e); }
  };
  return (
    <div className="tela pr2">
      <Toast aviso={aviso} />
      <header className="pr2-topo">
        <div className="pr2-tit"><h1>🛍 Pedidos extras</h1><span className="pr2-data" style={{ textTransform: 'none' }}>{linhas.length} pedido(s)</span></div>
        <button type="button" className="pr2-x" onClick={() => onFechar?.()}>✕ Fechar</button>
      </header>
      <section className="pr2-card fb-filtro">
        <button type="button" className="bt" onClick={carregar}>⟳ Atualizar</button>
        <button type="button" className="bt" onClick={() => setTodos((t) => !t)}>{todos ? '🙈 Esconder processados' : '👁 Visualizar processados'}</button>
        <span className="pr2-data" style={{ textTransform: 'none' }}>Pedidos digitados pela fábrica. Clique em ✔ na linha quando já tiver processado (digitado na programação diária).</span>
      </section>
      <div className="pr2-card fb-grade rolagem fb-solo">
        <table className="grade">
          <thead><tr><th style={{ width: 44 }} /><th>Empresa</th><th>Solicitante</th><th>Descrição do pedido</th><th>Data</th><th>Hora</th><th>Funcionário</th></tr></thead>
          <tbody>
            {linhas.map((r) => (
              <tr key={r.id} style={ja(r) ? { opacity: 0.55 } : undefined}>
                <td style={{ textAlign: 'center' }}><button type="button" className="bt" title={ja(r) ? 'Processado — clique para desfazer' : 'Marcar como processado'} onClick={() => processar(r)}>{ja(r) ? '↶' : '✔'}</button></td>
                <td>{r.empresa}</td><td>{r.contato}</td><td className="fb-txt">{r.descricao}</td><td>{brData(r.data)}</td><td>{hhmm(r.hora)}</td><td>{r.funcionario}</td>
              </tr>))}
            {!linhas.length && <tr className="semlinha"><td colSpan={7} className="vazio">Nenhum pedido extra pendente</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
