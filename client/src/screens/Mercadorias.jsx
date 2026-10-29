import { ehFabrica } from '../lib/perfil.js';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useJanela } from '../components/janela.js';
import { api } from '../api.js';
import Calendario from '../components/Calendario.jsx';
import { brData, diaExtenso, fmtMoeda, fmtQtde, hhmm, hoje } from '../lib/rules.js';
import { Num } from '../components/DiariaTab.jsx';
import { Campo, Pilula } from '../components/ItemForm.jsx';
import { BuscaProduto, Modal } from '../components/ui.jsx';
import { Toast } from '../components/toast.jsx';
import { imprimirDocumento, temDestino } from '../lib/impressora.js';
import { etiquetaMercadoria } from '../lib/print.js';
import EditorEtiqueta from '../components/EditorEtiqueta.jsx';
import * as mc from '../lib/mercCache.js';
import { buscaMercadorias, doCache, preaquece } from '../lib/mercCache.js';
import { confirmar } from '../components/toast.jsx';

const dataHora = (s) => String(s ?? '').replace('T', ' ').slice(0, 19).replace(/^(\d{4})-(\d\d)-(\d\d)/, '$3/$2/$1');
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Imprime HTML em um iframe oculto (substitui ppListaMercadorias / ppAdesivas do ReportBuilder). */
function imprimirHtml(corpo, css) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  f.contentDocument.open();
  f.contentDocument.write(`<!doctype html><meta charset="utf-8"><style>${css}</style>${corpo}`);
  f.contentDocument.close();
  setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 200);
}

const CSS_LISTA = `@page{size:A4;margin:6.35mm}body{font:10pt Arial}h1{font:20pt Arial;margin:0}
.t{display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid #000;padding-bottom:2mm;margin-bottom:2mm}
.r{display:grid;grid-template-columns:58mm 17mm 17mm 1fr;border-bottom:.3mm solid #000;padding:.6mm 0;break-inside:avoid}`;


const Ico = ({ children }) => <svg className="ico" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">{children}</svg>;
const IcoImpressora = () => <Ico><rect x="6" y="2.5" width="12" height="6" fill="#fff" stroke="#456" /><rect x="2.5" y="8" width="19" height="8.5" rx="1.5" fill="#6f8fb5" stroke="#345" /><rect x="6" y="13" width="12" height="8" fill="#fff" stroke="#456" /><circle cx="18.5" cy="10.5" r="1" fill="#7f7" /></Ico>;
const IcoEtiqueta = () => <Ico><path d="M3 12l9-9h8v8l-9 9z" fill="#f0b030" stroke="#8a5a00" /><circle cx="16" cy="8" r="1.6" fill="#fff" /></Ico>;
const IcoOk = () => <Ico><path d="M3 13l6 6L21 5" fill="none" stroke="#2fa84a" strokeWidth="4" /></Ico>;
const IcoPorta = () => <Ico><rect x="7" y="2" width="11" height="20" fill="#2f86d6" stroke="#0a3d75" /><path d="M18 2l4 3v16l-4 1z" fill="#8cc4f0" stroke="#0a3d75" /><path d="M1 12h8m-3-3l3 3-3 3" fill="none" stroke="#d22" strokeWidth="2.4" /></Ico>;
const IcoDisco = () => <Ico><path d="M3 3h15l3 3v15H3z" fill="#334" /><rect x="6" y="3" width="10" height="6" fill="#dde" /><rect x="6" y="13" width="12" height="8" fill="#9ab" /></Ico>;

const porDataHora = (a, b) => String(a.data).localeCompare(String(b.data)) || String(a.hora).localeCompare(String(b.hora))
  || String(a.produto_descricao).localeCompare(String(b.produto_descricao));

