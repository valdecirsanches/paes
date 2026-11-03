import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Toast } from '../components/toast.jsx';

const MAX_LADO = 2560;
/** Lê o arquivo; reduz (JPEG) se for grande, para caber no limite e carregar rápido. */
async function prepara(file) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Escolha uma imagem PNG, JPG ou WEBP.');
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_LADO / Math.max(bmp.width, bmp.height));
  if (k === 1 && file.size <= 3 * 1024 * 1024) return { blob: file, nome: file.name };
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.88));
  if (!blob || blob.size > 4 * 1024 * 1024) throw new Error('Imagem grande demais mesmo reduzida (máx. 4 MB).');
  return { blob, nome: file.name.replace(/\.\w+$/, '') + '.jpg' };
}
const paraBase64 = (blob) => new Promise((ok, err) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] ?? ''); r.onerror = err; r.readAsDataURL(blob); });

/** Ferramentas › Imagem da tela principal (administrador): escolhe a foto que aparece ao abrir o sistema. */
export default function TelaPrincipal() {
  const [info, setInfo] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [previa, setPrevia] = useState(null);
  const arq = useRef(null);
  const carrega = useCallback(() => api.get('/tela-principal').then(setInfo).catch((e) => setAviso({ tipo: 'erro', m: e.message })), []);
  useEffect(() => { carrega(); }, [carrega]);
  const escolhe = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    setOcupado(true);
    try {
      const { blob, nome } = await prepara(f);
      setPrevia(URL.createObjectURL(blob));
      await api.put('/tela-principal', { nomeArquivo: nome, arquivoBase64: await paraBase64(blob) });
      setAviso({ tipo: 'ok', m: 'Imagem da tela principal atualizada.' }); window.dispatchEvent(new Event('tela-principal-alterada')); carrega();
    } catch (er) { setPrevia(null); setAviso({ tipo: 'erro', m: er.message }); } finally { setOcupado(false); }
  };
  const padrao = async () => {
    if (!window.confirm('Voltar à imagem padrão da tela principal?')) return;
    setOcupado(true);
    try { await api.del('/tela-principal'); setPrevia(null); setAviso({ tipo: 'ok', m: 'Imagem padrão restaurada.' }); window.dispatchEvent(new Event('tela-principal-alterada')); carrega(); } catch (er) { setAviso({ tipo: 'erro', m: er.message }); } finally { setOcupado(false); }
  };
  const src = previa ?? (info?.personalizada ? `/api/tela-principal/imagem?v=${info.versao}` : '/principal-paes.jpg');
  return (
    <section className="tp">
      <Toast aviso={aviso} />
      <header><h2>🖼 Imagem da tela principal</h2><small>A foto que aparece ao abrir o sistema, para todos os usuários. PNG, JPG ou WEBP; imagens grandes são reduzidas automaticamente.</small></header>
      <div className="tp-previa" style={{ backgroundImage: `url(${src})` }} role="img" aria-label="Prévia da tela principal" />
      <p>{info?.personalizada ? `Imagem personalizada: ${info.nome} (${Math.round(info.bytes / 1024)} KB)` : 'Usando a imagem padrão.'}</p>
      <div className="tp-bts">
        <input ref={arq} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={escolhe} />
        <button type="button" className="bt principal" disabled={ocupado} onClick={() => arq.current?.click()}>{ocupado ? 'Enviando…' : '📁 Escolher imagem…'}</button>
        <button type="button" className="bt" disabled={ocupado || !info?.personalizada} onClick={padrao}>Voltar à padrão</button>
      </div>
    </section>
  );
}
