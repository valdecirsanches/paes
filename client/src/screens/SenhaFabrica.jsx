import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Toast, confirmar } from '../components/toast.jsx';

/** Faturamento ▸ Senha da Fábrica: senha que a Fábrica digita para abrir o Itinerário (Produção ▸ Itinerário). */
export default function SenhaFabrica({ onFechar }) {
  const [protegido, setProtegido] = useState(null);
  const [senha, setSenha] = useState('');
  const [conf, setConf] = useState('');
  const [aviso, setAviso] = useState(null);
  const carregar = async () => { try { setProtegido((await api.get('/itinerario/acesso')).protegido); } catch (e) { setAviso({ tipo: 'erro', m: e.message }); } };
  useEffect(() => { carregar(); }, []);
  const grava = async () => {
    if (senha.length < 4) { setAviso({ tipo: 'erro', m: 'A senha deve ter pelo menos 4 caracteres.' }); return; }
    if (senha !== conf) { setAviso({ tipo: 'erro', m: 'A confirmação não confere com a senha.' }); return; }
    try { await api.put('/itinerario/acesso', { senha }); setSenha(''); setConf(''); setAviso({ tipo: 'ok', m: 'Senha da Fábrica gravada.' }); await carregar(); } catch (e) { setAviso({ tipo: 'erro', m: e.message }); }
  };
  const remove = async () => {
    if (!(await confirmar('Remover a senha? Sem senha, a Fábrica NÃO consegue abrir o Itinerário.'))) return;
    try { await api.del('/itinerario/acesso'); setAviso({ tipo: 'ok', m: 'Senha removida.' }); await carregar(); } catch (e) { setAviso({ tipo: 'erro', m: e.message }); }
  };
  return (
    <div className="tela pr2">
      <Toast aviso={aviso} />
      <header className="pr2-topo"><div className="pr2-tit"><h1>🔑 Senha da Fábrica</h1><span className="pr2-data" style={{ textTransform: 'none' }}>Acesso ao Itinerário pela Produção</span></div><button type="button" className="pr2-x" onClick={() => onFechar?.()}>✕ Fechar</button></header>
      <section className="pr2-card" style={{ maxWidth: 520, margin: '12px', padding: 16, display: 'grid', gap: 10 }}>
        <p style={{ margin: 0 }}>Situação: <b>{protegido === null ? '…' : protegido ? 'senha definida' : 'SEM senha (a Fábrica não consegue abrir o Itinerário)'}</b></p>
        <label>Nova senha<input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} maxLength={40} /></label>
        <label>Repita a senha<input type="password" autoComplete="new-password" value={conf} onChange={(e) => setConf(e.target.value)} maxLength={40} onKeyDown={(e) => { if (e.key === 'Enter') grava(); }} /></label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="bt prim" onClick={grava} disabled={!senha}>💾 Gravar senha</button>
          {protegido && <button type="button" className="bt" onClick={remove}>🗑 Remover senha</button>}
        </div>
        <small>A senha fica guardada de forma criptografada e não pode ser consultada, só trocada. Cada alteração fica na Auditoria.</small>
      </section>
    </div>
  );
}
