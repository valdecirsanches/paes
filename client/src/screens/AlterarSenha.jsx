import { useState } from 'react';
import { api } from '../api.js';
import { Modal } from '../components/ui.jsx';
import { mensagem } from '../components/toast.jsx';

export default function AlterarSenha({ onFechar }) {
  const [v, setV] = useState({ atual: '', nova: '', confirma: '' });
  const [ok, setOk] = useState(false);
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const gravar = async (e) => {
    e.preventDefault();
    try { await api.post('/auth/senha', v); setOk(true); mensagem('ok', 'Senha alterada.'); } catch (er) { mensagem('erro', er.message); }
  };
  return (
    <Modal titulo="Alterar senha" onFechar={onFechar}>
      <form onSubmit={gravar} className="fat-pergunta">
        <label className="campo"><span>Senha atual</span><input type="password" autoFocus autoComplete="current-password" value={v.atual} onChange={set('atual')} disabled={ok} /></label>
        <label className="campo"><span>Nova senha</span><input type="password" autoComplete="new-password" value={v.nova} onChange={set('nova')} disabled={ok} /></label>
        <label className="campo"><span>Confirmar nova senha</span><input type="password" autoComplete="new-password" value={v.confirma} onChange={set('confirma')} disabled={ok} /></label>
        <div className="rodape-modal">
          {!ok && <button type="submit" className="bt">Gravar</button>}
          <button type="button" className="bt" onClick={onFechar}>{ok ? 'Fechar' : 'Cancelar'}</button>
        </div>
      </form>
    </Modal>
  );
}
