import { ehFabrica } from '../lib/perfil.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import {
  ACOMODACOES, EXTRAS, bool, brData, cargaPorHora, descricaoExpedicao, fmtQtde, hhmm, hoje, somaDias, turnoPorHora,
} from '../lib/rules.js';
import * as imp from '../lib/print.js';
import { imprimirDocumento, temDestino } from '../lib/impressora.js';
// com impressora configurada, falha mostra só a mensagem de erro (não abre a pré-visualização do navegador)
const imprimirDoc = (tipo, doc, aviso) => imprimirDocumento(tipo, { ...doc, semNavegador: temDestino(tipo) }, aviso);
import { BuscaProduto, Modal } from './ui.jsx';
import { Campo, HoraGrande, Pilula, TopoItem, diaDaSemana, horasDoDia } from './ItemForm.jsx';
import { confirmar, entrada } from './toast.jsx';

const classeLinha = (i) => {
  if (Number(i.status) === 3) return 'l-bloq';
  if (Number(i.status) === 0 || bool(i.cancelado)) return 'l-canc';
  const base = bool(i.programacao_fixa) ? 'l-fixo' : 'l-avulso';
  const cor = !bool(i.produto_producao) ? 'merc' : bool(i.produto_especial) ? 'esp' : 'prod';
  return `${base} ${cor}`;
};

/* ---------- ícones dos botões (a tela antiga usava bitmaps) ---------- */
const Ico = ({ children }) => <svg className="ico" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">{children}</svg>;
const IcoUsuario = () => <Ico><circle cx="12" cy="8" r="4.2" fill="#e8b98a" stroke="#6b4a2b" /><path d="M3 22c0-5 4-8 9-8s9 3 9 8z" fill="#3b4a5c" /><path d="M7 5.5c1-3 9-3 10 0z" fill="#2b2b2b" /></Ico>;
const IcoImpressora = () => <Ico><rect x="6" y="2.5" width="12" height="6" fill="#fff" stroke="#456" /><rect x="2.5" y="8" width="19" height="8.5" rx="1.5" fill="#6f8fb5" stroke="#345" /><rect x="6" y="13" width="12" height="8" fill="#fff" stroke="#456" /><circle cx="18.5" cy="10.5" r="1" fill="#7f7" /></Ico>;
const IcoPessoa = () => <Ico><circle cx="14" cy="4.5" r="2.6" fill="#f2b56b" /><path d="M13 8l-4 3-3-1-1 2 4 1.5 3-2 1.5 3-3.5 5 1.8 1.2 4-5.5 3 2.5 3-1.2-.8-2-2 .8-2.5-2.3-1-4z" fill="#c8861b" stroke="#6a4408" strokeWidth=".6" /></Ico>;
const IcoDisco = () => <Ico><path d="M3 3h15l3 3v15H3z" fill="#334" /><rect x="6" y="3" width="10" height="6" fill="#dde" /><rect x="6" y="13" width="12" height="8" fill="#9ab" /><rect x="12.5" y="4" width="2.2" height="4" fill="#334" /></Ico>;
const IcoDesfazer = () => <Ico><path d="M5 11a8 8 0 1 1 3 8" fill="none" stroke="#e08a00" strokeWidth="3.2" /><path d="M1.5 6l8 .5-4 7z" fill="#e08a00" /></Ico>;

