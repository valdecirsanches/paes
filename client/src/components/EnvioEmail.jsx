import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal } from './ui.jsx';

const lista = (a) => (a ?? []).join('; ');
const REAL = (v) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Envio de NF-e por e-mail (cliente destinatário ou contabilidade). 1 nota: edita destinatários/assunto/texto; várias: confere e envia. */
export default function EnvioEmail({ ids, destino, onFechar, onEnviado }) {
  const [prev, setPrev] = useState(null);
  const [erro, setErro] = useState('');
  const [env, setEnv] = useState(false);
  const [res, setRes] = useState(null);
  const [aj, setAj] = useState({ para: '', cc: '', cco: '', assunto: '', mensagem: '' });
  const unica = ids.length === 1;
  const quem = destino === 'contabilidade' ? 'Contabilidade' : 'Cliente destinatário';

  useEffect(() => {
    let vivo = true;
    api.post('/nfe/email/previa', { ids, destino }).then((r) => {
      if (!vivo) return; setPrev(r);
      const n = r.notas[0];
      if (r.notas.length === 1) setAj({ para: lista(n.para), cc: lista(n.cc), cco: lista(n.cco), assunto: n.assunto, mensagem: n.mensagem });
    }).catch((e) => vivo && setErro(e.message));
    return () => { vivo = false; };
  }, [ids, destino]);

  const prontas = prev?.notas.filter((n) => n.pode).length ?? 0;
  const enviar = async () => {
    setEnv(true); setErro('');
    try {
      const corpo = { ids: prev.notas.filter((n) => n.pode).map((n) => n.id), destino };
      if (unica) corpo.ajustes = aj;
      const r = await api.post('/nfe/email', corpo);
      setRes(r); onEnviado?.(r);
    } catch (e) { setErro(e.message); } finally { setEnv(false); }
  };
  const campo = (k, rot, dica) => (
    <label className="ee-mail-c"><span>{rot}</span><input value={aj[k]} placeholder={dica} onChange={(e) => setAj((x) => ({ ...x, [k]: e.target.value }))} /></label>
  );

  return (
    <Modal titulo={`✉ Enviar NF-e — ${quem}`} onFechar={onFechar} largo>
      <div className="em">
        {erro && <p className="em-erro" role="alert">{erro}</p>}
        {!prev && !erro && <p className="em-sub">Montando o e-mail…</p>}
        {prev && !prev.smtp && <p className="em-erro">Servidor SMTP não configurado — preencha em <b>Emitente e configurações › Envio de email</b>.</p>}
        {prev && !res && unica && (() => {
          const n = prev.notas[0];
          return (<>
            <p className="em-sub">NFe <b>{n.numero}</b> · {n.cliente || '—'} · {REAL(n.valor)} · anexos: <b>XML</b> autorizado e <b>DANFE</b> (PDF)</p>
            {n.avisos.map((a) => <p key={a} className="em-aviso">⚠ {a}</p>)}
            {campo('para', 'Para', 'um ou mais e-mails separados por ;')}
            {campo('cc', 'Cópia (Cc)')}
            {campo('cco', 'Cópia oculta (Cco)')}
            {campo('assunto', 'Assunto')}
            <label className="em-msg"><span>Mensagem</span><textarea rows={8} value={aj.mensagem} onChange={(e) => setAj((x) => ({ ...x, mensagem: e.target.value }))} /></label>
          </>);
        })()}
        {prev && !res && !unica && (<>
          <p className="em-sub"><b>{prontas}</b> de {prev.notas.length} nota(s) prontas para envio · anexos: XML + DANFE (PDF) de cada nota</p>
          <div className="em-grade"><table>
            <thead><tr><th>NFe</th><th>Cliente</th><th>Valor</th><th>Destinatários</th></tr></thead>
            <tbody>{prev.notas.map((n) => (
              <tr key={n.id} className={n.pode ? '' : 'em-x'}>
                <td>{n.numero || n.id}</td><td>{n.cliente}</td><td className="num">{REAL(n.valor)}</td>
                <td>{n.pode ? <>{lista(n.para)}{n.cc.length ? <small> · cc: {lista(n.cc)}</small> : null}</> : <span className="em-aviso">{n.avisos[0]}</span>}</td>
              </tr>))}</tbody>
          </table></div>
        </>)}
        {res && (<>
          <p className={res.ok ? 'em-ok' : 'em-erro'}>{res.ok ? `✔ ${res.enviadas} e-mail(s) enviado(s).` : `${res.enviadas} enviado(s); ${res.resultados.length - res.enviadas} com problema.`}</p>
          <ul className="em-log">{res.resultados.map((r) => <li key={r.id} className={r.ok ? 'ok' : 'x'}>{r.log}</li>)}</ul>
        </>)}
        <div className="rodape-modal">
          {!res && <button type="button" className="bt prim" disabled={env || !prontas || !prev?.smtp} onClick={enviar}>{env ? 'Enviando…' : `Enviar${prontas > 1 ? ` (${prontas})` : ''}`}</button>}
          <button type="button" className="bt" onClick={onFechar}>{res ? 'Fechar' : 'Cancelar'}</button>
        </div>
      </div>
    </Modal>
  );
}
