import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { assinaUnidade, publicaUnidade, unidadeSelecionada } from '../lib/unidadeSel.js';
import { api } from '../api.js';
import Calendario from '../components/Calendario.jsx';
import { BuscaProduto, Modal } from '../components/ui.jsx';
import { aplicaConversao, aplicaProduto, corSuave, SUAVES, derivados, passaFiltro, rodape } from '../lib/faturamento.js';
import { comandaTexto, demonstrativoTexto } from '../lib/print.js';
import { imprimirDocumento, temDestino } from '../lib/impressora.js';
import { brData, fmtQtde, hoje } from '../lib/rules.js';
import { Pergunta, Toast } from '../components/toast.jsx';
import { Busca, useBusca } from '../components/cad.jsx';
import { Campo, Pilula } from '../components/ItemForm.jsx';

const fmt = (n, min, max) => Number(n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });
const f3 = (n) => fmt(n, 3, 3);
const f2 = (n) => fmt(n, 2, 2);
const moeda = (n) => `R$ ${fmt(n, 2, 3)}`;
const hhmm = (h) => String(h ?? '').slice(0, 5);
const verdadeiro = (v) => v === 'True' || v === true;
const TIPOS = [['DIARIO', 'Diário'], ['SEMANAL', 'Semanal'], ['QUINZENAL', 'Quinzenal'], ['MENSAL', 'Mensal'], ['SEGUNDAS E QUINTAS', 'Segundas e Quintas']];
const EDITAVEIS = ['produto_codigo', 'produto_descricao_expedicao', 'qtde_original', 'qtde_alterada', 'produto_preco', 'produto_preco_cada',
  'conversao_produto_codigo', 'conversao_produto_descricao', 'conversao_produto_qtde', 'conversao_produto_preco', 'conversao_produto_preco_cada',
  'obs', 'quitado_manualmente', 'cobranca_cancelada', 'cobrado_obs'];
const LEGENDA = [
  ['#008000', 'Liquidado'], ['#ffff00', 'Descontos'], ['#f00', 'Não cobrado'], ['#00f', 'Quitado manualmente'],
  ['#ff8000', 'Pendente'], ['#808080', 'Ítem cancelado'], ['#00ffff', 'Cobrança cancelada'],
];


const B_UNI = ['unidade_nome', 'cliente_razao_social', 'tipo_faturamento'];
/** Código de produto com busca ao sair do campo; vazio ou "0" abre a janela de localizar produto. */
function CodigoProduto({ valor, onMudar, onResolver, className, style }) {
  return (
    <input className={className} style={style} value={valor ?? ''} onChange={(e) => onMudar(e.target.value)}
      onBlur={(e) => onResolver(e.target.value.trim())} onKeyDown={(e) => { if (e.key === 'Enter') onResolver(e.currentTarget.value.trim()); }} />
  );
}

function Num({ valor, onMudar, formato, somenteLeitura, className = '' }) {
  const [texto, setTexto] = useState(null); // texto digitado enquanto o campo está em foco
  const mostrado = texto ?? (valor === null || valor === undefined || valor === '' ? '' : formato(valor));
  return (
    <input className={`if-n ${className}`} value={mostrado} readOnly={somenteLeitura} tabIndex={somenteLeitura ? -1 : undefined}
      onFocus={(e) => { if (!somenteLeitura) { setTexto(valor === null || valor === undefined ? '' : String(valor).replace('.', ',')); setTimeout(() => e.target.select(), 0); } }}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        if (texto === null) return;
        const n = Number(String(texto).replace(/\./g, '').replace(',', '.'));
        setTexto(null);
        if (texto.trim() !== '' && Number.isFinite(n)) onMudar(n); else if (texto.trim() === '') onMudar(0);
      }} />
  );
}

