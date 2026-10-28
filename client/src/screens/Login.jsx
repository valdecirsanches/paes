import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { mensagem } from '../components/toast.jsx';

// Tela de acesso (u_acesso): abas Login / Servidor, Acessar / Sair e o histórico de acesso.
export default function Login({ onEntrou, saude }) {
  const [aba, setAba] = useState('login');
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState('');
  const [ver, setVer] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [saiu, setSaiu] = useState(false);
  const campoUsuario = useRef(null);
  useEffect(() => { campoUsuario.current?.focus(); }, []);

  const acessar = async (e) => {
    e?.preventDefault();
    if (ocupado || saiu) return;
    setOcupado(true); setMsg('Acessando perfil do usuário...');
    try {
      const u = await api.post('/auth/login', { usuario, senha });
      setMsg(`Acesso concedido ao usuário ${usuario}`);
      onEntrou(u);
    } catch (er) {
      const clara = er.status === 401 || er.status === 422 || er.status === 429 || er.rede;
      setMsg(clara ? er.message : `Falha ao conectar: ${er.message}`);
      mensagem('erro', clara ? er.message : `Falha ao conectar: ${er.message}`);
      setSenha(''); campoUsuario.current?.focus(); campoUsuario.current?.select();
    } finally { setOcupado(false); }
  };
  const sair = () => { setSaiu(true); setMsg('Sistema encerrado. Você já pode fechar esta janela.'); window.close(); };

  return (
    <div className="lg-fundo">
      <dialog open className="lg-janela" aria-label="Login" onKeyDown={(e) => { if (e.altKey && e.key === 'F4') e.preventDefault(); }}>
        <div className="lg-titulo"><span>Login</span><button type="button" aria-label="Fechar" onClick={sair}>✕</button></div>
        <div className="lg-corpo">
          <div className="lg-esq">
            <div className="lg-topo">
              <img src="/login-usuarios.png" alt="" />
              <div className="lg-sac">Sistema de SAC<br />Desenvolvido pela EDSSolution Tecnologia<br />Soluções em TI<br /><br />Telefone: 55 11 3682 0897<br />email: suporte@edssolution.com.br<br />WWW.EDSSOLUTION.COM.BR</div>
            </div>
            <div className="lg-abas" role="tablist">
              <button type="button" role="tab" aria-selected={aba === 'login'} className={aba === 'login' ? 'on' : ''} onClick={() => setAba('login')}>Login</button>
              <button type="button" role="tab" aria-selected={aba === 'servidor'} className={aba === 'servidor' ? 'on' : ''} onClick={() => setAba('servidor')}>Servidor</button>
            </div>
            <div className="lg-aba">
              {aba === 'login' ? (
                <form onSubmit={acessar} className="lg-form">
                  <label className="lg-u">Usuário:<input ref={campoUsuario} value={usuario} maxLength={100} autoComplete="username" disabled={saiu} onChange={(e) => setUsuario(e.target.value)} /></label>
                  <label className="lg-s">Senha:<span className="lg-olho"><input type={ver ? 'text' : 'password'} value={senha} maxLength={100} autoComplete="current-password" disabled={saiu} onChange={(e) => setSenha(e.target.value)} /><button type="button" tabIndex={-1} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'} title={ver ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={ver} onClick={() => setVer((x) => !x)}>{ver ? '🙈' : '👁'}</button></span></label>
                  <button type="submit" className="lg-bt lg-acessar" disabled={ocupado || saiu}>🔑 Acessar</button>
                  <button type="button" className="lg-bt lg-sair" onClick={sair}>🚪 Sair</button>
                  <span className="lg-versao">web 1.0</span>
                </form>
              ) : (
                <div className="lg-srv">
                  <label>Servidor<input readOnly value={saude?.host ?? ''} /></label>
                  <label>Banco de dados<input readOnly value={saude?.banco ?? ''} /></label>
                  <p className={saude?.ok ? 'ok' : 'falha'}>{saude ? (saude.ok ? `Conectado a ${saude.host}/${saude.banco}` : `Não conectado. ${saude.message ?? ''}`) : 'Verificando...'}</p>
                  <small>A conexão com o banco é configurada no servidor (arquivo .env), não nesta tela.</small>
                </div>
              )}
            </div>
            <textarea className="lg-hist" readOnly value={msg} aria-live="polite" />
          </div>
          <img className="lg-nfe" src="/login-nfe.png" alt="" />
        </div>
      </dialog>
    </div>
  );
}
