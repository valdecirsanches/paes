import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Modal } from './ui.jsx';

/** Abre um arquivo do servidor (PDF/XML/JSON) numa aba, mostrando o erro da API em vez de uma página em branco. */
export async function abrirArquivo(url, aba = window.open('', '_blank')) {
  try {
    const r = await fetch(url);
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.message || `HTTP ${r.status}`); }
    const u = URL.createObjectURL(await r.blob());
    if (aba) aba.location.href = u; else window.open(u, '_blank');
  } catch (e) { aba?.close(); throw e; }
}

const ABAS = [
  ['cancelar', '✖', 'Cancelar', 'Cancela a nota na SEFAZ'],
  ['carta', '✎', 'Carta de correção', 'CC-e (até 20 por nota)'],
  ['devolucao', '↩', 'Devolução', 'Nota de entrada e estoque'],
  ['inutilizar', '∅', 'Inutilizar', 'Números não usados'],
  ['consultas', '🔍', 'Consultas', 'Serviço, número e chave'],
  ['numeracao', '#', 'Numeração', 'Séries e próximo número'],
  ['arquivos', '📄', 'Arquivos', 'PDF e XML dos eventos'],
];
const dh = (v) => String(v ?? '').replace('T', ' ').slice(0, 19);

const TIPO_EVENTO = [[/AUTORIZ/i, 'aut', 'Autorização'], [/CANCEL/i, 'can', 'Cancelamento'], [/CARTA/i, 'cce', 'Carta de correção'], [/REJEI|DENEGA|ERRO/i, 'rej', null], [/INUTIL/i, 'inu', 'Inutilização'], [/DEVOL/i, 'dev', null], [/EMAIL|E-MAIL/i, 'eml', 'E-mail enviado']];
/** Arquivo que a API guarda para o evento (rota /api/nfe/:id/arquivo/…), quando existe. */
function urlArquivo(e, nota) {
  if (/AUTORIZ/i.test(e.nome_evento)) return `/api/nfe/${nota.id}/xml`;
  if (e.arquivo) return `/api/nfe/${nota.id}/arquivo/${e.arquivo.nome}${e.arquivo.seq ? `?seq=${e.arquivo.seq}` : ''}`;
  return null;
}
/** Eventos da nota (autorização, cancelamento, CC-e, rejeições…): cada dado da resposta da API na sua coluna. */
export function EventosTabela({ eventos, nota, onArquivo }) {
  return (
    <table className="grade nfe-ev">
      <thead><tr><th>Data</th><th>Evento</th><th>Situação</th><th>Código</th><th>Protocolo</th><th>Resposta / motivo</th><th>Observação</th><th>Arquivo</th></tr></thead>
      <tbody>
        {eventos.map((e) => {
          const tipo = TIPO_EVENTO.find(([re]) => re.test(e.nome_evento));
          const url = nota ? urlArquivo(e, nota) : null;
          const ok = e.homologado === true || (e.homologado == null && /AUTORIZ|INUTIL|DEVOL/i.test(e.nome_evento) && !/REJEI|ERRO|DENEGA/i.test(e.nome_evento));
          const ruim = e.homologado === false || /REJEI|DENEGA|ERRO/i.test(e.nome_evento);
          return (
            <tr key={e.id}>
              <td className="nowrap">{dh(e.data_evento)}</td>
              <td><span className={`ev-tag ${tipo?.[1] ?? ''}`}>{tipo?.[2] ?? e.nome_evento}{e.sequencia ? ` nº ${e.sequencia}` : ''}</span></td>
              <td>{ruim ? <span className="ev-st ruim">✖ Recusado</span> : ok ? <span className="ev-st ok">✔ Registrado</span> : <span className="ev-st">—</span>}</td>
              <td className="n">{e.codigo_status ?? ''}</td>
              <td className="nowrap">{e.protocolo ?? ''}</td>
              <td>{e.resposta}</td>
              <td>{e.obs}</td>
              <td>{url ? <button type="button" className="fs-link" onClick={() => onArquivo(url)}>📄 Abrir</button> : ''}</td>
            </tr>
          );
        })}
        {eventos.length === 0 && <tr className="semlinha"><td colSpan={8} className="vazio">&lt;Sem eventos&gt;</td></tr>}
      </tbody>
    </table>
  );
}

