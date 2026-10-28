import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Toast, confirmar } from '../components/toast.jsx';
import { useJanela } from '../components/janela.js';
import { etiquetaItem } from '../lib/print.js';
import { imprimirDocumento, temDestino } from '../lib/impressora.js';
import { bool, brData, fmtQtde, hhmm, hoje, semanaDia } from '../lib/rules.js';

const ACOMOD = [['SACARIA', 'Sacaria'], ['CAIXA BRANCA', 'Caixa branca'], ['CAIXA QUADRADA', 'Caixa quadrada'], ['CAIXA AMARELINHA', 'Caixa amarelinha']];
const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// rgTipo, rgEmbalagem… do Delphi: [chave, título, [opções…]] — a última opção é sempre "Tudo".
const FILTROS = [
  ['tipo', 'Tipo', ['Especiais', 'Salgados', 'Mercadorias', 'Tudo'], 3],
  ['embalagem', 'Embalagem', ['Em sacaria', 'Demais embalagens', 'Tudo'], 2],
  ['modal', 'Programação', ['Normais', 'Alteradas', 'Canceladas', 'Todos'], 3],
  ['carga', 'Carga', ['1ª carga', '2ª carga', '3ª carga', 'Tudo'], 3],
  ['expedicao', 'Expedição', ['Não separados', 'Já separados', 'Todos'], 2],
  ['alterados', 'Ítens', ['Alterados', 'Não alterados', 'Todos'], 2],
];
const EXTRAS = ['Cortado', 'Margarina', 'Côco', 'Açucar', 'Emb ind plástico', 'Emb ind papel', 'Pacote plástico', 'Tudo'];
const REGIOES = ['Osasco', 'Raposo Tavares', 'Pinheiros', 'Jaguaré', 'Lapa/Barra Funda', 'Anhanguera', 'Pirituba', 'Barueri', 'Alphaville', 'Tamboré', 'Itapevi', 'Jandira', 'Todos'];
const PADRAO = { tipo: 0, embalagem: 2, modal: 3, carga: 3, extra: 7, regiao: 12, expedicao: 2, alterados: 2 };

// Aba "Carga fixa": cada chip é uma caixa de seleção do Delphi (marcada = entra; desmarcada = sai da lista)
const GRUPOS_FIXA = [
  ['Tipo', [['especiais', 'Especiais'], ['salgados', 'Salgados']]],
  ['Acomodação', [['sacaria', 'Sacaria'], ['demais', 'Demais acomod.']]],
  ['Horário de produção', [['h1', '1º horário'], ['h2', '2º horário'], ['h3', '3º horário']]],
  ['Extras', [['cortado', 'Cortado'], ['margarina', 'Margarina'], ['coco', 'Côco'], ['acucar', 'Açúcar'], ['plastico', 'Emb indiv plástico'], ['papel', 'Emb indiv papel'], ['pacote', 'Pacote plástico']]],
  ['Carga', [['carga1', '1ª carga'], ['carga2', '2ª carga'], ['carga3', '3ª carga']]],
  ['Região', [['osasco', 'Osasco'], ['pinheiros', 'Pinheiros'], ['raposo', 'Raposo Tavares'], ['jaguare', 'Jaguaré'], ['lapa', 'Lapa'], ['outras', 'Outras'], ['anhanguera', 'Anhanguera'], ['pirituba', 'Pirituba'],
    ['barueri', 'Barueri'], ['alphaville', 'Alphaville'], ['tambore', 'Tamboré'], ['itapevi', 'Itapevi'], ['jandira', 'Jandira']]],
];

const qtdeTexto = (r) => `${fmtQtde(r.qtde_original)} ${Number(r.qtde_alterada) < 0 ? '-' : '+'} ${fmtQtde(Math.abs(r.qtde_alterada))} =`;
const COLS_DIARIA = [
  ['registro_alterado', 'A', (r) => (Number(r.registro_alterado) === 1 ? '✔' : ''), 'c'], ['etiqueta_adesiva', 'Etiq.', (r) => (Number(r.etiqueta_adesiva) || ''), 'c'],
  ['programacao_fixa', 'FX', (r) => (bool(r.programacao_fixa) ? '✔' : ''), 'c'], ['unidade_nome', 'Cliente'], ['xhora', 'Hora'], ['qtde', 'Qtde', qtdeTexto, 'n'],
  ['display_total', '=Total', (r) => fmtQtde(r.display_total), 'n'], ['produto_descricao_expedicao', 'Descrição do produto'], ['acomodacao_carga', 'Embalagem'],
  ['carga', 'Carga', (r) => (r.carga ? `${r.carga}ª` : ''), 'c'], ['regiao', 'Região'], ['xhorario', 'Saída'], ['motorista_apelido', 'Motorista'],
];
const COLS_FIXA = [
  ['motorista_nome', 'Motorista'], ['horario', 'Saída', (r) => hhmm(r.horario)], ['hora', 'Hora', (r) => hhmm(r.hora)], ['qtde_total', 'Qtde', (r) => fmtQtde(r.qtde_total), 'n'],
  ['produto_descricao_expedicao', 'Produto'], ['regiao', 'Região'], ['unidade_nome', 'Cliente'], ['unidade_telefone', 'Telefone'], ['acomodacao_carga', 'Embalagem'], ['carga', 'Carga', (r) => (r.carga ? `${r.carga}ª` : ''), 'c'],
];

