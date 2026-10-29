import { useEffect, useState } from 'react';
import Diaria from '../screens/Diaria.jsx';
import Mercadorias from '../screens/Mercadorias.jsx';
import Cargas from '../screens/Cargas.jsx';
import Reclamacoes from '../screens/Reclamacoes.jsx';
import Extras from '../screens/Extras.jsx';
import FabricaProducao from './FabricaProducao.jsx';
import './fabrica.css';

// Janela principal do sistema da fábrica (u_main): barra de botões grandes, abas das telas abertas e barra de status.
// `claro` = tela ainda não refeita no visual original: aparece no desenho do sistema web até receber o mesmo tratamento.
const TELAS = {
  diaria: { t: 'Programação', Tela: Diaria, claro: true },
  producao: { t: 'Produção', Tela: FabricaProducao },
  mercadorias: { t: 'Mercadorias', Tela: Mercadorias, claro: true },
  cargas: { t: 'Cargas', Tela: Cargas, claro: true },
  reclamacoes: { t: 'Reclamações', Tela: Reclamacoes, claro: true },
  extras: { t: 'Pedidos extras', Tela: Extras, claro: true },
};
const BOTOES = [['diaria', 'Programação', 'programacao'], ['producao', 'Produção', 'producao'], ['mercadorias', 'Mercadorias', 'mercadorias'], ['cargas', 'Cargas', 'cargas'], ['reclamacoes', 'Reclamações', 'reclamacoes'], ['extras', 'Pedidos Extras', 'extras']];
const VERSAO = typeof __BUILD__ === 'string' ? __BUILD__.replace(/ · build.*/, '').replace('fase ', '3.0.') : '3.0';

export default function FabricaApp({ saude }) {
  const [abertas, setAbertas] = useState([]);
  const [ativa, setAtiva] = useState(null);
  const [msg, setMsg] = useState('');
  const [menuAba, setMenuAba] = useState(null);
  const abrir = (k) => { setAbertas((a) => (a.includes(k) ? a : [...a, k])); setAtiva(k); };
  const fechar = (k) => setAbertas((a) => { const n = a.filter((x) => x !== k); if (ativa === k) setAtiva(n[n.length - 1] ?? null); return n; });
  useEffect(() => { abrir('producao'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!menuAba) return undefined; const f = () => setMenuAba(null); window.addEventListener('click', f); return () => window.removeEventListener('click', f); }, [menuAba]);
  useEffect(() => { if (!msg) return undefined; const t = setTimeout(() => setMsg(''), 6000); return () => clearTimeout(t); }, [msg]);
  const titulo = ativa ? `WinBakery - ${TELAS[ativa].t} *** Versão: ${VERSAO} - [${TELAS[ativa].t}]` : 'WinBakery';

  return (
    <div className="fb-win">
      <div className="fb-titulo"><img src="/fabrica/janela.png" alt="" />{titulo}</div>
      <div className="fb-barra" role="toolbar" aria-label="Menu">
        <span className="fb-grip" />
        {BOTOES.map(([k, rot, ic]) => (
          <button key={k} type="button" className={`fb-bt${ativa === k ? ' on' : ''}`} onClick={() => abrir(k)}><img src={`/fabrica/${ic}.png`} alt="" /><span>{rot}</span></button>))}
      </div>
      <div className="fb-abas" role="tablist">
        {abertas.map((k) => (
          <button key={k} role="tab" aria-selected={ativa === k} className={ativa === k ? 'on' : ''} onClick={() => setAtiva(k)}
            onContextMenu={(e) => { e.preventDefault(); setMenuAba({ k, x: e.clientX, y: e.clientY }); }}>{TELAS[k].t}</button>))}
      </div>
      <div className="fb-area">
        {abertas.map((k) => {
          const { Tela, claro } = TELAS[k];
          return <div key={k} className={`fb-slot${claro ? ' claro' : ''}`} hidden={ativa !== k}><Tela onFechar={() => fechar(k)} /></div>;
        })}
      </div>
      <div className="fb-status">
        <span><i>Compilação:</i> <b className="v">{VERSAO}</b></span>
        <span><i>Host:</i> <b className="h">{saude?.ok ? `${saude.host}/${saude.banco}` : ''}</b></span>
        <span><b className="m">Mensagem:</b> {msg}</span>
      </div>
      {menuAba && <ul className="fb-ctx" style={{ left: menuAba.x, top: menuAba.y }}><li><button type="button" onClick={() => fechar(menuAba.k)}>Fechar aba</button></li></ul>}
    </div>
  );
}