function Contador({ valor, min, max }) {
  const n = String(valor).trim().length;
  return <small className={`fs-cont${n < min ? ' baixo' : ''}`}>{n}/{max}{n < min ? ` · faltam ${min - n}` : ''}</small>;
}
function Json({ dados }) {
  return dados == null ? null : <pre className="fs-json">{typeof dados === 'string' ? dados : JSON.stringify(dados, null, 2)}</pre>;
}

/** Painel moderno dos eventos fiscais da NF-e (cancelamento, CC-e, devolução, inutilização, consultas, numeração, arquivos). */
export default function NfeFiscal({ nota, eventos = [], aba: abaInicial = 'cancelar', ambiente, onFechar, onMudou, onAjustou, notificar, setLog }) {
  const [aba, setAba] = useState(abaInicial);
  const [ocupado, setOcupado] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [erro, setErro] = useState('');
  useEffect(() => { api.get('/auth/me').then((u) => setAdmin(Boolean(u.admin))).catch(() => {}); }, []);

  const executa = useCallback(async (fn) => {
    setOcupado(true); setErro('');
    try { return await fn(); } catch (e) { setErro(e.message); setLog?.([e.message]); return null; } finally { setOcupado(false); }
  }, [setLog]);
  const sucesso = (m, id) => { notificar('ok', m); setLog?.([m]); onMudou?.(id); };

  const autorizada = nota?.status_e === 'AUTORIZADA';
  const temNumero = Boolean(nota?.nfe_numero);
  const prod = Number(ambiente) === 1;

  return (
    <Modal titulo={`Eventos fiscais${nota?.nfe_numero ? ` · NFe ${nota.nfe_numero}` : ''}`} onFechar={onFechar} largo>
      <div className="fs">
        <nav className="fs-nav" role="tablist" aria-label="Eventos fiscais">
          {ABAS.map(([k, ic, nome, sub]) => (
            <button key={k} type="button" role="tab" aria-selected={aba === k} className={aba === k ? 'on' : ''} onClick={() => { setAba(k); setErro(''); }}>
              <i aria-hidden="true">{ic}</i><span><b>{nome}</b><small>{sub}</small></span>
            </button>
          ))}
        </nav>
        <section className="fs-corpo">
          <div className="fs-ambiente"><span className={prod ? 'prod' : 'homol'}>{prod ? 'PRODUÇÃO — vale perante a SEFAZ' : 'HOMOLOGAÇÃO — sem valor fiscal'}</span>
            {nota && <span className="fs-nota">{nota.cliente_razao_social || nota.cliente_pedido || 'Nota'} · <em>{nota.status_e}</em></span>}</div>
          {erro && <div className="fs-erro" role="alert">{erro}</div>}
          {aba === 'cancelar' && <Cancelar {...{ nota, autorizada, temNumero, prod, ocupado, executa, sucesso }} />}
          {aba === 'carta' && <Carta {...{ nota, eventos, autorizada, temNumero, ocupado, executa, sucesso }} />}
          {aba === 'devolucao' && <Devolucao {...{ nota, autorizada, admin, ocupado, executa, sucesso, onFechar }} />}
          {aba === 'inutilizar' && <Inutilizar {...{ prod, ocupado, executa, sucesso }} />}
          {aba === 'consultas' && <Consultas {...{ nota, ocupado, executa, onAjustou }} />}
          {aba === 'numeracao' && <Numeracao {...{ ocupado, executa, sucesso, notificar }} />}
          {aba === 'arquivos' && <Arquivos {...{ nota, eventos, temNumero, executa }} />}
        </section>
      </div>
    </Modal>
  );
}

