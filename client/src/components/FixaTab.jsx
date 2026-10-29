import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import {
  ACOMODACOES, DIAS, EXTRAS, bool, cargaPorHora, descricaoExpedicao, fmtMoeda, fmtQtde, hhmm, semanaDia, turnoPorHora,
} from '../lib/rules.js';
import * as imp from '../lib/print.js';
import { BuscaProduto, Modal } from './ui.jsx';
import { Num } from './DiariaTab.jsx';
import { Campo, HoraGrande, Pilula, TopoItem, horasDoDia } from './ItemForm.jsx';
import { confirmar } from './toast.jsx';

const Ico = ({ children }) => <svg className="ico" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">{children}</svg>;
const IcoUsuario = () => <Ico><circle cx="12" cy="8" r="4.2" fill="#e8b98a" stroke="#6b4a2b" /><path d="M3 22c0-5 4-8 9-8s9 3 9 8z" fill="#3b4a5c" /><path d="M7 5.5c1-3 9-3 10 0z" fill="#2b2b2b" /></Ico>;
const IcoDisco = () => <Ico><path d="M3 3h15l3 3v15H3z" fill="#334" /><rect x="6" y="3" width="10" height="6" fill="#dde" /><rect x="6" y="13" width="12" height="8" fill="#9ab" /><rect x="12.5" y="4" width="2.2" height="4" fill="#334" /></Ico>;
const IcoDesfazer = () => <Ico><path d="M5 11a8 8 0 1 1 3 8" fill="none" stroke="#e08a00" strokeWidth="3.2" /><path d="M1.5 6l8 .5-4 7z" fill="#e08a00" /></Ico>;
const IcoAtivar = () => <Ico><circle cx="12" cy="12" r="9" fill="#3fa34d" stroke="#1d6b28" /><path d="M7 12.5l3.5 3.5L17 9" fill="none" stroke="#fff" strokeWidth="2.6" /></Ico>;
const IcoPasta = () => <Ico><path d="M2 6h7l2 2h11v12H2z" fill="#f0c04a" stroke="#8a6a12" /></Ico>;

const classeFixa = (i) => (bool(i.produto_producao) ? (bool(i.produto_especial) ? 'fx-esp' : 'fx-prod') : 'fx-merc');
const novoItem = (dia) => ({
  semana_dia: dia, hora: '', produto_codigo: '', produto_qtde: 0, produto_descricao_original: '', produto_descricao_expedicao: '',
  referencia_descricao: '', produto_producao: 'False', produto_especial: 'False', producao_dias: 0, producao_turno: '', carga: '',
  acomodacao_carga: 'SACARIA', id_roteiro: 0, ...Object.fromEntries(EXTRAS.map(([k]) => [`extra_${k}`, 'False'])),
});