/** Janela "Conversão de mercadorias" (u_converte_mercadoria): aberta por duplo clique ou Enter na grade. */
function ConverteMercadoria({ id, onFechar, onSalvo, notify }) {
  const [it, setIt] = useState(null);
  const [sujo, setSujo] = useState(false);
  const [busca, setBusca] = useState(null); // 'prod' | 'conv'
  const [ocupado, setOcupado] = useState(false);
  const valorItem = useRef(0);
  const refs = useRef({});
  const jaFocou = useRef(false);
  useEffect(() => {
    api.get(`/mercadorias/${id}`).then((r) => { valorItem.current = Number(r.produto_valor) || 0; setIt(r); }).catch((e) => { notify.erro(e.message); onFechar(); });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!it) return null;

  const mudar = (mud) => { setSujo(true); setIt((x) => ({ ...x, ...mud })); };
  const valor = (qtde, preco) => Math.round((Number(qtde) || 0) * (Number(preco) || 0) * 100) / 100;
  const foca = (n) => setTimeout(() => refs.current[n]?.focus(), 30);

  // dsprmDataChange: código → busca no cadastro; não achou/vazio → janela de localizar produto
  const resolver = async (codigo, alvo) => {
    const c = String(codigo ?? '').trim();
    if ((alvo === 'prod' && c === it.produto_codigo && !sujo) || (alvo === 'conv' && c === (it.conversao_produto_codigo ?? '') && !sujo)) return;
    if (!c || c === '0') { setBusca(alvo); return; }
    try {
      const p = await api.get(`/produtos/codigo/${encodeURIComponent(c)}`);
      if (alvo === 'conv') {
        const qtde = p.preco ? valorItem.current / p.preco : 0;
        mudar({ id_produto_conversao: p.id, conversao_produto_codigo: p.codigo, conversao_produto_descricao: p.descricao,
          conversao_produto_preco: p.preco, conversao_produto_qtde: qtde, conversao_produto_valor: valor(qtde, p.preco) });
      } else {
        mudar({ id_produto: p.id, produto_codigo: p.codigo, produto_descricao: p.descricao, produto_preco: p.preco,
          preco_total: valor(it.qtde, Number(p.preco) / (Number(p.divisor_basico) || 1)) });
        valorItem.current = valor(it.qtde, p.preco);
      }
    } catch { setBusca(alvo); }
  };

  const salvar = async () => {
    setOcupado(true);
    try {
      await api.put(`/mercadorias/${id}`, {
        produto_codigo: it.produto_codigo, produto_descricao: it.produto_descricao,
        conversao_produto_codigo: it.conversao_produto_codigo ?? '', conversao_produto_descricao: it.conversao_produto_descricao ?? '',
        conversao_produto_qtde: Number(it.conversao_produto_qtde) || 0, conversao_produto_preco: Number(it.conversao_produto_preco) || 0,
        conversao_observacoes: it.conversao_observacoes ?? '', quitado_manualmente: it.quitado_manualmente === 'True' ? 'True' : 'False',
      });
      notify.ok('Conversão gravada.');
      onSalvo();
    } catch (e) { notify.erro(e.message); setOcupado(false); }
  };
  const cancelar = async () => { if (sujo && !(await confirmar('Descartar as alterações?'))) return; onFechar(); };
  const enter = (e) => {
    if (e.key !== 'Enter' || ['TEXTAREA', 'BUTTON'].includes(e.target.tagName)) return;
    e.preventDefault();
    const campos = [...e.currentTarget.querySelectorAll('input:not([disabled]):not([readonly]):not([type=checkbox]), textarea')];
    const prox = campos[campos.indexOf(e.target) + 1]; e.target.blur(); if (prox) setTimeout(() => prox.focus(), 0);
  };
  // o foco inicial vai para o produto a cobrar (é o que se altera na conversão)
  const ref = (n) => (el) => { refs.current[n] = el; if (n === 'conv' && el && !jaFocou.current) { jaFocou.current = true; setTimeout(() => { el.focus(); el.select?.(); }, 60); } };
  const dinheiro = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const diferenca = valor(it.conversao_produto_valor, 0) - valor(it.preco_total, 0);
  const temConversao = Boolean(String(it.conversao_produto_codigo ?? '').trim());

  return (
    <Modal titulo="Conversão de mercadorias" onFechar={cancelar} largo>
      <div className="if cv2" onKeyDown={enter}>
        <header className="if-topo">
          <span className="if-badge alt">✎ Item da venda</span>
          <span className="if-ctx">{it.nome}</span>
          <span className="if-ctx">{brData(it.data)} · {hhmm(it.hora)}</span>
          {sujo && <span className="if-sujo">● não salvo</span>}
          <span className="if-dicas"><kbd>Enter</kbd> próximo campo<span>·</span><kbd>Esc</kbd> fecha</span>
        </header>
        <div className="if-corpo">
          <section className="cv2-card">
            <h4>Mercadoria vendida</h4>
            <div className="cv2-lin cv2-prod">
              <Campo rotulo="Código" className="if-cod"><input value={it.produto_codigo ?? ''} onChange={(e) => mudar({ produto_codigo: e.target.value })}
                onBlur={(e) => resolver(e.target.value, 'prod')} onDoubleClick={() => setBusca('prod')} title="Duplo clique pesquisa o produto" /></Campo>
              <Campo rotulo="Descrição da mercadoria" dica={`id ${it.id_produto ?? ''}`}><input value={it.produto_descricao ?? ''} onChange={(e) => mudar({ produto_descricao: e.target.value })} /></Campo>
            </div>
            <div className="cv2-nums">
              <Campo rotulo="Qtde"><Num className="if-n" readOnly tabIndex={-1} casas={[3, 3]} value={it.qtde} onChange={() => {}} /></Campo>
              <Campo rotulo="Preço unitário"><Num className="if-n" readOnly tabIndex={-1} casas={[3, 3]} value={it.produto_preco} onChange={() => {}} /></Campo>
              <Campo rotulo="Preço total" className="if-total"><Num className="if-n" readOnly tabIndex={-1} casas={[2, 2]} value={it.preco_total} onChange={() => {}} /></Campo>
            </div>
          </section>

          <div className="cv2-seta" aria-hidden="true"><span>⇣</span> cobrar como <span>⇣</span></div>

          <section className="cv2-card cv2-destino">
            <h4>Produto cobrado</h4>
            <div className="cv2-lin cv2-prod">
              <Campo rotulo="Código" className="if-cod if-destaque"><input ref={ref('conv')} value={it.conversao_produto_codigo ?? ''} onChange={(e) => mudar({ conversao_produto_codigo: e.target.value })}
                onBlur={(e) => (e.target.value !== (it.conversao_produto_codigo ?? '') || sujo ? resolver(e.target.value, 'conv') : null)}
                onDoubleClick={() => setBusca('conv')} placeholder="duplo clique pesquisa" /></Campo>
              <Campo rotulo="Descrição do produto" dica={`id ${it.id_produto_conversao ?? 0}`} className="if-destaque"><input value={it.conversao_produto_descricao ?? ''} onChange={(e) => mudar({ conversao_produto_descricao: e.target.value })} /></Campo>
            </div>
            <div className="cv2-nums">
              <Campo rotulo="Qtde"><Num className="if-n" casas={[3, 3]} value={it.conversao_produto_qtde} onChange={(n) => mudar({ conversao_produto_qtde: n, conversao_produto_valor: valor(n, it.conversao_produto_preco) })} /></Campo>
              <Campo rotulo="Preço unitário"><Num className="if-n" casas={[3, 3]} value={it.conversao_produto_preco} onChange={(n) => mudar({ conversao_produto_preco: n, conversao_produto_valor: valor(it.conversao_produto_qtde, n) })} /></Campo>
              <Campo rotulo="Preço total" className="if-total"><Num className="if-n" readOnly tabIndex={-1} casas={[2, 2]} value={it.conversao_produto_valor} onChange={() => {}} /></Campo>
            </div>
            {temConversao && <div className={`cv2-dif ${diferenca === 0 ? 'zero' : diferenca > 0 ? 'mais' : 'menos'}`}>
              {diferenca === 0 ? 'Mesmo valor da venda' : `${diferenca > 0 ? 'Cobra' : 'Deixa de cobrar'} ${dinheiro(Math.abs(diferenca))} ${diferenca > 0 ? 'a mais' : 'a menos'} que a venda`}
            </div>}
          </section>

          <div className="cv2-fim">
            <Campo rotulo="Observações" className="cv2-obs"><textarea value={it.conversao_observacoes ?? ''} onChange={(e) => mudar({ conversao_observacoes: e.target.value })} placeholder="Ex.: cliente pediu a troca por telefone" /></Campo>
            <div className="cv2-acoes">
              <Pilula marcado={it.quitado_manualmente === 'True'} onChange={(e) => mudar({ quitado_manualmente: e.target.checked ? 'True' : 'False' })}>Valor já cobrado</Pilula>
              <button type="button" className="cv2-bt prim" onClick={salvar} disabled={!sujo || ocupado}>{ocupado ? 'Gravando…' : '✔ Salvar'}</button>
              <button type="button" className="cv2-bt" onClick={cancelar}>Cancelar</button>
            </div>
          </div>
        </div>
      </div>
      {busca && (
        <BuscaProduto onFechar={() => setBusca(null)} onEscolher={(codigo) => {
          const alvo = busca; setBusca(null);
          mudar(alvo === 'conv' ? { conversao_produto_codigo: codigo } : { produto_codigo: codigo });
          resolver(codigo, alvo);
        }} />
      )}
    </Modal>
  );
}

const impressa = (v) => { const t = String(v ?? '').trim().toLowerCase(); return t !== '' && t !== '0' && t !== 'false' && t !== 'não' && t !== 'nao'; };
/** Linha da grade: memoizada — marcar/focar um item redesenha só as linhas que mudaram (antes eram todas). */
const Linha = memo(function Linha({ r, i, marcado, foco, onClick, onDuplo }) {
  return (
    <tr tabIndex={0} className={`clicavel${marcado ? ' marcado' : ''}${foco ? ' foco' : ''}`} onClick={(e) => onClick(e, r, i)} onDoubleClick={() => onDuplo?.(r.id)}>
      <td className="mc2-sel"><span className={`mc2-chk${marcado ? ' on' : ''}`} aria-hidden="true">{marcado ? '✔' : ''}</span></td>
      <td className="m-nome">{r.nome}</td>
      <td className="c">{impressa(r.etiqueta_adesiva) ? <span className="mc2-pill ok" title="Etiqueta já impressa">🏷 {String(r.etiqueta_adesiva).trim().length <= 3 ? r.etiqueta_adesiva : ''}</span> : <span className="mc2-pill">—</span>}</td>
      <td className="m-dt">{String(r.hora ?? '').slice(0, 5)}</td>
      <td className="n">{fmtQtde(r.qtde)}</td>
      <td className="m-desc">{r.produto_descricao_expedicao}</td>
      <td className="m-obs">{r.obs}{r.obs_producao ? <em title="Anotação para a produção"> · prod.: {r.obs_producao}</em> : null}</td>
    </tr>
  );
});

export default function Mercadorias({ onFechar }) {
  const [data, setData] = useState(hoje());
  const [itens, setItens] = useState([]);
  const [marcados, setMarcados] = useState(() => new Set());
  const [foco, setFoco] = useState(null);
  const [log, setLog] = useState([]);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [editorEtq, setEditorEtq] = useState(false);
  const fechaEditorEtq = useCallback(() => setEditorEtq(false), []);
  const ancora = useRef(null);
  const [filtro, setFiltro] = useState('');
  const [conv, setConv] = useState(null); // id do item na janela de conversão
  const [menu, setMenu] = useState(null);
  useEffect(() => {
    if (!menu) return undefined;
    const f = () => setMenu(null);
    window.addEventListener('click', f); window.addEventListener('keydown', f);
    return () => { window.removeEventListener('click', f); window.removeEventListener('keydown', f); };
  }, [menu]);

  // Mostra o cache da data na hora e atualiza em segundo plano (sem piscar nem perder a seleção).
  const aplica = useCallback((rows, reset) => {
    const ord = [...rows].sort(porDataHora);
    setItens((ant) => (!reset && ant.length === ord.length && ant.every((x, i) => x.id === ord[i].id && x.qtde === ord[i].qtde && x.etiqueta_adesiva === ord[i].etiqueta_adesiva && x.obs === ord[i].obs && x.obs_producao === ord[i].obs_producao) ? ant : ord));
    if (reset) setMarcados(new Set());
    setFoco((f) => (ord.some((r) => r.id === f) ? f : ord[0]?.id ?? null));
  }, []);
  const [atualizando, setAtualizando] = useState(false);
  const carregar = useCallback(async ({ forcar = false } = {}) => {
    const guardado = doCache(data);
    if (!forcar) { if (guardado) aplica(guardado, true); else { setItens([]); setMarcados(new Set()); } }
    setAtualizando(true);
    try { const rows = await buscaMercadorias(data); aplica(rows, !guardado && !forcar); preaquece(data); } finally { setAtualizando(false); }
  }, [data, aplica]);
  useEffect(() => { carregar().catch((e) => { if (!doCache(data)) setItens([]); setAviso({ tipo: 'erro', m: e.message }); }); }, [carregar]); // eslint-disable-line react-hooks/exhaustive-deps
  // Log do item focado: vem do cache na hora e a consulta ao servidor roda em segundo plano, depois de 200 ms parado
  // (clicar/descer pela lista não dispara uma ida ao servidor por linha).
  const cacheLog = useRef(new Map());
  useEffect(() => {
    if (!foco) { setLog([]); return undefined; }
    setLog(cacheLog.current.get(foco) ?? []);
    let vivo = true;
    const t = setTimeout(() => api.get(`/mercadorias/${foco}/etiquetas`).then((l) => { cacheLog.current.set(foco, l); if (vivo) setLog(l); }).catch(() => {}), 200);
    return () => { vivo = false; clearTimeout(t); };
  }, [foco]);
  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(null), 9000);
    return () => clearTimeout(t);
  }, [aviso]);

  // Seleção como na grade antiga: clique = só este; Ctrl = alterna; Shift = intervalo. Estável (usa ref) para a Linha memoizada.
  const visiveis = useMemo(() => { const q = filtro.trim().toLowerCase(); return q ? itens.filter((r) => `${r.nome} ${r.produto_descricao_expedicao} ${r.obs ?? ''} ${r.obs_producao ?? ''}`.toLowerCase().includes(q)) : itens; }, [itens, filtro]);
  const itensRef = useRef(visiveis); itensRef.current = visiveis;
  const clicar = useCallback((e, r, i) => {
    setFoco(r.id);
    setMarcados((atual) => {
      if (e.shiftKey && ancora.current != null) {
        const [a, b] = [Math.min(ancora.current, i), Math.max(ancora.current, i)];
        return new Set(itensRef.current.slice(a, b + 1).map((x) => x.id));
      }
      ancora.current = i;
      if (e.ctrlKey || e.metaKey) { const n = new Set(atual); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; }
      return atual.size === 1 && atual.has(r.id) ? atual : new Set([r.id]);
    });
  }, []);
  const abreConv = useCallback((id) => setConv(id), []);
  const jn = useJanela(visiveis.length);
  const todos = visiveis.length > 0 && visiveis.every((r) => marcados.has(r.id));
  const alternarTodos = () => setMarcados(todos ? new Set() : new Set(visiveis.map((r) => r.id)));
  const resumo = useMemo(() => ({ qtde: itens.reduce((a, r) => a + (Number(r.qtde) || 0), 0), imp: itens.filter((r) => impressa(r.etiqueta_adesiva)).length }), [itens]);

  const imprimirLista = () => {
    if (!itens.length) { setAviso({ tipo: 'erro', m: 'Não há itens para imprimir.' }); return; }
    const linhas = itens.map((r) => `<div class="r"><span>${esc(r.nome)}</span><span>${esc(hhmm(r.hora))}</span><span style="text-align:right;padding-right:3mm">${esc(fmtQtde(r.qtde))}</span><span>${esc(r.produto_descricao_expedicao)}</span></div>`).join('');
    imprimirHtml(`<div class="t"><h1>Lista de saída de mercadorias</h1><h1 style="text-transform:capitalize">${esc(diaExtenso(data))}</h1></div>${linhas}`, CSS_LISTA);
  };

  const imprimirEtiquetas = async () => {
    if (marcados.size === 0) { setAviso({ tipo: 'erro', m: 'Selecione ao menos um item para impressão.' }); return; }
    setOcupado(true);
    try {
      const ids = [...marcados];
      const dados = await api.post('/mercadorias/etiquetas/dados', { ids });
      if (!(await confirmar(`Prosseguir com ${dados.length} etiqueta(s)?`))) return;
      const pecas = dados.map(etiquetaMercadoria);
      const html = pecas.map((x) => x.corpo).join('');
      await imprimirDocumento('etiqueta-mercadorias', { corpo: html, css: pecas[0].css, semNavegador: temDestino('etiqueta-mercadorias') }, (t, m) => setAviso({ tipo: t, m }));
      // O navegador não informa se a impressão foi concluída: registra ao enviar (igual ao Delphi, que gravava após print).
      await api.post('/mercadorias/etiquetas', { ids });
      setAviso({ tipo: 'ok', m: `${ids.length} etiqueta(s) enviada(s) para impressão.` });
      cacheLog.current.clear();
      await carregar({ forcar: true });
      if (foco) setLog(await api.get(`/mercadorias/${foco}/etiquetas`));
    } catch (e) { setAviso({ tipo: 'erro', m: e.message }); } finally { setOcupado(false); }
  };

  const dtExt = diaExtenso(data);
  return (
    <div className={`tela merc mc2${ehFabrica() ? ' mc2-fab' : ''}`} onKeyDown={(e) => { if (e.key === 'Enter' && !ehFabrica() && foco && !conv && e.target.closest('.merc-tab')) { e.preventDefault(); setConv(foco); } }}>
      <Toast aviso={aviso} />
      {editorEtq && <EditorEtiqueta tipo="etiqueta-mercadorias" onFechar={fechaEditorEtq} />}
      <header className="mc2-topo">
        <div className="mc2-tit">
          <h1>📦 Mercadorias</h1>
          <span className="mc2-data">{dtExt}</span>
          {atualizando ? <span className="merc-atu">atualizando…</span> : mc.ultima && <span className="merc-atu" title={mc.ultima.servidor}>{mc.ultima.linhas} itens em {mc.ultima.ms} ms</span>}
        </div>
        <button type="button" className="mc2-x" title="Fechar esta tela" onClick={() => onFechar?.()}>✕ Fechar</button>
      </header>

      <section className="mc2-painel">
        <div className="mc2-card mc2-cal"><Calendario data={data} onChange={setData} /></div>
        {!ehFabrica() && (
        <div className="mc2-card mc2-acoes">
          <div className="mc2-chips">
            <span className="mc2-chip"><b>{itens.length}</b> itens</span>
            <span className="mc2-chip"><b>{fmtQtde(resumo.qtde)}</b> unidades</span>
            <span className="mc2-chip ok"><b>{resumo.imp}</b> com etiqueta</span>
            <span className={`mc2-chip${marcados.size ? ' sel' : ''}`}><b>{marcados.size}</b> selecionado(s)</span>
          </div>
          <div className="mc2-bts">
            <button type="button" className="mc2-bt prim" onClick={imprimirEtiquetas} disabled={ocupado || !marcados.size}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}><IcoEtiqueta /><span>Etiqueta adesiva{marcados.size ? ` (${marcados.size})` : ''}</span></button>
            <button type="button" className="mc2-bt" onClick={imprimirLista}><IcoImpressora /><span>Imprimir lista</span></button>
            <button type="button" className="mc2-bt" onClick={alternarTodos} disabled={!visiveis.length}><IcoOk /><span>{todos ? 'Desfazer seleção' : 'Selecionar tudo'}</span></button>
            {!ehFabrica() && <button type="button" className="mc2-bt" onClick={() => setEditorEtq(true)} title="Ajustar posição e espaçamento da etiqueta em milímetros"><span className="mc2-em">📐</span><span>Ajustar etiqueta</span></button>}
          </div>
          <p className="mc2-dica">Clique para marcar · Ctrl/Shift para vários · duplo clique converte a mercadoria</p>
        </div>
        )}
        {!ehFabrica() && (
        <div className="mc2-card mc2-log">
          <div className="mc2-log-t">Histórico de etiquetas{foco ? '' : ''}</div>
          <div className="rolagem">
            {log.length ? <ul>{log.map((l) => <li key={l.id}><b>{dataHora(l.data_hora)}</b><span>{l.usuario}</span><em>{l.origem}</em></li>)}</ul>
              : <p className="mc2-vazio">Nenhuma impressão registrada para o item em foco.</p>}
          </div>
        </div>
        )}
      </section>

      <div className="mc2-filtro">
        <input type="search" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar por unidade, mercadoria ou anotação…" aria-label="Filtrar mercadorias" />
        {filtro && <span className="mc2-cont">{visiveis.length} de {itens.length}</span>}
      </div>

      <div className="rolagem merc-grade" ref={jn.ref} onScroll={jn.onScroll}>
        <table className="grade merc-tab">
          <thead>
            <tr><th className="mc2-sel"><span className={`mc2-chk${todos ? ' on' : ''}`} role="checkbox" aria-checked={todos} tabIndex={0} title="Selecionar tudo" onClick={alternarTodos} onKeyDown={(e) => { if (e.key === ' ') { e.preventDefault(); alternarTodos(); } }}>{todos ? '✔' : ''}</span></th><th>Unidade</th><th className="c" title="Etiqueta adesiva impressa">Etiqueta</th><th>Hora</th><th>Qtde</th>
              <th>Mercadoria</th><th>Anotações</th></tr>
          </thead>
          <tbody>
            {jn.acima > 0 && <tr className="cd-esp" style={{ height: jn.acima }}><td colSpan={7} /></tr>}
            {visiveis.slice(jn.ini, jn.fim).map((r, k) => <Linha key={r.id} r={r} i={jn.ini + k} marcado={marcados.has(r.id)} foco={foco === r.id} onClick={clicar} onDuplo={ehFabrica() ? undefined : abreConv} />)}
            {jn.abaixo > 0 && <tr className="cd-esp" style={{ height: jn.abaixo }}><td colSpan={7} /></tr>}
            {visiveis.length === 0 && <tr className="semlinha"><td colSpan={7} className="vazio">{itens.length ? 'Nenhum item corresponde ao filtro.' : 'Não há mercadorias nesta data.'}</td></tr>}
          </tbody>
        </table>
      </div>

      {menu && !ehFabrica() && (
        <ul className="ctx" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <li><button disabled title="O designer de layout do ReportBuilder não foi migrado">Alterar lay-out</button></li>
        </ul>
      )}
      {conv && <ConverteMercadoria id={conv} notify={{ ok: (m) => setAviso({ tipo: 'ok', m }), erro: (m) => setAviso({ tipo: 'erro', m }) }}
        onFechar={() => setConv(null)} onSalvo={async () => { setConv(null); await carregar({ forcar: true }); }} />}
    </div>
  );
}
