import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal } from './ui.jsx';

const REAL = (v) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Envio de NF-e por e-mail (cliente destinatário ou contabilidade). 1 nota: edita destinatários/assunto/texto; várias: confere e envia. */
export default function EnvioEmail({ ids, destino, onFechar, onEnviado }) {
  const [prev, setPrev] = useState(null);
  const [erro, setErro] = useState('');
  const [env, setEnv] = useState(false);
  const [res, setRes] = useState(null);
  const [aj, setAj] = useState({ assunto: '', mensagem: '' });
  const [extra, setExtra] = useState(''); // e-mails a mais (nota única) — vão em "Para"
  const [marc, setMarc] = useState({}); // "id|campo|email" -> false quando desmarcado (ausente = marcado)
  const unica = ids.length === 1;
  const quem = destino === 'contabilidade' ? 'Contabilidade' : 'Cliente destinatário';

  useEffect(() => {
    let vivo = true;
    api.post('/nfe/email/previa', { ids, destino }).then((r) => {
      if (!vivo) return; setPrev(r);
      const n = r.notas[0];
      if (r.notas.length === 1) setAj({ assunto: n.assunto, mensagem: n.mensagem });
    }).catch((e) => vivo && setErro(e.message));
    return () => { vivo = false; };
  }, [ids, destino]);

  const todos = (n, c) => [...n[c], ...(n.opcionais?.[c] ?? [])]; // propostos + conhecidos que vêm desmarcados
  const on = (n, c, e) => { const v = marc[`${n.id}|${c}|${e}`]; return v === undefined ? !(n.opcionais?.[c] ?? []).includes(e) : v; };
  const tog = (n, c, e) => setMarc((m) => ({ ...m, [`${n.id}|${c}|${e}`]: !on(n, c, e) }));
  const maisEmails = unica ? extra.split(/[;,\s]+/).filter((x) => x.includes('@')) : [];
  const escolhidos = (n) => ({ para: [...todos(n, 'para').filter((e) => on(n, 'para', e)), ...maisEmails], cc: todos(n, 'cc').filter((e) => on(n, 'cc', e)), cco: todos(n, 'cco').filter((e) => on(n, 'cco', e)) });
  const prontasLista = prev?.notas.filter((n) => n.pode && escolhidos(n).para.length > 0) ?? [];
  const prontas = prontasLista.length;
  const enviar = async () => {
    setEnv(true); setErro('');
    try {
      const corpo = { ids: prontasLista.map((n) => n.id), destino };
      if (unica) { const e = escolhidos(prev.notas[0]); corpo.ajustes = { ...aj, para: e.para.join(';'), cc: e.cc.join(';'), cco: e.cco.join(';') }; }
      else corpo.selecao = Object.fromEntries(prontasLista.map((n) => [n.id, escolhidos(n)]));
      const r = await api.post('/nfe/email', corpo);
      setRes(r); onEnviado?.(r);
    } catch (e) { setErro(e.message); } finally { setEnv(false); }
  };
  /** Todos os e-mails que vão receber, cada um com seu checkbox (Para / Cópia / Cópia oculta). */
  const Destinos = ({ n }) => (
    <div className="em-dest">
      {[['para', 'Para'], ['cc', 'Cópia (Cc)'], ['cco', 'Cópia oculta (Cco)']].map(([c, rot]) => todos(n, c).length > 0 && (
        <div key={c} className="em-dest-g"><b>{rot}</b>
          {todos(n, c).map((e) => <label key={e} className="em-dest-i"><input type="checkbox" checked={on(n, c, e)} onChange={() => tog(n, c, e)} />{e}{(n.opcionais?.[c] ?? []).includes(e) ? <small> (contabilidade)</small> : null}</label>)}
        </div>))}
    </div>
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
            <p className="em-sub">Marque quem deve receber:</p>
            <Destinos n={n} />
            {!todos(n, 'para').length && !todos(n, 'cc').length && !todos(n, 'cco').length && <p className="em-aviso">Nenhum e-mail cadastrado — informe abaixo.</p>}
            <label className="ee-mail-c"><span>Outros e-mails</span><input value={extra} placeholder="adicionar e-mails separados por ;" onChange={(e) => setExtra(e.target.value)} /></label>
            <label className="ee-mail-c"><span>Assunto</span><input value={aj.assunto} onChange={(e) => setAj((x) => ({ ...x, assunto: e.target.value }))} /></label>
            <label className="em-msg"><span>Mensagem</span><textarea rows={8} value={aj.mensagem} onChange={(e) => setAj((x) => ({ ...x, mensagem: e.target.value }))} /></label>
          </>);
        })()}
        {prev && !res && !unica && (<>
          <p className="em-sub"><b>{prontas}</b> de {prev.notas.length} nota(s) prontas para envio · anexos: XML + DANFE (PDF) de cada nota</p>
          <div className="em-grade"><table>
            <thead><tr><th>NFe</th><th>Cliente</th><th>Valor</th><th>Destinatários</th></tr></thead>
            <tbody>{prev.notas.map((n) => (
              <tr key={n.id} className={n.pode && escolhidos(n).para.length ? '' : 'em-x'}>
                <td>{n.numero || n.id}</td><td>{n.cliente}</td><td className="num">{REAL(n.valor)}</td>
                <td>{n.pode ? <Destinos n={n} /> : <span className="em-aviso">{n.avisos[0]}</span>}</td>
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