/** Programação fixa (aba cxTabSheet2): barra de botões, painel pnlFixa e grade gridPrf. */
export default function FixaTab({ status, roteiros, onChanged, notify }) {
  const diaData = semanaDia(status.data);
  const [dia, setDia] = useState(diaData);
  const [info, setInfo] = useState({ itens: [], ativavel: false, ativada: false });
  const [selId, setSelId] = useState(null);
  const [draft, setDraft] = useState(null); // dsedit / dsinsert
  const [painel, setPainel] = useState(false); // pnlFixa
  const [modal, setModal] = useState(null);
  const [menu, setMenu] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const refs = useRef({});
  const pedeFoco = useRef(null); // foca assim que o campo existir na tela (não depende de tempo)
  const aplicaFoco = () => { const n = pedeFoco.current; const el = n && refs.current[n]; if (el) { pedeFoco.current = null; el.focus(); el.select?.(); } };
  const foca = (n) => { pedeFoco.current = n; setTimeout(aplicaFoco, 30); };
  useEffect(aplicaFoco);

  const carregar = useCallback(async () => {
    const r = await api.get(`/status/${status.id}/fixa?dia=${dia}`);
    setInfo(r);
    setSelId((id) => (r.itens.some((i) => i.id === id) ? id : r.itens[0]?.id ?? null));
  }, [status.id, dia]);
  useEffect(() => { carregar().catch((e) => notify.erro(e.message)); }, [carregar]); // eslint-disable-line react-hooks/exhaustive-deps

  const item = info.itens.find((i) => i.id === selId) || null;
  const editando = !!draft;
  const novo = editando && !draft.id;
  const hidratar = (i) => ({ ...i, hora: hhmm(i.hora), produto_descricao_original: i.produto_descricao ?? '' });
  const v = draft ?? (item ? hidratar(item) : null);
  const producao = v ? bool(v.produto_producao) : false;
  const mercadoria = v && !producao && !!v.produto_codigo;

  const rodar = async (fn, ok, tambemDiaria) => {
    try {
      const r = await fn(); await carregar();
      if (tambemDiaria) await onChanged();
      if (ok) notify.ok(typeof ok === 'function' ? ok(r) : ok);
    } catch (e) { notify.erro(e.message); }
  };

  /* ----- edição (dsprfDataChange) ----- */
  const editar = (mud) => setDraft((d) => {
    const base = d ?? (item ? hidratar(item) : null);
    if (!base) return d;
    let n = { ...base, ...mud };
    if ('hora' in mud && n.hora) n = { ...n, producao_turno: turnoPorHora(n.hora), carga: cargaPorHora(n.hora) };
    if (Object.keys(mud).some((k) => k.startsWith('extra_'))) n = { ...n, produto_descricao_expedicao: descricaoExpedicao(n.referencia_descricao, n) };
    return n;
  });
  const gravarRef = useRef(null); const draftRef = useRef(null);
  // Produto escolhido = último dado do item (hora e qtde vêm antes): se está completo, grava; senão leva ao que falta.
  const gravaSeCompleto = () => setTimeout(() => {
    const r = draftRef.current; if (!r) return;
    if (r.hora && r.produto_codigo && Number(r.produto_qtde) > 0) gravarRef.current?.(); else foca(r.hora ? 'qtde' : 'hora');
  }, 120);
  const aplicarProduto = (p) => {
    const especial = bool(p.produto_especial);
    editar({
      produto_codigo: p.codigo, id_produto: p.id, produto_descricao_original: p.descricao,
      produto_descricao_expedicao: p.descricao_expedicao || p.descricao, referencia_descricao: p.referencia_descricao,
      produto_producao: p.produto_producao, produto_especial: p.produto_especial,
      producao_dias: bool(p.produto_producao) && especial ? 1 : 0,
      acomodacao_carga: especial ? 'CAIXA AMARELINHA' : 'SACARIA',
      ...Object.fromEntries(EXTRAS.map(([k]) => [`extra_${k}`, p[`extra_${k}`] ?? 'False'])),
    });
    gravaSeCompleto();
  };
  const resolverCodigo = async (codigo) => {
    const c = String(codigo ?? '').trim();
    if (!c || c === '0') { setModal({ tipo: 'busca' }); return; }
    if (c === (item?.produto_codigo ?? '') && !novo) return;
    try { aplicarProduto(await api.get(`/produtos/codigo/${encodeURIComponent(c)}`)); } catch { notify.erro('Produto não encontrado!!!'); foca('codigo'); }
  };

  /* ----- botões ----- */
  const incluir = () => { if (editando) return; setPainel(true); setDraft(novoItem(dia)); setSelId(null); foca('hora'); };
  const alterar = () => {
    if (editando) return;
    if (!info.itens.length) { notify.erro('Não há itens para o procedimento.'); return; }
    setPainel((p) => !p); foca('hora');
  };
  const excluir = async () => {
    if (editando) return;
    if (!item) { notify.erro('Não há itens para o procedimento.'); return; }
    if ((await confirmar('Eliminar o item programado?'))) rodar(() => api.del(`/fixa/${item.id}`), 'Item excluído.');
  };
  const gravar = async () => {
    const r = draft;
    if (!r) return;
    if (!r.hora) { notify.erro('Informe a hora da entrega.'); foca('hora'); return; }
    if (!String(r.produto_codigo ?? '').length) { notify.erro('Informe o produto.'); foca('codigo'); return; }
    if (!(Number(r.produto_qtde) > 0)) { notify.erro('Informe a quantidade.'); foca('qtde'); return; }
    const corpo = {
      semana_dia: Number(r.semana_dia), hora: r.hora, produto_codigo: r.produto_codigo, produto_qtde: Number(r.produto_qtde) || 0,
      produto_descricao_expedicao: r.produto_descricao_expedicao || r.produto_descricao_original,
      producao_dias: Number(r.producao_dias) || 0, id_roteiro: Number(r.id_roteiro) || 0, acomodacao_carga: r.acomodacao_carga,
      ...(r.carga ? { carga: Number(r.carga) } : {}), ...(r.producao_turno ? { producao_turno: Number(r.producao_turno) } : {}),
      ...Object.fromEntries(EXTRAS.map(([k]) => [`extra_${k}`, r[`extra_${k}`] ?? 'False'])),
    };
    setOcupado(true);
    try {
      let id = r.id;
      if (novo) ({ id } = await api.post(`/status/${status.id}/fixa`, corpo)); else await api.put(`/fixa/${r.id}`, corpo);
      setDraft(null); await carregar(); setSelId(id); notify.ok('Item gravado.');
    } catch (e) { notify.erro(e.message); } finally { setOcupado(false); }
  };
  const ativarOuDesativar = async () => {
    if (info.ativada) {
      if (!(await confirmar('Deseja desativar a programação fixa?'))) return;
      rodar(() => api.post(`/status/${status.id}/fixa/desativar`), (r) => `${r.removidos} item(ns) removido(s) da diária.`, true);
    } else rodar(() => api.post(`/status/${status.id}/fixa/ativar`), (r) => `Fixa ativada: ${r.criados} criado(s), ${r.atualizados} reativado(s).`, true);
  };
  const imprimirPasta = async () => {
    try {
      const linhas = await api.get(`/status/${status.id}/pasta`);
      if (!linhas.length) { notify.erro('Esta unidade não tem programação fixa.'); return; }
      const { corpo, css } = imp.pasta(status.unidade_nome, linhas); imp.imprimirHtml(corpo, css);
    } catch (e) { notify.erro(e.message); }
  };
  const replicar = async (dias, pergunta) => item && (await confirmar(pergunta)) && rodar(() => api.post(`/fixa/${item.id}/replicar`, { dias }), 'Item ajustado nos outros dias.');
  const copiarDiaSeguinte = async () => {
    const pedir = (extra = {}) => api.post(`/status/${status.id}/fixa/copiar-dia-seguinte`, { semana_dia: dia, ...extra });
    const ok = (r) => notify.ok(`${r.copiados} item(ns) copiado(s) para ${DIAS[r.semana_dia - 1]}.`);
    try { ok(await pedir()); } catch (e) {
      if (e.data?.codigo === 'CONFIRMAR' && (await confirmar(e.message))) rodar(() => pedir({ confirmar: true }), ok); else if (e.data?.codigo !== 'CONFIRMAR') notify.erro(e.message);
    }
  };
  const verLog = async () => {
    if (!item) return;
    try { setModal({ tipo: 'log', linhas: await api.get(`/fixa/${item.id}/log`) }); } catch (e) { notify.erro(e.message); }
  };

  useEffect(() => {
    const tecla = (e) => {
      if (modal) return;
      if (e.key === 'F2') { e.preventDefault(); incluir(); }
      if (e.key === 'F3') { e.preventDefault(); alterar(); }
      if (e.key === 'F4') { e.preventDefault(); excluir(); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });
  useEffect(() => {
    if (!menu) return undefined;
    const fecha = (e) => { if (e.type === 'keydown' && e.key !== 'Escape') return; setMenu(null); };
    window.addEventListener('click', fecha); window.addEventListener('keydown', fecha);
    return () => { window.removeEventListener('click', fecha); window.removeEventListener('keydown', fecha); };
  }, [menu]);

  const trocarDia = (n) => { if (editando) { notify.erro('Grave ou desfaça o item em edição antes de trocar o dia.'); return; } setDia(n); };
  const escolher = (id) => { if (!editando) setSelId(id); };
  const enterComoTab = (e) => {
    if (e.key !== 'Enter' || ['TEXTAREA', 'BUTTON'].includes(e.target.tagName)) return;
    e.preventDefault();
    const campos = [...e.currentTarget.querySelectorAll('input:not([disabled]):not([readonly]), select')];
    const prox = campos[campos.indexOf(e.target) + 1]; e.target.blur();
    if (prox) setTimeout(() => prox.focus(), 0); else if (editando) setTimeout(() => gravarRef.current?.(), 60); // Enter no último campo grava o item
  };
  gravarRef.current = gravar; draftRef.current = draft;
  const ref = (n) => (el) => { refs.current[n] = el; };
  const set = (k) => (e) => editar({ [k]: e.target.value });

  return (
    <section className="diaria fixa">
      <div className="tb">
        <button className="bt ic" title="Log de operações da programação fixa" onClick={verLog} disabled={!item}><IcoUsuario /></button>
        <button className="bt" onClick={incluir} disabled={editando}>F2 Incluir</button>
        <button className="bt" onClick={alterar} disabled={editando}>F3 Alterar</button>
        <button className="bt" onClick={excluir} disabled={editando}>F4 Excluir</button>
        <button className="bt larga" onClick={gravar} disabled={!editando || ocupado}><IcoDisco />&nbsp;Salvar</button>
        <button className="bt larga" onClick={() => setDraft(null)} disabled={!editando}><IcoDesfazer />&nbsp;Desfazer</button>
        <button className="bt larga" onClick={ativarOuDesativar} disabled={!info.ativavel || editando}
          title={info.ativavel ? '' : 'Só vale quando o dia da semana é o mesmo da data do movimento'}><IcoAtivar />&nbsp;{info.ativada ? 'Desativar' : 'Ativar'}</button>
        <button className="bt larga" onClick={imprimirPasta}><IcoPasta />&nbsp;Pasta</button>
        <fieldset className="semana" title="Selecione o dia da semana para ver a programação" role="radiogroup">
          {DIAS.map((d, i) => (
            <label key={d} className={dia === i + 1 ? 'on' : ''}><input type="radio" name="semana" checked={dia === i + 1} onChange={() => trocarDia(i + 1)} />{d === 'Sáb' ? 'Sab' : d}</label>
          ))}
        </fieldset>
        {dia !== diaData && <span className="dica">Exibindo {DIAS[dia - 1]}; o movimento é de {DIAS[diaData - 1]}.</span>}
      </div>

      {painel && v && (
        <div className={`if if-fixa${novo ? ' novo' : ''}`} onKeyDown={enterComoTab}>
          <TopoItem novo={novo} sujo={editando} contexto={`Fixa · ${DIAS[(v.semana_dia ?? dia) - 1] ?? ''}`} />
          <div className="if-corpo">
            <div className="if-linha if-l1">
              <HoraGrande refHora={ref('hora')} valor={v.hora} onChange={(h) => editar({ hora: h })} sugestoes={horasDoDia(info.itens)} />
              <Campo rotulo="Qtde" className="if-destaque if-qtde"><Num className="if-n centro" inputRef={ref('qtde')} casas={[0, 3]} value={v.produto_qtde} onChange={(n) => editar({ produto_qtde: n })} /></Campo>
              <Campo rotulo="Produto" dica={mercadoria ? 'mercadoria' : ''} className="if-cod"><input ref={ref('codigo')} value={v.produto_codigo ?? ''} onChange={set('produto_codigo')} placeholder="código"
                onBlur={(e) => resolverCodigo(e.target.value)} onDoubleClick={() => setModal({ tipo: 'busca' })} title="Duplo clique pesquisa o produto" /></Campo>
              <Campo rotulo="Descrição original do produto" className="if-orig"><input readOnly tabIndex={-1} value={v.produto_descricao_original ?? ''} /></Campo>
            </div>
            <div className="if-linha if-l2 if-so1">
              <Campo rotulo="Descrição para expedição" className="if-destaque"><input value={v.produto_descricao_expedicao ?? ''} onChange={set('produto_descricao_expedicao')} /></Campo>
            </div>
            {producao && (
              <div className="if-linha if-l4">
                <div className="if-pills">
                  {EXTRAS.map(([k, r]) => <Pilula key={k} marcado={bool(v[`extra_${k}`])} onChange={(e) => editar({ [`extra_${k}`]: e.target.checked ? 'True' : 'False' })}>{r}</Pilula>)}
                </div>
                <div className="if-prodsel">
                  <Campo rotulo="Dia/horário de produção"><select value={v.producao_dias ?? 0} onChange={set('producao_dias')}><option value={0}>Mesmo dia</option><option value={1}>1 dia antes</option><option value={2}>2 dias antes</option></select></Campo>
                  <Campo rotulo="Turno"><select value={v.producao_turno ?? ''} onChange={set('producao_turno')}><option value="" />{[1, 2, 3].map((n) => <option key={n} value={n}>{n}º horário</option>)}</select></Campo>
                  <Campo rotulo="Carga"><select value={v.carga ?? ''} onChange={set('carga')}><option value="" />{[1, 2, 3].map((n) => <option key={n} value={n}>{n}ª carga</option>)}</select></Campo>
                  <Campo rotulo="Embalagem da carga"><select value={v.acomodacao_carga ?? ''} onChange={set('acomodacao_carga')}>{ACOMODACOES.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></Campo>
                  <Campo rotulo="Roteiro de entrega"><select value={v.id_roteiro ?? 0} onChange={set('id_roteiro')}><option value={0} />{roteiros.map((r) => <option key={r.id_roteiro} value={r.id_roteiro}>{r.horario} {r.nome}</option>)}</select></Campo>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rolagem diaria-grade" onContextMenu={(e) => { if (!item) return; e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}>
        <table className="grade">
          <thead><tr><th className="ind" /><th>Entrega</th><th>Qtde</th><th>Descrição</th><th>Preço</th><th>Produção</th></tr></thead>
          <tbody>
            {info.itens.map((i) => {
              const ed = draft && draft.id === i.id ? draft : i;
              return (
                <tr key={i.id} className={`clicavel ${classeFixa(i)}${i.id === selId ? ' sel' : ''}${editando && draft.id === i.id ? ' edit' : ''}`} onClick={() => escolher(i.id)} onDoubleClick={alterar}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); escolher(i.id); setMenu({ x: e.clientX, y: e.clientY }); }}>
                  <td className="ind">{editando && draft.id === i.id ? '✎' : i.id === selId ? '▶' : ''}</td>
                  <td className="num">{hhmm(ed.hora)}</td><td className="num">{fmtQtde(ed.produto_qtde)}</td>
                  <td>{ed.produto_descricao_expedicao}</td><td className="num">{i.xproduto_preco != null ? fmtMoeda(i.xproduto_preco) : ''}</td>
                  <td className="num">{i.producao_esquema}</td>
                </tr>
              );
            })}
            {info.itens.length === 0 && <tr className="semlinha"><td colSpan="6" className="vazio">&lt; Sem programação fixa para {DIAS[dia - 1]}. Use F2 Incluir. &gt;</td></tr>}
          </tbody>
        </table>
      </div>

      {menu && item && (
        <ul className="ctx" style={{ left: Math.min(menu.x, window.innerWidth - 290), top: Math.min(menu.y, window.innerHeight - 170) }} onClick={(e) => e.stopPropagation()}>
          {[['Log de operações', verLog], ['-'],
            ['Ajustar de segunda a sexta', () => replicar('seg-sex', 'Ajustar este item de segunda a sexta?')],
            ['Ajustar todos os dias', () => replicar('todos', 'Ajustar este item em todos os dias da semana?')], ['-'],
            ['Incluir no dia seguinte', copiarDiaSeguinte]].map(([r, fn], n) => (r === '-' ? <li key={n} className="sep-h" /> : (
              <li key={r}><button onClick={() => { setMenu(null); fn(); }}>{r}</button></li>)))}
        </ul>
      )}
      {modal?.tipo === 'log' && (
        <Modal titulo="Log da programação fixa" largo onFechar={() => setModal(null)}>
          <div className="rolagem curta">
            {modal.linhas.map((l) => <article key={l.id} className="log"><h4>{String(l.data).slice(0, 10)} {l.hora} · {l.usuario ?? 'sem usuário'}</h4><pre>{l.log}</pre></article>)}
            {modal.linhas.length === 0 && <p className="vazio">Nenhum registro.</p>}
          </div>
        </Modal>
      )}
      {modal?.tipo === 'busca' && (
        <BuscaProduto onFechar={() => setModal(null)} onEscolher={(codigo) => { setModal(null); editar({ produto_codigo: codigo }); resolverCodigo(codigo); }} />
      )}
    </section>
  );
}
