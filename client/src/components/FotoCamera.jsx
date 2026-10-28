import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from './ui.jsx';

/** Tirar foto com a câmera do computador/celular. Devolve um File JPEG (≤ 900 px, bem abaixo do limite de 5 MB do servidor). */
export default function FotoCamera({ onFechar, onFoto }) {
  const video = useRef(null);
  const fluxo = useRef(null);
  const [erro, setErro] = useState('');
  const [pronta, setPronta] = useState(false);
  const [previa, setPrevia] = useState(null); // { url, blob }

  const para = useCallback(() => { fluxo.current?.getTracks().forEach((t) => t.stop()); fluxo.current = null; }, []);
  const liga = useCallback(async () => {
    setErro(''); setPronta(false);
    if (!navigator.mediaDevices?.getUserMedia) { setErro('Este navegador não permite usar a câmera (é preciso abrir o sistema por HTTPS).'); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      fluxo.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); setPronta(true); }
    } catch (e) {
      setErro(e.name === 'NotAllowedError' ? 'Permissão da câmera negada. Libere a câmera no cadeado da barra de endereço e tente de novo.'
        : e.name === 'NotFoundError' ? 'Nenhuma câmera encontrada neste computador.' : `Não foi possível abrir a câmera (${e.message}).`);
    }
  }, []);
  useEffect(() => { liga(); return para; }, [liga, para]);
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa.url); }, [previa]);

  const capturar = () => {
    const v = video.current; if (!v?.videoWidth) return;
    const k = Math.min(1, 900 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    c.toBlob((blob) => { if (blob) setPrevia({ blob, url: URL.createObjectURL(blob) }); }, 'image/jpeg', 0.9);
  };
  const usar = () => { para(); onFoto(new File([previa.blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' })); };
  const fecha = () => { para(); onFechar(); };

  return (
    <Modal titulo="📷 Tirar foto" onFechar={fecha}>
      <div className="fc">
        {erro && <p className="fc-erro" role="alert">{erro}</p>}
        <div className="fc-tela">
          <video ref={video} playsInline muted style={{ display: previa ? 'none' : 'block' }} />
          {previa && <img src={previa.url} alt="Foto tirada" />}
          {!pronta && !erro && !previa && <span className="fc-esp">Abrindo a câmera…</span>}
        </div>
        <div className="rodape-modal">
          {!previa ? <button type="button" className="bt prim" onClick={capturar} disabled={!pronta}>📸 Capturar</button>
            : <><button type="button" className="bt prim" onClick={usar}>✔ Usar esta foto</button><button type="button" className="bt" onClick={() => setPrevia(null)}>↺ Tirar outra</button></>}
          {erro && <button type="button" className="bt" onClick={liga}>Tentar de novo</button>}
          <button type="button" className="bt" onClick={fecha}>Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}