function Cancelar({ nota, autorizada, temNumero, prod, ocupado, executa, sucesso }) {
  const [just, setJust] = useState('');
  const [conf, setConf] = useState(false);
  const ok = autorizada && temNumero && just.trim().length >= 15 && just.length <= 255 && (!prod || conf);
  return (
    <div className="fs-painel">
      <h3>Cancelamento de NF-e</h3>
      <p className="fs-ajuda">Evento 110111 enviado à SEFAZ. Prazo normal de 24h após a autorização (a SEFAZ pode recusar fora dele). Ao cancelar, as comandas da nota são liberadas e as duplicatas removidas. Repetir o pedido é seguro: a API é idempotente.</p>
      {!autorizada && <div className="fs-aviso">Só nota <b>AUTORIZADA</b> pode ser cancelada{nota ? ` (esta está ${nota.status_e})` : ''}.</div>}
      <dl className="fs-chave"><dt>Chave</dt><dd>{nota?.nfe_chave || '—'}</dd></dl>
      <label className="campo"><span>Justificativa (15 a 255 caracteres)</span>
        <textarea rows={4} maxLength={255} value={just} onChange={(e) => setJust(e.target.value)} placeholder="Ex.: Pedido em duplicidade, cliente não recebeu a mercadoria." disabled={!autorizada} />
        <Contador valor={just} min={15} max={255} /></label>
      {prod && <label className="check fs-conf"><input type="checkbox" checked={conf} onChange={(e) => setConf(e.target.checked)} />Estou ciente de que é <b>produção</b> e o cancelamento não pode ser desfeito.</label>}
      <div className="fs-rodape"><button type="button" className="bt perigo" disabled={!ok || ocupado} onClick={() => executa(async () => {
        const r = await api.post(`/nfe/${nota.id}/cancelar`, { justificativa: just.trim() }); sucesso(r.mensagem + (r.protocolo ? ` Protocolo ${r.protocolo}.` : '')); setJust(''); setConf(false);
      })}>{ocupado ? 'Enviando…' : 'Cancelar NF-e'}</button></div>
    </div>
  );
}

function Carta({ nota, eventos, autorizada, temNumero, ocupado, executa, sucesso }) {
  const ccs = useMemo(() => eventos.filter((e) => /CARTA/i.test(e.nome_evento)), [eventos]);
  const ultima = ccs.at(-1);
  const [txt, setTxt] = useState(ultima?.obs ?? '');
  const seq = Math.max(ccs.length, ...ccs.map((e) => Number(e.sequencia) || 0)) + 1; // a sequência é a que a API devolveu (sequenciaEvento), não a contagem de linhas
  const ok = autorizada && temNumero && txt.trim().length >= 15 && txt.length <= 1000 && seq <= 20;
  return (
    <div className="fs-painel">
      <h3>Carta de correção (CC-e)</h3>
      <p className="fs-ajuda">A SEFAZ mantém só a <b>última</b> carta: o texto enviado substitui o das anteriores, então ele deve conter <b>todas</b> as correções consolidadas. Não corrige valores, base de cálculo, destinatário nem data. A sequência é automática (máx. 20).</p>
      {!autorizada && <div className="fs-aviso">Só nota <b>AUTORIZADA</b> aceita carta de correção.</div>}
      <div className="fs-seq">Próxima: <b>sequência {seq}</b> de 20 {ultima && <button type="button" className="fs-link" onClick={() => setTxt(ultima.obs ?? '')}>recarregar texto anterior</button>}</div>
      <label className="campo"><span>Texto consolidado (15 a 1000 caracteres)</span>
        <textarea rows={7} maxLength={1000} value={txt} onChange={(e) => setTxt(e.target.value)} disabled={!autorizada} />
        <Contador valor={txt} min={15} max={1000} /></label>
      <div className="fs-rodape"><button type="button" className="bt" disabled={!ok || ocupado} onClick={() => executa(async () => {
        const r = await api.post(`/nfe/${nota.id}/carta-correcao`, { correcao: txt.trim() }); sucesso(r.mensagem);
      })}>{ocupado ? 'Enviando…' : `Enviar carta (seq. ${seq})`}</button></div>
      {ccs.length > 0 && <ul className="fs-hist">{ccs.slice().reverse().map((e, i) => <li key={e.id}><b>Seq. {e.sequencia ?? ccs.length - i}</b>{e.protocolo && <small> · protocolo {e.protocolo}</small>} <small>{dh(e.data_evento)}</small><p>{e.obs}</p></li>)}</ul>}
    </div>
  );
}

