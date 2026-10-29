import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { assinaUnidade, publicaUnidade, unidadeSelecionada } from '../lib/unidadeSel.js';
import { api } from '../api.js';
import { Modal } from '../components/ui.jsx';
import { comandaTexto, imprimirHtml } from '../lib/print.js';
import { imprimirDocumento, temDestino } from '../lib/impressora.js';
import { brData, hoje } from '../lib/rules.js';
import { fmtBr, parseBr } from '../lib/nfeCampos.js';
import { Confirma, Toast } from '../components/toast.jsx';
const semAcento = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Controle de comandas (u_comandas) + Edita/Desconto (u_comanda_desconto).
const f3 = (n) => fmtBr(n ?? 0, 3);
const f2 = (n) => fmtBr(n ?? 0, 2);
const moeda3 = (n) => `R$ ${fmtBr(n ?? 0, 3)}`;
const hhmm = (h) => String(h ?? '').slice(0, 5);
const qt = (n) => fmtBr(n ?? 0, 0, 3);


/** f_comanda_desconto: edita qtde/preço do item, inclui produto ou marca para exclusão. */
function EditaDesconto({ item, comandaId, onFechar, onAplicado }) {
  const [modo, setModo] = useState('editar'); // editar | incluir
  const [produto, setProduto] = useState(item.produto_codigo ?? '');
  const [descricao, setDescricao] = useState(item.descricao_generica ?? '');
  const [qtde, setQtde] = useState(fmtBr(item.new_qtde, 0, 3));
  const [cada, setCada] = useState(fmtBr(Number(item.preco_cada) || 1, 0, 3));
  const [preco, setPreco] = useState(fmtBr(item.preco, 3));
  const [excluir, setExcluir] = useState(false);
  const [resolvido, setResolvido] = useState(false); // cod = 'OK' do Delphi
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const refQtde = useRef(null);
  const refProduto = useRef(null);
  useEffect(() => { refQtde.current?.focus(); refQtde.current?.select(); }, []);

  const n = (t) => { const v = parseBr(t); return Number.isNaN(v) ? 0 : v ?? 0; };
  // Item existente: valor real da linha (qtde × preço, na unidade de preço_cada). Item novo: preço × qtde × cada.
  const total = modo === 'incluir' ? n(preco) * n(qtde) * n(cada) : (n(preco) * n(qtde) * n(cada)) / (Number(item.preco_cada) || 1);

  const incluir = () => {
    setModo('incluir'); setExcluir(false); setResolvido(false); setErro('');
    setProduto(''); setDescricao(''); setQtde('0'); setCada('0'); setPreco('0,000');
    setTimeout(() => refProduto.current?.focus(), 0);
  };
  const buscaProduto = async () => {
    if (modo !== 'incluir' || resolvido || !produto.trim()) return;
    try {
      const p = await api.get(`/comandas/produto/${encodeURIComponent(produto.trim())}`);
      setResolvido(true); setProduto(p.codigo); setDescricao(p.descricao ?? ''); setQtde('1');
      setPreco(fmtBr(p.preco, 3)); setCada(fmtBr(Number(p.divisor_basico) || 1, 0, 3)); setErro('');
    } catch {
      setDescricao('Produto não encontrado!'); setErro('Produto não encontrado!'); refProduto.current?.select();
    }
  };
  const aplicar = async () => {
    setErro(''); setOcupado(true);
    try {
      if (excluir) await api.del(`/comandas/itens/${item.id}`);
      else if (modo === 'incluir') {
        if (!resolvido) { setErro('Informe um código de produto válido e saia do campo para localizá-lo.'); setOcupado(false); return; }
        await api.post(`/comandas/${comandaId}/itens`, { produto_codigo: produto.trim(), descricao, qtde: n(qtde), cada: n(cada) || 1, preco: n(preco) });
      } else await api.put(`/comandas/itens/${item.id}`, { qtde: n(qtde), cada: n(cada) || 1, preco: n(preco) });
      onAplicado(excluir ? null : item.id);
    } catch (e) { setErro(e.message); setOcupado(false); }
  };

  const Num = ({ valor, set, refe, w = 80 }) => (
    <input ref={refe} className="cmd-ed-num" style={{ width: w }} value={valor} onChange={(e) => set(e.target.value)} onFocus={(e) => e.target.select()} />
  );
  return (
    <Modal titulo="Edita/Desconto" onFechar={onFechar}>
      <div className="cmd-ed">
        {excluir && <p className="cmd-ed-excl">Marcado para EXCLUSÃO... clique em aplicar</p>}
        <label>Produto:
          <input ref={refProduto} value={produto} readOnly={modo !== 'incluir'} tabIndex={modo === 'incluir' ? 0 : -1} style={{ width: 150 }}
            onChange={(e) => { setProduto(e.target.value); setResolvido(false); }} onBlur={buscaProduto}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscaProduto(); } }} />
        </label>
        <label>Descrição:
          <input value={descricao} readOnly={modo !== 'incluir'} tabIndex={-1} style={{ width: 330 }} onChange={(e) => setDescricao(e.target.value)} />
        </label>
        <div className="cmd-ed-nums">
          <label>Qtde:<Num valor={qtde} set={setQtde} refe={refQtde} /></label>
          <label>Cada:<Num valor={cada} set={setCada} w={60} /></label>
          <label>Preço:<Num valor={preco} set={setPreco} /></label>
          <label className="cmd-ed-tot">Valor total:<input readOnly tabIndex={-1} value={f2(total)} style={{ width: 120 }} /></label>
        </div>
        {erro && <p className="cmd-ed-erro">{erro}</p>}
        <div className="rodape-modal">
          <button type="button" className="bt" onClick={incluir} disabled={ocupado}>Incluir</button>
          <button type="button" className="bt cmd-excluir" onClick={() => setExcluir((x) => !x)} disabled={ocupado || modo === 'incluir'}>Excluir</button>
          <button type="button" className="bt" onClick={aplicar} disabled={ocupado}>Aplicar</button>
          <button type="button" className="bt" onClick={onFechar}>Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}

