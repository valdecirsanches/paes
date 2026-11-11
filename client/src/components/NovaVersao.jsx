import { useEffect, useState } from 'react';

const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : '';
const INTERVALO = 2 * 60 * 1000;

/** Avisa quando há versão nova publicada (compara o build embutido com /version.json) e oferece atualizar. */
export default function NovaVersao() {
  const [nova, setNova] = useState(null);
  useEffect(() => {
    if (!BUILD) return undefined;
    let vivo = true;
    const checar = async () => {
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return;
        const j = await r.json();
        if (vivo && j?.build && j.build !== BUILD) setNova(j.build);
      } catch { /* sem rede: tenta depois */ }
    };
    const t = setInterval(checar, INTERVALO);
    const vis = () => { if (document.visibilityState === 'visible') checar(); };
    document.addEventListener('visibilitychange', vis);
    checar();
    return () => { vivo = false; clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, []);
  if (!nova) return null;
  return (
    <div className="nova-versao" role="alert">
      <span>🔔 Nova versão do sistema disponível ({nova}). Termine o que está fazendo e atualize.</span>
      <button type="button" onClick={() => window.location.reload()}>Atualizar agora</button>
      <button type="button" className="sec" onClick={() => setNova(null)} title="Avisar de novo na próxima verificação">Depois</button>
    </div>
  );
}