function Devolucao({ nota, autorizada, admin, ocupado, executa, sucesso, onFechar }) {
  const [c1, setC1] = useState(false); const [c2, setC2] = useState(false);
  const devolvida = nota?.status_e === 'DEVOLVIDO';
  return (
    <div className="fs-painel">
      <h3>Devolução e estoque</h3>
      <div className="fs-duo">
        <div className="fs-cartao">
          <h4>↩ Gerar NF-e de devolução total</h4>
          <p className="fs-ajuda">Cria uma nota de <b>entrada</b> PENDENTE copiando destinatário e itens (CFOP 1202, CSOSN 900, pagamento 90; IPI 03, PIS/COFINS 98), com a chave da nota original em NFe Referência e o texto “Entrada por devolução total…”. A original passa a <b>DEVOLVIDO</b> e as comandas são liberadas. Depois é só conferir e autorizar.</p>
          {devolvida && <div className="fs-aviso">Esta nota já foi devolvida.</div>}
          {!autorizada && !devolvida && <div className="fs-aviso">Só nota <b>AUTORIZADA</b> pode ser devolvida.</div>}
          {!c1 ? <button type="button" className="bt" disabled={!autorizada || ocupado} onClick={() => setC1(true)}>Gerar devolução…</button>
            : <div className="fs-sim"><span>Confirma gerar a nota de devolução da NFe {nota.nfe_numero}?</span>
              <button type="button" className="bt" disabled={ocupado} onClick={() => executa(async () => { const r = await api.post(`/nfe/${nota.id}/devolucao`); sucesso(r.mensagem, r.id); onFechar(); })}>Sim, gerar</button>
              <button type="button" className="bt" onClick={() => setC1(false)}>Não</button></div>}
        </div>
        <div className="fs-cartao">
          <h4>📦 Devolver ao estoque</h4>
          <p className="fs-ajuda">Libera as comandas desta nota (status PROCESSADO, sem vínculo com NF-e) para serem faturadas de novo. {admin ? '' : <b>Somente o administrador pode executar.</b>}</p>
          {!c2 ? <button type="button" className="bt" disabled={!nota || !admin || ocupado} onClick={() => setC2(true)}>Devolver ao estoque…</button>
            : <div className="fs-sim"><span>Liberar as comandas da nota?</span>
              <button type="button" className="bt" disabled={ocupado} onClick={() => executa(async () => { const r = await api.post(`/nfe/${nota.id}/devolve-estoque`); sucesso(`${r.comandas} comanda(s) liberada(s).`); setC2(false); })}>Sim</button>
              <button type="button" className="bt" onClick={() => setC2(false)}>Não</button></div>}
        </div>
      </div>
    </div>
  );
}

function Inutilizar({ prod, ocupado, executa, sucesso }) {
  const [f, setF] = useState({ ano: String(new Date().getFullYear()), modelo: '55', serie: '1', ini: '', fim: '', just: '' });
  const [lista, setLista] = useState(null);
  const [conf, setConf] = useState(false);
  const carrega = useCallback(() => executa(async () => setLista(await api.get('/nfe/inutilizacoes'))), [executa]);
  useEffect(() => { carrega(); }, [carrega]);
  const ini = Number(f.ini); const fim = Number(f.fim || f.ini);
  const faixaOk = Number.isInteger(ini) && ini > 0 && Number.isInteger(fim) && fim >= ini && fim - ini <= 49;
  const ok = faixaOk && f.just.trim().length >= 15 && (!prod || conf);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="fs-painel">
      <h3>Inutilização de numeração</h3>
      <p className="fs-ajuda">Declara à SEFAZ que uma faixa de números não será usada (pulos de numeração). A API recusa se a faixa tiver nota autorizada ou cancelada; repetir a mesma faixa é seguro. Máximo de 50 números por pedido.</p>
      <div className="fs-grade">
        <label className="campo"><span>Ano</span><input type="number" value={f.ano} onChange={set('ano')} /></label>
        <label className="campo"><span>Modelo</span><input type="number" value={f.modelo} onChange={set('modelo')} /></label>
        <label className="campo"><span>Série</span><input type="number" value={f.serie} onChange={set('serie')} /></label>
        <label className="campo"><span>Número inicial</span><input type="number" value={f.ini} onChange={set('ini')} /></label>
        <label className="campo"><span>Número final</span><input type="number" value={f.fim} onChange={set('fim')} placeholder={f.ini || ''} /></label>
      </div>
      {f.ini && !faixaOk && <div className="fs-aviso">Faixa inválida (final ≥ inicial, no máximo 50 números).</div>}
      <label className="campo"><span>Justificativa (15 a 255 caracteres)</span><textarea rows={3} maxLength={255} value={f.just} onChange={set('just')} /><Contador valor={f.just} min={15} max={255} /></label>
      {prod && <label className="check fs-conf"><input type="checkbox" checked={conf} onChange={(e) => setConf(e.target.checked)} />Estou ciente de que é <b>produção</b>.</label>}
      <div className="fs-rodape"><button type="button" className="bt perigo" disabled={!ok || ocupado} onClick={() => executa(async () => {
        const r = await api.post('/nfe/inutilizar', { ano: f.ano, modelo: f.modelo, serie: f.serie, numero_inicial: f.ini, numero_final: f.fim || f.ini, justificativa: f.just.trim() });
        sucesso(r.mensagem); setF({ ...f, ini: '', fim: '', just: '' }); setConf(false); carrega();
      })}>Inutilizar {faixaOk ? (fim === ini ? `nº ${ini}` : `${ini} a ${fim}`) : ''}</button></div>
      <h4>Histórico na API</h4>
      {lista == null ? <p className="fs-ajuda">Carregando…</p> : lista.length === 0 ? <p className="fs-ajuda">Nenhuma inutilização registrada.</p> : (
        <table className="trb2-tab"><thead><tr><th>Quando</th><th>Série</th><th>Faixa</th><th>Protocolo</th><th>Situação</th></tr></thead><tbody>
          {lista.map((x, i) => <tr key={x.id ?? i}><td>{dh(x.dataRegistro ?? x.criadoEm ?? x.dataHora ?? x.data)}</td><td>{x.serie}</td><td>{x.numeroInicial}{x.numeroFinal !== x.numeroInicial ? ` – ${x.numeroFinal}` : ''}</td><td>{x.protocolo ?? '—'}</td><td>{x.homologado === false ? `Rejeitada${x.codigoStatus ? ` (${x.codigoStatus})` : ''}` : `Homologada${x.codigoStatus ? ` (${x.codigoStatus})` : ''}`}{x.motivo ? <small> — {x.motivo}</small> : ''}</td></tr>)}
        </tbody></table>)}
    </div>
  );
}