/** Aba "Edição": formulário do item focado (campos do dsprr), em cartões. */
function Edicao({ linha, draft, mudar, resolver, comandas, onExcluirComanda, onSalvar, onDesfazer, ocupado, mudarLinha, setMudarLinha }) {
  const v = { ...linha, ...draft, ...derivados({ ...linha, ...draft }) };
  const sujo = Object.keys(draft).length > 0;
  const [selCmd, setSelCmd] = useState(null);
  const justificar = verdadeiro(v.quitado_manualmente) || verdadeiro(v.cobranca_cancelada);
  const q = (n) => fmt(n, 0, 3);
  return (
    <div className="fe if">
      <header className="if-topo">
        <span className="if-badge alt">✎ Item da programação</span>
        <span className="if-ctx">{v.nome}</span>
        <span className="if-ctx">{brData(v.data)} · {hhmm(v.hora)}</span>
        {sujo && <span className="if-sujo">● não salvo</span>}
        <span className="if-dicas"><kbd>Alt</kbd>+<kbd>S</kbd> salva</span>
      </header>
      <div className="fe-corpo">
        <div className="fe-col">
          <section className="cv2-card">
            <h4>Produto / mercadoria</h4>
            <div className="cv2-lin cv2-prod">
              <Campo rotulo="Código" className="if-cod"><CodigoProduto valor={v.produto_codigo} onMudar={(t) => mudar('produto_codigo', t)} onResolver={(c) => resolver('produto', c)} /></Campo>
              <Campo rotulo="Descrição do produto"><input value={v.produto_descricao_expedicao ?? ''} onChange={(e) => mudar('produto_descricao_expedicao', e.target.value)} /></Campo>
            </div>
            <div className="fe-nums">
              <Campo rotulo="Qtde"><Num valor={v.qtde_original} onMudar={(n) => mudar('qtde_original', n)} formato={q} /></Campo>
              <Campo rotulo="Extra"><Num valor={v.qtde_alterada} onMudar={(n) => mudar('qtde_alterada', n)} formato={q} /></Campo>
              <Campo rotulo="Preço unitário"><Num valor={v.produto_preco} onMudar={(n) => mudar('produto_preco', n)} formato={moeda} /></Campo>
              <Campo rotulo="Cada"><Num valor={v.produto_preco_cada} onMudar={(n) => mudar('produto_preco_cada', n)} formato={q} /></Campo>
              <Campo rotulo="Preço total" className="if-total"><Num somenteLeitura valor={v.preco_total} formato={moeda} /></Campo>
            </div>
          </section>

          <section className="cv2-card cv2-destino">
            <h4>Cobrança — cobrar como</h4>
            <div className="cv2-lin cv2-prod">
              <Campo rotulo="Código" className="if-cod if-destaque"><CodigoProduto valor={v.conversao_produto_codigo} onMudar={(t) => mudar('conversao_produto_codigo', t)} onResolver={(c) => resolver('conversao', c)} /></Campo>
              <Campo rotulo="Descrição do produto" className="if-destaque"><input value={v.conversao_produto_descricao ?? ''} onChange={(e) => mudar('conversao_produto_descricao', e.target.value)} /></Campo>
            </div>
            <div className="fe-nums">
              <Campo rotulo="Qtde"><Num valor={v.conversao_produto_qtde} onMudar={(n) => mudar('conversao_produto_qtde', n)} formato={q} /></Campo>
              <Campo rotulo="Preço unitário"><Num valor={v.conversao_produto_preco} onMudar={(n) => mudar('conversao_produto_preco', n)} formato={moeda} /></Campo>
              <Campo rotulo="Cada"><Num valor={v.conversao_produto_preco_cada} onMudar={(n) => mudar('conversao_produto_preco_cada', n)} formato={q} /></Campo>
              <Campo rotulo="Preço total" className="if-total"><Num somenteLeitura valor={v.conversao_produto_valor} formato={moeda} /></Campo>
            </div>
          </section>

          <section className="fe-stats" aria-label="Quantidades">
            {[['Qtde total', v.qtde, ''], ['Cobrado', v.qtde_cobrado, 'ok'], ['Pendente', v.qtde_pendente, Number(v.qtde_pendente) > 0 ? 'pend' : ''], ['Quitada', v.qtde_quitado, '']].map(([r, n, c]) => (
              <div key={r} className={`fe-stat ${c}`}><span>{r}</span><b>{q(n)}</b></div>
            ))}
          </section>
        </div>

        <aside className="fe-lado">
          <Campo rotulo="Observações"><textarea value={v.obs ?? ''} onChange={(e) => mudar('obs', e.target.value)} /></Campo>
          <div className="fe-pilulas">
            <Pilula marcado={verdadeiro(v.quitado_manualmente)} onChange={(e) => mudar('quitado_manualmente', e.target.checked ? 'True' : 'False')}>Ítem quitado manualmente</Pilula>
            <Pilula marcado={verdadeiro(v.cobranca_cancelada)} onChange={(e) => mudar('cobranca_cancelada', e.target.checked ? 'True' : 'False')}>Cobrança cancelada</Pilula>
            <Pilula marcado={mudarLinha} onChange={(e) => setMudarLinha(e.target.checked)}>Ir p/ a próxima linha ao salvar</Pilula>
          </div>
          {justificar && <Campo rotulo="Justificativa"><textarea value={v.cobrado_obs ?? ''} onChange={(e) => mudar('cobrado_obs', e.target.value)} /></Campo>}
          <div className="fe-cmds">
            <div className="fe-cmds-t"><b>Comandas deste item</b>
              <button type="button" className="fe-menos" disabled={!selCmd || ocupado} title="Excluir esta linha da lista de comandas do item" onClick={() => onExcluirComanda(selCmd, () => setSelCmd(null))}>🗑 Excluir linha</button></div>
            <div className="rolagem fe-cmds-lista">
              <table className="grade">
                <thead><tr><th>Comanda</th><th>Emissão</th><th>Qtde</th><th>Status</th></tr></thead>
                <tbody>
                  {comandas.map((c) => (
                    <tr key={c.id} className={`clicavel${selCmd === c.id ? ' sel' : ''}`} onClick={() => setSelCmd(c.id)}>
                      <td>{c.id_comanda}</td><td>{brData(c.data_emissao)}</td><td className="n">{fmtQtde(c.qtde)}</td><td>{c.status}</td>
                    </tr>
                  ))}
                  {comandas.length === 0 && <tr className="semlinha"><td colSpan={4} className="vazio">Nenhuma comanda</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="cv2-acoes fe-botoes">
            <button type="button" className="cv2-bt prim" accessKey="s" disabled={!sujo || ocupado} onClick={onSalvar}>✔ Salvar</button>
            <button type="button" className="cv2-bt" disabled={!sujo || ocupado} onClick={onDesfazer}>Desfazer</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Painel direito: comanda recém-gerada (pnlComanda). */
function PainelComanda({ id, saida, onNfe, condicao, onFechar, onExcluida, onImpressa, unidadeNome, perguntar, aviso }) {
  const [dados, setDados] = useState(null);
  const [itemSel, setItemSel] = useState(null);
  const [detalhes, setDetalhes] = useState([]);
  const carregar = useCallback(async () => {
    const d = await api.get(`/faturamento/comandas/${id}`);
    setDados(d);
    setItemSel((s) => (d.itens.some((i) => i.id === s) ? s : d.itens[0]?.id ?? null));
  }, [id]);
  useEffect(() => { carregar().catch((e) => aviso('erro', e.message)); }, [carregar]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!itemSel) { setDetalhes([]); return; }
    api.get(`/faturamento/comandas/itens/${itemSel}/detalhes`).then(setDetalhes).catch(() => setDetalhes([]));
  }, [itemSel]);
  if (!dados) return <aside className="fat-cmd" />;
  const { comanda, itens, mercadorias } = dados;
  const totItens = itens.reduce((s, i) => s + Number(i.vr_item || 0), 0);
  const totQtde = itens.reduce((s, i) => s + Number(i.new_qtde || 0), 0);
  const totDet = detalhes.reduce((s, i) => s + Number(i.vr_item || 0), 0);
  const totDetQ = detalhes.reduce((s, i) => s + Number(i.xqtde || 0), 0);

  const imprimirAgora = async () => { await imprimirDocumento('comanda', { ...comandaTexto(comanda, itens, mercadorias, unidadeNome), semNavegador: true }, aviso); onImpressa(); }; // pelo agente de impressão (ou navegador, se não houver destino)
  const imprimir = () => perguntar({ texto: temDestino('comanda') ? 'Imprimir a comanda na impressora?' : 'Imprimir a comanda?', opcoes: [{ rotulo: 'Sim', acao: imprimirAgora }, { rotulo: 'Não' }] });
  const excluir = () => perguntar({
    texto: 'Deseja eliminar a comanda completamente?',
    opcoes: [{ rotulo: 'Sim', acao: async () => {
      try { await api.del(`/faturamento/comandas/${id}`); aviso('ok', 'Comanda eliminada!!!'); onExcluida(); } catch (e) { aviso('erro', e.message); }
    } }, { rotulo: 'Não' }],
  });

  const gerarNfe = async () => {
    if (itens.length === 0) { aviso('erro', 'Não há itens para emissão da NF.'); return; }
    try {
      const r = await api.post(`/faturamento/comandas/${id}/nfe`, { data_saida: saida });
      aviso('ok', `NF gerada (controle ${r.id}).`); onFechar(); onNfe?.();
    } catch (e) { aviso('erro', e.message); }
  };

  return (
    <aside className="fat-cmd">
      <div className="fat-cmd-topo">
        <span className="fat-cmd-rot">Comanda:</span> <b className="fat-cmd-id">{comanda.id}</b>
        <b className="fat-cmd-status">{comanda.status}</b>
        <span className="fat-nav">
          <button type="button" disabled>◀</button><button type="button" disabled>▶</button><button type="button" title="Atualizar" onClick={() => carregar()}>↻</button>
        </span>
        <p className="fat-cond">{condicao}</p>
      </div>
      <div className="fat-cmd-botoes">
        <button type="button" className="bt fat-cb" onClick={imprimir}><span className="fat-ic">🖨</span>Imprimir</button>
        <button type="button" className="bt fat-cb" onClick={excluir}><span className="fat-ic x">✖</span>Excluir</button>
        <button type="button" className="bt fat-cb" onClick={gerarNfe}><span className="fat-ic">📄</span>Gerar NFe</button>
        <button type="button" className="bt fat-cb porta" title="Fechar painel da comanda" onClick={onFechar}>🚪</button>
      </div>
      <div className="rolagem fat-g1">
        <table className="grade">
          <thead><tr><th className="ind" /><th>Comanda</th><th>Status</th><th>Emissão</th><th>Usuário</th><th>Valor</th></tr></thead>
          <tbody><tr className="sel"><td className="ind">▶</td><td>{comanda.id}</td><td>{comanda.status}</td><td>{brData(comanda.data_emissao)}</td><td>{comanda.usuario}</td><td className="n">R$ {fmt(comanda.vr_comanda, 3, 3)}</td></tr></tbody>
        </table>
      </div>
      <div className="rolagem fat-g2">
        <table className="grade">
          <thead><tr><th className="ind" /><th>Descrição da mercadoria</th><th>preco_cada</th><th>Qtde</th><th>Preço</th><th>Total</th></tr></thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id} className={`clicavel${itemSel === i.id ? ' sel' : ''}`} onClick={() => setItemSel(i.id)}>
                <td className="ind">{itemSel === i.id ? '▶' : ''}</td><td>{i.descricao_generica}</td><td className="n">{fmt(i.preco_cada, 0, 3)}</td>
                <td className="n">{fmtQtde(i.new_qtde)}</td><td className="n">{f3(i.preco)}</td><td className="n">{f3(i.vr_item)}</td>
              </tr>
            ))}
            {itens.length === 0 && <tr className="semlinha"><td colSpan={6} className="vazio">&lt;Não há informações a exibir&gt;</td></tr>}
          </tbody>
          <tfoot><tr><td /><td /><td /><td className="n">{fmtQtde(totQtde)}</td><td /><td className="n">{f3(totItens)}</td></tr></tfoot>
        </table>
      </div>
      <div className="fat-faixa azul">Detalhes de cada item</div>
      <div className="rolagem fat-g3">
        <table className="grade">
          <thead><tr><th className="ind" /><th>Data</th><th>Hora</th><th>Produto</th><th>Qtde</th><th>Unitário</th><th>Total</th></tr></thead>
          <tbody>
            {detalhes.map((d) => (
              <tr key={d.id}><td className="ind" /><td>{brData(d.data)}</td><td>{hhmm(d.hora)}</td><td>{d.descricao_generica}</td><td className="n">{fmtQtde(d.xqtde)}</td><td className="n">{f3(d.preco)}</td><td className="n">{f3(d.vr_item)}</td></tr>
            ))}
            {detalhes.length === 0 && <tr className="semlinha"><td colSpan={7} className="vazio">&lt;Comanda sem detalhes&gt;</td></tr>}
          </tbody>
          <tfoot><tr><td /><td /><td /><td /><td className="n">{fmtQtde(totDetQ)}</td><td /><td className="n">{f3(totDet)}</td></tr></tfoot>
        </table>
      </div>
      <div className="fat-faixa vermelha">Mercadorias constantes nesta comanda</div>
      <div className="rolagem fat-g4">
        <table className="grade">
          <thead><tr><th className="ind" /><th>Data</th><th>Hora</th><th>Descrição da mercadoria</th><th>qtde</th></tr></thead>
          <tbody>
            {mercadorias.map((m) => <tr key={m.id}><td className="ind" /><td>{brData(m.data)}</td><td>{hhmm(m.hora)}</td><td>{m.descricao}</td><td className="n">{fmtQtde(m.qtde)}</td></tr>)}
            {mercadorias.length === 0 && <tr className="semlinha"><td colSpan={5} className="vazio">&lt;Não há mercadorias nesta comanda&gt;</td></tr>}
          </tbody>
          <tfoot><tr><td /><td /><td /><td /><td className="n">{fmtQtde(mercadorias.reduce((s, m) => s + Number(m.qtde || 0), 0))}</td></tr></tfoot>
        </table>
      </div>
    </aside>
  );
}

