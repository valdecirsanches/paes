import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Busca, Confirma, Navegador, useBusca, useEdicao } from '../components/cad.jsx';
import GradeCad from '../components/GradeCad.jsx';
import ProdutoForm from '../components/ProdutoForm.jsx';
import { imprimirHtml, tabelaPrecos } from '../lib/print.js';
import { Toast } from '../components/toast.jsx';

const CAM = '/cadastros/produtos';
const B_CLI = ['razao_social', 'codigo', 'cnpj', 'cidade', 'contato'];
const COLS_LISTA = [['descricao', 'Descrição do item'], ['codigo', 'Código'], ['preco', 'Preço', 'm'], ['divisor_basico', 'Cada'], ['ncm', 'NCM']];
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
      const r = await api.get(`${CAM}?${par}`);
      setLista(r.produtos); setTrunc(r.truncado);
      setFoco((f) => { const alvo = idFoco ?? f; return r.produtos.some((x) => x.id === alvo) ? alvo : r.produtos[0]?.id ?? null; });
    } catch (e) { notificar('erro', e.message); }
  }, [clienteFiltro, q, notificar]);
  useEffect(() => { const t = setTimeout(() => recarregar(), q ? 300 : 0); return () => clearTimeout(t); }, [recarregar, q]);
  useEffect(() => {
    api.get('/cadastros/clientes').then((c) => { setClientes(c); setCliSel((x) => x ?? c[0]?.id ?? null); }).catch(() => {});
    api.get(`${CAM}/referencias`).then(setReferencias).catch(() => {});
    api.get('/tributos').then(setTributos).catch(() => {});
  }, []);

  const ed0 = useEdicao({ lista, foco, setFoco, caminho: CAM, recarregar, aviso: notificar, confirmar: setConfirma, padrao: () => ({ peso: '0.05', peso_bruto: '0.05', divisor_basico: 1, ...(clienteFiltro ? { id_cliente: clienteFiltro } : {}) }), texto: (r) => `o produto ${r?.descricao ?? ''}` });
  const codigoPara = useCallback(async (cli) => { try { const r = await api.get(`${CAM}/proximo-codigo?cliente=${cli}`); ed0.set('codigo', r.codigo); } catch (e) { notificar('erro', e.message); } }, [ed0.set, notificar]); // eslint-disable-line react-hooks/exhaustive-deps
  const ed = useMemo(() => ({ ...ed0, incluir: () => { if (ed0.sujo) { ed0.incluir(); return; } ed0.incluir(); if (clienteFiltro) codigoPara(clienteFiltro); } }), [ed0, clienteFiltro, codigoPara]);
  const campoCod = useRef(null);
  const bClis = useBusca(clientes, B_CLI);
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
        <label className="cd-filtro"><input type="checkbox" checked={filtrar} onChange={(e) => setFiltrar(e.target.checked)} />Só produtos de <b>{clienteNome || 'um cliente'}</b></label>
        <span className="cd-esp-barra" />
        <input type="search" className="cd-busca" placeholder="Pesquisar produto (descrição ou código)" aria-label="Pesquisar produto" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="cd-btn" title="Fechar esta tela" onClick={onFechar}>Fechar</button>
      </div>
      <div className="cd-corpo cd-prod">
        <section className="cd-lado larga">
          <div className="cd-abas" role="tablist">
            {[['lista', 'Produtos'], ['refs', 'Referências da produção'], ['clis', 'Clientes']].map(([k, r]) => <button key={k} type="button" role="tab" aria-selected={aba === k} className={aba === k ? 'on' : ''} onClick={() => setAba(k)}>{r}</button>)}
          </div>
          {aba === 'lista' && <GradeCad cols={COLS_LISTA} rows={lista} foco={foco} onSel={ed.selecionar} vazio="Nenhum produto" />}
          {aba === 'refs' && <GradeCad cols={COLS_REFS} rows={referencias} foco={null} onSel={() => {}} vazio="Nenhuma referência" />}
          {aba === 'clis' && (
            <>
              <div className="cd-busca-linha"><Busca busca={bClis} total={clientes.length} placeholder="Pesquisar cliente…" /></div>
              <GradeCad cols={COLS_CLIS} rows={bClis.visiveis} foco={cliSel} onSel={setCliSel} vazio="Nenhum cliente" />
            </>
          )}
          <footer className="cd-rodape-lista">{aba === 'lista' ? `${lista.length} produto(s)${trunc ? ' — mostrando os primeiros 5000; refine a busca' : ''}` : aba === 'clis' ? 'Clique para escolher o cliente do filtro' : `${referencias.length} referência(s)`}</footer>
        </section>
        <main className="cd-rola">
          <ProdutoForm ed={ed} layout="tela" clientes={clientes} referencias={referencias} tributos={tributos} aoMudarCliente={(n) => { if (ed.novo && n && !ed.v('codigo')) codigoPara(n); }} />
        </main>
      </div>
      {confirma && <Confirma texto={confirma.texto} onSim={confirma.sim} onFechar={() => setConfirma(null)} />}
    </div>
  );
}
