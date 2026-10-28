import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Modal } from '../components/ui.jsx';
import EnvioEmail from '../components/EnvioEmail.jsx';
import NcmCampo from '../components/NcmCampo.jsx';
import NfeFiscal, { EventosTabela, abrirArquivo } from '../components/NfeFiscal.jsx';
import { brData, hoje } from '../lib/rules.js';
import { useJanela } from '../components/janela.js';
import { CORPO_LINHAS, GRADE_COLS, ITEM_COLS, REF_LINHAS, alternaPeriodo, corLinha, fmtBr, parseBr, temMarca } from '../lib/nfeCampos.js';
import { Confirma, Toast, confirmar, copiaTexto, entrada } from '../components/toast.jsx';

// Configurações do emitente (tb_nfe_config)
const CFG_TABS = [
  ['🏢 Empresa', [['razao', 'Razão social', 2], ['fantasia', 'Nome fantasia', 2], ['cnpj', 'CNPJ'], ['ie', 'Inscrição estadual'], ['im', 'Inscrição municipal'], ['cnae', 'CNAE'], ['endereco', 'Endereço', 3], ['endereco_numero', 'Nº'], ['endereco_complemento', 'Complemento', 2], ['bairro', 'Bairro', 2], ['cidade', 'Cidade'], ['cep', 'CEP'], ['uf', 'UF'], ['ddd', 'DDD'], ['fones', 'Fone'], ['faxddd', 'DDD (fax)'], ['fax', 'Fax'], ['site', 'Home page', 2], ['email', 'E-mail', 2]]],
  ['🧾 Tributação', [['nfe_crt', 'Regime tributário (CRT)', 2, ['', 'SIMPLES NACIONAL', 'SIMPLES EXCESSO RECEITA', 'REGIME NORMAL']], ['csosn', 'CSOSN'], ['cst_pis_cofins', 'CST PIS/COFINS'], ['aliquota_iss', '% ISS'], ['ws_ibpt', 'WebService para busca do IBPT', 3]]],
  ['📄 NF-e', [['nfe_numero', 'Última NF-e emitida', 1, 'num'], ['nfe_carta_correcao_seq', 'Última carta de correção', 1, 'num'], ['veiculo_placa', 'Veículo - placa'], ['veiculo_uf', 'UF da placa']]],
  ['✉ E-mail', [['email_servidor', 'Servidor SMTP', 2], ['email_porta', 'Porta'], ['email_codificacao', 'Codificação'], ['email_usuario', 'Usuário', 2], ['email_senha', 'Senha (em branco = manter)', 2, 'senha'], ['email_titulo', 'Título', 2], ['email_confirmacao', 'Confirmação de leitura (Replay)', 2], ['email_cc', 'CC', 2], ['email_cco', 'CCO', 2], ['nfe_email_contabilidade', 'E-mail da contabilidade', 2]]],
  ['🔐 Certificado', [['nfe_certificado_vencimento', 'Vencimento do certificado (o sistema avisa 30 dias antes)', 2, 'date']]],
];
const CFG_NFE = 2, CFG_CERT = 4; // posições das abas com blocos próprios (ambiente/API e certificados)

const LIMITE_LISTA = 1500; // igual ao servidor
const ALT_NOTA = 22; // px — altura fixa das linhas da grade de notas (rolagem virtual)
function celulaGrade(r, [k, , t]) {
  if (t === 'chk') return <input type="checkbox" checked={temMarca(r[k])} readOnly tabIndex={-1} />;
  if (t === 'd') return r[k] ? brData(r[k]) : '';
  if (t === 'm') return fmtBr(r[k], 2);
  return String(r[k] ?? '');
}
/** Linha da grade de notas: memoizada, para que digitar no formulário não redesenhe centenas de linhas. */
const LinhaItem = memo(function LinhaItem({ i, sel, onSel }) {
  return (
    <tr className={`clicavel${sel ? ' sel' : ''}`} onClick={() => onSel(i.id)}>
      <td className="ind">{sel ? '▶' : ''}</td>
      {ITEM_COLS.map(([k, , t]) => <td key={k} className={t ? 'n' : ''}>{t === 'p' ? fmtBr(i[k], 2, 5) : t === 'q' ? fmtBr(i[k], 1, 3) : t === 'v' ? fmtBr(i[k], 5) : String(i[k] ?? '')}</td>)}
    </tr>
  );
});
const LinhaNota = memo(function LinhaNota({ r, i, sel, marc, foco, onClick, onMarcar, onModal, onClonar, onApagar }) {
  return (
    <tr className={`clicavel${foco ? ' foco' : ''}`} style={corLinha(r.status_e, sel) ?? undefined} onClick={(e) => onClick(e, r, i)}>
      <td className="ind">{foco ? '▶' : ''}</td>
      <td className="nf2-chk" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={!!marc} onChange={() => onMarcar(r, i)} aria-label={`Marcar NFe ${r.nfe_numero || r.id}`} title="Marcar para autorizar (qualquer nota, sem ordem)" /></td>
      <td className="nf2-ic"><button type="button" title="Dados do corpo da NFe" onClick={(e) => { e.stopPropagation(); onModal(r, i, 'corpo'); }}>📋</button><button type="button" title="Eventos da NFe" onClick={(e) => { e.stopPropagation(); onModal(r, i, 'eventos'); }}>🗓</button><button type="button" title="Clonar esta NFe (nova nota PENDENTE, sem XML, PDF, chave, protocolo e recibo)" onClick={(e) => { e.stopPropagation(); onClonar(r); }}>⧉</button>{!['AUTORIZADA', 'CANCELADA'].includes(r.status_e) && <button type="button" className="lx" title="Apagar esta NF (só notas não autorizadas)" onClick={(e) => { e.stopPropagation(); onApagar(r); }}>🗑</button>}</td>
      {GRADE_COLS.map((c) => <td key={c[0]} className={c[2] === 'm' ? 'n' : c[2] === 'chk' ? 'c' : ''}>{celulaGrade(r, c)}</td>)}
    </tr>
  );
});

function Entrada({ titulo, campos, onOk, onFechar }) {
  const [v, setV] = useState(() => Object.fromEntries(campos.map((c) => [c.k, c.valor ?? ''])));
  const erro = campos.map((c) => (c.min && String(v[c.k]).trim().length < c.min ? `${c.rotulo}: mínimo de ${c.min} caracteres.` : null)).find(Boolean);
  return (
    <Modal titulo={titulo} onFechar={onFechar}>
      <div className="nfe-entrada">
        {campos.map((c) => (
          <label key={c.k} className="campo"><span>{c.rotulo}</span>
            {c.area ? <textarea rows={4} value={v[c.k]} maxLength={c.max} onChange={(e) => setV({ ...v, [c.k]: e.target.value })} />
              : <input type={c.tipo ?? 'text'} value={v[c.k]} maxLength={c.max} onChange={(e) => setV({ ...v, [c.k]: e.target.value })} />}
            {c.min ? <small>{String(v[c.k]).trim().length}/{c.max}</small> : null}
          </label>
        ))}
        <div className="rodape-modal">
          <button type="button" className="bt" disabled={Boolean(erro)} title={erro ?? ''} onClick={() => { onFechar(); onOk(v); }}>Ok</button>
          <button type="button" className="bt" onClick={onFechar}>Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}


const at = (l, t, w, h) => ({ left: l, top: t, ...(w ? { width: w } : {}), ...(h ? { height: h } : {}) });

/** Campo genérico (texto/data/hora); `ro` = somente leitura */
function Campo({ rotulo, valor, onMudar, tipo, ro }) {
  const v = valor ?? '';
  return (
    <label className="nfe-campo"><span>{rotulo}</span>
      <input type={tipo === 'date' ? 'date' : 'text'} readOnly={ro} value={tipo === 'date' ? String(v).slice(0, 10) : v} onChange={(e) => onMudar?.(e.target.value)} />
    </label>
  );
}

/** cxDBCurrencyEdit: formatado quando fora de foco, texto livre (vírgula decimal) quando em edição. */
const ICONES_CORPO = { Identificação: '🧾', 'Dados do Destinatário': '👤', 'Valores/Pagamento': '💵', Tributos: '🏷️', 'Tributos Substituição': '🔁', 'Frete/Transportadora': '🚚', 'Informações fiscais': '📋', 'Dados complementares': '📝', 'Endereço de entrega': '📍', 'NF-e': '📑', Final: '✅' };
/** Quebra CORPO_LINHAS em seções (cada '#' abre uma; o início é "Identificação"). */
function agrupaCorpo() {
  const gs = [{ titulo: 'Identificação', campos: [] }];
  for (const l of CORPO_LINHAS) {
    if (l[0] === '#') { gs.push({ titulo: l[1], campos: [] }); continue; }
    const g = gs.at(-1);
    if (g.campos.some((c) => c[0] === l[0]) || (l[0] === 'entrega_complemento' && g.titulo === 'Dados do Destinatário')) continue; // o legado repetia campos no mesmo bloco
    g.campos.push(l);
  }
  return gs.filter((g) => g.campos.length).map((g, i) => ({ ...g, id: String(i), icone: ICONES_CORPO[g.titulo] ?? '▫️' }));
}
/** Colunas (de 12) que cada campo ocupa no cartão. */
function larguraCampo(k, r, t) {
  if (t === 'memo' || t === 'memo-ro' || /chave|extenso/i.test(r)) return 12;
  if (/^UF|IBGE|^DDD|^Número$|^Série$|^Modelo$|Placa|^Pessoa$|^Cep$|^ICMS$|Hora/i.test(r)) return 2;
  if (/Razão|Endereço|Descrição|^Nome|Justificativa|Arquivo|Informações|Condição/i.test(r)) return 8;
  return 4;
}
function Num({ valor, onMudar, ro, dec = 2, max, sufixo = '', className = '', style }) {
  const [txt, setTxt] = useState(null);
  const mostrado = txt ?? (valor === null || valor === undefined || valor === '' ? '' : fmtBr(valor, dec, max ?? dec) + sufixo);
  return (
    <input className={`num ${className}`} style={style} readOnly={ro} value={mostrado}
      onFocus={(e) => { if (!ro) { setTxt(valor === null || valor === undefined ? '' : String(valor).replace('.', ',')); setTimeout(() => e.target.select(), 0); } }}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => { if (txt === null) return; const n = parseBr(txt); setTxt(null); if (!Number.isNaN(n) && String(n ?? '') !== String(valor ?? '')) onMudar?.(n); }} />
  );
}

/** Mini cxDBNavigator: [{k, ic, dica, on, off}] */
function Nav({ botoes, info }) {
  return (
    <div className="nfe-nav" role="toolbar">
      {botoes.map((b) => <button key={b.k} type="button" className={b.k === 'post' ? 'gr' : b.k === 'cancel' ? 'cc' : ''} title={b.dica} aria-label={b.dica} disabled={b.off} onClick={b.on}>{b.ic}{b.k === 'post' ? <span> Gravar</span> : b.k === 'cancel' ? <span> Cancelar</span> : null}</button>)}
      {info != null && <span className="info">{info}</span>}
    </div>
  );
}

