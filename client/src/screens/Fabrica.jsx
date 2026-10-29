import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Producao from './Producao.jsx';
import DispositivoBloqueado from './DispositivoBloqueado.jsx';

/** App da fábrica: dispositivo liberado só para esta área. Sem login, somente consulta (a API recusa qualquer alteração). */
export default function Fabrica() {
  const [bloq, setBloq] = useState(null);
  useEffect(() => {
    const f = (e) => setBloq(e.detail);
    window.addEventListener('dispositivo-bloqueado', f);
    // se o administrador tirar a liberação, volta ao fluxo normal da página
    const t = setInterval(() => api.get('/dispositivo').then((d) => { if (!d.fabrica) window.location.reload(); }).catch(() => {}), 60000);
    return () => { window.removeEventListener('dispositivo-bloqueado', f); clearInterval(t); };
  }, []);
  if (bloq) return <DispositivoBloqueado codigo={bloq.codigo} mensagem={bloq.message} />;
  return (
    <div className="win">
      <div className="titulo-janela">Sistema Gestor WinBakery — Fábrica (somente consulta)</div>
      <div className="area-telas"><div className="slot"><Producao fabrica /></div></div>
      <footer className="rodape"><span><b>Área:</b> Fábrica · somente consulta</span><span><b>Versão:</b> web 1.0 · {typeof __BUILD__ === 'string' ? __BUILD__ : ''}</span></footer>
    </div>
  );
}