export default function Faturamento({ onFechar }) {
  const [aba, setAba] = useState('param'); // 'param' | 'edicao'
  const [recolhido, setRecolhido] = useState(false); // esconde calendários/unidades/filtros e deixa só as ações, para a grade ganhar espaço
  const [d1, setD1] = useState(hoje());
  const [d2, setD2] = useState(hoje());
  const [emissao, setEmissao] = useState(hoje());
  const [cbCliente, setCbCliente] = useState(true);
  const [cbDatas, setCbDatas] = useState(true);
  const [rgMerc, setRgMerc] = useState(2);
  const [rgTipo, setRgTipo] = useState(2);
  const [rgStatus, setRgStatus] = useState(0);
  const [mudarLinha, setMudarLinha] = useState(false);
  const [unidades, setUnidades] = useState([]);
  const buscaUni = useBusca(unidades, B_UNI);
  const [uniId, setUniId] = useState(null);
  const [uniDraft, setUniDraft] = useState({});
  const [linhas, setLinhas] = useState(null); // null = grade fechada (prr.close)
  const [foco, setFoco] = useState(null);
  const [marcados, setMarcados] = useState(() => new Set());
  const [draft, setDraft] = useState({});
  const [comandas, setComandas] = useState([]);
  const [painel, setPainel] = useState(null); // id da comanda aberta
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [pergunta, setPergunta] = useState(null);
  const [busca, setBusca] = useState(null); // 'produto' | 'conversao'
  const [mostrarValor, setMostrarValor] = useState(true);
  const ancora = useRef(null);
  const notificar = useCallback((tipo, m) => setAviso({ tipo, m }), []);
  const perguntar = useCallback((p) => setPergunta(p), []);

  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(null), 9000);
    return () => clearTimeout(t);
  }, [aviso]);
  useEffect(() => {
    api.get('/faturamento/unidades').then((u) => { setUnidades(u); setUniId((x) => x ?? (u.some((v) => v.id === unidadeSelecionada()) ? unidadeSelecionada() : u[0]?.id ?? null)); }).catch((e) => notificar('erro', e.message));
    api.get('/faturamento/config').then((c) => setMostrarValor(c.mostrarValor)).catch(() => {});
  }, [notificar]);

  const unidade = unidades.find((u) => u.id === uniId) ?? null;
  const uniV = unidade ? { ...unidade, ...uniDraft } : null;
  const visiveis = useMemo(() => (linhas ?? []).filter((r) => passaFiltro(r, { mercadoria: rgMerc, tipo: rgTipo, status: rgStatus })), [linhas, rgMerc, rgTipo, rgStatus]);
  const totais = useMemo(() => rodape(visiveis), [visiveis]);
  const atual = visiveis.find((r) => r.id === foco) ?? null;
  const sujo = Object.keys(draft).length > 0;

  // ---- bAtualizarClick
  const atualizar = useCallback(async (manterFoco) => {
    if (!uniId && cbCliente) { notificar('erro', 'Selecione uma unidade ou desmarque "Conectar cliente".'); return; }
    const q = `inicio=${d1 <= d2 ? d1 : d2}&fim=${d1 <= d2 ? d2 : d1}${cbCliente ? `&unidade=${uniId}` : ''}`;
    setOcupado(true);
    try {
      const rows = await api.get(`/faturamento/itens?${q}`);
      setLinhas(rows); setMarcados(new Set()); setDraft({});
      setFoco((f) => (manterFoco && rows.some((r) => r.id === f) ? f : rows[0]?.id ?? null));
    } catch (e) { notificar('erro', e.message); } finally { setOcupado(false); }
  }, [uniId, cbCliente, d1, d2, notificar]);
  // comanda eliminada no Controle de comandas, NFe apagada/emitida: a lista do faturamento acompanha
  const recarga = useRef(null); recarga.current = () => { if (linhas !== null) atualizar(true); };
  useEffect(() => {
    let t;
    const aoAlterar = (ev) => { if (!/^\/(comandas|nfe|faturamento\/comandas)/.test(ev.detail?.path ?? '')) return; clearTimeout(t); t = setTimeout(() => recarga.current?.(), 350); };
    window.addEventListener('nfe-alterada', aoAlterar);
    return () => { window.removeEventListener('nfe-alterada', aoAlterar); clearTimeout(t); };
  }, []);
  // o foco precisa estar entre as linhas visíveis (filtro dos radios)
  useEffect(() => { if (linhas && !visiveis.some((r) => r.id === foco)) setFoco(visiveis[0]?.id ?? null); }, [visiveis]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!foco) { setComandas([]); return; }
    api.get(`/faturamento/diaria/${foco}/comandas`).then(setComandas).catch(() => setComandas([]));
  }, [foco, linhas]);

  // ---- calendários (d1Click / d2Click)
  const clicouD1 = (v) => { setD1(v); if (!cbDatas) { setD2(v); setEmissao(v); } };
  const clicouD2 = (v) => { setD2(v); if (!cbDatas) setD1(v); };

  // ---- lista de unidades (gridCliCellClick: trocar de unidade fecha a grade)
  const mudarUnidade = (id) => {
    const trocar = () => { setUniId(id); setUniDraft({}); setLinhas(null); setFoco(null); setDraft({}); publicaUnidade(id, 'fat'); };
    if (id === uniId) return;
    if (Object.keys(uniDraft).length) perguntar({ texto: 'Há alterações não gravadas nas informações do cliente. Descartar?', opcoes: [{ rotulo: 'Descartar', acao: trocar }, { rotulo: 'Voltar' }] });
    else trocar();
  };
  // acompanha a unidade escolhida no Controle de comandas (só se não houver edição pendente aqui)
  const seguir = useRef(null);
  seguir.current = (id) => { if (id === uniId || !unidades.some((u) => u.id === id) || Object.keys(uniDraft).length || Object.keys(draft).length) return; setUniId(id); setLinhas(null); setFoco(null); };
  useEffect(() => assinaUnidade((id, o) => { if (o !== 'fat') seguir.current?.(id); }), []);
  // com "Conectar cliente" desligado a grade mistura clientes: a linha em foco define o cliente que as outras telas seguem
  useEffect(() => { const r = (linhas ?? []).find((x) => x.id === foco); if (r?.id_unidade) publicaUnidade(Number(r.id_unidade), 'fat'); }, [foco]); // eslint-disable-line react-hooks/exhaustive-deps
  const gravarUnidade = async () => {
    try {
      await api.put(`/faturamento/unidades/${unidade.id}`, uniDraft);
      setUnidades((us) => us.map((u) => (u.id === unidade.id ? { ...u, ...uniDraft } : u)));
      setUniDraft({}); notificar('ok', 'Informações do cliente gravadas.');
    } catch (e) { notificar('erro', e.message); }
  };

  // ---- seleção da grade
  const clicar = (e, r, i) => {
    const ir = () => {
      setFoco(r.id);
      setMarcados((s) => {
        if (e.shiftKey && ancora.current != null) {
          const [a, b] = [Math.min(ancora.current, i), Math.max(ancora.current, i)];
          return new Set(visiveis.slice(a, b + 1).map((x) => x.id));
        }
        ancora.current = i;
        if (e.ctrlKey || e.metaKey) { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; }
        return new Set([r.id]);
      });
    };
    if (r.id !== foco && sujo) {
      perguntar({ texto: 'Há alterações não salvas neste item. Salvar antes de mudar de linha?', opcoes: [
        { rotulo: 'Salvar', acao: async () => { if (await salvar(false)) ir(); } },
        { rotulo: 'Descartar', acao: () => { setDraft({}); ir(); } }, { rotulo: 'Voltar' }] });
    } else ir();
  };
  // grdRIDblClick: abre a edição; com a edição aberta e alterada, grava e volta para os parâmetros
  const duploClique = async () => {
    if (aba === 'edicao' && sujo) { if (await salvar(false)) setAba('param'); } else setAba('edicao');
  };
  const trocarAba = (nova) => {
    if (nova === aba) return;
    if (aba === 'edicao' && sujo) { setDraft({}); } // pnlEditaExit: prr.cancel
    setAba(nova);
  };

  // ---- edição direta na grade (duplo clique numa célula editável; Enter grava, Esc cancela, Tab vai para a próxima)
  const [cel, setCel] = useState(null); // { id, campo, texto }
  const ORDEM_CEL = ['qtde_original', 'qtde_alterada', 'produto_codigo', 'produto_descricao_expedicao', 'produto_preco', 'conversao_produto_descricao', 'conversao_produto_qtde', 'conversao_produto_preco'];
  const NUM_CEL = new Set(['qtde_original', 'qtde_alterada', 'produto_preco', 'conversao_produto_qtde', 'conversao_produto_preco']);
  const textoCel = (campo, v) => (v === null || v === undefined ? '' : NUM_CEL.has(campo) ? String(v).replace('.', ',') : String(v));
  const iniciarCel = (r, campo) => {
    if (sujo) { notificar('erro', 'Salve ou desfaça a edição aberta na aba Edição antes de editar na grade.'); return; }
    const v = r[campo];
    setFoco(r.id);
    setCel({ id: r.id, campo, texto: textoCel(campo, v) });
  };
  const gravarCel = async (r, campo, texto) => {
    const nulo = String(r[campo] ?? '') === '' || Number(r[campo]) === 0;
    let valor = texto.trim();
    if (NUM_CEL.has(campo)) {
      valor = valor === '' ? 0 : Number(valor.replace(/\./g, '').replace(',', '.'));
      if (!Number.isFinite(valor)) { notificar('erro', 'Valor inválido.'); return false; }
      if (Number(r[campo] ?? 0) === valor || (nulo && valor === 0)) return true;
    } else if (String(r[campo] ?? '') === valor) return true;
    if (campo === 'produto_codigo' && (valor === '' || valor === '0')) { notificar('erro', 'Informe o código do produto.'); return false; }
    setOcupado(true);
    try {
      const novo = await api.put(`/faturamento/diaria/${r.id}`, { [campo]: valor });
      setLinhas((ls) => ls.map((x) => (x.id === novo.id ? { ...x, ...novo } : x)));
      return true;
    } catch (e) { notificar('erro', e.message); return false; } finally { setOcupado(false); }
  };
  const teclaCel = async (e, r) => {
    if (e.key === 'Escape') { setCel(null); return; }
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    e.preventDefault();
    const { campo, texto } = cel;
    if (!(await gravarCel(r, campo, texto))) return;
    if (e.key === 'Tab') {
      const i = ORDEM_CEL.indexOf(campo) + (e.shiftKey ? -1 : 1);
      const prox = ORDEM_CEL[i];
      if (prox) { setCel({ id: r.id, campo: prox, texto: textoCel(prox, r[prox]) }); return; }
    }
    setCel(null);
  };
  // td editável: mostra o input quando a célula está em edição
  const tdEd = (r, campo, conteudo, cls = '') => (
    cel && cel.id === r.id && cel.campo === campo
      ? <td className={`${cls} edit-cel`} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <input autoFocus className={NUM_CEL.has(campo) ? 'n' : ''} value={cel.texto} onChange={(e) => setCel({ ...cel, texto: e.target.value })}
            onFocus={(e) => e.target.select()} onKeyDown={(e) => teclaCel(e, r)} onBlur={() => { if (cel && cel.campo === campo && cel.id === r.id) { const t = cel.texto; setCel(null); gravarCel(r, campo, t); } }} />
        </td>
      : <td className={`${cls} editavel`} title="Duplo clique para editar" onDoubleClick={(e) => { e.stopPropagation(); iniciarCel(r, campo); }}>{conteudo}</td>
  );

  // ---- edição do item (dsprrDataChange)
  const mudar = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const resolver = async (alvo, codigo) => {
    if (!atual) return;
    if (!codigo || codigo === '0') { setBusca(alvo); return; }
    const campo = alvo === 'produto' ? 'produto_codigo' : 'conversao_produto_codigo';
    if (String(atual[campo] ?? '') === codigo && draft[campo] === undefined) return;
    try {
      const p = await api.get(`/produtos/codigo/${encodeURIComponent(codigo)}`);
      setDraft((d) => {
        const f = { ...atual, ...d };
        return { ...d, ...(alvo === 'produto' ? aplicaProduto(p) : aplicaConversao({ ...f, ...derivados(f) }, p)) };
      });
    } catch { notificar('erro', 'Produto não encontrado!'); }
  };
  const salvar = async (mover = true) => {
    if (!atual || !sujo) return true;
    const payload = Object.fromEntries(EDITAVEIS.filter((k) => draft[k] !== undefined).map((k) => [k, draft[k]]));
    setOcupado(true);
    try {
      const novo = await api.put(`/faturamento/diaria/${atual.id}`, payload);
      const idx = visiveis.findIndex((r) => r.id === atual.id);
      const proximo = mover && mudarLinha ? visiveis[idx + 1]?.id : null;
      setLinhas((ls) => ls.map((r) => (r.id === novo.id ? { ...r, ...novo } : r)));
      setDraft({});
      if (proximo) setFoco(proximo);
      return true;
    } catch (e) { notificar('erro', e.message); return false; } finally { setOcupado(false); }
  };
  const excluirComanda = (idDetalhe, limpar) => perguntar({
    texto: 'Excluir esta linha da lista de comandas do item? A quantidade volta a ficar pendente.',
    opcoes: [{ rotulo: 'Sim', acao: async () => {
      try {
        await api.del(`/faturamento/detalhes/${idDetalhe}`);
        limpar();
        const novo = await api.get(`/faturamento/diaria/${foco}`);
        setLinhas((ls) => ls.map((r) => (r.id === novo.id ? { ...r, ...novo } : r)));
        setComandas(await api.get(`/faturamento/diaria/${foco}/comandas`));
      } catch (e) { notificar('erro', e.message); }
    } }, { rotulo: 'Não' }],
  });

  // ---- botões de ação
  const gerarComanda = async () => {
    if (!visiveis.length) return;
    setOcupado(true);
    try {
      const r = await api.post('/faturamento/comandas', { ids: visiveis.map((x) => x.id), unidade: uniId, data_emissao: emissao });
      setPainel(r.id);
      await atualizar(true);
    } catch (e) { notificar('erro', e.message); } finally { setOcupado(false); }
  };
  const demonstrativoAgora = () => imprimirDocumento('comanda', { ...demonstrativoTexto(visiveis, emissao, atual?.unidade_nome ?? visiveis[0]?.unidade_nome), semNavegador: true }, notificar);
  const demonstrativo = () => perguntar({ texto: temDestino('comanda') ? 'Imprimir o demonstrativo na impressora?' : 'Imprimir o demonstrativo?', opcoes: [{ rotulo: 'Sim', acao: demonstrativoAgora }, { rotulo: 'Não' }] });
  const auditoria = () => perguntar({
    texto: `Recalcular as quantidades cobradas/quitadas dos ${visiveis.length} item(ns) da grade a partir das comandas?`,
    opcoes: [{ rotulo: 'Sim', acao: async () => {
      setOcupado(true);
      try {
        await api.post('/faturamento/baixa', { ids: visiveis.map((x) => x.id) });
        await atualizar(true); notificar('ok', 'Auditoria concluída.');
      } catch (e) { notificar('erro', e.message); } finally { setOcupado(false); }
    } }, { rotulo: 'Não' }],
  });

  const condicao = unidade
    ? (unidade.tipo_faturamento === 'DIARIO'
      ? `Este cliente está configurado para fechamento DIARIO ${verdadeiro(unidade.emite_comanda_diaria) ? 'com emissão de comandas diariamente ' : ''}portanto a NF pode ou não ser emitida agora.`
      : `Este cliente está configurado para fechamento ${unidade.tipo_faturamento ?? ''} portanto não imprime NF agora a NF será impressa através do fechamento em "controle de comandas".`)
    : '';
  const temItens = visiveis.length > 0;

  return (
    <div className={`tela fatur${painel ? ' com-painel' : ''}`}>
      <div className="fat-principal">
        <Toast aviso={aviso} />
        <div className="fat-nt">
          <div className="fat-abas" role="tablist">
            <button role="tab" aria-selected={aba === 'edicao'} className={aba === 'edicao' ? 'on' : ''} onClick={() => trocarAba('edicao')}><span>Edição</span></button>
            <button role="tab" aria-selected={aba === 'param'} className={aba === 'param' ? 'on' : ''} onClick={() => trocarAba('param')}><span>Parâmetros</span></button>
            {aba === 'param' && !painel && <button type="button" className="fat-recolhe" onClick={() => setRecolhido((x) => !x)} title="Mostrar ou esconder calendários, unidades e filtros">{recolhido ? '▾ Mostrar filtros' : '▴ Recolher filtros'}</button>}
            <button type="button" className="fat-sair" title="Fechar tela de faturamento" onClick={() => onFechar?.()}>🚪 Sair</button>
          </div>

          <div className={`fat-pagina fp2${recolhido || painel ? ' fp-min' : ''}`} hidden={aba !== 'param'}>
            <div className="fp-linha fp-topo">
              <section className="fp-card fp-per">
                <h4>📅 Período</h4>
                <div className="fat-cals"><Calendario data={d1} onChange={clicouD1} /><Calendario data={d2} onChange={clicouD2} /></div>
                <div className="fp-conecta">
                  <Pilula marcado={cbCliente} onChange={(e) => setCbCliente(e.target.checked)}>Conectar cliente</Pilula>
                  <Pilula marcado={cbDatas} onChange={(e) => setCbDatas(e.target.checked)}>Conectar período</Pilula>
                </div>
              </section>
              <section className="fp-card fp-unis">
                <h4>🏢 Unidades <small>{unidades.length ? `${unidades.length} no período` : ''}</small></h4>
                <div className="busca-lateral"><Busca busca={buscaUni} total={unidades.length} placeholder="Pesquisar unidade/cliente…" /></div>
                <div className="rolagem fp-lista">
                  <table className="grade">
                    <thead><tr><th className="ind" /><th>Unidade <i className="ord">⏶</i></th><th>Faturamento</th><th title="Comanda diária">CM</th></tr></thead>
                    <tbody>
                      {buscaUni.visiveis.map((u) => (
                        <tr key={u.id} className={`clicavel${u.id === uniId ? ' sel' : ''}`} onClick={() => mudarUnidade(u.id)} onDoubleClick={() => { mudarUnidade(u.id); setTimeout(() => atualizar(false), 0); }}>
                          <td className="ind">{u.id === uniId ? '▶' : ''}</td><td>{u.unidade_nome}</td><td>{u.tipo_faturamento}</td>
                          <td className="c"><input type="checkbox" checked={verdadeiro(u.emite_comanda_diaria)} readOnly tabIndex={-1} /></td>
                        </tr>
                      ))}
                      {unidades.length === 0 && <tr className="semlinha"><td colSpan={4} className="vazio">Não há movimento neste período</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="fp-card fp-cli">
                <h4>🧾 Informações do cliente</h4>
                <label className="fp-lb">Tipo de faturamento (Nota Fiscal)</label>
                <select value={uniV?.tipo_faturamento ?? ''} disabled={!unidade} onChange={(e) => setUniDraft((d) => ({ ...d, tipo_faturamento: e.target.value }))}>
                  <option value="" />
                  {TIPOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </select>
                <Pilula marcado={verdadeiro(uniV?.emite_comanda_diaria)} onChange={(e) => unidade && setUniDraft((d) => ({ ...d, emite_comanda_diaria: e.target.checked ? 'True' : 'False' }))}>Com emissão de comanda diária</Pilula>
                <Pilula marcado={verdadeiro(uniV?.quitar_automaticamente)} onChange={(e) => unidade && setUniDraft((d) => ({ ...d, quitar_automaticamente: e.target.checked ? 'True' : 'False' }))}>Quitar automaticamente</Pilula>
                <div className="fp-grava">
                  <button type="button" className="cv2-bt prim" disabled={!Object.keys(uniDraft).length} onClick={gravarUnidade}>✔ Gravar</button>
                  <button type="button" className="cv2-bt" disabled={!Object.keys(uniDraft).length} onClick={() => setUniDraft({})}>✘ Descartar</button>
                </div>
                {unidade && !verdadeiro(uniV.emite_comanda_diaria) && <div className="fp-aviso">Não emitir comanda diária para {unidade.nome}</div>}
              </section>
            </div>

            <div className="fp-linha fp-barra">
              <section className="fp-card fp-filtros">
                <div className="fp-grupo"><span>Produtos</span><div className="seg">{['Mercadorias', 'Pães', 'Todos'].map((r, i) => <label key={r}><input type="radio" name="fat-prod" checked={rgMerc === i} onChange={() => setRgMerc(i)} /><span>{r}</span></label>)}</div></div>
                <div className="fp-grupo"><span>Programação</span><div className="seg">{['Fixas', 'Extras', 'Todas'].map((r, i) => <label key={r}><input type="radio" name="fat-tipo" checked={rgTipo === i} onChange={() => setRgTipo(i)} /><span>{r}</span></label>)}</div></div>
                <div className="fp-grupo"><span>Status</span><div className="seg">{['Pendentes', 'Cobrados', 'Descontos', 'Cancelados', 'Todos'].map((r, i) => <label key={r}><input type="radio" name="fat-stat" checked={rgStatus === i} onChange={() => setRgStatus(i)} /><span>{r}</span></label>)}</div></div>
              </section>
              <section className="fp-card fp-acoes">
                <button type="button" className="fp-atu" disabled={ocupado} onClick={() => atualizar(false)}>🔄 <u>A</u>tualizar</button>
                <label className="fp-saida"><span>Saída</span><input type="date" value={emissao} onChange={(e) => e.target.value && setEmissao(e.target.value)} /></label>
                <div className="fp-bts">
                  <button type="button" className="cv2-bt" disabled={!temItens || ocupado} onClick={gerarComanda}>📝 Gerar comanda</button>
                  <button type="button" className="cv2-bt" disabled={!temItens || ocupado} onClick={demonstrativo}>✅ Demonstrativo</button>
                  <button type="button" className="cv2-bt" disabled={!temItens || ocupado} onClick={auditoria}>🔎 Auditoria</button>
                </div>
              </section>
              <section className="fp-card fp-valor">
                {mostrarValor && <><span className="fp-vr-r">Valor total da comanda / N. Fiscal</span><div className="fp-vr">R$ {fmt(totais.valor, 2, 3)}</div></>}
                <ul className="fat-legenda">
                  {LEGENDA.map(([cor, r]) => <li key={r}><i style={{ background: SUAVES.get(cor)?.[0] ?? cor, boxShadow: `inset 3px 0 0 ${cor}` }} />{r}</li>)}
                </ul>
              </section>
            </div>
          </div>

          <div className="fat-pagina" hidden={aba !== 'edicao'}>
            {atual
              ? <Edicao linha={atual} draft={draft} mudar={mudar} resolver={resolver} comandas={comandas} onExcluirComanda={excluirComanda}
                  onSalvar={() => salvar(true)} onDesfazer={() => setDraft({})} ocupado={ocupado} mudarLinha={mudarLinha} setMudarLinha={setMudarLinha} />
              : <p className="vazio">Selecione uma linha na grade (Atualizar) e use duplo clique para editar.</p>}
          </div>
        </div>

        <div className="rolagem fat-grade">
          <table className="grade fat-tab">
            <thead>
              <tr className="bandas">
                <th className="ind" rowSpan={2}>✱</th><th>Cliente</th><th colSpan={2}>Data</th><th colSpan={4}>Qtde</th><th colSpan={3}>Produto/Mercadoria</th><th colSpan={3}>Cobrar como:</th><th colSpan={3}>Valores</th>
              </tr>
              <tr>
                <th>Cliente <i className="ord">⏶</i></th><th>Data</th><th>Hora</th><th>Fixa</th><th>Extra</th><th>Total</th><th>Cobr</th>
                <th>Produto</th><th>Descrição do produto</th><th>Preço</th><th>Descrição</th><th>Qtde</th><th>Preço</th><th>Vr Pendência</th><th>Valor</th><th>CMD</th>
              </tr>
            </thead>
            <tbody>
              {linhas && visiveis.map((r, i) => {
                const cor = corSuave(r);
                return (
                  <tr key={r.id} className={`clicavel${marcados.has(r.id) ? ' marcado' : ''}${foco === r.id ? ' foco' : ''}`} style={cor ?? undefined}
                    onClick={(e) => clicar(e, r, i)} onDoubleClick={duploClique}>
                    <td className="ind">{foco === r.id ? '▶' : ''}</td>
                    <td>{r.nome}</td><td>{brData(r.data)}</td><td>{hhmm(r.hora)}</td>
                    {tdEd(r, 'qtde_original', fmtQtde(r.qtde_original), 'n')}{tdEd(r, 'qtde_alterada', fmtQtde(r.qtde_alterada), 'n')}<td className="n">{fmtQtde(r.qtde)}</td><td className="n">{fmtQtde(r.qtde_cobrado)}</td>
                    {tdEd(r, 'produto_codigo', r.produto_codigo)}{tdEd(r, 'produto_descricao_expedicao', r.produto_descricao_expedicao)}{tdEd(r, 'produto_preco', `R$${fmt(r.produto_preco, 2, 2)}`, 'n')}
                    {tdEd(r, 'conversao_produto_descricao', r.conversao_produto_descricao)}{tdEd(r, 'conversao_produto_qtde', f3(r.conversao_produto_qtde), 'n')}{tdEd(r, 'conversao_produto_preco', f2(r.conversao_produto_preco), 'n')}
                    <td className="n">{f3(r.valor_pendente)}</td><td className="n">{f3(r.produto_valor)}</td><td>{r.comandas}</td>
                  </tr>
                );
              })}
              {(!linhas || visiveis.length === 0) && <tr className="semlinha"><td colSpan={17} className="vazio">&lt;Não há movimento neste período&gt;</td></tr>}
            </tbody>
            <tfoot>
              <tr><td className="ind" /><td>{totais.linhas}</td><td colSpan={13} /><td className="n">{f3(totais.pendente)}</td><td className="n">{f3(totais.valor)}</td><td /></tr>
            </tfoot>
          </table>
        </div>
      </div>

      {painel && (
        <PainelComanda id={painel} saida={emissao} onNfe={() => atualizar(true)} condicao={condicao} unidadeNome={atual?.unidade_nome ?? unidade?.unidade_nome} perguntar={perguntar} aviso={notificar}
          onFechar={() => setPainel(null)} onExcluida={() => { setPainel(null); atualizar(true); }} onImpressa={() => { setPainel(null); atualizar(true); }} />
      )}

      {pergunta && <Pergunta {...pergunta} onFechar={() => setPergunta(null)} />}
      {busca && (
        <BuscaProduto onFechar={() => setBusca(null)}
          onEscolher={(codigo) => { const a = busca; setBusca(null); mudar(a === 'produto' ? 'produto_codigo' : 'conversao_produto_codigo', codigo); resolver(a, codigo); }} />
      )}
    </div>
  );
}
