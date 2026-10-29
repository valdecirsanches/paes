import { useEffect, useState } from 'react';
import { api } from '../api.js';

/** Tela cheia mostrada quando o servidor não reconhece este navegador/computador como dispositivo habilitado. */
export default function DispositivoBloqueado({ codigo: codigoInicial, mensagem }) {
  const [codigo, setCodigo] = useState(codigoInicial || '');
  const [copiado, setCopiado] = useState(false);
  useEffect(() => { // confere de tempos em tempos: assim que o administrador habilitar, o sistema abre sozinho
    const ver = () => api.get('/dispositivo').then((d) => { if (d.codigo) setCodigo(d.codigo); if (d.habilitado) window.location.reload(); }).catch(() => {});
    ver(); const t = setInterval(ver, 10000);
    return () => clearInterval(t);
  }, []);
  const copia = async () => { try { await navigator.clipboard.writeText(codigo); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { /* o código já está visível para copiar à mão */ } };
  return (
    <div className="dsp-fundo" role="alertdialog" aria-labelledby="dsp-t">
      <div className="dsp-caixa">
        <div className="dsp-ico" aria-hidden="true">🔒</div>
        <h1 id="dsp-t">{mensagem || 'Dispositivo não habilitado para uso do aplicativo.'}</h1>
        <p>Informe o código abaixo ao administrador para liberar este dispositivo:</p>
        <div className="dsp-codigo" aria-label="Código do dispositivo">{codigo || '…'}</div>
        <button type="button" className="bt" onClick={copia} disabled={!codigo}>{copiado ? '✔ Copiado' : '📋 Copiar código'}</button>
        <small>Esta tela confere sozinha e abre o sistema assim que o dispositivo for liberado.</small>
      </div>
    </div>
  );
}
