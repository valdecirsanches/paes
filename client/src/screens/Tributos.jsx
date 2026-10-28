import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Modal } from '../components/ui.jsx';
import { Toast, confirmar } from '../components/toast.jsx';
import { useJanela } from '../components/janela.js';

// Colunas do CSV (todas as da tabela); a grade mostra só as essenciais.
const COLS = ['id', 'descricao', 'aliq_ipi', 'sit_trib', 'cst_icms', 'aliq_icms', 'ncm', 'cest', 'cfop', 'cClassTrib', 'pIBS', 'pCBS', 'red_aliq', 'legislacao', 'red_b_c_icms',
  'cst_ipi', 'cst_pis', 'cst_cofins', 'natureza', 'aliq_pis', 'aliq_cofins', 'base_legal_icms', 'base_legal_pis_cofins', 'cst', 'tipo_trib', 'cBenef'];
const GRADE = [['id', 'Cód.'], ['descricao', 'Descrição'], ['ncm', 'NCM'], ['cfop', 'CFOP'], ['sit_trib', 'Sit.'], ['aliq_icms', 'ICMS %'], ['aliq_ipi', 'IPI %'], ['cClassTrib', 'cClassTrib'], ['pIBS', 'IBS %'], ['pCBS', 'CBS %']];
// Formulário do tributo, em grupos: [título, [[campo, rótulo, largura(colunas)]]]
const GRUPOS = [
  ['Classificação', [['ncm', 'NCM'], ['cest', 'CEST'], ['cfop', 'CFOP'], ['tipo_trib', 'Tipo de tributação'], ['natureza', 'Natureza', 2]]],
  ['ICMS / IPI', [['sit_trib', 'Sit. tributária'], ['aliq_icms', 'Alíq. ICMS'], ['red_b_c_icms', 'Red. base ICMS'], ['aliq_ipi', 'Alíq. IPI'], ['cst_ipi', 'CST IPI']]],
  ['PIS / COFINS', [['cst_pis', 'CST PIS'], ['aliq_pis', 'Alíq. PIS'], ['cst_cofins', 'CST COFINS'], ['aliq_cofins', 'Alíq. COFINS']]],
  ['IBS / CBS (reforma tributária)', [['cst', 'CST'], ['cClassTrib', 'cClassTrib'], ['pIBS', 'pIBS'], ['pCBS', 'pCBS'], ['red_aliq', 'Red. da base'], ['cBenef', 'cBenef']]],
  ['Legislação', [['legislacao', 'Legislação', 4], ['base_legal_icms', 'Base legal ICMS', 2], ['base_legal_pis_cofins', 'Base legal PIS/COFINS', 2]]],
];
const txt = (v) => (v === null || v === undefined ? '' : String(v));