function Consultas({ nota, ocupado, executa, onAjustou }) {
  const [svc, setSvc] = useState(null);
  const [num, setNum] = useState({ numero: nota?.nfe_numero ? String(nota.nfe_numero) : '', serie: String(Number(nota?.nfe_serie) || 1) });
  const [rNum, setRNum] = useState(null);
  const [chave, setChave] = useState(nota?.nfe_chave ?? '');
  const [rChave, setRChave] = useState(null);
  const sit = rNum?.resposta;
  return (
    <div className="fs-painel">
      <h3>Consultas à SEFAZ / API</h3>
      <div className="fs-cartao">
        <h4>🏛 Status do serviço (Receita Federal)</h4>
        <button type="button" className="bt" disabled={ocupado} onClick={() => executa(async () => setSvc(await api.post('/nfe/status-servico')))}>Consultar agora</button>
        {svc && <p className={`fs-res ${svc.http === 200 && /107/.test(JSON.stringify(svc.resposta)) ? 'ok' : 'ruim'}`}>{svc.resposta?.xMotivo || svc.resposta?.motivo || `HTTP ${svc.http}`} <small>(cStat {svc.resposta?.cStat ?? svc.resposta?.codigoStatus ?? '—'})</small></p>}
      </div>
      <div className="fs-cartao">
        <h4>🔢 Situação por número</h4>
        <div className="fs-linha">
          <label className="campo"><span>Número</span><input type="number" value={num.numero} onChange={(e) => setNum({ ...num, numero: e.target.value })} /></label>
          <label className="campo"><span>Série</span><input type="number" value={num.serie} onChange={(e) => setNum({ ...num, serie: e.target.value })} /></label>
          <button type="button" className="bt" disabled={!num.numero || ocupado} onClick={() => executa(async () => { const r = await api.get(`/nfe/consultar-numero?numero=${num.numero}&serie=${num.serie}`); setRNum(r); if (r.ajuste?.id) onAjustou?.(r.ajuste.id); })}>Consultar</button>
        </div>
        {sit && (sit.existe === false
          ? <p className="fs-res ruim">A API não tem a nota {num.numero}/{num.serie}. {sit.podeEmitir ? 'O número está livre para emitir.' : ''}</p>
          : <p className={`fs-res ${['Autorizado'].includes(sit.status) ? 'ok' : 'ruim'}`}>Status na API: <b>{sit.status}</b>{sit.podeEmitir === false ? ' · não pode reemitir este número' : ''}</p>)}
        {rNum?.ajuste && <p className={`fs-res ${rNum.ajuste.erro || !rNum.ajuste.achou ? 'ruim' : 'ok'}`}>{rNum.ajuste.erro ? `Não consegui ajustar a nota: ${rNum.ajuste.erro}` : rNum.ajuste.achou ? `Nota ${rNum.ajuste.numero} do app ajustada: ${rNum.ajuste.statusLocal}, com XML e DANFE da API.` : `Nenhuma nota do app tem o número ${rNum.ajuste.numero ?? ''} (série ${rNum.ajuste.serie ?? ''}) nem esta chave: nada a ajustar. Se ela foi emitida por outro sistema, o app não a cadastra.`}</p>}
        {rNum?.arquivos && !rNum.ajuste && <p className={`fs-res ${rNum.arquivos.xml === 'ok' && rNum.arquivos.pdf === 'ok' ? 'ok' : 'ruim'}`}>XML e DANFE da API: XML {rNum.arquivos.xml ?? rNum.arquivos.erro}, DANFE {rNum.arquivos.pdf ?? '—'} (guardados na nota).</p>}
        {sit && <details><summary>Resposta completa</summary><Json dados={sit} /></details>}
      </div>
      <div className="fs-cartao">
        <h4>🔑 Consulta de protocolo pela chave</h4>
        <div className="fs-linha">
          <label className="campo fs-larga"><span>Chave de acesso (44 dígitos)</span><input value={chave} onChange={(e) => setChave(e.target.value)} maxLength={54} /></label>
          <button type="button" className="bt" disabled={chave.replace(/\D/g, '').length !== 44 || ocupado} onClick={() => executa(async () => { const r = await api.post('/nfe/consultar-chave', { chave }); setRChave(r); if (r.ajuste?.id) onAjustou?.(r.ajuste.id); })}>Consultar</button>
        </div>
        {rChave?.ajuste && <p className={`fs-res ${rChave.ajuste.erro || !rChave.ajuste.achou ? 'ruim' : 'ok'}`}>{rChave.ajuste.erro ? `Não consegui ajustar a nota: ${rChave.ajuste.erro}` : rChave.ajuste.achou ? `Nota ${rChave.ajuste.numero} do app ajustada: ${rChave.ajuste.statusLocal}, com XML e DANFE da API.` : `Nenhuma nota do app tem o número ${rChave.ajuste.numero ?? ''} (série ${rChave.ajuste.serie ?? ''}) nem esta chave: nada a ajustar. Se ela foi emitida por outro sistema, o app não a cadastra.`}</p>}
        {rChave?.arquivos && !rChave.ajuste && <p className={`fs-res ${rChave.arquivos.xml === 'ok' && rChave.arquivos.pdf === 'ok' ? 'ok' : 'ruim'}`}>XML e DANFE da API: XML {rChave.arquivos.xml ?? rChave.arquivos.erro}, DANFE {rChave.arquivos.pdf ?? '—'} (guardados na nota).</p>}
        {rChave && <><p className={`fs-res ${rChave.http === 200 ? 'ok' : 'ruim'}`}>{rChave.resposta?.xMotivo || rChave.resposta?.motivoRetorno || rChave.resposta?.motivo || `HTTP ${rChave.http}`}</p><details open><summary>Resposta completa</summary><Json dados={rChave.resposta} /></details></>}
      </div>
    </div>
  );
}

