import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal } from './ui.jsx';

/** NCM com conferência na tabela oficial (✔ descrição / ✖ não existe) e pesquisa por código ou descrição (🔍). Controlado: valor + aoMudar. */
export default function NcmCampo({ valor, aoMudar, desabilitado, titulo = 'NCM' }) {
  const v = String(valor ?? '');
  const d = v.replace(/\D/g, '');
  const [r, setR] = useState(null);
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    setR(null);
    if (d.length !== 8) return undefined;
    let vivo = true;
    const t = setTimeout(() => api.get(`/nfe/ncm/${d}`).then((x) => vivo && setR(x)).catch(() => {}), 400);
    return () => { vivo = false; clearTimeout(t); };
  }, [d]);
  const msg = !d ? null : d.length !== 8 ? { ok: false, motivo: 'O NCM precisa ter 8 dígitos.' } : r;
  return (<>
    <span className="ncm-linha">
      <input value={v} disabled={desabilitado} readOnly={desabilitado} onChange={(e) => aoMudar(e.target.value)} aria-label={titulo} />
      {!desabilitado && <button type="button" className="ncm-lupa" title="Pesquisar NCM por código ou descrição" onClick={() => setAberto(true)}>🔍</button>}
    </span>
    {msg && <small className={`ncm-msg ${msg.ok === true ? 'ok' : msg.ok === false ? 'ruim' : ''}`}>{msg.ok === true ? `✔ ${msg.descricao}` : msg.ok === false ? `✖ ${msg.motivo}` : msg.motivo}</small>}
    {aberto && <Pesquisa inicial={d} aoEscolher={(c) => { aoMudar(c); setAberto(false); }} aoFechar={() => setAberto(false)} />}
  </>);
}

function Pesquisa({ inicial, aoEscolher, aoFechar }) {
  const [q, setQ] = useState(inicial && inicial.length >= 2 ? inicial : '');
  const [res, setRes] = useState(null);
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return undefined; }
    let vivo = true;
    const t = setTimeout(() => api.get(`/nfe/ncm?q=${encodeURIComponent(q)}`).then((x) => vivo && setRes(x)).catch((e) => vivo && setRes({ itens: [], motivo: e.message })), 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [q]);
  return (
    <Modal titulo="Pesquisar NCM" onFechar={aoFechar}>
      <div className="ncm-pesq">
        <input autoFocus placeholder="Digite parte do código (ex.: 0901) ou da descrição (ex.: café)" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="ncm-lista">
          {!res && <p className="vazio">Digite ao menos 2 caracteres.</p>}
          {res?.motivo && <p className="vazio">{res.motivo}</p>}
          {res && !res.motivo && res.itens.length === 0 && <p className="vazio">Nenhum NCM encontrado.</p>}
          {res?.itens.map((n) => <button type="button" key={n.codigo} onClick={() => aoEscolher(n.codigo)}><b>{n.codigo.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3')}</b><span>{n.descricao}</span></button>)}
        </div>
        {res?.fonte && <small>Fonte: {res.fonte}. Clique para escolher.</small>}
      </div>
    </Modal>
  );
}