/** Edição de um tributo (antes pnlEditaTributo): navega entre os tributos da grade, inclui, grava e exclui. */
function EditaTributo({ tributos, foco, setFoco, recarregar, aviso, onFechar, iniciaNovo }) {
  const [draft, setDraft] = useState({});
  const [novo, setNovo] = useState(Boolean(iniciaNovo));
  const atual = tributos.find((t) => t.id === foco) ?? null;
  const sujo = novo || Object.keys(draft).length > 0;
  const idx = tributos.findIndex((t) => t.id === foco);
  const v = (k) => (k in draft ? draft[k] : novo ? '' : txt(atual?.[k]));
  const mudar = (k, valor) => setDraft((d) => ({ ...d, [k]: valor }));
  useEffect(() => { setDraft({}); }, [foco]);

  const ir = (i) => {
    if (sujo) { aviso('erro', 'Grave ou cancele as alterações antes de mudar de tributo.'); return; }
    const t = tributos[Math.max(0, Math.min(tributos.length - 1, i))];
    if (t) setFoco(t.id);
  };
  const gravar = async () => {
    try {
      if (novo) {
        const r = await api.post('/tributos', { ...draft });
        await recarregar(); setNovo(false); setDraft({}); setFoco(r.id); aviso('ok', `Tributo ${r.id} incluído.`);
      } else if (sujo) {
        await api.put(`/tributos/${foco}`, draft); await recarregar(); setDraft({}); aviso('ok', 'Tributo gravado.');
      }
    } catch (e) { aviso('erro', e.message); }
  };
  const excluir = async () => {
    if (!(await confirmar(`Excluir o tributo ${foco} (${txt(atual?.descricao)})?`))) return;
    try { await api.del(`/tributos/${foco}`); await recarregar(); aviso('ok', 'Tributo excluído.'); } catch (e) { aviso('erro', e.message); }
  };
  const fechar = () => { if (sujo) { aviso('erro', 'Grave ou cancele as alterações antes de fechar.'); return; } onFechar(); };
  const vazio = !atual && !novo;
  return (
    <Modal titulo={novo ? 'Novo tributo' : `Tributo ${atual?.id ?? ''}`} onFechar={fechar} largo>
      <div className="trb2-edita">
        <label className="trb2-desc"><span>Descrição</span><input value={v('descricao')} disabled={vazio} onChange={(e) => mudar('descricao', e.target.value)} autoFocus /></label>
        {GRUPOS.map(([titulo, campos]) => (
          <fieldset key={titulo}><legend>{titulo}</legend>
            <div className="trb2-grid">
              {campos.map(([k, r, w = 1]) => <label key={k} style={{ gridColumn: `span ${w}` }}><span>{r}</span><input value={v(k)} disabled={vazio} onChange={(e) => mudar(k, e.target.value)} /></label>)}
            </div>
          </fieldset>
        ))}
        <div className="trb2-edita-rod">
          <div className="trb2-nav">
            <button type="button" title="Anterior" disabled={sujo || idx <= 0} onClick={() => ir(idx - 1)}>◀</button>
            <span>{novo ? 'novo' : idx >= 0 ? `${idx + 1} / ${tributos.length}` : '—'}</span>
            <button type="button" title="Próximo" disabled={sujo || idx < 0 || idx >= tributos.length - 1} onClick={() => ir(idx + 1)}>▶</button>
          </div>
          <button type="button" className="trb2-btn" disabled={sujo} onClick={() => { setNovo(true); setDraft({}); }}>＋ Novo</button>
          <button type="button" className="trb2-btn perigo" disabled={!atual || novo} onClick={excluir}>Excluir</button>
          <span className="trb2-esp" />
          <button type="button" className="trb2-btn" disabled={!sujo} onClick={() => { setDraft({}); setNovo(false); }}>Cancelar</button>
          <button type="button" className="trb2-btn principal" disabled={!sujo} onClick={gravar}>✔ Gravar</button>
        </div>
      </div>
    </Modal>
  );
}

/** Linha de produto: memoizada — com milhares de produtos, marcar uma linha só redesenha ela. */
const LinhaProduto = memo(function LinhaProduto({ p, marc, foco, tit, onClick, onCheck }) {
  return (
    <tr className={`${marc ? 'marc' : ''}${foco ? ' foco' : ''}`} onClick={(e) => onClick(e, p.id)}>
      <td className="trb2-ck"><input type="checkbox" checked={marc} onChange={() => {}} onClick={(e) => { e.stopPropagation(); onCheck(e, p.id); }} aria-label={`Marcar ${p.descricao}`} /></td>
      <td>{p.codigo}</td><td>{p.descricao}</td>
      <td>{p.id_tributos ? <span className="trb2-tag" title={tit}>{p.id_tributos}</span> : <span className="trb2-tag sem">sem</span>}</td>
    </tr>
  );
});