/** Cores da grade (GridPDCustomDrawCell): especial = amarelo, cancelado = prata, separado = preto/amarelo, selecionado = azul. */
const classeDiaria = (r) => `${bool(r.produto_especial) ? ' esp' : ''}${bool(r.cancelado) ? ' canc' : ''}${bool(r.separado) ? ' sep' : ''}`;

const Linha = memo(function Linha({ r, cols, marc, foco, extra, onClick, onCheck }) {
  return (
    <tr className={`${marc ? 'marc' : ''}${foco ? ' foco' : ''}${extra}`} onClick={(e) => onClick(e, r.id)} onDoubleClick={() => {}}>
      <td className="trb2-ck"><input type="checkbox" checked={marc} onChange={() => {}} onClick={(e) => { e.stopPropagation(); onCheck(e, r.id); }} aria-label="Marcar linha" /></td>
      {cols.map(([k, , f, t]) => <td key={k} className={t ?? ''} title={f ? undefined : String(r[k] ?? '')}>{f ? f(r) : String(r[k] ?? '')}</td>)}
    </tr>
  );
});

/** Seleção múltipla da grade: clique simples, Ctrl alterna, Shift intervalo; a caixa alterna (como o MultiSelect do cxGrid). */
function useSelecao(rows) {
  const [marcados, setMarcados] = useState(() => new Set());
  const [foco, setFoco] = useState(null);
  const ancora = useRef(null);
  const ref = useRef(rows); ref.current = rows;
  const faixa = (id) => { const ids = ref.current.map((r) => r.id); const a = ids.indexOf(ancora.current); const b = ids.indexOf(id); return ids.slice(Math.min(a, b), Math.max(a, b) + 1); };
  const alterna = useCallback((id) => { setMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); ancora.current = id; }, []);
  const clica = useCallback((e, id) => {
    setFoco(id);
    if (e.shiftKey && ancora.current != null) setMarcados(new Set(faixa(id)));
    else if (e.ctrlKey || e.metaKey) alterna(id);
    else { setMarcados(new Set([id])); ancora.current = id; }
  }, [alterna]); // eslint-disable-line react-hooks/exhaustive-deps
  const checa = useCallback((e, id) => {
    setFoco(id);
    if (e.shiftKey && ancora.current != null) setMarcados((s) => new Set([...s, ...faixa(id)])); else alterna(id);
  }, [alterna]); // eslint-disable-line react-hooks/exhaustive-deps
  const todos = rows.length > 0 && marcados.size === rows.length;
  const marcaTodos = () => setMarcados(todos ? new Set() : new Set(rows.map((r) => r.id)));
  return { marcados, setMarcados, foco, setFoco, clica, checa, todos, marcaTodos };
}

/** Ordenação por clique no título da coluna (1º clique crescente, 2º decrescente, 3º volta à ordem original). */
const CHAVE_ORDEM = { qtde: 'qtde_original', display_total: 'display_total', registro_alterado: 'registro_alterado' };
const cmpOrdem = (a, b) => {
  const [x, y] = [a ?? '', b ?? ''];
  const [nx, ny] = [Number(x), Number(y)];
  if (x !== '' && y !== '' && Number.isFinite(nx) && Number.isFinite(ny)) return nx - ny;
  return String(x).localeCompare(String(y), 'pt-BR', { numeric: true, sensitivity: 'base' });
};
function useOrdem(brutas) {
  const [ord, setOrd] = useState(null); // [coluna, 1 | -1]
  const alternar = useCallback((k) => setOrd((o) => (o?.[0] !== k ? [k, 1] : o[1] === 1 ? [k, -1] : null)), []);
  const rows = useMemo(() => {
    if (!ord) return brutas;
    const ch = CHAVE_ORDEM[ord[0]] ?? ord[0];
    return brutas.map((r, i) => [r, i]).sort((a, b) => cmpOrdem(a[0][ch], b[0][ch]) * ord[1] || a[1] - b[1]).map((x) => x[0]);
  }, [brutas, ord]);
  return { rows, ord, alternar };
}

