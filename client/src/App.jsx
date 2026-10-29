import { sincronizaLayout } from './lib/ajustes.js';
import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import Diaria from './screens/Diaria.jsx';
import Mercadorias from './screens/Mercadorias.jsx';
import Producao from './screens/Producao.jsx';
import RelatorioNfes from './screens/RelatorioNfes.jsx';
import NfsConfirmadas from './screens/NfsConfirmadas.jsx';
import Faturamento from './screens/Faturamento.jsx';
import NFe from './screens/NFe.jsx';
import Comandas from './screens/Comandas.jsx';
import Tributos from './screens/Tributos.jsx';
import { statusAgente, lerMapa } from './lib/impressora.js';
import { preaquece } from './lib/mercCache.js';
import Impressoras from './screens/Impressoras.jsx';
import InstalarAgente from './screens/InstalarAgente.jsx';
import Clientes from './screens/Clientes.jsx';
import Produtos from './screens/Produtos.jsx';
import Funcionarios from './screens/Funcionarios.jsx';
import Itinerario from './screens/Itinerario.jsx';
import Cargas from './screens/Cargas.jsx';
import Login from './screens/Login.jsx';
import Dispositivos from './screens/Dispositivos.jsx';
import Fabrica from './screens/Fabrica.jsx';
import DispositivoBloqueado from './screens/DispositivoBloqueado.jsx';
import AlterarSenha from './screens/AlterarSenha.jsx';

// Menu "Programação" do sistema antigo. `tela` = componente já convertido; sem tela = próxima fase.
const TELAS = {
  diaria: { titulo: 'Programação diária', Tela: Diaria },
  mercadorias: { titulo: 'Venda de mercadorias', Tela: Mercadorias },
  producao: { titulo: 'Produção', Tela: Producao },
  itinerario: { titulo: 'Controle do etinerário', Tela: Itinerario },
  cargas: { titulo: 'Roteiro de cargas', Tela: Cargas },
  faturamento: { titulo: 'Faturamento', Tela: Faturamento },
  comandas: { titulo: 'Controle de comandas', Tela: Comandas },
  nfe: { titulo: 'Nota Fiscal - Eletrônica', Tela: NFe },
  tributos: { titulo: 'Códigos de Tributação de produtos', Tela: Tributos },
  impressoras: { titulo: 'Configurar impressoras', Tela: Impressoras },
  instalar: { titulo: 'Instalar agente de impressão', Tela: InstalarAgente },
  clientes: { titulo: 'Cadastro de Clientes', Tela: Clientes },
  produtos: { titulo: 'Produtos', Tela: Produtos },
  dispositivos: { titulo: 'Dispositivos autorizados', Tela: Dispositivos },
  funcionarios: { titulo: 'Cadastro de funcionários', Tela: Funcionarios },
  relnfes: { titulo: 'Relatório de NFEs', Tela: RelatorioNfes },
  nfsconf: { titulo: 'Leitura de NFs confirmadas', Tela: NfsConfirmadas },
};
// Menus do sistema antigo. Itens sem tela em TELAS ainda são de próximas fases (aparecem esmaecidos).
const MENUS = [
  { id: 'prog', rotulo: 'Programação', icone: '🗓️', itens: [['diaria', 'Fixa/Diária', '📋'], ['mercadorias', 'Mercadorias', '🛒'], ['producao', 'Produção', '🥖'], ['itinerario', 'Etinerário', '🧭'], ['cargas', 'Cargas', '🚚']] },
  { id: 'fat', rotulo: 'Faturamento', icone: '💳', itens: [['faturamento', 'Faturamento', '💳'], ['comandas', 'Controle de comandas', '🧾'], ['nfe', 'NFe', '📑'], ['tributos', 'Tributos', '🏷️'], ['quitacao', 'Quitação', '💰']] },
  { id: 'cad', rotulo: 'Cadastros', icone: '👥', itens: [['clientes', 'Clientes', '🏢'], ['produtos', 'Produtos', '🍞'], ['funcionarios', 'Funcionários', '🧑‍🍳']] },
  { id: 'outros', rotulo: 'Outros', icone: '📦', itens: [['relnfes', 'Relatório de NFEs', '📊'], ['nfsconf', 'Leitura de NFs confirmadas', '📥']] },
  { id: 'ferr', rotulo: 'Ferramentas', icone: '🛠️', itens: [['impressoras', 'Configurar impressoras', '🖨️'], ['instalar', 'Instalar agente de impressão', '⬇️'], ['dispositivos', 'Dispositivos autorizados', '🖥']] },
];
const MENUS_FUTUROS = [];

