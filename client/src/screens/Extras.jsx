import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Toast } from '../components/toast.jsx';
import { brData, hhmm, hoje } from '../lib/rules.js';

const VAZIO = () => ({ empresa: '', contato: '', funcionario: '', descricao: '', fone: '', data: hoje(), hora: '' });

/** Pedidos extras (u_extras): lançamentos ainda não digitados na programação. Novo pedido / alterar pedido. */
export default function Extras({ onFechar }) {
  const [linhas, setLinhas] = useState([]);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState(null); // null = só a grade; {id?, ...campos}
  const [op, setOp] = useState({ empresas: [], contatos: [], descricoes: [], funcionarios: [] });
  const [aviso, setAviso] = useState(null);
  const erro = (e) => setAviso({ tipo: 'erro', m: e.message });
  const carregar = useCallback(async () => {
    try { const [r, o] = await Promise.all([api.get('/extras'), api.get('/extras/opcoes')]); setLinhas(r); setOp(o); } catch (e) { erro(e); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { if (!aviso) return undefined; const t = setTimeout(() => setAviso(null), 6000); return () => clearTimeout(t); }, [aviso]);
  const atual = linhas.find((r) => r.id === sel) ?? null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const novo = () => { setForm(VAZIO()); setTimeout(() => document.getElementById('ex-empresa')?.focus(), 30); };
  const alterar = () => {
    if (!atual) return;
    setForm({ id: atual.id, empresa: atual.empresa ?? '', contato: atual.contato ?? '', funcionario: atual.funcionario ?? '', descricao: atual.descricao ?? '', fone: atual.fone ?? '', data: String(atual.data).slice(0, 10), hora: hhmm(atual.hora) });
  };
  const grava = async () => {
    try {
      const { id, ...c } = form;
      if (id) await api.put(`/extras/${id}`, c); else await api.post('/extras', c);
      setForm(null); setAviso({ tipo: 'ok', m: 'Pedido gravado.' }); await carregar();
    } catch (e) { erro(e); }
  };
  const L = ({ id, v }) => <datalist id={id}>{v.map((x) => <option key={x} value={x} />)}</datalist>;
  return (
    <div className="tela pr2">
      <Toast aviso={aviso} />
      <header className="pr2-topo">
        <div className="pr2-tit"><h1>🛍 Pedidos extras</h1><span className="pr2-data" style={{ textTransform: "none" }}>{linhas.length} pendente(s) de digitação</span></div>
        <button type="button" className="pr2-x" onClick={() => onFechar?.()}>✕ Fechar</button>
      </header>
      {!form ? (
        <section className="pr2-card fb-filtro">
          <button type="button" className="bt prim" onClick={novo}>✚ Novo pedido</button>
          <button type="button" className="bt" disabled={!atual} onClick={alterar}>✎ Alterar pedido</button>
          <button type="button" className="bt" onClick={carregar}>⟳ Atualizar</button>
        </section>
      ) : (
        <fieldset className="pr2-card fb-form">
          <legend>{form.id ? 'Alterando ítem' : 'Incluindo ítem'}</legend>
          <label>Empresa (Cliente)<input id="ex-empresa" list="ex-emp" value={form.empresa} onChange={set('empresa')} /></label>
          <label>Nome do solicitante (Cliente)<input list="ex-ctt" value={form.contato} onChange={set('contato')} /></label>
          <label>Telefone do cliente<input value={form.fone} onChange={set('fone')} /></label>
          <label>Data da entrega<input type="date" value={form.data} onChange={set('data')} /></label>
          <label>Hora<input type="time" value={form.hora} onChange={set('hora')} /></label>
          <label>Funcionário (quem digitou)<input list="ex-fun" value={form.funcionario} onChange={set('funcionario')} /></label>
          <label className="fb-larga">Produto ou mercadoria<input list="ex-des" value={form.descricao} onChange={set('descricao')} /></label>
          <div className="fb-acoes"><button type="button" className="bt prim" onClick={grava}>Gravar</button><button type="button" className="bt" onClick={() => setForm(null)}>Descartar</button></div>
          <L id="ex-emp" v={op.empresas} /><L id="ex-ctt" v={op.contatos} /><L id="ex-fun" v={op.funcionarios} /><L id="ex-des" v={op.descricoes} />
        </fieldset>
      )}
      <div className="pr2-card fb-grade rolagem fb-solo">
        <table className="grade">
          <thead><tr><th>Entrega</th><th>Hora</th><th>Empresa</th><th>Solicitante</th><th>Produto/Mercadoria</th><th>Funcionário</th></tr></thead>
          <tbody>
            {linhas.map((r) => (
              <tr key={r.id} className={`clicavel${sel === r.id ? ' sel' : ''}`} onClick={() => setSel(r.id)} onDoubleClick={() => { setSel(r.id); setTimeout(alterar, 0); }}>
                <td>{brData(r.data)}</td><td>{hhmm(r.hora)}</td><td>{r.empresa}</td><td>{r.contato}</td><td className="fb-txt">{r.descricao}</td><td>{r.funcionario}</td>
              </tr>))}
            {!linhas.length && <tr className="semlinha"><td colSpan={6} className="vazio">Nenhum pedido extra pendente</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