function Numeracao({ ocupado, executa, sucesso }) {
  const [d, setD] = useState(null);
  const [f, setF] = useState({ serie: '1', proximo: '' });
  const [conf, setConf] = useState(false);
  const carrega = useCallback(() => executa(async () => {
    const r = await api.get('/nfe/series'); setD(r);
    const s1 = r.series.find((x) => Number(x.serie) === 1);
    setF((a) => ({ ...a, proximo: a.proximo || String(s1?.proximoNumero ?? r.localNumero + 1) }));
  }), [executa]);
  useEffect(() => { carrega(); }, [carrega]);
  const ok = Number(f.proximo) > 0 && Number(f.serie) > 0 && conf;
  return (
    <div className="fs-painel">
      <h3>Numeração das séries</h3>
      <p className="fs-ajuda">Quem controla o próximo número é a API. Use <b>inicializar</b> ao migrar de sistema ou para realinhar quando o número local e o da API divergirem. Nunca volte a numeração para um número já usado.</p>
      {d && <>
        <div className="fs-comp"><span>Último emitido (local): <b>{d.localNumero}</b></span><span>Próximo local: <b>{d.localNumero + 1}</b></span>
          {d.series.filter((s) => Number(s.serie) === 1).map((s) => <span key="s1" className={Number(s.proximoNumero) === d.localNumero + 1 ? 'ok' : 'ruim'}>Próximo na API (série 1): <b>{s.proximoNumero}</b>{Number(s.proximoNumero) === d.localNumero + 1 ? ' ✔ alinhado' : ' ⚠ divergente'}</span>)}</div>
        <table className="trb2-tab"><thead><tr><th>Modelo</th><th>Série</th><th>Ambiente</th><th>Próximo número</th></tr></thead><tbody>
          {d.series.map((s, i) => <tr key={i} onClick={() => setF({ serie: String(s.serie), proximo: String(s.proximoNumero) })}><td>{s.modelo}</td><td>{s.serie}</td><td>{Number(s.ambiente) === 1 ? 'Produção' : 'Homologação'}</td><td>{s.proximoNumero}</td></tr>)}
          {d.series.length === 0 && <tr><td colSpan={4} className="vazio">Nenhuma série cadastrada na API (será criada ao inicializar).</td></tr>}
        </tbody></table></>}
      <div className="fs-linha">
        <label className="campo"><span>Série</span><input type="number" value={f.serie} onChange={(e) => setF({ ...f, serie: e.target.value })} /></label>
        <label className="campo"><span>Próximo número</span><input type="number" value={f.proximo} onChange={(e) => setF({ ...f, proximo: e.target.value })} /></label>
      </div>
      <label className="check fs-conf"><input type="checkbox" checked={conf} onChange={(e) => setConf(e.target.checked)} />Confirmo que o número informado nunca foi usado neste ambiente.</label>
      <div className="fs-rodape"><button type="button" className="bt" disabled={!ok || ocupado} onClick={() => executa(async () => {
        const r = await api.put('/nfe/series', { modelo: 55, serie: Number(f.serie), proximoNumero: Number(f.proximo) }); sucesso(`Próximo número da série ${f.serie}: ${r.proximoNumero}.`); setConf(false); carrega();
      })}>Inicializar numeração</button></div>
    </div>
  );
}