/* ---------- campo numérico com vírgula (pt-BR) ---------- */
const fmt = (n, [min, max]) => (n === '' || n === null || n === undefined || Number.isNaN(Number(n)) ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max }));
const parseBR = (t) => {
  const s = String(t).trim();
  if (!s) return null;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : null;
};
export function Num({ value, onChange, casas = [0, 3], className = '', disabled, readOnly, inputRef, ...rest }) {
  const [txt, setTxt] = useState(() => fmt(value, casas));
  const foco = useRef(false);
  useEffect(() => { if (!foco.current) setTxt(fmt(value, casas)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input ref={inputRef} inputMode="decimal" className={className} disabled={disabled} readOnly={readOnly} value={txt} {...rest}
      onFocus={(e) => { foco.current = true; e.target.select(); }}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => { foco.current = false; const n = parseBR(txt); setTxt(fmt(n ?? value, casas)); if (n !== null && n !== Number(value)) onChange(n); }} />
  );
}

const hidratar = (i) => ({
  ...i, hora: hhmm(i.hora), data: String(i.data).slice(0, 10), producao_data: String(i.producao_data ?? '').slice(0, 10),
  preco_total: i.preco_total ?? 0,
});
const total = (r) => ((Number(r.qtde_original) || 0) + (Number(r.qtde_alterada) || 0)) * ((Number(r.produto_preco) || 0) / (Number(r.produto_preco_cada) || 1));
const novoItem = (status) => ({
  data: status.data, hora: '', produto_codigo: '', produto_descricao: '', produto_descricao_original: '', produto_descricao_expedicao: '',
  referencia_descricao: '', qtde_original: 0, qtde_alterada: 0, produto_preco: 0, produto_preco_cada: 1, preco_total: 0,
  programacao_fixa: 'False', cancelado: 'False', produto_producao: 'False', produto_especial: 'False', obs: '', obs_producao: '',
  id_roteiro: 0, carga: '', producao_turno: '', acomodacao_carga: 'SACARIA', producao_data: '',
  ...Object.fromEntries(EXTRAS.map(([k]) => [`extra_${k}`, 'False'])),
});

/** Regras do dsprdDataChange: campos derivados quando um campo muda. */
function derivar(r, chaves) {
  let n = r;
  if (chaves.some((k) => ['qtde_alterada', 'produto_preco', 'produto_preco_cada'].includes(k))) n = { ...n, preco_total: total(n) };
  if (chaves.includes('hora') && n.hora) n = { ...n, producao_turno: turnoPorHora(n.hora), carga: cargaPorHora(n.hora) };
  if (chaves.some((k) => k.startsWith('extra_'))) n = { ...n, produto_descricao_expedicao: descricaoExpedicao(n.referencia_descricao, n) };
  if (chaves.some((k) => ['conversao_produto_qtde', 'conversao_produto_preco'].includes(k))) {
    n = { ...n, conversao_produto_valor: (Number(n.conversao_produto_qtde) || 0) * (Number(n.conversao_produto_preco) || 0) };
  }
  if (chaves.includes('conversao_produto_descricao')) n = { ...n, produto_descricao: n.conversao_produto_descricao };
  return n;
}

export default function DiariaTab({ status, data, filtro, roteiros, onChanged, notify }) {
  const [itens, setItens] = useState([]);
  const [selId, setSelId] = useState(null);
  const [draft, setDraft] = useState(null); // registro em edição/inclusão (state dsedit/dsinsert do Delphi)
  const [painel, setPainel] = useState(false); // pnlDiaria
  const [completa, setCompleta] = useState(false);
  const [menu, setMenu] = useState(null);
  const [modal, setModal] = useState(null); // {tipo, ...}
  const [ocupado, setOcupado] = useState(false);
  const refs = useRef({});
  const ultimoCodigo = useRef('');
  const painelRef = useRef(null);

  const carregar = useCallback(async () => {
    if (!status) { setItens([]); return; }
    const rows = await api.get(`/status/${status.id}/diaria`);
    setItens(rows);
    setSelId((id) => (rows.some((r) => r.id === id) ? id : rows[0]?.id ?? null));
  }, [status?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carregar().catch((e) => notify.erro(e.message)); }, [carregar]); // eslint-disable-line react-hooks/exhaustive-deps

  const item = itens.find((i) => i.id === selId) || null;
  const novo = !!draft && !draft.id;
  const editando = !!draft;
  const v = draft ?? (item ? hidratar(item) : null);
  const mostrarPainel = painel && (!!v);
  const mercadoria = v && !bool(v.produto_producao);

  useEffect(() => { ultimoCodigo.current = draft ? draft.produto_codigo ?? '' : item?.produto_codigo ?? ''; }, [draft?.id, novo, item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const atualizar = async () => { await carregar(); await onChanged(); };
  const rodar = async (fn, ok) => {
    try { await fn(); await atualizar(); if (ok) notify.ok(ok); } catch (e) { notify.erro(e.message); }
  };
  // foco: pede o campo e o efeito abaixo foca assim que ele existir na tela (não depende de tempo)
  const pedeFoco = useRef(null);
  const aplicaFoco = () => { const n = pedeFoco.current; const el = n && refs.current[n]; if (el) { pedeFoco.current = null; el.focus(); el.select?.(); } };
  const foca = (nome) => { pedeFoco.current = nome; setTimeout(aplicaFoco, 30); };
  useEffect(aplicaFoco);

  /* ----- edição ----- */
  const editar = (mud) => setDraft((d) => {
    const base = d ?? (item ? hidratar(item) : null);
    return base ? derivar({ ...base, ...mud }, Object.keys(mud)) : d;
  });

  const aplicarProduto = (p, alvo) => {
    const especial = bool(p.produto_especial);
    setDraft((d) => {
      const base = d ?? (item ? hidratar(item) : null);
      if (!base) return d;
      const prodData = especial ? somaDias(base.data, -1) : base.data;
      if (alvo === 'conv') {
        return derivar({
          ...base, producao_data: prodData, conversao_id_produto: p.id, conversao_produto_codigo: p.codigo,
          conversao_produto_preco: p.preco, conversao_produto_preco_cada: p.divisor_basico,
          conversao_produto_qtde: p.preco ? (Number(base.preco_total) || 0) / p.preco : 0,
          acomodacao_carga: especial ? 'CAIXA AMARELINHA' : 'SACARIA', conversao_produto_descricao: p.descricao,
        }, ['conversao_produto_descricao', 'conversao_produto_qtde', 'conversao_produto_preco']);
      }
      const extras = Object.fromEntries(EXTRAS.map(([k]) => [`extra_${k}`, p[`extra_${k}`] ?? 'False']));
      return derivar({
        ...base, produto_codigo: p.codigo, id_produto: p.id, producao_data: prodData,
        produto_descricao_original: p.descricao, produto_descricao: p.descricao,
        produto_descricao_expedicao: p.descricao_expedicao || p.descricao, referencia_descricao: p.referencia_descricao,
        produto_especial: p.produto_especial, produto_producao: p.produto_producao,
        produto_preco: p.preco, produto_preco_cada: p.divisor_basico, acomodacao_carga: especial ? 'CAIXA AMARELINHA' : 'SACARIA', ...extras,
      }, ['produto_preco']);
    });
    ultimoCodigo.current = p.codigo;
    if (alvo !== 'conv' && ['999.999', '99999'].includes(String(p.codigo))) foca('nf');
  };

  const resolverCodigo = async (codigo, alvo = 'prod') => {
    const c = String(codigo ?? '').trim();
    if (!c || c === '0') { setModal({ tipo: 'busca', alvo }); return; }
    if (alvo === 'prod' && c === ultimoCodigo.current) return true;
    try { aplicarProduto(await api.get(`/produtos/codigo/${encodeURIComponent(c)}`), alvo); return true; } catch {
      notify.erro('Produto não encontrado!!!');
      foca(alvo === 'conv' ? 'conv' : 'codigo');
      return false;
    }
  };

  /* ----- ações da barra ----- */
  const incluir = () => {
    if (!status || editando) return;
    setPainel(true); setDraft(novoItem(status)); setSelId(null);
    foca('hora');
  };
  const alterar = () => {
    if (editando) return;
    if (!itens.length) { notify.erro('Não há itens para o procedimento.'); return; }
    setPainel((p) => !p);
    if (!painel) foca('hora');
  };
  // alvo = item da linha (ícone 🗑) ou, sem argumento, o item selecionado (F4)
  const excluir = async (alvo = item) => {
    if (editando) return;
    if (!itens.length || !alvo) { notify.erro('Não há itens para o procedimento.'); return; }
    if (bool(alvo.programacao_fixa)) { // item fixo não se elimina: oferece cancelar (o cancelamento pode ser desfeito)
      if (bool(alvo.cancelado)) { notify.erro('Este item fixo já está cancelado.'); return; }
      if (await confirmar(`"${alvo.produto_descricao_expedicao}" é item da programação FIXA e não pode ser eliminado.\nDeseja CANCELAR o item nesta data?`)) rodar(() => api.post(`/diaria/${alvo.id}/cancelar`, { cancelado: true }), 'Item cancelado.');
      return;
    }
    if ((await confirmar(`Eliminar o item programado?\n${hhmm(alvo.hora)} — ${alvo.produto_descricao_expedicao}`))) rodar(() => api.del(`/diaria/${alvo.id}`), 'Item excluído.');
  };
  const desfazer = () => { setDraft(null); };

  const gravar = async () => {
    const r = draft;
    if (!r) return true;
    const qtde = (Number(r.qtde_original) || 0) + (Number(r.qtde_alterada) || 0);
    if (!String(r.produto_codigo ?? '').length || qtde === 0 || !String(r.produto_descricao ?? '').length) {
      notify.erro('Registro inconsistente para gravação. "Verifique o código do produto, qtdes e a descrição do item na Comanda!"');
      return false;
    }
    if (!r.hora) { notify.erro('Informe a hora da entrega.'); foca('hora'); return false; }
    const corpo = {
      data: r.data, hora: r.hora, produto_codigo: r.produto_codigo, produto_descricao: r.produto_descricao,
      qtde_alterada: Number(r.qtde_alterada) || 0, obs: r.obs ?? '', obs_producao: r.obs_producao ?? '',
      produto_descricao_expedicao: r.produto_descricao_expedicao,
      produto_preco: Number(r.produto_preco) || 0, produto_preco_cada: Number(r.produto_preco_cada) || 1,
      id_roteiro: Number(r.id_roteiro) || 0, acomodacao_carga: r.acomodacao_carga,
      ...(r.carga ? { carga: Number(r.carga) } : {}),
      ...(r.producao_turno ? { producao_turno: Number(r.producao_turno) } : {}),
      ...(r.producao_data ? { producao_data: String(r.producao_data).slice(0, 10) } : {}),
      ...Object.fromEntries(EXTRAS.map(([k]) => [`extra_${k}`, r[`extra_${k}`] ?? 'False'])),
      ...(bool(r.programacao_fixa) ? { qtde_original: Number(r.qtde_original) || 0 } : {}),
      ...(r.conversao_produto_codigo ? {
        conversao_id_produto: r.conversao_id_produto, conversao_produto_codigo: r.conversao_produto_codigo,
        conversao_produto_descricao: r.conversao_produto_descricao, conversao_produto_preco: Number(r.conversao_produto_preco) || 0,
        conversao_produto_preco_cada: Number(r.conversao_produto_preco_cada) || 1,
        conversao_produto_qtde: Number(r.conversao_produto_qtde) || 0, conversao_produto_valor: Number(r.conversao_produto_valor) || 0,
      } : {}),
    };
    setOcupado(true);
    try {
      let id = r.id;
      if (novo) ({ id } = await api.post(`/status/${status.id}/diaria`, corpo));
      else await api.put(`/diaria/${r.id}`, corpo);
      setDraft(null);
      await atualizar();
      setSelId(id);
      notify.ok('Item gravado.');
      return true;
    } catch (e) { notify.erro(e.message); return false; } finally { setOcupado(false); }
  };

  /** Trocar de linha com registro em edição: o Delphi gravava sozinho; aqui pergunta antes. */
  const escolher = async (id) => {
    if (id === selId) return;
    if (editando) {
      if (!(await confirmar('Há alterações não gravadas neste item. Gravar agora?'))) return;
      if (!(await gravar())) return;
    }
    setSelId(id);
  };

  /* ----- impressões ----- */
  const imprimirConferencia = () => {
    if (!status || !itens.length) { notify.erro('Não há itens para imprimir.'); return; }
    const { corpo, css } = imp.conferencia(status.unidade_nome, itens);
    imp.imprimirHtml(corpo, css);
  };
  const imprimirAlteracoes = async () => {
    if (data !== somaDias(hoje(), 1)
      && !(await confirmar(`\n${imp.nomeDiaMaiusculo(data)}\n\nA data que deseja\n\nestá correta?`))) return;
    try {
      const linhas = await api.get(`/alteracoes?data=${data}&filtro=${filtro}${completa ? '&completa=1' : ''}`);
      if (!linhas.length) { notify.erro('Nenhuma alteração para imprimir neste dia.'); return; }
      const { corpo, css } = imp.alteracoes(data, linhas);
      imp.imprimirHtml(corpo, css);
    } catch (e) { notify.erro(e.message); }
  };
  const etiquetaItem = async () => {
    if (!item) return;
    if (Number(item.etiqueta_adesiva) > 0
      && !(await confirmar(`Já impressa(s) ${item.etiqueta_adesiva} etiqueta(s).\nDeseja imprimir mais?`))) return;
    await imprimirDoc('etiqueta-item', imp.etiquetaItem(item, status.unidade_nome), (t, m) => notify.erro(m));
    await rodar(() => api.post(`/diaria/${item.id}/etiqueta`), null);
  };
  const etiquetaValidade = async () => {
    const n = Number.parseInt(await entrada('Digite a qtde', '1'), 10);
    if (!Number.isInteger(n) || n < 1 || n > 200) return;
    const { corpo, css } = imp.etiquetaValidade(item);
    await imprimirDoc('etiqueta-validade', { corpo: corpo.repeat(n), css }, (t, m) => notify.erro(m));
  };
  const cupom = () => imprimirDoc('cupom-expedicao', imp.cupomExpedicao(item, status.unidade_nome), (t, m) => notify.erro(m));
  const verLogItem = async () => {
    try { setModal({ tipo: 'log', titulo: 'Log de operações', linhas: await api.get(`/diaria/${item.id}/log`) }); } catch (e) { notify.erro(e.message); }
  };
  const verLogDia = async () => {
    if (!status) return;
    try { setModal({ tipo: 'log', titulo: `Log de operações — ${status.unidade_nome}`, dia: true, linhas: await api.get(`/status/${status.id}/diaria-log`) }); } catch (e) { notify.erro(e.message); }
  };
  const alternarCancelamento = () => item && rodar(() => api.post(`/diaria/${item.id}/cancelar`, { cancelado: !bool(item.cancelado) }),
    bool(item.cancelado) ? 'Cancelamento desfeito.' : 'Item cancelado.');
  const ajustaPreco = () => item && rodar(() => api.post(`/diaria/${item.id}/ajusta-preco`), 'Preço atualizado.');
  const ajustaTudo = async () => (await confirmar('Trazer o preço atual do cadastro para todos os itens do dia?'))
    && rodar(() => api.post('/diaria/ajusta-preco-lote', { data }), 'Preços do dia atualizados.');
  const ajustaCobranca = () => item && rodar(() => api.post(`/diaria/${item.id}/ajusta-cobranca`), 'Cobrança recalculada.');

  /* ----- teclado: F2/F3/F4 e Alt+F2, Alt+Shift+F2, Ctrl+Shift+F2 (FormKeyDown) ----- */
  useEffect(() => {
    const tecla = (e) => {
      if (modal) return;
      if (ehFabrica() && e.key === 'F2' && (e.altKey || e.ctrlKey)) return; // fábrica não ajusta preço
      if (e.key === 'F2' && e.altKey && e.shiftKey) { e.preventDefault(); ajustaTudo(); return; }
      if (e.key === 'F2' && e.altKey) { e.preventDefault(); ajustaPreco(); return; }
      if (e.key === 'F2' && e.ctrlKey && e.shiftKey) { e.preventDefault(); rodar(async () => { for (const i of itens) await api.post(`/diaria/${i.id}/ajusta-preco`); }, 'Preços do item ajustados.'); return; }
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
    window.addEventListener('click', fecha); window.addEventListener('keydown', fecha); window.addEventListener('scroll', fecha, true);
    return () => { window.removeEventListener('click', fecha); window.removeEventListener('keydown', fecha); window.removeEventListener('scroll', fecha, true); };
  }, [menu]);

  // JvEnterTab: Enter passa para o próximo campo do painel.
  const enterComoTab = (e) => {
    if (e.key !== 'Enter' || e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    if (e.target.tagName === 'TEXTAREA' && (e.ctrlKey || e.metaKey)) { // Ctrl+Enter = nova linha no texto
      const t = e.target; t.setRangeText('\n', t.selectionStart, t.selectionEnd, 'end');
      t.dispatchEvent(new Event('input', { bubbles: true })); return;
    }
    const campos = [...e.currentTarget.querySelectorAll('input:not([disabled]):not([readonly]), select, textarea')];
    const prox = e.target.dataset.ultimo ? null : campos[campos.indexOf(e.target) + 1]; // "Informe p/ produção" é o último campo do fluxo: grava
    e.target.blur();
    if (prox) setTimeout(() => prox.focus(), 0);
    else if (e.currentTarget === painelRef.current && editando) setTimeout(() => gravarRef.current?.(), 60); // Enter no último campo grava o item
  };
  const gravarRef = useRef(null); gravarRef.current = gravar;

  const ref = (nome) => (el) => { refs.current[nome] = el; };
  const set = (k) => (e) => editar({ [k]: e.target.value });
  const marcaExtra = (k) => (e) => editar({ [`extra_${k}`]: e.target.checked ? 'True' : 'False' });
  const roteiroOpcoes = roteiros.map((r) => <option key={r.id_roteiro} value={r.id_roteiro}>{r.horario} {r.nome}</option>);
  const linhaNova = novo ? v : {};

  return (
    <section className="diaria">
      {/* ---------- barra de botões (cxTabControl1) ---------- */}
      <div className="tb">
        <button className="bt ic" title="Log de operações da programação diária" onClick={verLogDia} disabled={!status}><IcoUsuario /></button>
        <button className="bt ic" title="Imprime lista para conferencia" onClick={imprimirConferencia} disabled={!status}><IcoImpressora /></button>
        <button className="bt ic" title="Atalho para tela de recados" onClick={() => setModal({ tipo: 'recados' })}><IcoPessoa /></button>
        <button className="bt" onClick={incluir} disabled={editando || !status}>F2 Incluir</button>
        <button className="bt" onClick={alterar} disabled={editando || !status}>F3 Alterar</button>
        <button className="bt" onClick={() => excluir()} disabled={editando || !status}>🗑 F4 Excluir</button>
        <button className="bt" onClick={atualizar} disabled={editando || !status}>Atualizar</button>
        <button className="bt larga" onClick={gravar} disabled={!editando || ocupado}><IcoDisco />&nbsp;<u>S</u>alvar</button>
        <button className="bt larga" onClick={desfazer} disabled={!editando}><IcoDesfazer />&nbsp;<u>D</u>esfazer</button>
        <button className="bt larga" onClick={imprimirAlteracoes}><IcoImpressora />&nbsp;Imprimir alterações</button>
        <label className="chk-completa"><input type="checkbox" checked={completa} onChange={(e) => setCompleta(e.target.checked)} />Imprimir programação completa</label>
        <button className="bt larga" onClick={alterar} disabled={!status || editando}>Mostrar/Esconder&nbsp;item</button>
      </div>

      {/* ---------- painel do item (pnlDiaria) ---------- */}
      {mostrarPainel && (
        <div className={`if${novo ? ' novo' : ''}`} ref={painelRef} onKeyDown={enterComoTab}>
          <TopoItem novo={novo} sujo={editando} contexto={`${status?.unidade_nome ?? ''}${v.data ? ` · ${diaDaSemana(v.data)}, ${brData(v.data)}` : ''}`} />
          <div className="if-corpo">
            <div className="if-linha if-l1">
              <HoraGrande refHora={ref('hora')} valor={v.hora} onChange={(h) => editar({ hora: h })} sugestoes={horasDoDia(itens)} />
              <Campo rotulo="Data" className="if-data"><input type="date" ref={ref('data')} value={v.data ?? ''} onChange={set('data')} /></Campo>
              <Campo rotulo="Produto" className="if-cod"><input ref={ref('codigo')} value={v.produto_codigo ?? ''} onChange={set('produto_codigo')} placeholder="código (999.999 = mercadoria)"
                onBlur={(e) => resolverCodigo(e.target.value)} onDoubleClick={() => setModal({ tipo: 'busca', alvo: 'prod' })} title="Duplo clique pesquisa o produto" /></Campo>
              <Campo rotulo="Descrição original do produto" className="if-orig"><input readOnly tabIndex={-1} value={v.produto_descricao_original ?? ''} /></Campo>
            </div>
            <div className="if-linha if-l2">
              <Campo rotulo="Descrição da comanda / nota fiscal"><input ref={ref('nf')} value={v.produto_descricao ?? ''} onChange={set('produto_descricao')} /></Campo>
              <Campo rotulo="Descrição para expedição" className="if-destaque"><input value={v.produto_descricao_expedicao ?? ''} onChange={set('produto_descricao_expedicao')} /></Campo>
            </div>
            <div className="if-linha if-l3">
              <div className="if-nums">
                <Campo rotulo="Qtde fixa"><Num className="if-n" casas={[1, 3]} disabled={!bool(v.programacao_fixa)} value={v.qtde_original} onChange={(n) => editar({ qtde_original: n, preco_total: total({ ...v, qtde_original: n }) })} /></Campo>
                <Campo rotulo="Extra" className="if-destaque"><Num className="if-n centro" inputRef={ref('extra')} casas={[0, 3]} value={v.qtde_alterada} onChange={(n) => editar({ qtde_alterada: n })} /></Campo>
                <Campo rotulo="Preço"><Num className="if-n" casas={[2, 3]} value={v.produto_preco} onChange={(n) => editar({ produto_preco: n })} /></Campo>
                <Campo rotulo="Cada"><Num className="if-n centro" casas={[0, 3]} value={v.produto_preco_cada} onChange={(n) => editar({ produto_preco_cada: n })} /></Campo>
                <Campo rotulo="Valor total" className="if-total"><Num className="if-n" readOnly tabIndex={-1} casas={[2, 2]} value={v.preco_total} onChange={() => {}} /></Campo>
              </div>
              <Campo rotulo="Anotações p/ faturamento" className="if-nota"><textarea value={v.obs ?? ''} onChange={set('obs')} /></Campo>
              <Campo rotulo="Informe p/ produção" className="if-nota"><textarea data-ultimo value={v.obs_producao ?? ''} onChange={set('obs_producao')} /></Campo>
            </div>
            {!mercadoria && (
              <div className="if-linha if-l4">
                <div className="if-pills">
                  {[['cortado', 'Cortado'], ['margarina', 'C/ margarina'], ['coco', 'Cobertura côco'], ['acucar', 'Cobertura açúcar'],
                    ['plastico', 'Embalado individual (plástico)'], ['papel', 'Embalado individual (papel)'], ['pacote', 'Em pacote plástico']].map(([k, r]) => (
                      <Pilula key={k} marcado={bool(v[`extra_${k}`])} onChange={marcaExtra(k)}>{r}</Pilula>
                  ))}
                </div>
                <div className="if-prodsel">
                  <Campo rotulo="Produção data"><input type="date" value={String(v.producao_data ?? '').slice(0, 10)} onChange={set('producao_data')} /></Campo>
                  <Campo rotulo="Turno"><select value={v.producao_turno ?? ''} onChange={set('producao_turno')}><option value="" />{[1, 2, 3].map((n) => <option key={n} value={n}>{n}º horário</option>)}</select></Campo>
                  <Campo rotulo="Embalagem da carga"><select value={v.acomodacao_carga ?? ''} onChange={set('acomodacao_carga')}>{ACOMODACOES.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></Campo>
                  <Campo rotulo="Preparação da carga"><select value={v.carga ?? ''} onChange={set('carga')}><option value="" />{[1, 2, 3].map((n) => <option key={n} value={n}>{n}ª carga</option>)}</select></Campo>
                  <Campo rotulo="Itinerário"><select value={v.id_roteiro ?? 0} onChange={set('id_roteiro')}><option value={0} />{roteiroOpcoes}</select></Campo>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- grade (GridPrd) ---------- */}
      <div className="rolagem diaria-grade" onContextMenu={(e) => { if (!item) return; e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}>
        <table className="grade">
          <thead>
            <tr><th className="ind" /><th className="c" title="Registro alterado">A</th><th className="c" title="Programação fixa">Fx</th>
              <th>Entrega</th><th>Fixo + Extra = Total</th><th>Descrição para expedição</th><th>Anotações</th>
              <th>Produção</th><th>Comandas</th><th className="c" />
            </tr>
          </thead>
          <tbody>
            {status && (
              <tr className={`l-novo${novo ? ' sel edit' : ''}`} onClick={() => !editando && status && incluir()} title="Clique para incluir um item (F2)">
                <td className="ind">*</td><td className="c"><input type="checkbox" readOnly disabled /></td><td className="c"><input type="checkbox" readOnly disabled /></td>
                <td className="num">{linhaNova.hora}</td>
                <td className="qtd">{novo && <><span>{fmtQtde(linhaNova.qtde_original)}</span> + <span>{fmtQtde(linhaNova.qtde_alterada)}</span> = <span>{fmtQtde((Number(linhaNova.qtde_original) || 0) + (Number(linhaNova.qtde_alterada) || 0))}</span></>}</td>
                <td>{linhaNova.produto_descricao_expedicao}</td><td>{linhaNova.obs}</td><td /><td />
              </tr>
            )}
            {itens.map((i) => {
              const ed = draft && draft.id === i.id ? draft : i;
              return (
                <tr key={i.id} className={`clicavel ${classeLinha(i)}${i.id === selId ? ' sel' : ''}${(painel && i.id === selId) ? ' edit' : ''}`}
                  onClick={() => escolher(i.id)} onDoubleClick={alterar}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); escolher(i.id); setMenu({ x: e.clientX, y: e.clientY }); }}>
                  <td className="ind">{(painel && i.id === selId) ? '✎' : i.id === selId ? '▶' : ''}</td>
                  <td className="c"><input type="checkbox" readOnly checked={!!Number(i.registro_alterado)} tabIndex={-1} /></td>
                  <td className="c"><input type="checkbox" readOnly checked={bool(i.programacao_fixa)} tabIndex={-1} /></td>
                  <td className="num">{hhmm(ed.hora)}</td>
                  <td className="qtd">
                    <span>{fmtQtde(ed.qtde_original)}</span> {Number(ed.qtde_alterada) < 0 ? '−' : '+'} <span>{fmtQtde(Math.abs(ed.qtde_alterada))}</span> = <span>{fmtQtde((Number(ed.qtde_original) || 0) + (Number(ed.qtde_alterada) || 0))}</span>
                  </td>
                  <td>{ed.produto_descricao_expedicao}</td>
                  <td>{ed.obs}</td>
                  <td className="num">{i.producao_esquema}</td>
                  <td className="num">{i.comandas}</td>
                  <td className="c dx-lixo"><button type="button" className="dx-del" title={bool(i.programacao_fixa) ? 'Item fixo: oferece cancelar' : 'Excluir este lançamento'} aria-label="Excluir lançamento" disabled={editando} onClick={(e) => { e.stopPropagation(); escolher(i.id); excluir(i); }}>🗑</button></td>
                </tr>
              );
            })}
            {itens.length === 0 && !novo && <tr className="semlinha"><td colSpan="10" className="vazio">&lt; Não há ítens para entrega &gt;</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ---------- barra "Cobrar como:" (pnlConverte) ---------- */}
      {v && mercadoria && (itens.length > 0 || novo) && (
        <div className="converte" onKeyDown={enterComoTab}>
          <span className="rot">Cobrar como:</span>
          <input className="cv-cod" ref={ref('conv')} value={v.conversao_produto_codigo ?? ''} onChange={set('conversao_produto_codigo')}
            onBlur={(e) => (e.target.value !== (item?.conversao_produto_codigo ?? '') || draft) && e.target.value !== '' && resolverCodigo(e.target.value, 'conv')}
            onDoubleClick={() => setModal({ tipo: 'busca', alvo: 'conv' })} />
          <input className="cv-desc" value={v.conversao_produto_descricao ?? ''} onChange={set('conversao_produto_descricao')} />
          <span className="rot">Qtde</span>
          <Num className="cv-n1" casas={[0, 3]} value={v.conversao_produto_qtde} onChange={(n) => editar({ conversao_produto_qtde: n })} />
          <span className="rot">Preço</span>
          <Num className="cv-n2" casas={[2, 3]} value={v.conversao_produto_preco} onChange={(n) => editar({ conversao_produto_preco: n })} />
          <span className="rot">Preço total</span>
          <Num className="cv-n3" casas={[2, 2]} value={v.conversao_produto_valor} onChange={(n) => editar({ conversao_produto_valor: n })} />
        </div>
      )}

      {/* ---------- menu do botão direito (OpcoesDiariaF) ---------- */}
      {menu && item && (
        <ul className="ctx" style={{ left: Math.min(menu.x, window.innerWidth - 290), top: Math.min(menu.y, window.innerHeight - 330) }} onClick={(e) => e.stopPropagation()}>
          {[
            ['Configurar produto a ser cobrado', () => { setPainel(true); if (!editando) setDraft(hidratar(item)); foca('conv'); }, mercadoria ? false : 'Só para mercadorias'],
            ['-'],
            ['Etiqueta adesiva do ítem (expedição)', etiquetaItem],
            ['Etiqueta adesiva de validade', etiquetaValidade],
            ['Imprimir na expedição', cupom],
            ['-'],
            [bool(item.cancelado) ? 'Desfazer cancelamento' : 'Cancelar ítem', alternarCancelamento],
            ['-'],
            ['Log de operações', verLogItem],
            ['Lay-out etiqueta adesiva', null, 'Designer do ReportBuilder: não migrado'],
            ...(ehFabrica() ? [] : [['-'],
            ['Ajustar preço do item\tAlt+F2', ajustaPreco],
            ['Ajustar preço de todos os itens do dia\tAlt+Shift+F2', ajustaTudo],
            ['Ajustar cobrança (comandas) do item', ajustaCobranca]]),
          ].map(([r, fn, off], n) => (r === '-' ? <li key={n} className="sep-h" /> : (
            <li key={r}><button disabled={!fn || !!off} title={off || ''} onClick={() => { setMenu(null); fn(); }}>{r.split('\t')[0]}{r.includes('\t') && <kbd>{r.split('\t')[1]}</kbd>}</button></li>
          )))}
        </ul>
      )}

      {modal?.tipo === 'log' && (
        <Modal titulo={modal.titulo} largo onFechar={() => setModal(null)}>
          <div className="rolagem curta">
            {modal.linhas.map((l) => (
              <article key={l.id} className="log"><h4>{String(l.data).slice(0, 10)} {l.hora} · {l.usuario ?? 'sem usuário'}{modal.dia ? ` · ${l.produto_descricao_expedicao ?? ''}` : ''}</h4><pre>{l.log}</pre></article>
            ))}
            {modal.linhas.length === 0 && <p className="vazio">Nenhum registro.</p>}
          </div>
        </Modal>
      )}
      {modal?.tipo === 'busca' && (
        <BuscaProduto onFechar={() => setModal(null)}
          onEscolher={(codigo) => { const alvo = modal.alvo; setModal(null); if (alvo === 'prod') editar({ produto_codigo: codigo }); else editar({ conversao_produto_codigo: codigo }); Promise.resolve(resolverCodigo(codigo, alvo)).then((ok) => { if (ok && alvo === 'prod') { foca('nf'); setTimeout(() => foca('nf'), 120); } }); }} />
      )}
      {modal?.tipo === 'recados' && (
        <Modal titulo="Recados" onFechar={() => setModal(null)}>
          <p>A tela de recados (<code>u_recados</code>) não foi enviada, então este atalho será ligado quando ela for convertida.</p>
          <footer className="rodape-form"><button className="primario" onClick={() => setModal(null)}>OK</button></footer>
        </Modal>
      )}
    </section>
  );
}
