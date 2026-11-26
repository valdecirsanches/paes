import { useEffect, useState } from 'react';
import { api } from '../api.js';

/** Itinerário (Faturamento) ▸ 🔑 Senha da Fábrica: define a senha que a Fábrica digita para abrir o Itinerário. O 👁 mostra a senha atual e o que foi digitado, para conferir. */
export default function SenhaFabricaDialog({ onFechar, onAviso }) {
  const [protegido, setProtegido] = useState(null);
  const [senha, setSenha] = useState('');
  const [conf, setConf] = useState('');
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState('');
  const [gravando, setGravando] = useState(false);
  const [atual, setAtual] = useState(null); // senha em vigor, só depois de clicar no 👁
  const alternaAtual = async () => {
    if (atual !== null) { setAtual(null); return; }
    setErro('');
    try { setAtual((await api.post('/itinerario/acesso/ver', {})).senha); } catch (e) { setErro(e.message); }
  };
  useEffect(() => { api.get('/itinerario/acesso').then((r) => setProtegido(r.protegido)).catch((e) => setErro(e.message)); }, []);
  useEffect(() => { const f = (e) => { if (e.key === 'Escape') onFechar(); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [onFechar]);
  const tipo = ver ? 'text' : 'password';
  const grava = async () => {
    if (gravando) return;
    if (senha.length < 4) { setErro('A senha deve ter pelo menos 4 caracteres.'); return; }
    if (senha !== conf) { setErro('A confirmação não confere com a senha.'); return; }
    setGravando(true); setErro('');
    try { await api.put('/itinerario/acesso', { senha }); onAviso?.('Senha da Fábrica gravada.'); onFechar(); } catch (e) { setErro(e.message); } finally { setGravando(false); }
  };
  const remove = async () => {
    if (!window.confirm('Remover a senha? Sem senha, a Fábrica NÃO consegue abrir o Itinerário.')) return;
    try { await api.del('/itinerario/acesso'); onAviso?.('Senha da Fábrica removida.'); onFechar(); } catch (e) { setErro(e.message); }
  };
  const campo = (rot, v, set, enter) => (
    <label style={{ display: 'grid', gap: 4 }}>{rot}
      <span style={{ display: 'flex', gap: 6 }}>
        <input type={tipo} autoComplete="new-password" value={v} maxLength={40} onChange={(e) => set(e.target.value)} onKeyDown={enter ? (e) => { if (e.key === 'Enter') grava(); } : undefined} style={{ flex: 1 }} />
        {enter && <button type="button" className="trb2-btn" onClick={() => setVer((x) => !x)} title={ver ? 'Esconder a senha' : 'Mostrar a senha digitada'} aria-pressed={ver} aria-label="Mostrar ou esconder a senha">{ver ? '🙈' : '👁'}</button>}
      </span>
    </label>
  );
  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center' }}>
      <div role="dialog" aria-label="Senha da Fábrica" onClick={(e) => e.stopPropagation()} style={{ background: '#fff', color: '#222', padding: 18, borderRadius: 8, width: 360, boxShadow: '0 6px 24px rgba(0,0,0,.4)', display: 'grid', gap: 10 }}>
        <b>🔑 Senha da Fábrica (Itinerário)</b>
        <small>Situação: <b>{protegido === null ? '…' : protegido ? 'senha definida' : 'SEM senha — a Fábrica não consegue abrir o Itinerário'}</b></small>
        {protegido && (
          <label style={{ display: 'grid', gap: 4 }}>Senha atual
            <span style={{ display: 'flex', gap: 6 }}>
              <input type="text" readOnly value={atual ?? '••••••••'} style={{ flex: 1, fontWeight: 700, background: '#f4f4f4' }} aria-label="Senha atual da Fábrica" />
              <button type="button" className="trb2-btn" onClick={alternaAtual} title={atual !== null ? 'Esconder a senha atual' : 'Mostrar a senha atual (fica registrado na Auditoria)'} aria-pressed={atual !== null} aria-label="Mostrar ou esconder a senha atual">{atual !== null ? '🙈' : '👁'}</button>
            </span>
          </label>
        )}
        {campo('Nova senha', senha, setSenha)}
        {campo('Repita a senha (👁 para conferir)', conf, setConf, true)}
        {erro && <span style={{ color: '#b00020' }} role="alert">{erro}</span>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <span>{protegido && <button type="button" className="trb2-btn" onClick={remove}>🗑 Remover</button>}</span>
          <span style={{ display: 'flex', gap: 8 }}><button type="button" className="trb2-btn" onClick={onFechar}>Cancelar</button><button type="button" className="trb2-btn" onClick={grava} disabled={!senha || gravando}>💾 Gravar</button></span>
        </div>
        <small>A senha fica criptografada no servidor; o 👁 de "Senha atual" a mostra só aqui no Faturamento. Ver, trocar e remover ficam na Auditoria.</small>
      </div>
    </div>
  );
}
