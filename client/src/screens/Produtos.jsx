import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Busca, Confirma, Navegador, useBusca, useEdicao } from '../components/cad.jsx';
import GradeCad from '../components/GradeCad.jsx';
import ProdutoForm from '../components/ProdutoForm.jsx';
import { imprimirHtml, tabelaPrecos } from '../lib/print.js';
import { Toast } from '../components/toast.jsx';

const CAM = '/cadastros/produtos';
const B_CLI = ['razao_social', 'codigo', 'cnpj', 'cidade', 'contato'];
const COLS_LISTA = [['descricao', 'Descrição do item'], ['codigo', 'Código'], ['preco', 'Preço', 'm'], ['divisor_basico', 'Cada'], ['ncm', 'NCM'], ['ativo', 'Ativo', 'chk']];
const COLS_REFS = [['id', 'ID'], ['codigo_referencia', 'Referência'], ['descricao', 'Descrição'], ['produto_especial', 'ESP', 'chk'], ['produto_producao', 'PRÇ', 'chk']];
const COLS_CLIS = [['razao_social', 'Cliente'], ['codigo', 'Código']];

// Cadastro de produtos (u_produtos): lista + referências + clientes à esquerda, edição à direita.
export default function Produtos({ onFechar }) {
  const [lista, setLista] = useState([]);
  const [trunc, setTrunc] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [referencias, setReferencias] = useState([]);
  const [tributos, setTributos] = useState([]);
  const [aba, setAba] = useState('lista');
  const [filtrar, setFiltrar] = useState(false);
  const [cliSel, setCliSel] = useState(null);
  const [q, setQ] = useState('');
  const [situacao, setSituacao] = useState('ativos'); // inativos só aparecem se o usuário escolher Inativos/Todos
  const [mesesSemUso, setMesesSemUso] = useState(6);
  const [marcandoSemUso, setMarcandoSemUso] = useState(false);
  const [marcados, setMarcados] = useState(() => new Set());
  const [foco, setFoco] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [confirma, setConfirma] = useState(null);
  const notificar = useCallback((tipo, m) => setAviso({ tipo, m }), []);
  useEffect(() => { if (!aviso) return undefined; const t = setTimeout(() => setAviso(null), 9000); return () => clearTimeout(t); }, [aviso]);

  const clienteFiltro = filtrar ? cliSel : null;
  const recarregar = useCallback(async (idFoco) => {
    try {
      const par = new URLSearchParams();
      if (clienteFiltro) par.set('cliente', clienteFiltro);
      if (q.trim()) par.set('q', q.trim());
      par.set('situacao', situacao);
      const r = await api.get(`${CAM}?${par}`);
      setLista(r.produtos); setTrunc(r.truncado);
      setMarcados((m) => { const ids = new Set(r.produtos.map((x) => x.id)); return new Set([...m].filter((i) => ids.has(i))); });
      setFoco((f) => { const alvo = idFoco ?? f; return r.produtos.some((x) => x.id === alvo) ? alvo : r.produtos[0]?.id ?? null; });
    } catch (e) { notificar('erro', e.message); }
  }, [clienteFiltro, q, situacao, notificar]);
  useEffect(() => { const t = setTimeout(() => recarregar(), q ? 300 : 0); return () => clearTimeout(t); }, [recarregar, q]);
  useEffect(() => {
    api.get('/cadastros/clientes').then((c) => { setClientes(c); }).catch(() => {});
    api.get(`${CAM}/referencias`).then(setReferencias).catch(() => {});
    api.get('/tributos').then(setTributos).catch(() => {});
  }, []);

  const ed0 = useEdicao({ lista, foco, setFoco, caminho: CAM, recarregar, aviso: notificar, confirmar: setConfirma, padrao: () => ({ ativo: 'True', peso: '0.05', peso_bruto: '0.05', divisor_basico: 1, ...(clienteFiltro ? { id_cliente: clienteFiltro } : {}) }), texto: (r) => `o produto ${r?.descricao ?? ''}` });
  const codigoPara = useCallback(async (cli) => { try { const r = await api.get(`${CAM}/proximo-codigo?cliente=${cli}`); ed0.set('codigo', r.codigo); } catch (e) { notificar('erro', e.message); } }, [ed0.set, notificar]); // eslint-disable-line react-hooks/exhaustive-deps
  const ed = useMemo(() => ({ ...ed0, incluir: () => { if (ed0.sujo) { ed0.incluir(); return; } ed0.incluir(); if (clienteFiltro) codigoPara(clienteFiltro); } }), [ed0, clienteFiltro, codigoPara]);
  const campoCod = useRef(null);
  const bClis = useBusca(clientes, B_CLI);
  const marca = (id, on) => setMarcados((m) => { const n = new Set(m); if (on) n.add(id); else n.delete(id); return n; });
  const marcaTodos = (on) => setMarcados(on ? new Set(lista.map((p) => p.id)) : new Set());
  // ativa/inativa de uma vez todos os produtos marcados (com confirmação)
  const mudaAtivo = (ativo) => {
    const ids = [...marcados];
    if (!ids.length) return;
    setConfirma({
      texto: `${ativo ? 'Ativar' : 'Inativar'} ${ids.length} produto(s) marcado(s)?${ativo ? '' : '\nEles deixam de aparecer nas pesquisas.'}`,
      sim: async () => {
        try {
          const r = await api.post(`${CAM}/ativo`, { ids, ativo });
          notificar('ok', `${r.alterados} produto(s) ${ativo ? 'ativado(s)' : 'inativado(s)'}.`);
          setMarcados(new Set()); await recarregar();
        } catch (e) { notificar('erro', e.message); }
      },
    });
  };
  // marca (só marca) os produtos ativos sem uso há N meses que aparecem na lista; a inativação é pelo botão "Inativar marcados"
  const marcaSemUso = async () => {
    const MESES = Math.max(1, Math.min(120, Math.floor(Number(mesesSemUso)) || 0));
    if (marcandoSemUso) return;
    setMarcandoSemUso(true); notificar('ok', `Marcando produtos sem uso há mais de ${MESES} meses… aguarde, pode demorar.`);
    try {
      const r = await api.get(`${CAM}/sem-uso?meses=${MESES}`);
      const sem = new Set(r.produtos.map((x) => x.id));
      const ids = lista.filter((p) => sem.has(p.id)).map((p) => p.id);
      setMarcados(new Set(ids));
      if (!ids.length) notificar('ok', r.total ? `Há ${r.total} produto(s) sem uso há mais de ${MESES} meses, mas nenhum aparece na lista atual (confira filtros e situação).` : `Nenhum produto ativo parado há mais de ${MESES} meses.`);
      else notificar('ok', `${ids.length} produto(s) sem uso há mais de ${MESES} meses marcado(s). Confira e use "Inativar marcados".${r.total > ids.length ? ` (${r.total - ids.length} fora da lista atual)` : ''}`);
    } catch (e) { notificar('erro', e.message); } finally { setMarcandoSemUso(false); }
  };
  // escolher um cliente na aba Clientes já filtra: marca o filtro e volta para a lista de produtos
  const escolheCliente = (id) => { setCliSel(id); setFiltrar(true); setAba('lista'); };
  const clienteNome = clientes.find((c) => c.id === cliSel)?.razao_social ?? '';

  const exportar = () => {
    const cols = [['codigo', 'Código'], ['descricao', 'Descrição'], ['un', 'UN'], ['preco', 'Preço'], ['divisor_basico', 'Cada'], ['preco_unitario', 'Preço unitário'], ['peso', 'Peso'], ['ncm', 'NCM'], ['id_cliente', 'Cliente']];
    const cel = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\./g, (m, i, s) => (/^-?\d+\.\d+$/.test(s) ? ',' : m))}"`;
    const csv = [cols.map(([, r]) => cel(r)).join(';'), ...lista.map((p) => cols.map(([k]) => cel(p[k])).join(';'))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    a.download = 'Produtos.csv'; document.body.appendChild(a); a.click(); a.remove();
    notificar('ok', 'Arquivo gerado (Produtos.csv).');
  };
  const imprimirTabela = () => { const { corpo, css } = tabelaPrecos(clienteFiltro ? clienteNome : '', lista); imprimirHtml(corpo, css); };

  return (
    <div className="cd">
      <Toast aviso={aviso} />
      <div className="cd-barra">
        <Navegador ed={ed} onEditar={() => campoCod.current?.focus()} />
        <button type="button" className="cd-btn" onClick={imprimirTabela}>🖨 Tabela de preços</button>
        <button type="button" className="cd-btn" onClick={exportar}>⇩ Exportar</button>
        <label className="cd-filtro"><input type="checkbox" checked={filtrar} onChange={(e) => { if (e.target.checked && !cliSel) { setAba('clis'); notificar('aviso', 'Escolha o cliente na aba Clientes.'); return; } setFiltrar(e.target.checked); }} />Só produtos de <b>{clienteNome || 'um cliente'}</b></label>
        <label className="cd-filtro" title="Quais produtos listar"><span>Mostrar</span>
          <select value={situacao} onChange={(e) => setSituacao(e.target.value)} aria-label="Situação dos produtos"><option value="ativos">Ativos</option><option value="inativos">Inativos</option><option value="todos">Todos</option></select></label>
        <button type="button" className="cd-btn" disabled={!marcados.size} title="Inativa todos os produtos marcados na lista" onClick={() => mudaAtivo(false)}>⛔ Inativar marcados{marcados.size ? ` (${marcados.size})` : ''}</button>
        <label className="cd-sem-uso" title="Quantidade de meses sem uso">Sem uso há <input type="number" min="1" max="120" value={mesesSemUso} onChange={(e) => setMesesSemUso(e.target.value)} aria-label="Meses sem utilização" /> meses</label>
        <button type="button" className="cd-btn" title="Marca os produtos da lista que não aparecem na programação diária no período informado. Depois use Inativar marcados." disabled={marcandoSemUso} aria-busy={marcandoSemUso} onClick={marcaSemUso}>{marcandoSemUso ? '⏳ Marcando…' : '🕒 Marcar sem uso'}</button>
        <button type="button" className="cd-btn" disabled={!marcados.size} title="Ativa todos os produtos marcados na lista" onClick={() => mudaAtivo(true)}>✔ Ativar marcados</button>
        <span className="cd-esp-barra" />
        <input type="search" className="cd-busca" placeholder="Pesquisar produto (descrição ou código)" aria-label="Pesquisar produto" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="cd-btn" title="Fechar esta tela" onClick={onFechar}>Fechar</button>
      </div>
      <div className="cd-corpo cd-prod">
        <section className="cd-lado larga">
          <div className="cd-abas" role="tablist">
            {[['lista', 'Produtos'], ['refs', 'Referências da produção'], ['clis', 'Clientes']].map(([k, r]) => <button key={k} type="button" role="tab" aria-selected={aba === k} className={aba === k ? 'on' : ''} onClick={() => setAba(k)}>{r}</button>)}
          </div>
          {aba === 'lista' && <GradeCad cols={COLS_LISTA} rows={lista} foco={foco} onSel={ed.selecionar} vazio={situacao === 'inativos' ? 'Nenhum produto inativo' : 'Nenhum produto'} marcados={marcados} onMarcar={marca} onMarcarTodos={marcaTodos} />}
          {aba === 'refs' && <GradeCad cols={COLS_REFS} rows={referencias} foco={null} onSel={() => {}} vazio="Nenhuma referência" />}
          {aba === 'clis' && (
            <>
              <div className="cd-busca-linha"><Busca busca={bClis} total={clientes.length} placeholder="Pesquisar cliente…" /></div>
              <GradeCad cols={COLS_CLIS} rows={bClis.visiveis} foco={cliSel} onSel={escolheCliente} vazio="Nenhum cliente" />
            </>
          )}
          <footer className="cd-rodape-lista">{aba === 'lista' ? `${lista.length} produto(s) ${situacao === 'todos' ? '(ativos e inativos)' : situacao === 'inativos' ? 'inativo(s)' : 'ativo(s)'}${marcados.size ? ` · ${marcados.size} marcado(s)` : ''}${clienteFiltro ? ` de ${clienteNome}` : ' (todos os clientes)'}${trunc ? ' — mostrando os primeiros 5000; refine a busca' : ''}` : aba === 'clis' ? 'Clique no cliente para ver só os produtos dele' : `${referencias.length} referência(s)`}</footer>
        </section>
        <main className="cd-rola">
          <ProdutoForm ed={ed} layout="tela" clientes={clientes} referencias={referencias} tributos={tributos} aoMudarCliente={(n) => { if (ed.novo && n && !ed.v('codigo')) codigoPara(n); }} />
        </main>
      </div>
      {confirma && <Confirma texto={confirma.texto} onSim={confirma.sim} onFechar={() => setConfirma(null)} />}
    </div>
  );
}
