import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Toast } from '../components/toast.jsx';

const VAZIO = { id: null, usuario: '', nome: '', senha: '' };

/** Cadastro de usuários (só administrador): cria, altera nome/login, redefine a senha e exclui. */
export default function Usuarios() {
  const [lista, setLista] = useState([]);
  const [sel, setSel] = useState(VAZIO);
  const [aviso, setAviso] = useState(null);
  const [filtro, setFiltro] = useState('');
  const carrega = useCallback(() => api.get('/cadastros/usuarios').then(setLista).catch((e) => setAviso({ tipo: 'erro', m: e.message })), []);
  useEffect(() => { carrega(); }, [carrega]);
  const set = (k) => (e) => setSel((s) => ({ ...s, [k]: e.target.value }));
  const novo = sel.id === null;
  const grava = async (e) => {
    e.preventDefault();
    try {
      const corpo = { usuario: sel.usuario, nome: sel.nome, ...(sel.senha ? { senha: sel.senha } : {}) };
      const r = novo ? await api.post('/cadastros/usuarios', corpo) : await api.put(`/cadastros/usuarios/${sel.id}`, corpo);
      setAviso({ tipo: 'ok', m: novo ? 'Usuário criado.' : r.senhaRedefinida ? 'Usuário gravado e senha redefinida.' : 'Usuário gravado.' });
      setSel({ ...VAZIO, id: r.id, usuario: r.usuario, nome: r.nome }); carrega();
    } catch (er) { setAviso({ tipo: 'erro', m: er.message }); }
  };
  const exclui = async () => {
    if (novo || !window.confirm(`Excluir o usuário ${sel.usuario}?`)) return;
    try { await api.del(`/cadastros/usuarios/${sel.id}`); setAviso({ tipo: 'ok', m: 'Usuário excluído.' }); setSel(VAZIO); carrega(); } catch (er) { setAviso({ tipo: 'erro', m: er.message }); }
  };
  const vis = lista.filter((u) => `${u.usuario} ${u.nome}`.toLowerCase().includes(filtro.toLowerCase()));
  const reservado = lista.find((u) => u.id === sel.id)?.reservado;
  return (
    <section className="usr">
      <Toast aviso={aviso} />
      <header><h2>👥 Cadastro de usuários</h2><small>Só o administrador acessa. A senha é gravada criptografada e nunca é exibida.</small></header>
      <div className="usr-corpo">
        <div className="usr-lista">
          <input placeholder="Buscar usuário…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          <table><thead><tr><th>Usuário</th><th>Nome</th></tr></thead>
            <tbody>{vis.map((u) => <tr key={u.id} className={`clicavel${u.id === sel.id ? ' foco' : ''}`} onClick={() => setSel({ ...VAZIO, id: u.id, usuario: u.usuario, nome: u.nome })}><td>{u.usuario}</td><td>{u.nome}{u.reservado ? ' (sistema)' : ''}</td></tr>)}</tbody>
          </table>
        </div>
        <form className="usr-form" onSubmit={grava}>
          <h3>{novo ? 'Novo usuário' : `Usuário ${sel.usuario}`}</h3>
          <label>Usuário (login)<input value={sel.usuario} onChange={set('usuario')} maxLength={30} disabled={reservado} autoComplete="off" /></label>
          <label>Nome<input value={sel.nome} onChange={set('nome')} maxLength={60} disabled={reservado} /></label>
          <label>{novo ? 'Senha' : 'Redefinir senha (deixe em branco para manter)'}<input type="password" value={sel.senha} onChange={set('senha')} autoComplete="new-password" disabled={reservado} /></label>
          <div className="usr-bts">
            <button type="button" className="bt" onClick={() => setSel(VAZIO)}>+ Novo</button>
            <button type="submit" className="bt principal" disabled={reservado}>Gravar</button>
            <button type="button" className="bt" onClick={exclui} disabled={novo || reservado}>Excluir</button>
          </div>
          {reservado && <small>Usuário reservado do sistema (máquinas da fábrica): não pode ser alterado.</small>}
        </form>
      </div>
    </section>
  );
}