function Grade({ cols, rows, sel, classe, vazio, onKeyDown, ordem }) {
  const j = useJanela(rows.length);
  return (
    <div className="trb2-tab cg-grade" ref={j.ref} onScroll={j.onScroll} tabIndex={0} onKeyDown={onKeyDown}>
      <table>
        <thead><tr><th className="trb2-ck"><input type="checkbox" checked={sel.todos} onChange={sel.marcaTodos} aria-label="Marcar todos" title="Marcar/desmarcar todos" /></th>{cols.map(([k, r, , t]) => <th key={k} className={`${t ?? ''} cg-ord`} title="Clique para ordenar" onClick={() => ordem?.alternar(k)}>{r}{ordem?.ord?.[0] === k ? (ordem.ord[1] === 1 ? ' ⏶' : ' ⏷') : ''}</th>)}</tr></thead>
        <tbody>
          {j.acima > 0 && <tr className="trb2-esp-l" style={{ height: j.acima }}><td colSpan={cols.length + 1} /></tr>}
          {rows.slice(j.ini, j.fim).map((r) => <Linha key={r.id} r={r} cols={cols} marc={sel.marcados.has(r.id)} foco={r.id === sel.foco} extra={classe(r)} onClick={sel.clica} onCheck={sel.checa} />)}
          {j.abaixo > 0 && <tr className="trb2-esp-l" style={{ height: j.abaixo }}><td colSpan={cols.length + 1} /></tr>}
          {rows.length === 0 && <tr><td colSpan={cols.length + 1} className="trb2-vazio">{vazio}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

const Segmentado = ({ titulo, opcoes, valor, onMudar }) => (
  <div className="cg-gr"><span className="cg-rot">{titulo}</span>
    <div className="nf2-seg">{opcoes.map((o, i) => <label key={o} className={valor === i ? 'on' : ''}><input type="radio" checked={valor === i} onChange={() => onMudar(i)} />{o}</label>)}</div>
  </div>
);

/** Combos do item focado (RxDBComboBox + edtEtinerario + navegador): editar e gravar acomodação e etinerário. */
function EditorItem({ tabela, item, roteiros, aoGravar, notificar }) {
  const [ac, setAc] = useState(''); const [rt, setRt] = useState('');
  useEffect(() => { setAc(item?.acomodacao_carga ?? ''); setRt(String(item?.id_roteiro ?? '')); }, [item?.id, item?.acomodacao_carga, item?.id_roteiro]);
  const sujo = item && (ac !== (item.acomodacao_carga ?? '') || rt !== String(item.id_roteiro ?? ''));
  const gravar = async () => {
    try {
      const b = {};
      if (ac !== (item.acomodacao_carga ?? '') && ac) b.acomodacao_carga = ac;
      if (rt !== String(item.id_roteiro ?? '')) b.id_roteiro = Number(rt || 0);
      await api.put(`/cargas/${tabela}/${item.id}`, b); await aoGravar(); notificar('ok', 'Item gravado.');
    } catch (e) { notificar('erro', e.message); }
  };
  return (
    <div className="cg-editor">
      <span className="cg-rot">{tabela === 'diaria' ? 'Embalagem na carga' : 'Acomodação da carga'}</span>
      <select value={ac} disabled={!item} onChange={(e) => setAc(e.target.value)} aria-label="Acomodação da carga"><option value="" />{ACOMOD.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select>
      <span className="cg-rot">Etinerário</span>
      <select value={rt} disabled={!item} onChange={(e) => setRt(e.target.value)} aria-label="Etinerário"><option value="">(nenhum)</option>{roteiros.map((r) => <option key={r.roteiro_id} value={r.roteiro_id}>{r.chave}</option>)}</select>
      <button type="button" className="trb2-btn principal" disabled={!sujo} onClick={gravar}>✔ Gravar</button>
      <button type="button" className="trb2-btn" disabled={!sujo} onClick={() => { setAc(item.acomodacao_carga ?? ''); setRt(String(item.id_roteiro ?? '')); }}>✖ Cancelar</button>
    </div>
  );
}

function MenuAcomodacao({ tabela, sel, aoAplicar, extra, notificar }) {
  const [aberto, setAberto] = useState(false);
  const aplicar = async (valor) => {
    if (!sel.marcados.size) { notificar('erro', 'Marque ao menos uma linha.'); return; }
    try { const r = await api.post(`/cargas/${tabela}/acomodacao`, { ids: [...sel.marcados], valor }); await aoAplicar(); notificar('ok', `${r.atualizados} linha(s) alterada(s) para ${valor}.`); } catch (e) { notificar('erro', e.message); }
  };
  return (
    <div className="nf2-mais">
      <button type="button" className="trb2-btn" aria-haspopup="menu" aria-expanded={aberto} onClick={() => setAberto((x) => !x)}>📦 Embalagem das marcadas ▾</button>
      {aberto && (<>
        <div className="nf2-veu" onClick={() => setAberto(false)} />
        <div className="nf2-menu" role="menu" onClick={() => setAberto(false)}>
          <small>Definir acomodação</small>
          {ACOMOD.map(([v, r]) => <button key={v} type="button" role="menuitem" onClick={() => aplicar(v)}>{r}</button>)}
          {extra}
        </div>
      </>)}
    </div>
  );
}

/** Aba "Carga diária" (tb_diaria) */
function CargaDiaria({ roteiros, notificar }) {
  const [data, setData] = useState(hoje());
  const [f, setF] = useState(PADRAO);
  const [brutas, setRows] = useState([]);
  const ordem = useOrdem(brutas);
  const rows = ordem.rows;
  const [carregando, setCarregando] = useState(false);
  const [log, setLog] = useState([]);
  const [bip, setBip] = useState('');
  const sel = useSelecao(rows);
  const item = rows.find((r) => r.id === sel.foco) ?? null;

  const carrega = useCallback(async () => {
    setCarregando(true);
    try {
      const qs = new URLSearchParams({ data, ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, String(v)])) });
      const r = await api.get(`/cargas/diaria?${qs}`);
      setRows(r); sel.setMarcados((m) => new Set([...m].filter((id) => r.some((x) => x.id === id))));
    } catch (e) { setRows([]); notificar('erro', e.message); } finally { setCarregando(false); }
  }, [data, f, notificar]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(carrega, 250); return () => clearTimeout(t); }, [carrega]);
  useEffect(() => { if (!sel.foco) { setLog([]); return; } api.get(`/cargas/diaria/${sel.foco}/etiquetas`).then(setLog).catch(() => setLog([])); }, [sel.foco]);

  const etiquetas = async () => {
    if (!sel.marcados.size) { notificar('erro', 'Selecione ao menos um item para impressão.'); return; }
    try {
      const ids = [...sel.marcados];
      const dados = await api.post('/cargas/etiquetas/dados', { ids });
      if (!(await confirmar(`Prosseguir com ${dados.length} etiqueta(s)?`))) return;
      const pecas = dados.map((d) => etiquetaItem({ ...d, nome: d.unidade_nome }));
      await imprimirDocumento('etiqueta-carga', { corpo: pecas.map((p) => p.corpo).join(''), css: `${pecas[0].css}.e{page-break-after:always}`, semNavegador: temDestino('etiqueta-carga') }, notificar);
      await api.post('/cargas/etiquetas', { ids }); // o navegador não confirma a impressão: registra ao enviar (como o Delphi)
      notificar('ok', `${ids.length} etiqueta(s) enviada(s) para impressão.`);
      await carrega();
      if (sel.foco) api.get(`/cargas/diaria/${sel.foco}/etiquetas`).then(setLog).catch(() => {});
    } catch (e) { notificar('erro', e.message); }
  };
  const teclas = (e) => {
    if (e.key !== 'Enter' || !item) return;
    e.preventDefault();
    if (bool(item.cancelado)) notificar('erro', 'Programação cancelada!'); else etiquetas();
  };
  const separar = async (e) => {
    if (e.key !== 'Enter') return;
    const id = Number(bip.trim());
    if (!Number.isInteger(id) || id <= 0) { notificar('erro', 'Número da etiqueta inválido.'); return; }
    try { await api.post('/cargas/diaria/separar', { ids: [id] }); setBip(''); await carrega(); sel.setFoco(id); notificar('ok', `Item ${id} separado.`); } catch (er) { notificar('erro', er.message); }
  };
  const separarMarcadas = async () => {
    if (!sel.marcados.size) { notificar('erro', 'Marque ao menos uma linha.'); return; }
    try { const r = await api.post('/cargas/diaria/separar', { ids: [...sel.marcados] }); await carrega(); notificar('ok', `${r.atualizados} item(ns) separado(s).`); } catch (er) { notificar('erro', er.message); }
  };

  return (
    <div className="cg-aba">
      <section className="cg-filtros">
        <div className="cg-gr"><span className="cg-rot">Data</span><input type="date" value={data} onChange={(e) => e.target.value && setData(e.target.value)} aria-label="Data da carga" /></div>
        {FILTROS.map(([k, t, o]) => <Segmentado key={k} titulo={t} opcoes={o} valor={f[k]} onMudar={(i) => setF({ ...f, [k]: i })} />)}
        <div className="cg-gr"><span className="cg-rot">Extra</span><select value={f.extra} onChange={(e) => setF({ ...f, extra: Number(e.target.value) })}>{EXTRAS.map((o, i) => <option key={o} value={i}>{o}</option>)}</select></div>
        <div className="cg-gr"><span className="cg-rot">Região</span><select value={f.regiao} onChange={(e) => setF({ ...f, regiao: Number(e.target.value) })}>{REGIOES.map((o, i) => <option key={o} value={i}>{o}</option>)}</select></div>
        <button type="button" className="trb2-btn principal" onClick={carrega} disabled={carregando}>⟳ Atualizar</button>
      </section>

      <div className="cg-barra cg-acoes">
        <span className={`trb2-chip${sel.marcados.size ? ' on' : ''}`}>Registros marcados: {sel.marcados.size}</span>
        <button type="button" className="trb2-btn" onClick={() => sel.setMarcados(new Set(rows.map((r) => r.id)))}>Selecionar tudo</button>
        <button type="button" className="trb2-btn principal" onClick={etiquetas}>🏷 Etiquetas</button>
        <MenuAcomodacao tabela="diaria" sel={sel} aoAplicar={carrega} notificar={notificar}
          extra={<><small>Outras ações</small><button type="button" role="menuitem" onClick={etiquetas}>🏷 Etiqueta adesiva</button><button type="button" role="menuitem" onClick={separarMarcadas}>✔ Marcar como separadas</button></>} />
        <span className="cg-esp" />
        <input className="cg-bip" value={bip} onChange={(e) => setBip(e.target.value.replace(/\D/g, ''))} onKeyDown={separar} placeholder="Separar: nº da etiqueta + Enter" aria-label="Separar pelo número da etiqueta" />
      </div>
      <EditorItem tabela="diaria" item={item} roteiros={roteiros} aoGravar={carrega} notificar={notificar} />

      <div className="cg-meio">
        <section className="trb2-card cg-lista">
          <Grade cols={COLS_DIARIA} rows={rows} sel={sel} ordem={ordem} classe={classeDiaria} vazio={carregando ? 'Carregando…' : 'Nenhum item para este filtro'} onKeyDown={teclas} />
          <footer>{rows.length} item(ns){rows.length >= 5000 ? ' — lista limitada; refine o filtro' : ''} · Enter imprime a etiqueta do item</footer>
        </section>
        <aside className="trb2-card cg-log">
          <header><div><h3>Log de impressão de etiquetas</h3><p>{item ? item.unidade_nome : 'Escolha um item'}</p></div></header>
          <div className="trb2-tab">
            <table><thead><tr><th>Data e hora</th><th>Usuário</th><th>Origem</th></tr></thead>
              <tbody>{log.map((l) => <tr key={l.id}><td>{brData(String(l.data_hora))} {String(l.data_hora).slice(11, 16)}</td><td>{l.usuario}</td><td>{l.origem}</td></tr>)}
                {log.length === 0 && <tr><td colSpan={3} className="trb2-vazio">Sem impressões</td></tr>}</tbody></table>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Aba "Carga fixa" (tb_fixa) */
function CargaFixa({ roteiros, notificar }) {
  const [dia, setDia] = useState(semanaDia(hoje()));
  const [des, setDes] = useState(() => new Set()); // chips desmarcados
  const [brutas, setRows] = useState([]);
  const ordem = useOrdem(brutas);
  const rows = ordem.rows;
  const [carregando, setCarregando] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(true);
  const sel = useSelecao(rows);
  const item = rows.find((r) => r.id === sel.foco) ?? null;

  const carrega = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api.get(`/cargas/fixa?dia=${dia}&desmarcados=${[...des].join(',')}`);
      setRows(r); sel.setMarcados(new Set());
    } catch (e) { setRows([]); notificar('erro', e.message); } finally { setCarregando(false); }
  }, [dia, des, notificar]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(carrega, 250); return () => clearTimeout(t); }, [carrega]);
  const alterna = (k) => setDes((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const grupo = (chaves, ligar) => setDes((s) => { const n = new Set(s); chaves.forEach((k) => (ligar ? n.delete(k) : n.add(k))); return n; });

  return (
    <div className="cg-aba">
      <section className="cg-filtros">
        <Segmentado titulo="Dia da semana" opcoes={DIAS_SEMANA} valor={dia - 1} onMudar={(i) => setDia(i + 1)} />
        <button type="button" className="trb2-btn" onClick={() => setFiltrosAbertos((x) => !x)}>{filtrosAbertos ? '▴ Esconder filtros' : `▾ Filtros${des.size ? ` (${des.size} desmarcado(s))` : ''}`}</button>
        <button type="button" className="trb2-btn principal" onClick={carrega} disabled={carregando}>⟳ Atualizar</button>
      </section>
      {filtrosAbertos && (
        <section className="cg-chipbox">
          {GRUPOS_FIXA.map(([titulo, itens]) => (
            <div key={titulo} className="cg-gr"><span className="cg-rot">{titulo} <a role="button" tabIndex={0} onClick={() => grupo(itens.map((x) => x[0]), true)} title="Marcar todos do grupo">todos</a> · <a role="button" tabIndex={0} onClick={() => grupo(itens.map((x) => x[0]), false)} title="Desmarcar todos do grupo">nenhum</a></span>
              <div className="nf2-chips">{itens.map(([k, r]) => <label key={k} className={`nf2-chip${des.has(k) ? '' : ' on'}`}><input type="checkbox" checked={!des.has(k)} onChange={() => alterna(k)} />{r}</label>)}</div>
            </div>
          ))}
        </section>
      )}
      <div className="cg-barra cg-acoes">
        <span className={`trb2-chip${sel.marcados.size ? ' on' : ''}`}>Registros marcados: {sel.marcados.size}</span>
        <button type="button" className="trb2-btn" onClick={() => sel.setMarcados(new Set(rows.map((r) => r.id)))}>Selecionar tudo</button>
        <MenuAcomodacao tabela="fixa" sel={sel} aoAplicar={carrega} notificar={notificar} />
      </div>
      <EditorItem tabela="fixa" item={item} roteiros={roteiros} aoGravar={carrega} notificar={notificar} />
      <div className="cg-meio">
        <section className="trb2-card cg-lista">
          <Grade cols={COLS_FIXA} rows={rows} sel={sel} ordem={ordem} classe={() => ''} vazio={carregando ? 'Carregando…' : 'Nenhuma programação fixa para este filtro'} />
          <footer>{rows.length} item(ns)</footer>
        </section>
      </div>
    </div>
  );
}

/** Roteiro de cargas (u_cargas) */
export default function Cargas({ onFechar }) {
  const [aba, setAba] = useState('diaria');
  const [roteiros, setRoteiros] = useState([]);
  const [aviso, setAviso] = useState(null);
  const notificar = useCallback((tipo, m) => setAviso({ tipo, m }), []);
  useEffect(() => { if (!aviso) return undefined; const t = setTimeout(() => setAviso(null), 8000); return () => clearTimeout(t); }, [aviso]);
  useEffect(() => { api.get('/cargas/roteiros').then(setRoteiros).catch((e) => notificar('erro', e.message)); }, [notificar]);
  const abas = useMemo(() => [['diaria', '🚚 Carga diária'], ['fixa', '📌 Carga fixa']], []);
  return (
    <div className="cg">
      <Toast aviso={aviso} />
      <header className="cg-topo">
        <div className="cg-tit"><b>🚚 Roteiro de cargas</b><small>Acomodação, etinerário e etiquetas da expedição</small></div>
        <nav className="dr2-abas" role="tablist">{abas.map(([k, r]) => <button key={k} type="button" role="tab" aria-selected={aba === k} className={aba === k ? 'on' : ''} onClick={() => setAba(k)}>{r}</button>)}</nav>
        <span className="cg-esp" />
        <button type="button" className="trb2-btn" onClick={onFechar}>Fechar</button>
      </header>
      {aba === 'diaria' ? <CargaDiaria roteiros={roteiros} notificar={notificar} /> : <CargaFixa roteiros={roteiros} notificar={notificar} />}
    </div>
  );
}