function Arquivos({ nota, eventos, temNumero, executa }) {
  const abre = (nome, q = '') => executa(() => abrirArquivo(`/api/nfe/${nota.id}/arquivo/${nome}${q}`));
  const ccs = eventos.filter((e) => /CARTA/i.test(e.nome_evento));
  const cancelada = nota?.status_e === 'CANCELADA';
  const dis = !temNumero;
  return (
    <div className="fs-painel">
      <h3>Arquivos e retornos</h3>
      <p className="fs-ajuda">Documentos gerados pela API para esta nota. Os PDFs/XMLs de evento só existem depois de o evento ser registrado.</p>
      <div className="fs-arq">
        <button type="button" className="bt" disabled={!nota || nota.status_e === 'PENDENTE'} onClick={() => executa(() => abrirArquivo(`/api/nfe/${nota.id}/danfe`))}>🖨 DANFE</button>
        <button type="button" className="bt" disabled={!nota || nota.status_e === 'PENDENTE'} onClick={() => executa(() => abrirArquivo(`/api/nfe/${nota.id}/xml`))}>📄 XML autorizado</button>
        <button type="button" className="bt" disabled={dis || !cancelada} onClick={() => abre('cancelamento.pdf')}>✖ PDF do cancelamento</button>
        <button type="button" className="bt" disabled={dis || !cancelada} onClick={() => abre('danfe-cancelamento.pdf')}>🖨 DANFE cancelada</button>
        <button type="button" className="bt" disabled={dis || !cancelada} onClick={() => abre('cancelamento.xml')}>📄 XML do cancelamento</button>
        <button type="button" className="bt" disabled={dis} onClick={() => abre('retorno-sefaz')}>📡 Retorno bruto da SEFAZ</button>
      </div>
      <h4>Cartas de correção</h4>
      {ccs.length === 0 ? <p className="fs-ajuda">Nenhuma carta enviada.</p> : <div className="fs-arq">{ccs.map((e, i) => { const n = e.sequencia ?? i + 1; return <button key={e.id} type="button" className="bt" onClick={() => abre('carta-correcao.xml', `?seq=${n}`)}>📄 XML da CC-e {n}</button>; })}</div>}
      <h4>Eventos registrados</h4>
      <EventosTabela eventos={eventos} nota={nota} onArquivo={(url) => executa(() => abrirArquivo(url))} />
    </div>
  );
}