const UFS = ['', 'RO', 'AC', 'AM', 'RR', 'PA', 'AP', 'TO', 'MA', 'PI', 'CE', 'RN', 'PB', 'PE', 'AL', 'SE', 'BA', 'MG', 'ES', 'RJ', 'SP', 'PR', 'SC', 'RS', 'MS', 'MT', 'GO', 'DF'];
const ST = [['AUTORIZADA', 'Autorizadas'], ['CANCELADA', 'Canceladas'], ['PENDENTE', 'Pendentes'], ['INUTILIZADA', 'Inutilizadas'], ['DEVOLVIDO', 'Devolvidas']];
const ST_INICIAL = { PENDENTE: true, AUTORIZADA: false, CANCELADA: false, INUTILIZADA: false, DEVOLVIDO: false };

export default function NFe({ onFechar }) {
  const [f, setF] = useState({ periodo: false, campo: 'emissao', d1: hoje(), d2: hoje(), cli: false, cliente: '', st: ST_INICIAL, nfe1: '', nfe2: '', ref: '' });
  const [clientes, setClientes] = useState([]);
  const [linhas, setLinhas] = useState(null); // versão leve (colunas da grade)
  const [completa, setCompleta] = useState(null); // nota em foco, completa (GET /nfe/:id)
  const [foco, setFoco] = useState(null);
  const focoRef = useRef(null);
  const recarregaDetalhe = useRef(null); // preenchido adiante (usa o cache de detalhes)
  const [marcados, setMarcados] = useState(new Set());
  const [itens, setItens] = useState([]);
  const [itemSel, setItemSel] = useState(null);
  const [itemTab, setItemTab] = useState('produto');
  const txt1 = (x) => String(x ?? '').trim();
  const [trib, setTrib] = useState(null);
  const [tribDraft, setTribDraft] = useState({});
  const [eventos, setEventos] = useState([]);
  const [dups, setDups] = useState([]);
  const [dupIdx, setDupIdx] = useState(0);
  const [dupDraft, setDupDraft] = useState({});
  const [refs, setRefs] = useState([]);
  const [refIdx, setRefIdx] = useState(0);
  const [refDraft, setRefDraft] = useState({});
  const [comandas, setComandas] = useState([]);
  const [comandaSel, setComandaSel] = useState(null);
  const [comandaItens, setComandaItens] = useState([]);
  const [cfg, setCfg] = useState(null);
  const simplesNota = /simples/i.test(String(cfg?.nfe_crt ?? ''));
  const [cfgDraft, setCfgDraft] = useState({});
  const [draft, setDraft] = useState({});
  const [itemDraft, setItemDraft] = useState({});
  const [aba, setAba] = useState('nfe'); // nfe | cfg | resp
  const [subNfe, setSubNfe] = useState('nfe'); // nfe | comanda | rf
  const [sub, setSub] = useState('itens'); // itens | corpo | ref (seção do corpo)
  const [modalNota, setModalNota] = useState(null); // 'corpo' | 'eventos' (modais abertos pelos ícones da linha)
  const gruposCorpo = useMemo(agrupaCorpo, []);
  const [cfgTab, setCfgTab] = useState(0);
  const [log, setLog] = useState([]);
  const [logAberto, setLogAberto] = useState(false);
  const [maisAberto, setMaisAberto] = useState(false);
  const [resposta, setResposta] = useState('');
  const [impDireta, setImpDireta] = useState(true);
  const [confirmaEmail, setConfirmaEmail] = useState(true);
  const [emailEnvio, setEmailEnvio] = useState(null);
  const [progresso, setProgresso] = useState(4);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [dialogo, setDialogo] = useState(null);
  const [confirma, setConfirma] = useState(null);
  const [altGrade, setAltGrade] = useState(255);
  const [cert, setCert] = useState(null);
  const [certSenha, setCertSenha] = useState('');
  const [certArq, setCertArq] = useState(null); // { nome, base64 }
  const [a3Arq, setA3Arq] = useState(null);
  const [a3Desc, setA3Desc] = useState('');
  const [a3Agente, setA3Agente] = useState('');
  const [a3Id, setA3Id] = useState('');
  const [a3Token, setA3Token] = useState(null); // mostrado uma única vez
  const ancora = useRef(null);

  focoRef.current = foco;
  const nota = useMemo(() => {
    const leve = (linhas ?? []).find((r) => r.id === foco) ?? null;
    return leve && completa?.id === leve.id ? { ...leve, ...completa } : leve;
  }, [linhas, foco, completa]);
  const v = { ...(nota ?? {}), ...draft };
  const pendente = nota?.status_e === 'PENDENTE';
  const sujo = Object.keys(draft).length > 0;
  const notificar = useCallback((tipo, m) => setAviso({ tipo, m }), []);
  useEffect(() => { if (!aviso) return undefined; const t = setTimeout(() => setAviso(null), 6000); return () => clearTimeout(t); }, [aviso]);

  const carregarCfg = useCallback(() => api.get('/nfe/config').then((c) => { setCfg(c); setCfgDraft({}); }).catch((e) => notificar('erro', e.message)), [notificar]);
  useEffect(() => { carregarCfg(); api.get('/nfe/clientes').then(setClientes).catch(() => {}); }, [carregarCfg]);

  // bFiltroClick
  const seqFiltro = useRef(0);
  const filtrar = useCallback(async (manter, fixa) => {
    const q = new URLSearchParams();
    const fx = fixa ?? (manter ? focoRef.current : null);
    if (fx) q.set('fixa', fx);
    q.set('status', Object.entries(f.st).filter(([, on]) => on).map(([k]) => k).join(','));
    if (Number(f.nfe1) > 0) { q.set('nfe1', f.nfe1); if (f.nfe2) q.set('nfe2', f.nfe2); } else {
      if (f.periodo) { q.set('inicio', f.d1); q.set('fim', f.d2); q.set('campo', f.campo); }
      if (f.cli && f.cliente) q.set('cliente', f.cliente);
      if (f.ref) q.set('ref', f.ref);
    }
    const minha = ++seqFiltro.current;
    setOcupado(true);
    try {
      const rows = await api.get(`/nfe?${q}`);
      if (minha !== seqFiltro.current) return; // resposta velha: o filtro já mudou
      if (rows.length >= LIMITE_LISTA) notificar('erro', `Mostrando as ${LIMITE_LISTA} notas mais recentes do filtro. Refine o período para ver as demais.`);
      recarregaDetalhe.current?.(manter || fixa ? (fixa ?? focoRef.current) : null);
      setLinhas(rows); setMarcados(new Set()); setDraft({}); setSubNfe('nfe');
      setFoco((a) => (fixa && rows.some((r) => r.id === fixa) ? fixa : manter && rows.some((r) => r.id === a) ? a : rows.at(-1)?.id ?? null));
    } catch (e) { if (minha === seqFiltro.current) notificar('erro', e.message); } finally { if (minha === seqFiltro.current) setOcupado(false); }
  }, [f, notificar]);
  // O filtro vale a cada alteração (sem botão Filtrar); espera 350 ms de pausa na digitação para não consultar a cada tecla.
  useEffect(() => { const t = setTimeout(() => filtrar(false), 350); return () => clearTimeout(t); }, [filtrar]);
  // outra tela (Faturamento, Comandas) gerou/alterou notas: recarrega a lista mantendo a nota em foco — sem descartar edição em andamento
  const recarga = useRef({});
  recarga.current = { filtrar, sujo: Object.keys(draft).length > 0 };
  useEffect(() => {
    let t;
    const aoAlterar = (ev) => { if (!/^\/(faturamento|comandas)/.test(ev.detail?.path ?? '')) return; /* as alterações feitas aqui mesmo já se atualizam */ clearTimeout(t); t = setTimeout(() => { if (!recarga.current.sujo) recarga.current.filtrar(true); }, 400); };
    window.addEventListener('nfe-alterada', aoAlterar);
    return () => { window.removeEventListener('nfe-alterada', aoAlterar); clearTimeout(t); };
  }, []);

  // Cada recarga individual (após gravar um item, uma duplicata…) continua existindo; a troca de nota usa UMA chamada só (/detalhe).
  const carregarItens = useCallback((idNota, manterSel) => api.get(`/nfe/${idNota}/itens`).then((i) => { setItens(i); setItemSel((a) => (manterSel && i.some((x) => x.id === a) ? a : i[0]?.id ?? null)); }), []);
  const carregarDups = useCallback((idNota) => api.get(`/nfe/${idNota}/duplicatas`).then((d) => { setDups(d); setDupIdx((i) => Math.min(i, Math.max(0, d.length - 1))); setDupDraft({}); }), []);
  const carregarRefs = useCallback((idNota) => api.get(`/nfe/${idNota}/referencias`).then((r) => { setRefs(r); setRefIdx((i) => Math.min(i, Math.max(0, r.length - 1))); setRefDraft({}); }), []);

  // cache por nota (some quando qualquer coisa de NFe/faturamento muda): voltar a uma nota já vista é instantâneo
  const cacheDet = useRef(new Map());
  const preCarregado = useRef({ trib: null, comanda: null }); // o /detalhe já trouxe o tributo e os itens da 1ª comanda
  useEffect(() => { const limpa = () => cacheDet.current.clear(); window.addEventListener('nfe-alterada', limpa); return () => window.removeEventListener('nfe-alterada', limpa); }, []);
  const buscaDetalhe = useCallback(async (id) => {
    const c = cacheDet.current.get(id);
    if (c && Date.now() - c.t < 60000) return c.d;
    const d = await api.get(`/nfe/${id}/detalhe`);
    cacheDet.current.set(id, { t: Date.now(), d });
    if (cacheDet.current.size > 60) cacheDet.current.delete(cacheDet.current.keys().next().value);
    return d;
  }, []);
  const aplicaDetalhe = useCallback((d) => { // tudo de uma vez: um único redesenho
    preCarregado.current = { trib: d.itens[0]?.id_tributo ?? null, comanda: d.comandas[0]?.id ?? null };
    setCompleta(d.nota); setItens(d.itens); setItemSel(d.itens[0]?.id ?? null); setEventos(d.eventos);
    setDups(d.duplicatas); setDupIdx(0); setRefs(d.referencias); setRefIdx(0);
    setComandas(d.comandas); setComandaSel(d.comandas[0]?.id ?? null); setComandaItens(d.comandas_itens); setTrib(d.tributo);
  }, []);

  // depois de autorizar/consultar/reenviar a nota mudou no banco (xml, pdf, chave, protocolo): descarta o cache e relê a nota em foco
  recarregaDetalhe.current = (id) => {
    cacheDet.current.clear();
    if (id) buscaDetalhe(id).then((d) => { if (focoRef.current === id || !focoRef.current) aplicaDetalhe(d); }).catch(() => {});
  };

  // tbnfeAfterScroll: detalhes da nota em foco
  useEffect(() => {
    setDraft({}); setItemDraft({}); setDupDraft({}); setRefDraft({});
    if (!foco) { setItens([]); setEventos([]); setDups([]); setComandas([]); setRefs([]); setItemSel(null); setCompleta(null); return undefined; }
    let cancelado = false; // navegação rápida: espera 120 ms e ignora respostas de notas que já saíram do foco
    const cache = cacheDet.current.get(foco);
    const t = setTimeout(() => {
      buscaDetalhe(foco).then((d) => { if (!cancelado) aplicaDetalhe(d); }).catch((e) => { if (!cancelado) notificar('erro', e.message); });
    }, cache ? 0 : 120);
    return () => { cancelado = true; clearTimeout(t); };
  }, [foco, notificar, buscaDetalhe, aplicaDetalhe]);
  // adianta a nota vizinha (setas/PgDn): quando o usuário chegar nela, já está no cache
  useEffect(() => {
    const i = (linhasRef.current ?? []).findIndex((r) => r.id === foco); if (i < 0 || !foco) return undefined;
    const t = setTimeout(() => { for (const k of [i + 1, i - 1]) { const r = linhasRef.current[k]; if (r && !cacheDet.current.has(r.id)) buscaDetalhe(r.id).catch(() => {}); } }, 600);
    return () => clearTimeout(t);
  }, [foco, buscaDetalhe]);

  // tbnfiAfterScroll: tributo (tb_tributos) do item em foco — aba IBSCBS
  const item = itens.find((i) => i.id === itemSel);
  useEffect(() => {
    setItemDraft({}); setTribDraft({});
    if (!item?.id_tributo) { setTrib(null); return; }
    if (preCarregado.current.trib === item.id_tributo) { preCarregado.current.trib = null; return; } // veio no /detalhe
    api.get(`/nfe/tributos/${item.id_tributo}`).then(setTrib).catch(() => setTrib(null));
  }, [itemSel, item?.id_tributo]); // eslint-disable-line react-hooks/exhaustive-deps

  // pgnfeChange: itens da comanda em foco
  useEffect(() => {
    if (!comandaSel) { setComandaItens([]); return; }
    if (preCarregado.current.comanda === comandaSel) { preCarregado.current.comanda = null; return; } // veio no /detalhe
    api.get(`/nfe/comandas/${comandaSel}/itens`).then(setComandaItens).catch(() => setComandaItens([]));
  }, [comandaSel]);

  const linhasRef = useRef(linhas); linhasRef.current = linhas;
  const clicar = useCallback((e, r, i) => {
    setFoco(r.id);
    setMarcados((s) => {
      if (e.shiftKey && ancora.current != null) { const [a, b] = [Math.min(ancora.current, i), Math.max(ancora.current, i)]; return new Set(linhasRef.current.slice(a, b + 1).map((x) => x.id)); }
      ancora.current = i;
      if (e.ctrlKey || e.metaKey) { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; }
      return new Set([r.id]);
    });
  }, []);
  const marcar = useCallback((r, i) => { ancora.current = i; setMarcados((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; }); }, []);
  const abreModal = useCallback((r, i, qual) => { setFoco(r.id); setMarcados(new Set([r.id])); ancora.current = i; setModalNota(qual); }, []);
  const todosMarcados = (linhas?.length ?? 0) > 0 && marcados.size === linhas.length;
  const marcarTodas = () => setMarcados(todosMarcados ? new Set(foco ? [foco] : []) : new Set(linhas.map((r) => r.id)));
  const irPara = (i) => { const r = linhas?.[i]; if (r) { setFoco(r.id); setMarcados(new Set([r.id])); ancora.current = i; } };
  const alvo = marcados.size ? marcados : new Set(foco ? [foco] : []);
  const posFoco = (linhas ?? []).findIndex((r) => r.id === foco);
  const jn = useJanela((linhas ?? []).length, ALT_NOTA); // só as linhas visíveis existem no DOM
  useEffect(() => { // navegação por botões/teclado: mantém a nota em foco à vista (a linha pode nem existir no DOM)
    const el = jn.ref.current; if (!el || posFoco < 0) return;
    const topo = posFoco * ALT_NOTA; const base = topo + ALT_NOTA + 48; // 48 = cabeçalho + rodapé fixos
    if (topo < el.scrollTop) el.scrollTop = topo; else if (base > el.scrollTop + el.clientHeight) el.scrollTop = base - el.clientHeight;
  }, [posFoco]); // eslint-disable-line react-hooks/exhaustive-deps

  const acao = async (fn) => { setOcupado(true); try { await fn(); } catch (e) { notificar('erro', e.message); setLog([e.message]); } finally { setOcupado(false); } };

  // ----- ações da barra
  const ambienteAtual = Number(cfg?.nfe_configuracoes_webservice_ambiente) === 1 ? 1 : 2;
  const autorizar = async () => {
    if (alvo.size === 0) { notificar('erro', 'Selecione a NFE'); return; }
    if (ambienteAtual === 1 && !(await confirmar(`⚠ AMBIENTE DE PRODUÇÃO\n\n${alvo.size} nota(s) serão autorizadas na SEFAZ com VALOR FISCAL REAL.\n\nDeseja continuar?`))) return;
    return acao(async () => {
      setLog([]); setSubNfe('nfe'); setProgresso(10);
      try {
        const r = await api.post('/nfe/autorizar', { ids: [...alvo] });
        setProgresso(100);
        setLog(r.resultados.flatMap((x) => [`— Nota ${x.id}`, ...x.log]));
        const ult = r.resultados.at(-1);
        setResposta(JSON.stringify(ult?.resumo ?? {}, null, 2));
        if (r.resultados.every((x) => x.ok)) notificar('ok', 'A U T O R I Z A D A !'); else notificar('erro', ult?.temporario ? 'Agente do certificado A3 offline: tente de novo quando a máquina do token estiver ligada.' : ult?.log?.[0] ?? 'Não foi possível autorizar.');
        await filtrar(true);
      } finally { setTimeout(() => setProgresso(4), 1200); }
    });
  };
  const danfe = async () => {
    const lote = marcados.size > 1 || (marcados.size === 1 && !marcados.has(foco));
    if (!nota && !lote) return;
    const aba = window.open('', '_blank'); // abre já (clique do usuário) para o bloqueador de pop-up não barrar
    if (lote) { // notas marcadas: um único PDF com todas as DANFEs
      try {
        const r = await fetch('/api/nfe/danfe-lote', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...marcados] }) });
        if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.message || `HTTP ${r.status}`); }
        const ign = decodeURIComponent(r.headers.get('X-Danfe-Ignoradas') || '');
        const url = URL.createObjectURL(await r.blob());
        if (aba) aba.location.href = url; else window.open(url, '_blank');
        if (ign) notificar('erro', `DANFE não incluída: ${ign}`);
        cacheDet.current.clear();
      } catch (e) { aba?.close(); notificar('erro', `Danfe: ${e.message}`); }
      return;
    }
    try {
      const r = await fetch(`/api/nfe/${nota.id}/danfe`, { credentials: 'same-origin' });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.message || `HTTP ${r.status}`); }
      const url = URL.createObjectURL(await r.blob());
      if (aba) aba.location.href = url; else window.open(url, '_blank');
      recarregaDetalhe.current?.(nota.id); // o servidor guardou XML/PDF vindos da API
    } catch (e) { aba?.close(); notificar('erro', `Danfe: ${e.message}`); setFiscal('consultas'); } // sem XML/DANFE: abre a consulta para buscar na API
  };
  const [fiscal, setFiscal] = useState(null); // aba aberta do painel de eventos fiscais
  const abreFiscal = (aba) => () => { if (!nota && aba !== 'inutilizar' && aba !== 'consultas' && aba !== 'numeracao') { setLog(['Selecione a NFe desejada.']); return; } setFiscal(aba); };
  const reenviar = () => nota && setConfirma({ texto: `Reenviar a NFe ${nota.nfe_numero} à SEFAZ (mesmo XML)?`, ok: () => acao(async () => {
    const r = await api.post(`/nfe/${nota.id}/reenviar`, {}); setLog(r.log ?? ['Reenviada.']); notificar('ok', 'NFe autorizada.'); await filtrar(true);
  }) });
  const clonar = (r0) => setConfirma({ texto: `Clonar a NFe ${r0.nfe_numero || r0.id}? A cópia nasce PENDENTE, sem XML, PDF, chave, protocolo e recibo.`, ok: () => acao(async () => {
    const r = await api.post(`/nfe/${r0.id}/duplicar`); setF((x) => ({ ...x, st: { ...x.st, PENDENTE: true }, nfe1: '', nfe2: '' })); await filtrar(false); setFoco(r.id);
  }) });
  const criar = () => acao(async () => { const r = await api.post('/nfe'); setF((x) => ({ ...x, periodo: false, cli: false, nfe1: '', nfe2: '', st: ST_INICIAL })); await filtrar(false); setFoco(r.id); });
  const apagar = (r0) => setConfirma({ texto: `Deseja realmente apagar a NF ${r0.nfe_numero || r0.id}?`, ok: () => acao(async () => { await api.del(`/nfe/${r0.id}`); await filtrar(false); }) });
  const acoesLinha = useRef({}); acoesLinha.current = { clonar, apagar };
  const clonarLinha = useCallback((r) => acoesLinha.current.clonar(r), []);
  const apagarLinha = useCallback((r) => acoesLinha.current.apagar(r), []);
  const enviaEmail = (destino) => () => {
    const ids = [...alvo]; if (!ids.length) { setLog(['Selecione a NFe desejada.']); return; }
    if (ids.length > 1 && !confirmaEmail) {
      setConfirma({ texto: `Enviar ${ids.length} NF-e(s) por e-mail${destino === 'contabilidade' ? ' à contabilidade' : ' aos clientes'} sem conferir?`, ok: () => acao(async () => {
        const r = await api.post('/nfe/email', { ids, destino }); setLog(r.resultados.map((x) => x.log)); setLogAberto(true);
        notificar(r.ok ? 'ok' : 'erro', `${r.enviadas} e-mail(s) enviado(s).`); await filtrar(true);
      }) });
      return;
    }
    setEmailEnvio({ ids, destino });
  };
  const naoMigrado = (t) => () => notificar('erro', `${t}: ainda não migrado.`);

  // ----- gravação (tbnfe.post / cancel)
  const salvar = () => acao(async () => {
    const novo = await api.put(`/nfe/${nota.id}`, draft);
    setLinhas((ls) => ls.map((r) => (r.id === novo.id ? { ...r, ...novo } : r))); setCompleta(novo); setDraft({}); notificar('ok', 'Nota gravada.');
  });
  const ed = (k, val) => setDraft((d) => ({ ...d, [k]: val }));
  const destinatario = () => {
    if (!pendente) { notificar('erro', 'Só é possível alterar notas PENDENTES.'); return; }
    setDialogo({ titulo: 'Razao social do destinatário', campos: [{ k: 'razao_social', rotulo: 'Digite:', valor: v.cliente_razao_social ?? '' }],
      ok: (d) => acao(async () => {
        const novo = await api.post(`/nfe/${nota.id}/destinatario`, d);
        setLinhas((ls) => ls.map((r) => (r.id === novo.id ? { ...r, ...novo } : r))); setCompleta(novo); setDraft({}); notificar('ok', 'Destinatário copiado.');
      }) });
  };

  // ----- itens (tbnfi)
  const iv = { ...(item ?? {}), ...itemDraft };
  const edi = (k, val) => setItemDraft((d) => ({ ...d, [k]: val }));
  const itemSujo = Object.keys(itemDraft).length > 0;
  const aplicaNota = (n) => { if (!n) return; setLinhas((ls) => ls.map((r) => (r.id === foco ? { ...r, valor_produtos: n.valor_produtos, nf_valor_total: n.nf_valor_total } : r))); setCompleta((c) => (c?.id === foco ? { ...c, valor_produtos: n.valor_produtos, nf_valor_total: n.nf_valor_total } : c)); };
  const salvarItem = () => acao(async () => {
    const { _nota, ...novo } = await api.put(`/nfe/itens/${itemSel}`, itemDraft);
    setItens((is) => is.map((i) => (i.id === novo.id ? { ...i, ...novo } : i))); setItemDraft({}); aplicaNota(_nota); notificar('ok', 'Item gravado.');
  });
  const novoItem = () => {
    if (!pendente) { notificar('erro', 'Só é possível incluir itens em notas PENDENTES.'); return; }
    setDialogo({ titulo: 'Novo item', campos: [{ k: 'produto_codigo', rotulo: 'Produto (código)' }, { k: 'qtde', rotulo: 'Qtde', valor: '1', tipo: 'number' }],
      ok: (d) => acao(async () => {
        const novo = await api.post(`/nfe/${nota.id}/itens`, d);
        await carregarItens(nota.id, false); setItemSel(novo.id); await filtrar(true);
      }) });
  };
  const excluirItem = () => item && pendente && setConfirma({ texto: 'Excluir o item selecionado?', ok: () => acao(async () => { await api.del(`/nfe/itens/${item.id}`); await carregarItens(nota.id, false); await filtrar(true); }) });
  const salvarTrib = () => acao(async () => { const t = await api.put(`/nfe/tributos/${trib.id}`, tribDraft); setTrib(t); setTribDraft({}); notificar('ok', 'Tributo gravado.'); });
  const tv = { ...(trib ?? {}), ...tribDraft };

  // ----- duplicata (tbDup)
  const dup = dups[dupIdx];
  const dv = { ...(dup ?? {}), ...dupDraft };
  const salvarDup = () => acao(async () => { const d = await api.put(`/nfe/duplicatas/${dup.id}`, dupDraft); setDups((ds) => ds.map((x) => (x.id === d.id ? d : x))); setDupDraft({}); notificar('ok', 'Duplicata gravada.'); });

  // ----- NFe referência (tbNRef)
  const ref = refs[refIdx];
  const rv = { ...(ref ?? {}), ...refDraft };
  const refEditando = Object.keys(refDraft).length > 0;
  const novaRef = () => acao(async () => { const r = await api.post(`/nfe/${nota.id}/referencias`, {}); await carregarRefs(nota.id); setRefIdx(refs.length); notificar('ok', `Referência ${r.id} incluída.`); });
  const apagarRef = () => acao(async () => { await api.del(`/nfe/referencias/${ref.id}`); await carregarRefs(nota.id); notificar('ok', 'Referência excluída.'); });
  const salvarRef = () => acao(async () => { const r = await api.put(`/nfe/referencias/${ref.id}`, refDraft); setRefs((rs) => rs.map((x) => (x.id === r.id ? r : x))); setRefDraft({}); notificar('ok', 'Referência gravada.'); });

  const carregarCert = useCallback(() => api.get('/nfe/certificado').then(setCert).catch((e) => setCert({ situacao: 'erro', mensagem: e.message })), []);
  useEffect(() => {
    if (aba !== 'cfg' || cfgTab !== CFG_CERT) return undefined;
    carregarCert();
    const t = setInterval(carregarCert, 15000); // indicador online/offline do agente A3
    return () => clearInterval(t);
  }, [aba, cfgTab, carregarCert]);
  const [danfeCfg, setDanfeCfg] = useState(null);
  const [diagLogo, setDiagLogo] = useState('');
  const [logoV, setLogoV] = useState(0); // força recarregar a miniatura do logo
  useEffect(() => { if (aba === 'cfg' && cfgTab === CFG_NFE) api.get('/nfe/danfe-config').then(setDanfeCfg).catch(() => setDanfeCfg({ orientacao: 'retrato', logoNome: '' })); }, [aba, cfgTab]);
  const orientacaoDanfe = (o) => acao(async () => { setDanfeCfg(await api.put('/nfe/danfe-config', { orientacao: o })); notificar('ok', `DANFE em ${o}.`); });
  const escolheLogo = (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => acao(async () => {
      try { setDanfeCfg(await api.post('/nfe/danfe-logo', { nomeArquivo: f.name, arquivoBase64: String(rd.result).split(',')[1] ?? '' })); notificar('ok', 'Logo enviado à API de NF-e.'); }
      finally { api.get('/nfe/danfe-config').then(setDanfeCfg).catch(() => {}); setLogoV((v) => v + 1); }
    });
    rd.readAsDataURL(f);
  };
  const tiraLogo = () => setConfirma({ texto: 'Remover o logo do DANFE?', ok: () => acao(async () => { const r = await api.del('/nfe/danfe-logo'); setDanfeCfg(r); setLogoV((v) => v + 1); notificar(r.aviso ? 'erro' : 'ok', r.aviso || 'Logo removido.'); }) });
  const escolheA3 = (e) => {
    const f = e.target.files?.[0]; if (!f) { setA3Arq(null); return; }
    const rd = new FileReader();
    rd.onload = () => setA3Arq({ nome: f.name, base64: String(rd.result).split(',')[1] ?? '' });
    rd.readAsDataURL(f);
  };
  const cadastrarA3 = () => acao(async () => {
    const r = await api.post('/nfe/certificado/a3', { nomeArquivo: a3Arq?.nome, arquivoBase64: a3Arq?.base64, descricao: a3Desc, nomeAgente: a3Agente });
    setA3Arq(null); setA3Token(r.tokenAgente ? { token: r.tokenAgente, agente: a3Agente } : { token: '', agente: a3Agente, aviso: 'A API não devolveu o token no formato esperado: confira a resposta no painel da API.' });
    notificar('ok', r.mensagem); await carregarCert();
  });
  const revogarA3 = () => cert?.a3?.agenteId && setConfirma({ texto: 'Revogar o agente do certificado A3? A emissão com A3 para até um novo cadastro e pareamento.', ok: () => acao(async () => { const r = await api.del(`/nfe/certificado/a3/agente/${cert.a3.agenteId}`); notificar('ok', r?.mensagem ?? 'Agente revogado.'); await carregarCert(); }) });
  const salvarA3Id = () => acao(async () => { await api.put('/nfe/certificado/a3/id', { certificadoId: a3Id.trim() }); setA3Id(''); await carregarCert(); });
  const escolheArquivo = (e) => {
    const f = e.target.files?.[0]; if (!f) { setCertArq(null); return; }
    const rd = new FileReader();
    rd.onload = () => setCertArq({ nome: f.name, base64: String(rd.result).split(',')[1] ?? '' });
    rd.readAsDataURL(f);
  };
  const enviarCert = () => acao(async () => {
    const r = await api.post('/nfe/certificado', { senha: certSenha, nomeArquivo: certArq?.nome, arquivoBase64: certArq?.base64 });
    setCertSenha(''); setCertArq(null); notificar('ok', r.mensagem); await carregarCert();
  });
  const salvarCfg = () => acao(async () => { await api.put('/nfe/config', cfgDraft); await carregarCfg(); window.dispatchEvent(new Event('ambiente-alterado')); notificar('ok', 'Configurações gravadas.'); });
  const escolheAmbiente = async (novo) => {
    const atual = cfgDraft.nfe_configuracoes_webservice_ambiente ?? cfg.nfe_configuracoes_webservice_ambiente;
    if (Number(atual) === novo) return;
    if (novo === 1) {
      const r = await entrada('⚠ PASSAR PARA PRODUÇÃO\n\nAs notas passarão a ser autorizadas na SEFAZ com valor fiscal real.\nDigite PRODUCAO para confirmar:', '');
      if (r?.trim().toUpperCase() !== 'PRODUCAO') { if (r !== null) notificar('erro', 'Confirmação incorreta: o ambiente não foi alterado.'); return; }
      setCfgDraft({ ...cfgDraft, nfe_configuracoes_webservice_ambiente: 1, confirmacao: 'PRODUCAO' });
    } else {
      const { confirmacao: _c, ...resto } = cfgDraft; // eslint-disable-line no-unused-vars
      setCfgDraft({ ...resto, nfe_configuracoes_webservice_ambiente: 2 });
    }
  };

  const totalNF = (linhas ?? []).reduce((s, r) => s + Number(r.nf_valor_total || 0), 0);
  const totalItens = itens.reduce((s, i) => s + Number(i.preco_total || 0), 0);
  const ro = !pendente;

  return (
    <div className="tela nfe nf2">
      <header className="nf2-topo">
        <div className="nf2-id">
          <b>📑 Nota Fiscal Eletrônica</b>
          <span className={`nf2-amb ${ambienteAtual === 1 ? 'prod' : 'hom'}`}>{ambienteAtual === 1 ? '🔴 PRODUÇÃO' : '🟢 Homologação'}</span>
          {nota && <span className="nf2-nota">NF {nota.nfe_numero || '—'} · <i className={`nf2-st ${nota.status_e}`}>{nota.status_e}</i></span>}
        </div>
        <div className="nf2-acoes">
          <button type="button" className="nf2-b novo" onClick={criar} disabled={ocupado}>＋ Criar</button>
          <button type="button" className="nf2-b prim" onClick={autorizar} disabled={ocupado || !(pendente || marcados.size)} title="Autorizar NFe">✔ Autorizar{marcados.size > 0 ? ` (${marcados.size})` : ''}</button>
          <button type="button" className="nf2-b" onClick={danfe} disabled={marcados.size > 0 ? false : !nota || (nota.status_e === 'PENDENTE' && !nota.nfe_numero)}>🖨 Danfe{marcados.size > 0 ? ` (${marcados.size})` : ''}</button>
          <button type="button" className={`nf2-b${todosMarcados ? ' on' : ''}`} onClick={marcarTodas} disabled={!linhas?.length} title="Marcar / desmarcar todas as notas da lista">{todosMarcados ? '☐ Desmarcar' : '☑ Marcar todas'}</button>
          <button type="button" className="nf2-b" onClick={() => setSubNfe('comanda')} disabled={!nota} title="Comandas ligadas à nota">🧾 Comandas{comandas.length ? ` (${comandas.length})` : ''}</button>
          <div className="nf2-mais">
            <button type="button" className="nf2-b" aria-haspopup="menu" aria-expanded={maisAberto} onClick={() => setMaisAberto((x) => !x)}>⋯ Mais ações ▾</button>
            {maisAberto && (
              <>
                <div className="nf2-veu" onClick={() => setMaisAberto(false)} />
                <div className="nf2-menu" role="menu" onClick={() => setMaisAberto(false)}>
                  <small>Eventos fiscais</small>
                  <button type="button" role="menuitem" className="perigo" onClick={abreFiscal('cancelar')} disabled={ocupado || nota?.status_e !== 'AUTORIZADA'}>✖ Cancelar NFe</button>
                  <button type="button" role="menuitem" onClick={abreFiscal('carta')} disabled={ocupado || nota?.status_e !== 'AUTORIZADA'}>✎ Carta de Correção</button>
                  <button type="button" role="menuitem" onClick={abreFiscal('inutilizar')} disabled={ocupado}>∅ Inutilizar numeração</button>
                  <button type="button" role="menuitem" onClick={abreFiscal('numeracao')} disabled={ocupado}># Numeração das séries</button>
                  <button type="button" role="menuitem" onClick={reenviar} disabled={ocupado || nota?.status_e !== 'PENDENTE' || !nota?.nfe_numero}>↻ Reenviar à SEFAZ</button>
                  <button type="button" role="menuitem" onClick={abreFiscal('consultas')} disabled={ocupado}>🏛 Consultas e status Receita</button>
                  <button type="button" role="menuitem" onClick={abreFiscal('arquivos')} disabled={!nota}>📄 Arquivos e retornos</button>
                  <small>Envio</small>
                  <button type="button" role="menuitem" onClick={enviaEmail('cliente')}>✉ Enviar e-mail ao cliente</button>
                  <button type="button" role="menuitem" onClick={enviaEmail('contabilidade')}>📧 Enviar à Contabilidade</button>
                  <small>Documento</small>
                  <button type="button" role="menuitem" onClick={naoMigrado('Pré Danfe')}>👁 Pré Danfe <em>em breve</em></button>
                  <button type="button" role="menuitem" onClick={naoMigrado('Danfe Simples')}>🖨 Danfe Simples <em>em breve</em></button>
                  <small>Estoque / devolução</small>
                  <button type="button" role="menuitem" onClick={abreFiscal('devolucao')} disabled={ocupado || !nota}>↩ Devolução</button>
                  <button type="button" role="menuitem" onClick={abreFiscal('devolucao')} disabled={ocupado || !nota}>📦 Devolver ao estoque</button>
                  <small>Configuração</small>
                  <button type="button" role="menuitem" onClick={() => setAba('cfg')}>⚙ Emitente, ambiente e certificado</button>
                  <button type="button" role="menuitem" onClick={() => setAba('resp')}>📡 Última requisição/resposta da API</button>
                </div>
              </>
            )}
          </div>
          <button type="button" className={`nf2-b${logAberto ? ' on' : ''}`} onClick={() => setLogAberto((x) => !x)} title="Log da NFe">📜 Log{log.length ? <i className="nf2-cnt">{log.length}</i> : null}</button>
          <button type="button" className="nf2-b" onClick={onFechar}>Fechar</button>
        </div>
      </header>
      <Toast aviso={aviso} />
      {logAberto && (
        <div className="nf2-log">
          <textarea readOnly value={log.join('\n')} aria-label="Log da NFe" placeholder="(sem mensagens)" />
          <button type="button" className="nf2-b" onClick={() => setLog([])}>Limpar</button>
        </div>
      )}

      {/* tabPesquisa */}
      <section className="nf2-filtro" role="group" aria-label="Filtro">
        <span className={`nf2-aplica${ocupado ? ' on' : ''}`} title="O filtro é aplicado automaticamente">{ocupado ? '⏳ Filtrando…' : '✓ Filtro aplicado'}</span>
        <div className="nf2-gr">
          <span className="nf2-rot">Data por</span>
          <div className="nf2-seg">
            {[['emissao', 'Emissão'], ['autorizacao', 'Autorização'], ['saida', 'Saída']].map(([k, r]) => <label key={k} className={f.campo === k ? 'on' : ''}><input type="radio" name="nfe-campo" checked={f.campo === k} onChange={() => setF({ ...f, campo: k })} />{r}</label>)}
          </div>
        </div>
        <div className="nf2-gr">
          <label className="nf2-rot"><input type="checkbox" checked={f.periodo} onChange={(e) => setF({ ...f, periodo: e.target.checked })} />Período</label>
          <div className="nf2-lin">
            <input type="date" value={f.d1} onChange={(e) => e.target.value && setF({ ...f, d1: e.target.value })} aria-label="Período inicial" />
            <span>até</span>
            <input type="date" value={f.d2} onChange={(e) => e.target.value && setF({ ...f, d2: e.target.value })} aria-label="Período final" />
            <button type="button" className="nf2-b mini" title="Alterna entre hoje e o mês corrente" onClick={() => { const [a, b] = alternaPeriodo(f.d1, f.d2, hoje()); setF({ ...f, d1: a, d2: b }); }}>📅</button>
          </div>
        </div>
        <div className="nf2-gr">
          <span className="nf2-rot">Situação</span>
          <div className="nf2-chips">
            {ST.map(([k, r]) => <label key={k} className={`nf2-chip ${k}${f.st[k] ? ' on' : ''}`}><input type="checkbox" checked={f.st[k]} onChange={(e) => setF({ ...f, st: { ...f.st, [k]: e.target.checked } })} />{r}</label>)}
          </div>
        </div>
        <div className="nf2-gr">
          <label className="nf2-rot"><input type="checkbox" checked={f.cli} onChange={(e) => setF({ ...f, cli: e.target.checked })} aria-label="Filtrar por cliente" />Destinatário</label>
          <select value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value, cli: e.target.value ? true : f.cli })} aria-label="Destinatário">
            <option value="">Todos os destinatários…</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.razao_social || c.nome_fantasia}</option>)}
          </select>
        </div>
        <div className="nf2-gr">
          <span className="nf2-rot">NFe nº</span>
          <div className="nf2-lin">
            <input type="number" min="0" className="curto" value={f.nfe1} onChange={(e) => setF({ ...f, nfe1: e.target.value, nfe2: e.target.value })} aria-label="NFe inicial" />
            <span>à</span>
            <input type="number" min="0" className="curto" value={f.nfe2} onChange={(e) => setF({ ...f, nfe2: e.target.value })} aria-label="NFe final" />
          </div>
        </div>
        <div className="nf2-gr">
          <span className="nf2-rot">Referência</span>
          <input value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} aria-label="Referência" />
        </div>
      </section>
      <div className="nfe-geral">
        {/* cxTabControl5: painel da esquerda */}
        <aside className="nf2-lat">
          <div className="nf2-card">
            <div className="nf2-card-t">🚚 Transporte e saída
              <Nav botoes={[
                { k: 'post', ic: '✔', dica: 'Gravar', on: salvar, off: !sujo || ocupado },
                { k: 'cancel', ic: '✖', dica: 'Cancelar edição', on: () => setDraft({}), off: !sujo },
                { k: 'refresh', ic: '⟳', dica: 'Atualizar', on: () => filtrar(true) },
              ]} />
            </div>
            <label className="nf2-c"><span>Placa / veículo</span>
              <div className="nf2-lin"><input value={v.transportadora_veiculo_placa ?? ''} readOnly={ro} onChange={(e) => ed('transportadora_veiculo_placa', e.target.value)} aria-label="Placa" />
                <select className="uf" value={v.transportadora_veiculo_uf ?? ''} disabled={ro} onChange={(e) => ed('transportadora_veiculo_uf', e.target.value)} aria-label="UF do veículo">{UFS.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
            </label>
            <label className="nf2-c"><span>Saída da mercadoria</span>
              <input type="date" value={String(v.data_saida ?? '').slice(0, 10)} readOnly={ro} onChange={(e) => ed('data_saida', e.target.value)} aria-label="Saída da mercadoria" /></label>
            <label className="nf2-c"><span>Hora da saída</span>
              <div className="nf2-lin"><input type="time" step="1" value={String(v.hora_saida ?? '').slice(0, 8)} readOnly={ro} onChange={(e) => ed('hora_saida', e.target.value)} aria-label="Hora da saída" />
                <button type="button" className="nf2-b mini" disabled={ro} title="Hora atual" onClick={() => ed('hora_saida', new Date().toTimeString().slice(0, 8))}>⏱</button></div></label>
          </div>
          <div className="nf2-card">
            <div className="nf2-card-t">💵 Duplicata</div>
            <label className="nf2-c"><span>Documento</span><input value={dv.documento ?? ''} readOnly={ro || !dup} onChange={(e) => setDupDraft({ ...dupDraft, documento: e.target.value })} aria-label="Documento" /></label>
            <label className="nf2-c"><span>Vencimento</span><input type="date" value={String(dv.vencto ?? '').slice(0, 10)} readOnly={ro || !dup} onChange={(e) => setDupDraft({ ...dupDraft, vencto: e.target.value })} aria-label="Vencimento" /></label>
            <label className="nf2-c"><span>Valor da duplicata</span><Num valor={dv.valor} ro={ro || !dup} onMudar={(n) => setDupDraft({ ...dupDraft, valor: n })} max={2} /></label>
            <div className="nfe-nav">
              <button type="button" title="Anterior" disabled={dupIdx <= 0} onClick={() => { setDupIdx(dupIdx - 1); setDupDraft({}); }}>◀</button>
              <button type="button" title="Próxima" disabled={dupIdx >= dups.length - 1} onClick={() => { setDupIdx(dupIdx + 1); setDupDraft({}); }}>▶</button>
              <button type="button" className="gr" title="Gravar" disabled={!Object.keys(dupDraft).length || ocupado} onClick={salvarDup}>✔ <span>Gravar</span></button>
              <button type="button" className="cc" title="Cancelar edição" disabled={!Object.keys(dupDraft).length} onClick={() => setDupDraft({})}>✖ <span>Cancelar</span></button>
              <button type="button" title="Atualizar" disabled={!nota} onClick={() => nota && carregarDups(nota.id)}>⟳</button>
              <span className="info">{dups.length ? `${dupIdx + 1}/${dups.length}` : '0/0'}</span>
            </div>
          </div>
          <div className="nf2-card">
            <div className="nf2-card-t">⚙ Opções</div>
            <label className="nf2-sw"><input type="checkbox" checked={impDireta} onChange={(e) => setImpDireta(e.target.checked)} />Impressão direta</label>
            <label className="nf2-sw"><input type="checkbox" checked={confirmaEmail} onChange={(e) => setConfirmaEmail(e.target.checked)} />Confirma e-mail</label>
          </div>
          <div className="nfe-bar" title="Progresso"><div style={{ width: `${progresso}%` }} /><span>{progresso}%</span></div>
        </aside>

        <div className="nfe-direita">
          <div className="nfe-abas" role="tablist">
            {[['nfe', 'NFe'], ['cfg', '⚙ Emitente e configurações'], ['resp', '📡 Envio/Resposta']].map(([k, r]) => <button key={k} role="tab" aria-selected={aba === k} className={aba === k ? 'on' : ''} onClick={() => setAba(k)}>{r}</button>)}
          </div>

          {aba === 'nfe' && (
            <div className="nfe-centro">

              {(
                <>
                  <div className="nfe-grade rolagem" ref={jn.ref} onScroll={jn.onScroll} style={{ height: altGrade }}>
                    <table className="grade">
                      <thead><tr><th className="ind" /><th className="nf2-chk"><input type="checkbox" checked={todosMarcados} onChange={marcarTodas} disabled={!linhas?.length} aria-label="Marcar todas" title="Marcar / desmarcar todas" /></th><th className="nf2-ic" />{GRADE_COLS.map(([k, r, , w]) => <th key={k} style={{ minWidth: w }}>{r}</th>)}</tr></thead>
                      <tbody>
                        {jn.acima > 0 && <tr className="cd-esp" style={{ height: jn.acima }}><td colSpan={GRADE_COLS.length + 2} /></tr>}
                        {(linhas ?? []).slice(jn.ini, jn.fim).map((r, k) => <LinhaNota key={r.id} r={r} i={jn.ini + k} sel={marcados.has(r.id) || foco === r.id} marc={marcados.has(r.id)} foco={foco === r.id} onClick={clicar} onMarcar={marcar} onModal={abreModal} onClonar={clonarLinha} onApagar={apagarLinha} />)}
                        {jn.abaixo > 0 && <tr className="cd-esp" style={{ height: jn.abaixo }}><td colSpan={GRADE_COLS.length + 2} /></tr>}
                        {linhas && linhas.length === 0 && <tr className="semlinha"><td colSpan={GRADE_COLS.length + 3} className="vazio">&lt;Não há notas para este filtro&gt;</td></tr>}
                      </tbody>
                      <tfoot><tr>
                        <td className="ind" /><td /><td />{GRADE_COLS.map(([k, , t]) => <td key={k} className={t === 'm' ? 'n' : ''}>{k === 'status_e' ? <b>{linhas?.length ?? 0}</b> : k === 'nf_valor_total' ? <b>{fmtBr(totalNF, 2)}</b> : ''}</td>)}
                      </tr></tfoot>
                    </table>
                  </div>
                  <div className="nfe-split" role="separator" aria-orientation="horizontal" title="Arraste para redimensionar"
                    onMouseDown={(e) => { const y0 = e.clientY; const h0 = altGrade; const mv = (m) => setAltGrade(Math.max(80, Math.min(600, h0 + m.clientY - y0))); const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); }} />
                  <div className="nfe-sub inferior" role="tablist">
                    <button role="tab" aria-selected className="on">Ítens da NFe</button>
                  </div>

                  {sub === 'itens' && (
                    <div className="nfe-itens">
                      <div className="rolagem nfe-itens-grade" tabIndex={0} onKeyDown={(e) => {
                        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) || !itens.length) return;
                        e.preventDefault();
                        const i0 = Math.max(0, itens.findIndex((x) => x.id === itemSel));
                        const j = e.key === 'ArrowDown' ? Math.min(itens.length - 1, i0 + 1) : e.key === 'ArrowUp' ? Math.max(0, i0 - 1) : e.key === 'Home' ? 0 : itens.length - 1;
                        setItemSel(itens[j].id);
                        const tr = e.currentTarget.querySelectorAll('tbody tr')[j]; tr?.scrollIntoView({ block: 'nearest' });
                      }}>
                        <table className="grade">
                          <thead><tr><th className="ind" />{ITEM_COLS.map(([k, r, , w]) => <th key={k} style={{ minWidth: w }}>{r}</th>)}</tr></thead>
                          <tbody>
                            {itens.map((i) => <LinhaItem key={i.id} i={i} sel={itemSel === i.id} onSel={setItemSel} />)}
                            {itens.length === 0 && <tr className="semlinha"><td colSpan={ITEM_COLS.length + 1} className="vazio">&lt;Sem itens&gt;</td></tr>}
                          </tbody>
                          <tfoot><tr><td className="ind" />{ITEM_COLS.map(([k]) => <td key={k} className={k === 'preco_total' ? 'n' : ''}>{k === 'preco_total' ? <b>{fmtBr(totalItens, 2)}</b> : ''}</td>)}</tr></tfoot>
                        </table>
                      </div>

                      {/* Ficha do item: tudo à vista, agrupado por assunto (antes: 5 abas com campos posicionados e repetidos) */}
                      <div className="nfe-p5 fi">
                        <div className="nfe-p5-tabs" role="tablist">
                          {[['produto', '📦 Produto'], ['icms', '🏛 ICMS'], ['pc', '🧮 IPI/PIS/COFINS'], ['trib', '🏷 Tributação']].map(([k, r]) => <button key={k} role="tab" aria-selected={itemTab === k} className={itemTab === k ? 'on' : ''} onClick={() => setItemTab(k)}>{r}</button>)}
                        </div>
                        <div className="fi-rolagem">
                          {!item && <p className="vazio">Sem item.</p>}
                          {item && (<>
                            {itemTab === 'produto' && <section className="fi-sec">
                              <h5>📦 Produto <small>{iv.produto_codigo ?? ''}</small></h5>
                              <div className="fi-grid">
                                <label className="fi-c s2"><span>Descrição</span><input value={iv.produto_descricao ?? ''} readOnly={ro} onChange={(e) => edi('produto_descricao', e.target.value)} /></label>
                                <div className="fi-c"><span>NCM</span><NcmCampo valor={iv.produto_ncm} aoMudar={(x) => edi('produto_ncm', x)} desabilitado={ro} /></div>
                                <label className="fi-c"><span>UN</span><input value={iv.un ?? ''} readOnly={ro} onChange={(e) => edi('un', e.target.value)} /></label>
                                <label className="fi-c s2"><span>EAN</span><input value={iv.produto_ean ?? ''} readOnly={ro} onChange={(e) => edi('produto_ean', e.target.value)} /></label>
                                <label className="fi-c"><span>Qtde</span><Num valor={iv.qtde} dec={3} ro={ro} onMudar={(n) => edi('qtde', n)} /></label>
                                <label className="fi-c"><span>Preço unit.</span><Num valor={iv.preco} dec={2} max={5} ro={ro} onMudar={(n) => edi('preco', n)} /></label>
                                <label className="fi-c"><span>Preço total</span><Num valor={itemDraft.qtde !== undefined || itemDraft.preco !== undefined ? Math.round(Number(iv.qtde) * Number(iv.preco) * 100) / 100 : iv.preco_total} ro /></label>
                                <label className="fi-c"><span>Nº AF (acordo)</span><input value={iv.ordem_compra ?? ''} readOnly={ro} onChange={(e) => edi('ordem_compra', e.target.value)} /></label>
                                <label className="fi-c"><span>Nº item</span><input value={iv.item ?? ''} readOnly={ro} onChange={(e) => edi('item', e.target.value)} /></label>
                              </div>
                            </section>}
                            {itemTab === 'icms' && <section className="fi-sec">
                              <h5>🏛 ICMS do item</h5>
                              <div className="fi-grid">
                                <label className="fi-c"><span>CFOP</span><input value={iv.cfop_codigo ?? ''} readOnly={ro} onChange={(e) => edi('cfop_codigo', e.target.value)} /></label>
                                {(!simplesNota || txt1(iv.cfop_cst_icms)) && <label className="fi-c"><span>CST</span><input value={iv.cfop_cst_icms ?? ''} readOnly={ro} onChange={(e) => edi('cfop_cst_icms', e.target.value)} /></label>}
                                {(simplesNota || txt1(iv.csosn)) && <label className="fi-c"><span>CSOSN</span><input value={iv.csosn ?? ''} readOnly={ro} onChange={(e) => edi('csosn', e.target.value)} /></label>}
                                <label className="fi-c"><span>vBC (base)</span><Num valor={iv.icms_base_calculo} ro={ro} onMudar={(n) => edi('icms_base_calculo', n)} /></label>
                                <label className="fi-c"><span>pICMS</span><Num valor={iv.icms_aliquota} sufixo=" %" ro={ro} onMudar={(n) => edi('icms_aliquota', n)} /></label>
                                <label className="fi-c"><span>vICMS</span><Num valor={iv.icms_valor} ro={ro} onMudar={(n) => edi('icms_valor', n)} /></label>
                              </div>
                            </section>}
                            {itemTab === 'pc' && <section className="fi-sec">
                              <h5>🧮 IPI · PIS · COFINS</h5>
                              <div className="fi-grid">
                                <label className="fi-c"><span>CST IPI</span><input value={iv.cst_ipi ?? ''} readOnly={ro} onChange={(e) => edi('cst_ipi', e.target.value)} /></label>
                                <label className="fi-c"><span>CST PIS</span><input value={iv.cfop_cst_pis ?? ''} readOnly={ro} onChange={(e) => edi('cfop_cst_pis', e.target.value)} /></label>
                                <label className="fi-c"><span>CST Cofins</span><input value={iv.cfop_cst_cofins ?? ''} readOnly={ro} onChange={(e) => edi('cfop_cst_cofins', e.target.value)} /></label>
                                <label className="fi-c"><span>pPIS</span><Num valor={iv.pis_aliquota} sufixo=" %" ro={ro} onMudar={(n) => edi('pis_aliquota', n)} /></label>
                                <label className="fi-c"><span>vPIS</span><Num valor={iv.pis_valor} ro={ro} onMudar={(n) => edi('pis_valor', n)} /></label>
                                <span />
                                <label className="fi-c"><span>pCOFINS</span><Num valor={iv.cofins_aliquota} sufixo=" %" ro={ro} onMudar={(n) => edi('cofins_aliquota', n)} /></label>
                                <label className="fi-c"><span>vCOFINS</span><Num valor={iv.cofins_valor} ro={ro} onMudar={(n) => edi('cofins_valor', n)} /></label>
                              </div>
                            </section>}
                            {itemTab === 'trib' && <section className="fi-sec fi-trib">
                              <h5>🏷 Código de tributação <small>(vale p/ todos os itens com este código)</small></h5>
                              <div className="fi-grid">
                                <label className="fi-c"><span>Código (id)</span><input value={iv.id_tributo ?? ''} readOnly={ro} onChange={(e) => edi('id_tributo', e.target.value)} title="id_tributo (tb_tributos)" /></label>
                                <label className="fi-c"><span>Total dos tributos</span><Num valor={iv.valor_trib_prod} ro /></label>
                                {!trib && <p className="vazio s2">Item sem código de tributação (id_tributo): a nota não poderá ser autorizada.</p>}
                                {trib && (<>
                                  <label className="fi-c"><span>Red. base ICMS %</span><Num valor={tv.red_aliq} dec={2} max={4} onMudar={(n) => setTribDraft({ ...tribDraft, red_aliq: n })} /></label>
                                  <label className="fi-c"><span>cBenef</span><input value={tv.cBenef ?? ''} onChange={(e) => setTribDraft({ ...tribDraft, cBenef: e.target.value })} /></label>
                                  <label className="fi-c"><span>CST IBS/CBS</span><input maxLength={3} value={tv.cst ?? ''} onChange={(e) => setTribDraft({ ...tribDraft, cst: e.target.value })} /></label>
                                  <label className="fi-c"><span>cClassTrib</span><input maxLength={6} value={tv.cClassTrib ?? ''} onChange={(e) => setTribDraft({ ...tribDraft, cClassTrib: e.target.value })} /></label>
                                  <label className="fi-c"><span>pIBS %</span><Num valor={tv.pIBS} dec={2} max={4} onMudar={(n) => setTribDraft({ ...tribDraft, pIBS: n })} /></label>
                                  <label className="fi-c"><span>pCBS %</span><Num valor={tv.pCBS} dec={2} max={4} onMudar={(n) => setTribDraft({ ...tribDraft, pCBS: n })} /></label>
                                  <button type="button" className="bt s2" disabled={!Object.keys(tribDraft).length || ocupado} onClick={salvarTrib}>✔ Gravar código de tributação</button>
                                </>)}
                              </div>
                            </section>}
                          </>)}
                        </div>
                        <Nav info={itens.length ? `Item ${itens.findIndex((i) => i.id === itemSel) + 1} de ${itens.length}` : 'Item 0 de 0'} botoes={[
                          { k: 'add', ic: '＋', dica: 'Novo item', on: novoItem, off: !pendente || ocupado },
                          { k: 'del', ic: '−', dica: 'Excluir item', on: excluirItem, off: !pendente || !item || ocupado },
                          { k: 'post', ic: '✔', dica: 'Gravar item', on: salvarItem, off: !itemSujo || ocupado },
                          { k: 'cancel', ic: '✖', dica: 'Cancelar edição do item', on: () => setItemDraft({}), off: !itemSujo },
                          { k: 'refresh', ic: '⟳', dica: 'Atualizar itens', on: () => nota && carregarItens(nota.id, true), off: !nota },
                        ]} />
                      </div>
                    </div>
                  )}

                  {modalNota === 'corpo' && nota && (
                    <Modal titulo={`Dados do corpo da NFe ${nota.nfe_numero || ''}${refs.length ? ` · ${refs.length} ref.` : ''}`} onFechar={() => setModalNota(null)} largo>
                    <div className="nc">
                      <div className="nc-barra">
                        <div className="nc-acoes">
                          <button type="button" className="nc-b" title="Destinatário: copia os dados de um cliente já faturado" disabled={!pendente || ocupado} onClick={destinatario}>👤 Destinatário</button>
                          <button type="button" className="nc-b prim" disabled={!sujo || ocupado} onClick={salvar}>💾 Salvar</button>
                          <button type="button" className="nc-b" disabled={!sujo} onClick={() => setDraft({})}>↩ Desfazer</button>
                          {sujo && <span className="nc-sujo">● alterações não salvas</span>}
                        </div>
                        {nota && <nav className="nc-nav" aria-label="Seções">{[...gruposCorpo, { id: 'ref', icone: '🔗', titulo: `NFe referenciada${refs.length ? ` (${refs.length})` : ''}` }].map((g) => <button type="button" key={g.id} onClick={(e) => { const c = e.currentTarget.closest('.nc').querySelector('.nc-corpo'); const el = c.querySelector(`#nc-${g.id}`); if (el) c.scrollTo({ top: el.offsetTop - c.offsetTop - 6, behavior: 'smooth' }); }}>{g.icone} {g.titulo}</button>)}</nav>}
                      </div>
                      <div className="nc-corpo">
                        {!nota && <p className="vazio">Selecione uma nota.</p>}
                        {nota && gruposCorpo.map((g) => (
                          <section className="nc-sec" id={`nc-${g.id}`} key={g.id}>
                            <h4><i aria-hidden="true">{g.icone}</i>{g.titulo}</h4>
                            <div className="nc-grid">
                              {g.campos.map(([k, r, t], i) => {
                                const somenteLeitura = ro || t === 'ro' || t === 'rom' || t === 'memo-ro';
                                const val = v[k];
                                const cls = `nc-c${somenteLeitura ? ' ro' : ''}${t === 'rom' ? ' total' : ''}`;
                                if (t === 'chk') return (
                                  <label key={i} className="nc-chave" style={{ gridColumn: 'span 4' }}>
                                    <input type="checkbox" checked={temMarca(val)} disabled={somenteLeitura} onChange={(e) => ed(k, e.target.checked ? 'True' : 'False')} /><i aria-hidden="true" />{r}
                                  </label>
                                );
                                let ctl;
                                if (t === 'num') ctl = <Num valor={val} ro={somenteLeitura} onMudar={(n) => ed(k, n)} />;
                                else if (t === 'rom') ctl = <Num valor={val} ro dec={2} />;
                                else if (t === 'memo' || t === 'memo-ro') ctl = <textarea rows={2} readOnly={somenteLeitura} value={val ?? ''} onChange={(e) => ed(k, e.target.value)} />;
                                else if (t === 'mov') ctl = <select disabled={somenteLeitura} value={String(val ?? '1')} onChange={(e) => ed(k, e.target.value)}><option value="0">Entrada</option><option value="1">Saída</option></select>;
                                else ctl = <input type={t === 'date' ? 'date' : t === 'time' ? 'time' : 'text'} step={t === 'time' ? 1 : undefined} readOnly={somenteLeitura} value={t === 'date' ? String(val ?? '').slice(0, 10) : t === 'time' ? String(val ?? '').slice(0, 8) : val ?? ''} onChange={(e) => ed(k, e.target.value)} />;
                                return <label key={i} className={cls} style={{ gridColumn: `span ${larguraCampo(k, r, t)}` }}><span>{r}</span>{ctl}</label>;
                              })}
                            </div>
                          </section>
                        ))}
                        {nota && (
                          <section className="nc-sec" id="nc-ref">
                            <h4><i aria-hidden="true">🔗</i>NFe referenciada <small>({refs.length})</small>
                              <span className="nc-ref-acoes">
                                {!refEditando && <button type="button" className="nc-b" disabled={!pendente || ocupado} onClick={novaRef}>＋ Nova</button>}
                                {refEditando && <button type="button" className="nc-b prim" disabled={ocupado} onClick={salvarRef}>💾 Salvar referência</button>}
                                {refEditando && <button type="button" className="nc-b" onClick={() => setRefDraft({})}>↩ Desfazer</button>}
                                {ref && !refEditando && <button type="button" className="nc-b perigo" disabled={!pendente || ocupado} onClick={apagarRef}>🗑 Excluir</button>}
                              </span>
                            </h4>
                            {!ref ? <p className="nc-vazio">Nenhuma NFe referenciada. Use <b>＋ Nova</b> quando a nota referenciar outra (devolução, complementar, ajuste).</p> : (
                              <>
                                {refs.length > 1 && <div className="nc-refchips" role="tablist">{refs.map((r, i) => <button key={r.id} type="button" role="tab" aria-selected={i === refIdx} className={i === refIdx ? 'on' : ''} disabled={refEditando} onClick={() => setRefIdx(i)}>{r.refNFE ? `…${String(r.refNFE).slice(-9)}` : `Referência ${i + 1}`}</button>)}</div>}
                                <div className="nc-grid">
                                  <label className="nc-c" style={{ gridColumn: 'span 12' }}><span>Chave da NF-e referenciada (44 dígitos)</span><input readOnly={!pendente} maxLength={44} value={rv.refNFE ?? ''} onChange={(e) => setRefDraft({ ...refDraft, refNFE: e.target.value.replace(/\D/g, '') })} /></label>
                                </div>
                                <details className="nc-outros"><summary>Outros tipos de referência (NF modelo 1/1A, produtor rural, CT-e, cupom fiscal)</summary>
                                  <div className="nc-grid">
                                    {REF_LINHAS.filter(([k]) => k !== 'refNFE').map(([k, r]) => <label key={k} className="nc-c" style={{ gridColumn: `span ${['refCTe'].includes(k) ? 12 : 3}` }}><span>{r}</span><input readOnly={!pendente} value={rv[k] ?? ''} onChange={(e) => setRefDraft({ ...refDraft, [k]: e.target.value })} /></label>)}
                                  </div>
                                </details>
                              </>
                            )}
                          </section>
                        )}
                        {nota && !pendente && <p className="nfe-nota">🔒 Só notas PENDENTES podem ser editadas.</p>}
                      </div>
                    </div>
                    </Modal>
                  )}

                  {modalNota === 'eventos' && nota && <Modal titulo={`Eventos da NFe ${nota.nfe_numero || ''}`} onFechar={() => setModalNota(null)} largo><div className="nfe-eventos rolagem"><EventosTabela eventos={eventos} nota={nota} onArquivo={(url) => abrirArquivo(url).catch((e) => notificar('erro', e.message))} /></div></Modal>}
                </>
              )}

              {subNfe === 'comanda' && (
                <Modal titulo={`Comandas da NFe ${nota?.nfe_numero || ''}`} onFechar={() => setSubNfe('nfe')} largo>
                <div className="nfe-comandas">
                  <div className="rolagem nfe-cmd-cab">
                    <table className="grade">
                      <thead><tr><th className="ind" /><th>Comanda</th><th>Status</th><th>Emissão</th><th>Usuário</th><th>Valor</th></tr></thead>
                      <tbody>
                        {comandas.map((c) => (
                          <tr key={c.id} className={`clicavel${comandaSel === c.id ? ' sel' : ''}`} onClick={() => setComandaSel(c.id)}>
                            <td className="ind">{comandaSel === c.id ? '▶' : ''}</td><td>{c.id}</td><td>{c.status}</td><td>{c.data_emissao ? brData(c.data_emissao) : ''}</td><td>{c.usuario}</td><td className="n">{fmtBr(c.vr_comanda, 2, 3)}</td>
                          </tr>
                        ))}
                        {comandas.length === 0 && <tr className="semlinha"><td colSpan={6} className="vazio">&lt;Nenhuma comanda ligada a esta nota&gt;</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div className="rolagem nfe-cmd-itens">
                    <table className="grade">
                      <thead><tr><th>Produto</th><th>Qtde</th><th>Unitário</th><th>Total</th></tr></thead>
                      <tbody>
                        {comandaItens.map((i) => <tr key={i.id}><td>{i.descricao_generica}</td><td className="n">{fmtBr(i.new_qtde, 3)}</td><td className="n">{fmtBr(i.preco, 2, 3)}</td><td className="n">{fmtBr(i.vr_item, 2, 3)}</td></tr>)}
                        {comandaItens.length === 0 && <tr className="semlinha"><td colSpan={4} className="vazio">&lt;Sem itens&gt;</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
                </Modal>
              )}
            </div>
          )}

          {aba === 'cfg' && cfg && (
            <div className="nfe-cfg nfe-cfg2">
              <div className="cf2-barra">
                <div className="cf2-tabs" role="tablist">{CFG_TABS.map(([r], i) => <button key={r} role="tab" aria-selected={cfgTab === i} className={cfgTab === i ? 'on' : ''} onClick={() => setCfgTab(i)}>{r}</button>)}</div>
                <span className={`cf2-estado${Object.keys(cfgDraft).length ? ' sujo' : ''}`}>{Object.keys(cfgDraft).length ? '● Alterações não gravadas' : '✔ Tudo gravado'}</span>
                <button type="button" className="bt cf2-gravar" disabled={!Object.keys(cfgDraft).length || ocupado} onClick={salvarCfg}>✔ Gravar</button>
                <button type="button" className="bt" disabled={!Object.keys(cfgDraft).length} onClick={() => setCfgDraft({})}>Desfazer</button>
              </div>
              {cfgTab === CFG_NFE && (() => {
                const amb = Number(cfgDraft.nfe_configuracoes_webservice_ambiente ?? cfg.nfe_configuracoes_webservice_ambiente) === 1 ? 1 : 2;
                const mudou = cfgDraft.nfe_configuracoes_webservice_ambiente !== undefined;
                return (
                  <div className="amb-escolha" role="radiogroup" aria-label="Ambiente de emissão">
                    <button type="button" role="radio" aria-checked={amb === 2} className={`amb-card hom${amb === 2 ? ' on' : ''}`} onClick={() => escolheAmbiente(2)}>
                      <b>🧪 HOMOLOGAÇÃO</b><span>Ambiente de testes. As notas não têm valor fiscal.</span>
                    </button>
                    <button type="button" role="radio" aria-checked={amb === 1} className={`amb-card prod${amb === 1 ? ' on' : ''}`} onClick={() => escolheAmbiente(1)}>
                      <b>🔴 PRODUÇÃO</b><span>Notas reais, autorizadas na SEFAZ, com valor fiscal.</span>
                    </button>
                    {mudou && <p className="amb-aviso">Ambiente alterado — clique em <b>Gravar</b> (acima) para valer.</p>}
                  </div>
                );
              })()}
              <div className="nfe-cfg-form">
                {CFG_TABS[cfgTab][1].map(([k, r, larg = 1, extra]) => {
                  const val = cfgDraft[k] ?? (k === 'email_senha' ? '' : cfg[k]) ?? '';
                  const set = (x) => setCfgDraft({ ...cfgDraft, [k]: x });
                  return (
                    <label key={k} className="nfe-campo" style={{ gridColumn: `span ${larg}` }}><span>{r}</span>
                      {Array.isArray(extra) ? (
                        <select value={String(val)} onChange={(e) => set(e.target.value)}>{extra.map((o) => { const [a, b] = o.split('|'); return <option key={o} value={a}>{b ?? a}</option>; })}</select>
                      ) : <input type={extra === 'date' ? 'date' : extra === 'senha' ? 'password' : extra === 'num' ? 'number' : 'text'} value={extra === 'date' ? String(val).slice(0, 10) : val} onChange={(e) => set(e.target.value)} />}
                    </label>
                  );
                })}
                {cfgTab === CFG_CERT && (
                  <div className="nfe-api nfe-cert">
                    <b>Certificado A1 e cadastro da empresa na API de NF-e</b>
                    <div className={`nfe-cert-st ${cert?.situacao ?? ''}`}>
                      {!cert && 'Consultando a API…'}
                      {cert && (<><strong>{{ ok: '✔ Pronto para emitir', sem_certificado: '⚠ Sem certificado A1 ativo', sem_empresa: '⚠ Empresa não cadastrada na API', sem_token: '✖ Token não configurado', api_fora: '✖ API inacessível', sem_cnpj: '⚠ CNPJ não informado', a3_offline: '✖ Agente A3 OFFLINE', erro: '✖ Erro' }[cert.situacao] ?? cert.situacao}</strong> — {cert.mensagem}</>)}
                      {cert?.empresa && <small>Empresa na API: {cert.empresa.razaoSocial} · CNPJ {cert.empresa.cnpj} · ambiente padrão {cert.empresa.ambientePadrao === 1 ? 'produção' : 'homologação'}</small>}
                    </div>
                    <div className="nfe-cert-form">
                      <label className="nfe-campo"><span>Arquivo do certificado A1 (.pfx / .p12)</span><input type="file" accept=".pfx,.p12" onChange={escolheArquivo} /></label>
                      <label className="nfe-campo"><span>Senha do certificado</span><input type="password" autoComplete="new-password" value={certSenha} onChange={(e) => setCertSenha(e.target.value)} /></label>
                      <button type="button" className="bt" disabled={ocupado || !certArq || !certSenha || Object.keys(cfgDraft).length > 0} title={Object.keys(cfgDraft).length ? 'Grave as configurações antes de enviar' : ''} onClick={enviarCert}>Enviar certificado</button>
                      <button type="button" className="bt" disabled={ocupado} onClick={carregarCert}>Atualizar status</button>
                    </div>
                    <small>Cadastra a empresa com os dados da aba Empresa e envia o A1 numa única chamada; certificado inválido não cria nada. Reenviar atualiza.</small>
                    <b className="nfe-a3-t">Certificado A3 (token/cartão) — assinatura pelo agente da máquina do token</b>
                    <div className={`nfe-a3-st ${cert?.a3?.certificadoId ? (cert.a3.online === true ? 'on' : cert.a3.online === false ? 'off' : 'nd') : 'nd'}`}>
                      <span className="led" />
                      {!cert?.a3?.certificadoId && <span>Nenhum A3 cadastrado neste sistema.</span>}
                      {cert?.a3?.certificadoId && <span><strong>{cert.a3.online === true ? 'Agente ONLINE' : cert.a3.online === false ? 'Agente OFFLINE' : 'Estado do agente desconhecido'}</strong>{cert.a3.nomeAgente ? ` · ${cert.a3.nomeAgente}` : ''}{cert.a3.ultimoContato ? ` · último contato ${String(cert.a3.ultimoContato).replace('T', ' ').slice(0, 19)}` : ''}{cert.a3.erro ? ` · ${cert.a3.erro}` : ''} <small>(certificado {cert.a3.certificadoId})</small></span>}
                      {cert?.a3?.agenteId && <button type="button" className="bt" disabled={ocupado} onClick={revogarA3}>Revogar agente</button>}
                    </div>
                    <div className="nfe-cert-form a3">
                      <label className="nfe-campo"><span>Certificado PÚBLICO do A3 (.cer — nunca .pfx nem PIN)</span><input type="file" accept=".cer,.crt,.pem" onChange={escolheA3} /></label>
                      <label className="nfe-campo"><span>Descrição</span><input value={a3Desc} onChange={(e) => setA3Desc(e.target.value)} placeholder="Ex.: A3 LEVPAO 2026" /></label>
                      <label className="nfe-campo"><span>Nome do agente (máquina do token)</span><input value={a3Agente} onChange={(e) => setA3Agente(e.target.value)} placeholder="Ex.: PC-FISCAL" /></label>
                      <button type="button" className="bt" disabled={ocupado || !a3Arq || !a3Desc.trim() || !a3Agente.trim() || Object.keys(cfgDraft).length > 0} onClick={cadastrarA3}>Cadastrar A3</button>
                    </div>
                    {!cert?.a3?.certificadoId && (
                      <div className="nfe-cert-form id">
                        <label className="nfe-campo"><span>Já cadastrou o A3 antes (pelo painel)? Informe o id do certificado</span><input value={a3Id} onChange={(e) => setA3Id(e.target.value)} placeholder="GUID do certificado" /></label>
                        <button type="button" className="bt" disabled={ocupado || !a3Id.trim()} onClick={salvarA3Id}>Vincular</button>
                      </div>
                    )}
                    <details className="cf2-ajuda"><summary>Como parear o agente A3</summary><small>Pareamento (na máquina do token, uma vez): <code>NFeAgenteA3 configurar</code> e depois <code>NFeAgenteA3 instalar</code>; o PIN fica cifrado na máquina e nunca vai para a API nem para este sistema. A máquina precisa estar ligada, com o token plugado e o agente rodando em toda emissão; com o agente offline a nota continua PENDENTE e nenhum número é consumido. Cada certificado tem um único agente; cadastrar de novo revoga os anteriores; renovar o certificado exige novo cadastro e pareamento.</small></details>
                  </div>
                )}
                {cfgTab === CFG_NFE && (
                  <div className="nfe-api nfe-danfe">
                    <b>DANFE — orientação e logo</b>
                    <div className="dnf-orient" role="radiogroup" aria-label="Orientação do DANFE">
                      {[['retrato', '▯ Retrato'], ['paisagem', '▭ Paisagem']].map(([o, r]) => (
                        <button key={o} type="button" role="radio" aria-checked={(danfeCfg?.orientacao ?? 'retrato') === o} className={`dnf-op${(danfeCfg?.orientacao ?? 'retrato') === o ? ' on' : ''}`} disabled={ocupado || !danfeCfg} onClick={() => orientacaoDanfe(o)}>{r}</button>
                      ))}
                    </div>
                    <div className="dnf-logo">
                      {danfeCfg?.logoNome ? <img key={logoV} src={`/api/nfe/danfe-logo?v=${logoV}`} alt="Logo da empresa" /> : <span className="dnf-sem">Sem logo</span>}
                      <label className="bt dnf-up">{danfeCfg?.logoNome ? 'Trocar logo' : 'Enviar logo'}<input type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" hidden disabled={ocupado} onChange={escolheLogo} /></label>
                      {danfeCfg?.logoNome && <button type="button" className="bt" disabled={ocupado} onClick={tiraLogo}>Remover</button>}
                    </div>
                    <div className="dnf-diag">
                      <button type="button" className="bt" disabled={ocupado} onClick={() => acao(async () => { const r = await api.get('/nfe/danfe-logo-diagnostico'); setDiagLogo(JSON.stringify(r, null, 2)); })}>🔎 Diagnóstico do logo</button>
                      {diagLogo && <><button type="button" className="bt" onClick={() => copiaTexto(diagLogo).then(() => notificar('ok', 'Diagnóstico copiado.'))}>📋 Copiar</button><pre className="nfe-resp">{diagLogo}</pre></>}
                    </div>
                    <small>A orientação vale para as próximas notas e para os DANFEs baixados. O logo (PNG/JPG, até 1 MB) é enviado à API de NF-e e aparece no DANFE. {danfeCfg?.apiTemLogo === true ? '✔ A API confirma que a empresa tem logo.' : danfeCfg?.apiTemLogo === false ? '⚠ A API informa que a empresa NÃO tem logo — envie novamente.' : ''}</small>
                  </div>
                )}
                {cfgTab === CFG_NFE && (
                  <div className="nfe-api">
                    <b>API de NF-e</b>
                    <span>URL: {cfg.api?.url}</span>
                    <span className={cfg.api?.configurada ? 'ok' : 'erro'}>{cfg.api?.configurada ? 'Token configurado (NFE_API_TOKEN)' : 'Token NÃO configurado — defina NFE_API_TOKEN no server/.env'}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {aba === 'resp' && (
            <div className="nfe-resp-aba">
              <b>Última requisição/resposta da API</b>
              <button type="button" className="bt" disabled={!resposta} onClick={() => copiaTexto(resposta).then(() => notificar('ok', 'Requisição e resposta copiadas.'), () => notificar('erro', 'Não foi possível copiar.'))}>📋 Copiar tudo</button>
              <pre className="nfe-resp">{resposta || '(nenhuma autorização nesta sessão)'}</pre>
            </div>
          )}
        </div>
      </div>

      {a3Token && (
        <Modal titulo="Token do agente A3 — anote agora" onFechar={() => setA3Token(null)}>
          <div className="nfe-entrada">
            {a3Token.aviso && <p>{a3Token.aviso}</p>}
            {a3Token.token && (<>
              <p>Este token <b>não será mostrado de novo</b> (a API guarda só o hash) e <b>não é gravado</b> neste sistema. Use-o na máquina <b>{a3Token.agente}</b> ao rodar <code>NFeAgenteA3 configurar</code>.</p>
              <textarea readOnly rows={3} value={a3Token.token} onFocus={(e) => e.target.select()} />
              <div className="rodape-modal"><button type="button" className="bt" onClick={() => navigator.clipboard?.writeText(a3Token.token).catch(() => {})}>Copiar</button><button type="button" className="bt" onClick={() => setA3Token(null)}>Já anotei</button></div>
            </>)}
          </div>
        </Modal>
      )}
      {fiscal && <NfeFiscal nota={nota} eventos={eventos} aba={fiscal} ambiente={cfg?.nfe_configuracoes_webservice_ambiente} notificar={notificar} setLog={setLog}
        onFechar={() => setFiscal(null)} onAjustou={(id) => filtrar(true, id)} onMudou={async (idNovo) => { if (idNovo) { setF((x) => ({ ...x, st: { ...x.st, PENDENTE: true }, nfe1: '', nfe2: '' })); await filtrar(false); setFoco(idNovo); } else await filtrar(true); }} />}
      {emailEnvio && <EnvioEmail ids={emailEnvio.ids} destino={emailEnvio.destino} onFechar={() => setEmailEnvio(null)}
        onEnviado={async (r) => { setLog(r.resultados.map((x) => x.log)); if (r.enviadas) notificar('ok', `${r.enviadas} e-mail(s) enviado(s).`); await filtrar(true); }} />}
      {dialogo && <Entrada {...dialogo} onOk={dialogo.ok} onFechar={() => setDialogo(null)} />}
      {confirma && <Confirma texto={confirma.texto} onSim={confirma.ok} onFechar={() => setConfirma(null)} />}
    </div>
  );
}
