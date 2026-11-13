import { useEffect, useState } from 'react';

const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : '';
const FASE = typeof __FASE__ === 'number' ? __FASE__ : 0;
const NOVIDADES = typeof __NOVIDADES__ === 'object' ? __NOVIDADES__ : [];
const INTERVALO = 2 * 60 * 1000;
const CHAVE = 'paes_fase_vista';

const lerVista = () => { try { return Number(localStorage.getItem(CHAVE)) || 0; } catch { return 0; } };
const gravaVista = (n) => { try { localStorage.setItem(CHAVE, String(n)); } catch { /* sem armazenamento */ } };
/** Entregas com número maior que `de` (e até `ate`, se informado), da mais nova para a mais antiga. */
export const novidadesEntre = (lista, de, ate = Infinity) => (lista ?? []).filter((n) => n.fase > de && n.fase <= ate).sort((a, b) => b.fase - a.fase);

function Lista({ itens }) {
  return (
    <ul className="nv-lista">
      {itens.map((n) => (
        <li key={n.fase}><b>Fase {n.fase}</b><ul>{n.itens.map((t, i) => <li key={i}>{t}</li>)}</ul></li>
      ))}
    </ul>
  );
}

/** Avisa quando há versão nova publicada (compara o build embutido com /version.json), diz o que mudou e oferece atualizar.
 *  Depois de atualizar, mostra uma vez o quadro "O que mudou" com as novidades desde a última versão vista neste navegador. */
export default function NovaVersao() {
  const [nova, setNova] = useState(null); // { build, fase, novidades }
  const [aberto, setAberto] = useState(false);
  const [recem, setRecem] = useState(() => { // acabou de atualizar: novidades entre a última fase vista e a atual
    const vista = lerVista();
    return vista > 0 && vista < FASE ? novidadesEntre(NOVIDADES, vista, FASE).slice(0, 12) : [];
  });
  useEffect(() => { if (!recem.length) gravaVista(FASE); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!BUILD) return undefined;
    let vivo = true;
    const checar = async () => {
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return;
        const j = await r.json();
        if (vivo && j?.build && j.build !== BUILD) setNova({ build: j.build, fase: j.fase ?? 0, novidades: novidadesEntre(j.novidades, FASE, j.fase ?? Infinity).slice(0, 12) });
      } catch { /* sem rede: tenta depois */ }
    };
    const t = setInterval(checar, INTERVALO);
    const vis = () => { if (document.visibilityState === 'visible') checar(); };
    document.addEventListener('visibilitychange', vis);
    checar();
    return () => { vivo = false; clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, []);
  const fechaRecem = () => { gravaVista(FASE); setRecem([]); };
  return (
    <>
      {recem.length > 0 && (
        <div className="nv-fundo" role="dialog" aria-label="O que mudou">
          <div className="nv-caixa">
            <h3>✨ O que mudou nesta atualização</h3>
            <Lista itens={recem} />
            <div className="nv-bt"><button type="button" onClick={fechaRecem}>Entendi</button></div>
          </div>
        </div>
      )}
      {nova && (
        <div className="nova-versao" role="alert">
          <span>🔔 Nova versão do sistema disponível ({nova.build}). Termine o que está fazendo e atualize.</span>
          {nova.novidades.length > 0 && <button type="button" className="sec" onClick={() => setAberto((x) => !x)}>{aberto ? 'Ocultar' : 'O que mudou?'}</button>}
          <button type="button" onClick={() => window.location.reload()}>Atualizar agora</button>
          <button type="button" className="sec" onClick={() => setNova(null)} title="Avisar de novo na próxima verificação">Depois</button>
          {aberto && <div className="nv-novas"><Lista itens={nova.novidades} /></div>}
        </div>
      )}
    </>
  );
}