export default function App() {
  const [abertas, setAbertas] = useState([]);
  const [ativa, setAtiva] = useState(null);
  const [saude, setSaude] = useState(null);
  const [impr, setImpr] = useState(null); // estado do agente de impressão desta estação
  const [ambiente, setAmbiente] = useState(null); // 1 produção · 2 homologação (emissão de NFe)
  const [usuario, setUsuario] = useState(null); // null = sem sessão (tela de login)
  const [verificando, setVerificando] = useState(true);
  const [soFabrica, setSoFabrica] = useState(false); // dispositivo liberado só para a fábrica: consulta sem login
  const [bloqueio, setBloqueio] = useState(null); // dispositivo não habilitado: { codigo, message }
  const [trocaSenha, setTrocaSenha] = useState(false);
  const [menuAberto, setMenuAberto] = useState(null);
  const barra = useRef(null);
  useEffect(() => { // fecha o menu ao clicar fora ou com Esc
    const fora = (e) => { if (barra.current && !barra.current.contains(e.target)) setMenuAberto(null); };
    const esc = (e) => { if (e.key === 'Escape') setMenuAberto(null); };
    document.addEventListener('pointerdown', fora); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc); };
  }, []);
  useEffect(() => { // dispositivo habilitado? (a tela de bloqueio mostra o código; qualquer chamada barrada também aciona o evento)
    api.get('/dispositivo').then((d) => { if (d && d.habilitado === false) setBloqueio(d); else if (d?.fabrica) setSoFabrica(true); }).catch(() => {});
    const f = (e) => setBloqueio(e.detail ?? { codigo: '' });
    window.addEventListener('dispositivo-bloqueado', f);
    return () => window.removeEventListener('dispositivo-bloqueado', f);
  }, []);
  useEffect(() => { api.get('/health').then(setSaude).catch((e) => setSaude({ ok: false, message: e.message })); }, []);
  useEffect(() => { if (usuario) sincronizaLayout({ forcar: true }); }, [usuario]); // layout de etiquetas compartilhado entre estações
  useEffect(() => { if (usuario) preaquece(); }, [usuario]); // Mercadorias de hoje já na memória quando a tela for aberta
  useEffect(() => { // ao atualizar a página: só volta ao login se o servidor disser "sem sessão"; se a API ainda está subindo (rede/5xx), tenta de novo
    let vivo = true;
    (async () => {
      for (let t = 0; t < 12 && vivo; t += 1) {
        try { const u = await api.get('/auth/me'); if (vivo) setUsuario(u); break; } catch (e) {
          if (e.status === 401 || (e.status && e.status < 500 && e.status !== 408 && e.status !== 429)) { if (vivo) setUsuario(null); break; }
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      if (vivo) setVerificando(false);
    })();
    return () => { vivo = false; };
  }, []);
  useEffect(() => { // ambiente de emissão da NFe: sempre visível no menu (recarrega após gravar a configuração)
    if (!usuario) { setAmbiente(null); return undefined; }
    const ler = () => api.get('/nfe/ambiente').then((r) => setAmbiente(r.ambiente)).catch(() => setAmbiente(0));
    ler(); window.addEventListener('ambiente-alterado', ler);
    return () => window.removeEventListener('ambiente-alterado', ler);
  }, [usuario]);
  useEffect(() => { // ambiente de impressão: agente local online/offline e quantos documentos estão ligados a ele
    if (!usuario) { setImpr(null); return undefined; }
    const ler = () => statusAgente().then((s) => setImpr({ on: true, destinos: s.destinos, ligados: Object.keys(lerMapa()).length })).catch(() => setImpr({ on: false, ligados: 0 }));
    ler(); const t = setInterval(ler, 30000); window.addEventListener('impressoras-alteradas', ler);
    return () => { clearInterval(t); window.removeEventListener('impressoras-alteradas', ler); };
  }, [usuario]);
  useEffect(() => { // sessão vencida no meio do uso: volta ao login (as telas abertas são descartadas)
    const f = () => { setUsuario(null); setAbertas([]); setAtiva(null); };
    window.addEventListener('sessao-expirada', f);
    return () => window.removeEventListener('sessao-expirada', f);
  }, []);
  const sair = async () => { try { await api.post('/auth/logout'); } catch { /* sem sessão mesmo */ } setUsuario(null); setAbertas([]); setAtiva(null); };

  const abrir = (k) => { setAbertas((a) => (a.includes(k) ? a : [...a, k])); setAtiva(k); };
  const fechar = (k) => {
    setAbertas((a) => {
      const n = a.filter((x) => x !== k);
      if (ativa === k) setAtiva(n[n.length - 1] ?? null);
      return n;
    });
  };
  
  if (soFabrica && !bloqueio) return <Fabrica />;
  return (
    <div className="win">
      <div className={`titulo-janela${ambiente === 1 ? ' prod' : ''}`}>Sistema Gestor WinBakery{ativa ? ` — [${TELAS[ativa].titulo}]` : ''}{ambiente === 1 ? '  ·  ⚠ NFe em PRODUÇÃO' : ambiente === 2 ? '  ·  NFe em homologação' : ''}</div>
      <nav className="menubar" ref={barra} aria-label="Menu principal">
        <span className="menu-marca" aria-hidden="true">🥖</span>
        {MENUS.map((m) => {
          const aberto = menuAberto === m.id;
          return (
            <div key={m.id} className={`menu${aberto ? ' aberto' : ''}`} onPointerEnter={() => { if (menuAberto && menuAberto !== m.id) setMenuAberto(m.id); }}>
              <button type="button" className="menu-bt" aria-haspopup="menu" aria-expanded={aberto} disabled={!usuario} onClick={() => setMenuAberto(aberto ? null : m.id)}>
                <span className="mi" aria-hidden="true">{m.icone}</span>{m.rotulo}<span className="seta" aria-hidden="true">▾</span>
              </button>
              {aberto && (
                <ul role="menu">
                  {m.itens.filter(([k]) => k !== 'dispositivos' || usuario?.admin).map(([k, r, ic]) => (TELAS[k]
                    ? <li key={k} role="none"><button role="menuitem" className={abertas.includes(k) ? 'aberta' : ''} onClick={() => { setMenuAberto(null); abrir(k); }}><span className="mi" aria-hidden="true">{ic}</span><span className="rot">{r}</span>{abertas.includes(k) && <i className="ponto" title="Aberta" />}</button></li>
                    : <li key={k} role="none"><span role="menuitem" aria-disabled="true" className="desab" title="Próxima fase"><span className="mi" aria-hidden="true">{ic}</span><span className="rot">{r}</span><em>em breve</em></span></li>))}
                </ul>
              )}
            </div>
          );
        })}
        {MENUS_FUTUROS.map(([r, ic]) => <span key={r} className="menu-bt desab" title="Próximas fases"><span className="mi" aria-hidden="true">{ic}</span>{r}</span>)}
        <div className={`menu${menuAberto === 'usr' ? ' aberto' : ''}`} onPointerEnter={() => { if (menuAberto && menuAberto !== 'usr') setMenuAberto('usr'); }}>
          <button type="button" className="menu-bt" aria-haspopup="menu" aria-expanded={menuAberto === 'usr'} disabled={!usuario} onClick={() => setMenuAberto(menuAberto === 'usr' ? null : 'usr')}>
            <span className="mi" aria-hidden="true">👤</span>Usuário<span className="seta" aria-hidden="true">▾</span>
          </button>
          {menuAberto === 'usr' && (
            <ul role="menu">
              <li role="none"><button role="menuitem" onClick={() => { setMenuAberto(null); sair(); }}><span className="mi" aria-hidden="true">🔑</span><span className="rot">Login (trocar usuário)</span></button></li>
              <li role="none"><button role="menuitem" onClick={() => { setMenuAberto(null); setTrocaSenha(true); }}><span className="mi" aria-hidden="true">🔒</span><span className="rot">Alterar senha</span></button></li>
            </ul>
          )}
        </div>
        <span className="menu-espaco" />
        {usuario && ambiente !== null && (
          <button type="button" className={`amb-selo ${ambiente === 1 ? 'prod' : ambiente === 2 ? 'hom' : 'unk'}`} title="Ambiente de emissão de NFe — clique para configurar" onClick={() => abrir('nfe')}>
            <i aria-hidden="true" />{ambiente === 1 ? 'PRODUÇÃO' : ambiente === 2 ? 'HOMOLOGAÇÃO' : 'AMBIENTE ?'}
          </button>
        )}
        {usuario && impr && (
          <button type="button" className={`imp-selo-topo ${impr.on ? 'on' : 'off'}`} onClick={() => abrir('impressoras')}
            title={impr.on ? `Agente de impressão conectado · ${impr.destinos} impressora(s) cadastrada(s) · ${impr.ligados} documento(s) direcionado(s). Clique para configurar.` : 'Agente de impressão não encontrado: tudo imprime pelo navegador. Clique para configurar/instalar.'}>
            🖨️ {impr.on ? `Agente · ${impr.ligados ? `${impr.ligados} doc(s) direto` : 'sem direcionamento'}` : 'Navegador'}
          </button>
        )}
        {usuario && <span className="menu-usuario" title="Usuário conectado">👤 {usuario.nome || usuario.usuario}</span>}
        <button type="button" className="menu-bt menu-fechar" title="Fechar o sistema (encerra a sessão)" disabled={!usuario} onClick={sair}><span className="mi" aria-hidden="true">⏻</span>Fechar</button>
      </nav>

      <div className="abas-topo" role="tablist">
        {abertas.map((k) => (
          <span key={k} className={`aba-topo${ativa === k ? ' on' : ''}`}>
            <button role="tab" aria-selected={ativa === k} onClick={() => setAtiva(k)}>{TELAS[k].titulo}</button>
            {abertas.length > 1 && <button className="x" aria-label={`Fechar ${TELAS[k].titulo}`} onClick={() => fechar(k)}>×</button>}
          </span>
        ))}
      </div>

      {/* Telas abertas continuam montadas (como janelas MDI): trocar de aba não perde data/seleção. */}
      <div className="area-telas">
        {usuario && abertas.map((k) => {
          const { Tela } = TELAS[k];
          return <div key={k} className="slot" hidden={ativa !== k}><Tela onFechar={() => fechar(k)} /></div>;
        })}
        {!ativa && <div className="fundo-paes" />}
      </div>

      <footer className="rodape">
        <span><b>Host:</b> {saude ? (saude.ok ? `${saude.host}/${saude.banco}` : <em className="falha">sem conexão com o banco</em>) : '…'}</span>
        <span title="Se após o deploy este texto não mudou, o navegador/Cloudflare está com a versão antiga ou o build não foi refeito"><b>Versão:</b> web 1.0 · {typeof __BUILD__ === 'string' ? __BUILD__ : ''}</span>
        <span><b>Usuário:</b> {usuario ? usuario.nome || usuario.usuario : ''}</span>
        {saude && !saude.ok && <span className="falha">{saude.message}</span>}
      </footer>
      {bloqueio && <DispositivoBloqueado codigo={bloqueio.codigo} mensagem={bloqueio.message} />}
      {!verificando && !usuario && !bloqueio && <Login saude={saude} onEntrou={(u) => { setUsuario(u); setAbertas([]); setAtiva(null); }} />}
      {trocaSenha && usuario && <AlterarSenha onFechar={() => setTrocaSenha(false)} />}
    </div>
  );
}