/** f_comanda_impressao / f_comanda_pronta: pré-visualização do texto da comanda, com Imprimir e Cancelar. */
function PreviaComanda({ dados, unidadeNome, onFechar, notificar }) {
  const p = comandaTexto(dados.comanda, dados.itens, dados.mercadorias, unidadeNome);
  return (
    <Modal titulo="Comanda" onFechar={onFechar} largo>
      <style>{p.css}</style>
      <div className="cmd-previa" dangerouslySetInnerHTML={{ __html: p.corpo }} />
      <div className="rodape-modal">
        <button type="button" className="bt" autoFocus onClick={async () => { await imprimirDocumento('comanda', { ...p, semNavegador: temDestino('comanda') }, notificar); onFechar(); }}>Imprimir</button>
        <button type="button" className="bt" onClick={onFechar}>Cancelar</button>
      </div>
    </Modal>
  );
}

export default function Comandas({ onFechar }) {
  const [unidades, setUnidades] = useState([]);
  const [fUni, setFUni] = useState({ u: '', c: '', t: '' }); // filtros nas colunas da própria grade
  const unisVisiveis = useMemo(() => {
    const k = { u: semAcento(fUni.u).split(/\s+/).filter(Boolean), c: semAcento(fUni.c).split(/\s+/).filter(Boolean), t: semAcento(fUni.t).split(/\s+/).filter(Boolean) };
    if (!k.u.length && !k.c.length && !k.t.length) return unidades;
    return unidades.filter((x) => { const a = semAcento(x.unidade_nome); const b = semAcento(x.cliente_razao_social); const c = semAcento(x.tipo_faturamento); return k.u.every((w) => a.includes(w)) && k.c.every((w) => b.includes(w)) && k.t.every((w) => c.includes(w)); });
  }, [unidades, fUni]);
  const [uniId, setUniId] = useState(null);
  const [usaEmissao, setUsaEmissao] = useState(false);
  const [emissao, setEmissao] = useState(hoje());
  const [modo, setModo] = useState('pendentes');
  const [saida, setSaida] = useState(hoje());
  const [lista, setLista] = useState(null); // null = "<Clique em Atualizar>"
  const [sel, setSel] = useState(() => new Set());
  const [foco, setFoco] = useState(null);
  const [dados, setDados] = useState(null); // { comanda, itens, mercadorias }
  const [itemSel, setItemSel] = useState(null);
  const [detalhes, setDetalhes] = useState([]);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirma, setConfirma] = useState(null);
  const [edicao, setEdicao] = useState(false);
  const [previa, setPrevia] = useState(false);
  const [disparo, setDisparo] = useState(0);
  const ancora = useRef(null);
  const notificar = useCallback((tipo, m) => setAviso({ tipo, m }), []);
  useEffect(() => { if (!aviso) return undefined; const t = setTimeout(() => setAviso(null), 9000); return () => clearTimeout(t); }, [aviso]);

  useEffect(() => {
    api.get('/faturamento/unidades').then((u) => { setUnidades(u); setUniId((x) => x ?? (u.some((v) => v.id === unidadeSelecionada()) ? unidadeSelecionada() : u[0]?.id ?? null)); }).catch((e) => notificar('erro', e.message));
  }, [notificar]);
  const unidade = unidades.find((u) => u.id === uniId) ?? null;

  // bAtualizeClick
  const atualizar = useCallback(async (manter) => {
    if (!uniId) { notificar('erro', 'Selecione uma unidade.'); return; }
    if (usaEmissao && !emissao) { notificar('erro', 'Informe a data de emissão.'); return; }
    setOcupado(true);
    try {
      const q = `unidade=${uniId}&modo=${modo}${usaEmissao ? `&emissao=${emissao}` : ''}`;
      const rows = await api.get(`/comandas?${q}`);
      setLista(rows);
      setSel((s) => new Set(manter ? [...s].filter((id) => rows.some((r) => r.id === id)) : []));
      setFoco((f) => (manter && rows.some((r) => r.id === f) ? f : rows[0]?.id ?? null));
    } catch (e) { notificar('erro', e.message); } finally { setOcupado(false); }
  }, [uniId, usaEmissao, emissao, modo, notificar]);

  useEffect(() => { if (disparo > 0) atualizar(false); }, [disparo]); // eslint-disable-line react-hooks/exhaustive-deps

  const carregaComanda = useCallback(async (id, manterItem) => {
    if (!id) { setDados(null); setItemSel(null); return; }
    try {
      const d = await api.get(`/faturamento/comandas/${id}`);
      setDados(d);
      setItemSel((s) => (manterItem && d.itens.some((i) => i.id === s) ? s : d.itens[0]?.id ?? null));
    } catch (e) { notificar('erro', e.message); setDados(null); }
  }, [notificar]);
  useEffect(() => { carregaComanda(foco, false); }, [foco]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!itemSel) { setDetalhes([]); return; }
    api.get(`/faturamento/comandas/itens/${itemSel}/detalhes`).then(setDetalhes).catch(() => setDetalhes([]));
  }, [itemSel]);

  // NFe/faturamento mexeram nas comandas (ex.: NF apagada devolve as comandas a PENDENTES): recarrega a lista e a comanda em foco
  const recarga = useRef(null); recarga.current = () => { if (lista !== null) { atualizar(true); carregaComanda(foco, true); } };
  useEffect(() => {
    let t;
    const aoAlterar = (ev) => { if (!/^\/(nfe|faturamento)/.test(ev.detail?.path ?? '')) return; clearTimeout(t); t = setTimeout(() => recarga.current?.(), 350); };
    window.addEventListener('nfe-alterada', aoAlterar);
    return () => { window.removeEventListener('nfe-alterada', aoAlterar); clearTimeout(t); };
  }, []);
  const mudarUnidade = (id, publicar = true) => { setUniId(id); setLista(null); setSel(new Set()); setFoco(null); setDados(null); setDisparo((d) => d + 1); if (publicar) publicaUnidade(id, 'cmd'); }; // um clique na unidade já lista as comandas
  // acompanha a unidade escolhida no Faturamento (não interrompe uma edição de comanda aberta)
  const seguir = useRef(null);
  seguir.current = (id) => { if (id === uniId || !unidades.some((u) => u.id === id) || edicao) return; mudarUnidade(id, false); };
  useEffect(() => assinaUnidade((id, o) => { if (o !== 'cmd') seguir.current?.(id); }), []);
  const clicaComanda = (e, id) => {
    const ids = (lista ?? []).map((r) => r.id);
    setFoco(id);
    if (e.shiftKey && ancora.current != null) {
      const a = ids.indexOf(ancora.current); const b = ids.indexOf(id);
      setSel(new Set(ids.slice(Math.min(a, b), Math.max(a, b) + 1)));
    } else if (e.ctrlKey || e.metaKey) {
      setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); ancora.current = id;
    } else { setSel(new Set([id])); ancora.current = id; }
  };
  // Operações valem para as comandas selecionadas (MultiSelect); sem seleção, a comanda em foco.
  const alvos = useMemo(() => {
    const ids = (lista ?? []).filter((r) => sel.has(r.id)).map((r) => r.id);
    return ids.length ? ids : foco ? [foco] : [];
  }, [lista, sel, foco]);

  const totais = useMemo(() => ({ n: lista?.length ?? 0, valor: (lista ?? []).reduce((s, r) => s + Number(r.vr_comanda || 0), 0) }), [lista]);
  const totItens = useMemo(() => ({ n: dados?.itens.length ?? 0, valor: (dados?.itens ?? []).reduce((s, i) => s + Number(i.vr_item || 0), 0) }), [dados]);
  const totDet = useMemo(() => ({ q: detalhes.reduce((s, d) => s + Number(d.xqtde || 0), 0), valor: detalhes.reduce((s, d) => s + Number(d.vr_item || 0), 0) }), [detalhes]);

  const imprimirAgora = async () => {
    try {
      const pecas = [];
      for (const id of alvos) {
        const d = await api.get(`/faturamento/comandas/${id}`);
        pecas.push(comandaTexto(d.comanda, d.itens, d.mercadorias, unidade?.unidade_nome));
      }
      if (temDestino('comanda')) { let ok = 0; for (const p of pecas) { if (await imprimirDocumento('comanda', { ...p, semNavegador: true }, notificar) === 'agente') ok += 1; } if (ok) notificar('ok', `${ok} comanda(s) enviada(s) para a impressora.`); } // uma por vez, cada uma com seu corte
      else imprimirHtml(pecas.map((p) => `<div style="page-break-after:always">${p.corpo}</div>`).join(''), pecas[0].css);
    } catch (e) { notificar('erro', e.message); }
  };
  // com impressora escolhida: pergunta e vai direto ao agente (sem pré-visualização); sem impressora, abre a impressão do navegador
  const imprimir = () => {
    if (!alvos.length) { notificar('erro', 'Selecione uma comanda.'); return; }
    if (temDestino('comanda')) setConfirma({ texto: alvos.length === 1 ? `Imprimir a comanda ${alvos[0]} na impressora?` : `Imprimir as ${alvos.length} comandas selecionadas na impressora?`, sim: imprimirAgora });
    else imprimirAgora();
  };
  const excluir = () => {
    if (!alvos.length) { notificar('erro', 'Selecione uma comanda.'); return; }
    setConfirma({
      texto: alvos.length === 1 ? `Deseja eliminar a comanda ${alvos[0]} completamente?` : `Deseja eliminar as ${alvos.length} comandas selecionadas completamente?`,
      sim: async () => {
        setOcupado(true);
        const falhas = []; let ok = 0;
        for (const id of alvos) { notificar('ok', `Eliminando comanda ${id} (${ok + falhas.length + 1} de ${alvos.length})…`); try { await api.del(`/faturamento/comandas/${id}`); ok += 1; } catch (e) { falhas.push(`${id}: ${e.message}`); } }
        setOcupado(false);
        notificar(falhas.length ? 'erro' : 'ok', falhas.length ? `Eliminadas ${ok}. Não eliminadas — ${falhas.join(' | ')}` : `${ok} comanda(s) eliminada(s)!`);
        await atualizar(false);
      },
    });
  };
  const gerarNfe = () => {
    if (!alvos.length) { notificar('erro', 'Selecione ao menos uma comanda.'); return; }
    if (!saida) { notificar('erro', 'Informe a data de saída.'); return; }
    setConfirma({
      texto: `Gerar a NF-e com ${alvos.length} comanda(s) (${alvos.join(', ')}) — saída em ${brData(saida)}?`,
      sim: async () => {
        setOcupado(true);
        try { const r = await api.post('/comandas/nfe', { ids: alvos, unidade: uniId, data_saida: saida }); notificar('ok', `NF gerada (controle ${r.id}). Abra a tela NFe para emitir.`); await atualizar(false); }
        catch (e) { notificar('erro', e.message); } finally { setOcupado(false); }
      },
    });
  };

  const itemAtual = dados?.itens.find((i) => i.id === itemSel) ?? null;
  const bloqueada = dados && (String(dados.comanda.status).toUpperCase() === 'FATURADO' || Number(dados.comanda.id_nota_fiscal) > 0);
  const abreEdicao = () => {
    if (!itemAtual) return;
    if (bloqueada) { notificar('erro', 'Esta comanda já foi faturada e não pode ser alterada.'); return; }
    setEdicao(true);
  };

  return (
    <div className="cmd cm2">
      <Toast aviso={aviso} />
      <header className="cm2-topo">
        <h1>🧾 Controle de comandas</h1>
        {unidade && <span className="cm2-un"><b>{unidade.unidade_nome}</b> · {unidade.cliente_razao_social}</span>}
        <span className="cm2-chips">
          <span className="cm2-chip"><b>{totais.n}</b> comanda(s)</span>
          <span className="cm2-chip"><b>{f2(totais.valor)}</b> total</span>
          <span className={`cm2-chip${alvos.length ? ' sel' : ''}`}><b>{alvos.length}</b> selecionada(s)</span>
        </span>
      </header>
      <div className="cmd-barra">
        <fieldset className="cmd-emis">
          <label><input type="checkbox" checked={usaEmissao} onChange={(e) => setUsaEmissao(e.target.checked)} /> Emitidas em:</label>
          <input type="date" value={emissao} onChange={(e) => setEmissao(e.target.value)} />
        </fieldset>
        <fieldset className="cmd-radios">
          {[['pendentes', 'Pendentes'], ['faturadas', 'Faturadas'], ['todas', 'Todas']].map(([v, r]) => (
            <label key={v}><input type="radio" name="cmd-modo" checked={modo === v} onChange={() => { setModo(v); setLista(null); setSel(new Set()); setFoco(null); setDisparo((d) => d + 1); }} /> {r}</label>
          ))}
        </fieldset>
        <button type="button" className="bt cmd-bt" disabled={ocupado} onClick={() => atualizar(false)}><span className="fat-ic">⟳</span>Atualizar</button>
        <button type="button" className="bt cmd-bt" disabled={ocupado || !alvos.length} onClick={imprimir}><span className="fat-ic">🖨</span>Imprimir</button>
        <button type="button" className="bt cmd-bt" title="Click aqui para selecionar todas as comandas" disabled={!lista?.length}
          onClick={() => setSel(new Set((lista ?? []).map((r) => r.id)))}><span className="fat-ic">☑</span>Selecionar tudo</button>
        <button type="button" className="bt cmd-bt" title="Excluir comanda" disabled={ocupado || !alvos.length} onClick={excluir}><span className="fat-ic x">✖</span>Excluir Comanda</button>
        <fieldset className="cmd-emis">
          <label>Saída:</label>
          <input type="date" value={saida} onChange={(e) => setSaida(e.target.value)} />
        </fieldset>
        <button type="button" className="bt cmd-bt" title="Gera NFe" disabled={ocupado || !alvos.length} onClick={gerarNfe}><span className="fat-ic">📄</span>NFe</button>
        <button type="button" className="bt cmd-bt" title="Fechar tela de programação" onClick={onFechar}><span className="fat-ic">🚪</span>Sair</button>
      </div>

      <div className="cmd-sup">
        <div className="rolagem cmd-g-cmd">
          <table className="grade">
            <thead><tr><th className="ind" /><th>Comanda ⏶</th><th>Emissão</th><th>Responsável</th><th>Valor</th><th>Status</th></tr></thead>
            <tbody>
              {(lista ?? []).map((r) => (
                <tr key={r.id} className={`clicavel${sel.has(r.id) ? ' sel cmd-marcada' : ''}`} onClick={(e) => clicaComanda(e, r.id)} onDoubleClick={() => setPrevia(true)}>
                  <td className="ind">{r.id === foco ? '▶' : ''}</td><td>{r.id}</td><td>{brData(r.data_emissao)}</td><td>{r.usuario_resp}</td>
                  <td className="n">{f3(r.vr_comanda)}</td><td><span className={`cm2-st ${String(r.status).toUpperCase() === 'FATURADO' ? 'fat' : 'pen'}`}>{r.status}</span></td>
                </tr>
              ))}
              {lista === null && <tr className="semlinha"><td colSpan={6} className="vazio">&lt;Clique em Atualizar&gt;</td></tr>}
              {lista?.length === 0 && <tr className="semlinha"><td colSpan={6} className="vazio">&lt;Não há comandas&gt;</td></tr>}
            </tbody>
            <tfoot><tr><td className="ind" /><td>{totais.n}</td><td colSpan={2} /><td className="n">{f2(totais.valor)}</td><td /></tr></tfoot>
          </table>
        </div>
        <div className="rolagem cmd-g-uni">
          <table className="grade">
            <thead>
              <tr><th className="ind">✱</th><th>Unidade ⏶</th><th>Cliente</th><th>Faturamento</th></tr>
              <tr className="cm2-filtro">
                <th className="ind" title="Filtros">🔎</th>
                {[['u', 'Unidade…'], ['c', 'Cliente…'], ['t', 'Tipo…']].map(([k, ph], i) => (
                  <th key={k}><input type="search" value={fUni[k]} placeholder={ph} aria-label={`Filtrar por ${ph.replace('…', '').toLowerCase()}`}
                    onChange={(e) => setFUni((x) => ({ ...x, [k]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter' && unisVisiveis[0]) { e.preventDefault(); mudarUnidade(unisVisiveis[0].id); } }} autoFocus={i === 1} /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {unisVisiveis.map((u) => (
                <tr key={u.id} className={`clicavel${u.id === uniId ? ' sel' : ''}`} onClick={() => mudarUnidade(u.id)}>
                  <td className="ind">{u.id === uniId ? '▶' : ''}</td><td>{u.unidade_nome}</td><td>{u.cliente_razao_social}</td><td>{u.tipo_faturamento}</td>
                </tr>
              ))}
              {unidades.length === 0 && <tr className="semlinha"><td colSpan={4} className="vazio">&lt;Não há unidades&gt;</td></tr>}
              {unidades.length > 0 && unisVisiveis.length === 0 && <tr className="semlinha"><td colSpan={4} className="vazio">Nenhuma unidade/cliente corresponde ao filtro.</td></tr>}
            </tbody>
            <tfoot><tr><td className="ind" /><td colSpan={3}>{unisVisiveis.length === unidades.length ? `${unidades.length} unidades` : `${unisVisiveis.length} de ${unidades.length} unidades`}</td></tr></tfoot>
          </table>
        </div>
      </div>

      <div className="cmd-inf">
        <div className="rolagem cmd-g-it">
          <table className="grade">
            <thead><tr><th className="ind" /><th>Produto</th><th>Descrição do ítem</th><th>Qtde</th><th>Preço</th><th>Var total</th></tr></thead>
            <tbody>
              {(dados?.itens ?? []).map((i) => (
                <tr key={i.id} className={`clicavel${i.id === itemSel ? ' sel' : ''}`} title="Clique duplo para editar/dar desconto" onClick={() => setItemSel(i.id)} onDoubleClick={() => { setItemSel(i.id); setTimeout(abreEdicao, 0); }}>
                  <td className="ind">{i.id === itemSel ? '▶' : ''}</td><td>{i.produto_codigo}</td><td>{i.descricao_generica}</td>
                  <td className="n">{qt(i.new_qtde)}</td><td className="n">{f3(i.preco)}</td><td className="n">{fmtBr(i.vr_item, 2, 3)}</td>
                </tr>
              ))}
              {!dados && <tr className="semlinha"><td colSpan={6} className="vazio">&lt;Não há informações a exibir&gt;</td></tr>}
            </tbody>
            <tfoot><tr><td className="ind" /><td>{totItens.n}</td><td colSpan={3} /><td className="n">{fmtBr(totItens.valor, 3)}</td></tr></tfoot>
          </table>
        </div>
        <div className="cmd-dir">
          <div className="cmd-tit">Detalhes de cada ítem da comanda</div>
          <div className="rolagem cmd-g-det">
            <table className="grade">
              <thead><tr><th>Data</th><th>Hora</th><th>Descrição do ítem</th><th>QTD</th><th>Cada</th><th>Qtde</th><th>Preço</th><th>Var total</th></tr></thead>
              <tbody>
                {detalhes.map((d) => (
                  <tr key={d.id}><td>{brData(d.data)}</td><td>{hhmm(d.hora)}</td><td>{d.descricao_generica}</td><td className="n">{qt(d.qtde)}</td><td className="n">{qt(d.preco_cada)}</td>
                    <td className="n">{qt(d.xqtde)}</td><td className="n">{f2(d.preco)}</td><td className="n">{moeda3(d.vr_item)}</td></tr>
                ))}
                {detalhes.length === 0 && <tr className="semlinha"><td colSpan={8} className="vazio">&lt;Não há informações a exibir&gt;</td></tr>}
              </tbody>
              <tfoot><tr><td colSpan={5} /><td className="n">{fmtBr(totDet.q, 0, 2)}</td><td /><td className="n">{moeda3(totDet.valor)}</td></tr></tfoot>
            </table>
          </div>
          <div className="cmd-tit">Mercadorias constantes nesta comanda</div>
          <div className="rolagem cmd-g-mer">
            <table className="grade">
              <thead><tr><th>Data</th><th>Hora</th><th>Descrição da mercadoria</th><th>Qtde</th></tr></thead>
              <tbody>
                {(dados?.mercadorias ?? []).map((m) => (
                  <tr key={m.id}><td>{brData(m.data)}</td><td>{hhmm(m.hora)}</td><td>{m.descricao}</td><td className="n">{qt(m.qtde)}</td></tr>
                ))}
                {(!dados || dados.mercadorias.length === 0) && <tr className="semlinha"><td colSpan={4} className="vazio">&lt;Não há mercadorias nesta comanda&gt;</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {previa && dados && <PreviaComanda dados={dados} unidadeNome={unidade?.unidade_nome} notificar={notificar} onFechar={() => setPrevia(false)} />}
      {confirma && <Confirma texto={confirma.texto} onSim={confirma.sim} onFechar={() => setConfirma(null)} />}
      {edicao && itemAtual && (
        <EditaDesconto item={itemAtual} comandaId={dados.comanda.id} onFechar={() => setEdicao(false)}
          onAplicado={async (manter) => { setEdicao(false); await atualizar(true); await carregaComanda(foco, true); if (manter == null) setItemSel(null); notificar('ok', 'Item atualizado.'); }} />
      )}
    </div>
  );
}