/** Tributos: liga o código de tributação (tb_tributos) aos produtos e mantém o cadastro de tributos. */
export default function Tributos() {
  const [fProd, setFProd] = useState('');
  const [esconder, setEsconder] = useState(false);
  const [produtos, setProdutos] = useState([]);
  const [truncado, setTruncado] = useState(false);
  const [marcados, setMarcados] = useState(() => new Set());
  const [pFoco, setPFoco] = useState(null);
  const [fTrib, setFTrib] = useState('');
  const [tributos, setTributos] = useState([]);
  const [tFoco, setTFoco] = useState(null);
  const [editando, setEditando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const ancora = useRef(null);
  const notificar = useCallback((tipo, m) => setAviso({ tipo, m }), []);
  useEffect(() => { if (!aviso) return undefined; const t = setTimeout(() => setAviso(null), 9000); return () => clearTimeout(t); }, [aviso]);

  const carregaProdutos = useCallback(async () => {
    try {
      const r = await api.get(`/tributos/produtos?q=${encodeURIComponent(fProd)}${esconder ? '&esconder=1' : ''}`);
      setProdutos(r.produtos); setTruncado(r.truncado); setMarcados(new Set()); setPFoco(null);
    } catch (e) { notificar('erro', e.message); }
  }, [fProd, esconder, notificar]);
  const carregaTributos = useCallback(async () => {
    try {
      const rows = await api.get(`/tributos?q=${encodeURIComponent(fTrib)}`);
      setTributos(rows); setTFoco((f) => (rows.some((r) => r.id === f) ? f : rows[0]?.id ?? null));
    } catch (e) { notificar('erro', e.message); }
  }, [fTrib, notificar]);
  useEffect(() => { const t = setTimeout(carregaProdutos, 250); return () => clearTimeout(t); }, [carregaProdutos]);
  useEffect(() => { const t = setTimeout(carregaTributos, 250); return () => clearTimeout(t); }, [carregaTributos]);

  const produtosRef = useRef(produtos); produtosRef.current = produtos;
  // Clique na linha: simples = só ela; Ctrl = alterna; Shift = intervalo. Caixa de seleção: alterna (Shift = intervalo).
  const intervalo = (id) => {
    const ids = produtosRef.current.map((p) => p.id);
    const a = ids.indexOf(ancora.current); const b = ids.indexOf(id);
    return ids.slice(Math.min(a, b), Math.max(a, b) + 1);
  };
  const alterna = useCallback((id) => { setMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); ancora.current = id; }, []);
  const clicaProduto = useCallback((e, id) => {
    setPFoco(id);
    if (e.shiftKey && ancora.current != null) setMarcados(new Set(intervalo(id)));
    else if (e.ctrlKey || e.metaKey) alterna(id);
    else { setMarcados(new Set([id])); ancora.current = id; }
  }, [alterna]); // eslint-disable-line react-hooks/exhaustive-deps
  const checaProduto = useCallback((e, id) => {
    setPFoco(id);
    if (e.shiftKey && ancora.current != null) setMarcados((s) => new Set([...s, ...intervalo(id)]));
    else alterna(id);
  }, [alterna]); // eslint-disable-line react-hooks/exhaustive-deps
  const todosMarcados = produtos.length > 0 && marcados.size === produtos.length;
  const marcaTodos = () => setMarcados(todosMarcados ? new Set() : new Set(produtos.map((p) => p.id)));

  const tribAtual = tributos.find((t) => t.id === tFoco) ?? null;
  const indicar = async () => {
    if (!tribAtual) { notificar('erro', 'Selecione o tributo na lista da direita.'); return; }
    if (marcados.size === 0) { notificar('erro', 'Marque ao menos um produto (Ctrl/Shift + clique).'); return; }
    if (!(await confirmar(`Configurar tributos para produtos marcados?\n${marcados.size} produto(s) → tributo ${tribAtual.id} - ${tribAtual.descricao}`))) return;
    try {
      const r = await api.post('/tributos/atribuir', { tributo_id: tribAtual.id, produtos: [...marcados] });
      notificar('ok', `${r.produtos} produto(s) atualizado(s).`);
      const ids = new Set(marcados);
      setProdutos((ps) => (esconder ? ps.filter((p) => !ids.has(p.id)) : ps.map((p) => (ids.has(p.id) ? { ...p, id_tributos: tribAtual.id } : p))));
      setMarcados(new Set());
    } catch (e) { notificar('erro', e.message); }
  };
  // O Delphi abria o Excel por OLE; aqui baixa um CSV (o Excel abre direto).
  const exportar = () => {
    const celula = (v) => `"${txt(v).replace(/"/g, '""')}"`;
    const chaves = tributos[0] ? Object.keys(tributos[0]) : COLS;
    const csv = [chaves.map(celula).join(';'), ...tributos.map((t) => chaves.map((k) => celula(t[k])).join(';'))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    a.download = 'Tributos.csv'; document.body.appendChild(a); a.click(); a.remove();
    notificar('ok', 'Arquivo gerado com sucesso (Tributos.csv).');
  };
  const novoTributo = () => setEditando('novo');
  const jp = useJanela(produtos.length);
  const jt = useJanela(tributos.length);
  // lista nova (busca/filtro): volta ao topo
  useEffect(() => { if (jp.ref.current) jp.ref.current.scrollTop = 0; }, [fProd, esconder]); // eslint-disable-line react-hooks/exhaustive-deps
  const nomeTrib = useMemo(() => new Map(tributos.map((t) => [t.id, t.descricao])), [tributos]);

  return (
    <div className="trb2">
      <Toast aviso={aviso} />
      <section className="trb2-card trb2-prod">
        <header>
          <div><h3>Produtos</h3><p>Use as caixas (ou Ctrl/Shift + clique) para marcar vários</p></div>
          <span className={`trb2-chip${marcados.size ? ' on' : ''}`}>{marcados.size} marcado(s)</span>
        </header>
        <div className="trb2-filtro">
          <input type="search" value={fProd} onChange={(e) => setFProd(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && carregaProdutos()} placeholder="Buscar por descrição ou código…" aria-label="Buscar produto" />
          <label className="trb2-chk"><input type="checkbox" checked={esconder} onChange={(e) => setEsconder(e.target.checked)} /> Só os sem tributo</label>
        </div>
        <div className="trb2-tab" ref={jp.ref} onScroll={jp.onScroll}>
          <table>
            <thead><tr><th className="trb2-ck"><input type="checkbox" checked={todosMarcados} onChange={marcaTodos} aria-label="Marcar todos os produtos listados" title="Marcar/desmarcar todos os listados" /></th><th>Código</th><th>Produto</th><th>Tributo</th></tr></thead>
            <tbody>
              {jp.acima > 0 && <tr className="trb2-esp-l" style={{ height: jp.acima }}><td colSpan={4} /></tr>}
              {produtos.slice(jp.ini, jp.fim).map((p) => <LinhaProduto key={p.id} p={p} marc={marcados.has(p.id)} foco={p.id === pFoco} tit={nomeTrib.get(p.id_tributos) ?? ''} onClick={clicaProduto} onCheck={checaProduto} />)}
              {jp.abaixo > 0 && <tr className="trb2-esp-l" style={{ height: jp.abaixo }}><td colSpan={4} /></tr>}
              {produtos.length === 0 && <tr><td colSpan={4} className="trb2-vazio">Nenhum produto</td></tr>}
            </tbody>
          </table>
        </div>
        <footer>{produtos.length} produto(s){truncado ? ' — lista limitada; refine a busca' : ''}</footer>
      </section>

      <div className="trb2-meio">
        <button type="button" className="trb2-aplicar" onClick={indicar} disabled={!tribAtual || marcados.size === 0} title="Indicar o tributo selecionado (à direita) a todos os produtos marcados (à esquerda)">
          <span aria-hidden="true">⬅</span>Aplicar tributo<small>aos marcados</small>
        </button>
      </div>

      <section className="trb2-card trb2-trib">
        <header>
          <div><h3>Tributos</h3><p>{tribAtual ? `Selecionado: ${tribAtual.id} — ${tribAtual.descricao}` : 'Selecione um tributo'}</p></div>
          <div className="trb2-acoes">
            <button type="button" className="trb2-btn" onClick={novoTributo}>＋ Novo</button>
            <button type="button" className="trb2-btn" disabled={!tribAtual} onClick={() => setEditando('editar')}>✎ Editar</button>
            <button type="button" className="trb2-btn" onClick={exportar} title="Baixa todos os campos em CSV (abre no Excel)">⇩ Exportar</button>
          </div>
        </header>
        <div className="trb2-filtro"><input type="search" value={fTrib} onChange={(e) => setFTrib(e.target.value.toUpperCase())} placeholder="Filtrar tributos pela descrição…" aria-label="Filtrar tributos" /></div>
        <div className="trb2-tab" ref={jt.ref} onScroll={jt.onScroll}>
          <table>
            <thead><tr>{GRADE.map(([, r]) => <th key={r}>{r}</th>)}</tr></thead>
            <tbody>
              {jt.acima > 0 && <tr className="trb2-esp-l" style={{ height: jt.acima }}><td colSpan={GRADE.length} /></tr>}
              {tributos.slice(jt.ini, jt.fim).map((t) => (
                <tr key={t.id} className={t.id === tFoco ? 'marc foco' : ''} onClick={() => setTFoco(t.id)} onDoubleClick={() => { setTFoco(t.id); setEditando('editar'); }}>
                  {GRADE.map(([c]) => <td key={c}>{txt(t[c])}</td>)}
                </tr>
              ))}
              {jt.abaixo > 0 && <tr className="trb2-esp-l" style={{ height: jt.abaixo }}><td colSpan={GRADE.length} /></tr>}
              {tributos.length === 0 && <tr><td colSpan={GRADE.length} className="trb2-vazio">Nenhum tributo</td></tr>}
            </tbody>
          </table>
        </div>
        <footer>{tributos.length} tributo(s) · duplo clique para editar</footer>
      </section>

      {editando && <EditaTributo key={editando} iniciaNovo={editando === 'novo'} tributos={tributos} foco={tFoco} setFoco={setTFoco} recarregar={carregaTributos} aviso={notificar} onFechar={() => setEditando(false)} />}
    </div>
  );
}
