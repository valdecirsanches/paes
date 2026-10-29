import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Busca, Campo, Chave, Confirma, Navegador, Secao, Txt, useBusca, useEdicao } from '../components/cad.jsx';
import GradeCad from '../components/GradeCad.jsx';
import ProdutoForm from '../components/ProdutoForm.jsx';
import { imprimirDocumento, temDestino } from '../lib/impressora.js';
import { etiquetasNutricionista, imprimirHtml, listagemUnidades, tabelaPrecos } from '../lib/print.js';
import { Toast } from '../components/toast.jsx';

const CAM = '/cadastros/clientes';
const TIPOS = ['DIARIO', 'SEMANAL', 'QUINZENAL', 'MENSAL', 'SEGUNDAS E QUINTAS'];
const REGIOES = ['OSASCO', 'RAPOSO TAVARES', 'PINHEIROS', 'JAGUARE', 'LAPA', 'ANHANGUERA', 'PIRITUBA', 'BARUERI', 'ALPHAVILLE', 'TAMBORE', 'ITAPEVI', 'JANDIRA', 'OUTRA'];
const EXTRAS = [['extra_cortado', ' CORTADO'], ['extra_margarina', ' C/MARGARINA'], ['extra_coco', ' C/COCO'], ['extra_acucar', ' C/ACUCAR'], ['extra_plastico', ' EMB/IND/PLASTICO'], ['extra_papel', ' EMB/IND/PAPEL'], ['extra_pacote', ' EMB/PCT/PLASTICO']];

const COLS_CLI = [['codigo', 'Código'], ['razao_social', 'Nome do cliente'], ['nome_fantasia', 'Fantasia'], ['cidade', 'Cidade'], ['uf', 'UF'], ['fone', 'Telefone'], ['contato', 'Contato'], ['cnpj', 'CNPJ'], ['email', 'E-mail'], ['programacao_ativo', 'Prog.', 'chk'], ['ativo', 'Ativo', 'chk']];
const COLS_UNI = [['codigo', 'Código'], ['nome', 'Unidade'], ['endereco', 'Endereço'], ['bairro', 'Bairro'], ['cidade', 'Cidade'], ['telefone', 'Telefone'], ['contato', 'Contato'], ['nutricionista_nome', 'Nutricionista'], ['regiao', 'Região'], ['emite_comanda_diaria', 'Comanda', 'chk'], ['ativo', 'Ativo', 'chk']];
const COLS_PROD = [['codigo', 'Código'], ['descricao', 'Descrição do produto'], ['descricao_expedicao', 'Descrição expedição'], ['un', 'UN'], ['preco', 'Preço', 'm'], ['divisor_basico', 'Cada'], ['produto_producao', 'Prod.', 'chk']];
const COLS_REFS = [['id', 'ID'], ['codigo_referencia', 'Referência'], ['descricao', 'Descrição'], ['produto_especial', 'ESP', 'chk'], ['produto_producao', 'PRÇ', 'chk']];
const B_CLI = ['razao_social', 'nome_fantasia', 'codigo', 'cnpj', 'cidade', 'bairro', 'endereco', 'fone', 'contato', 'email'];
const B_UNI = ['nome', 'codigo', 'cnpj', 'cidade', 'bairro', 'endereco', 'telefone', 'contato', 'nutricionista_nome', 'regiao'];
const POR_PAG = 50;
const B_PROD = ['descricao', 'descricao_expedicao', 'codigo', 'ncm', 'un'];
// Cadastro de clientes (u_clientes): cliente no alto; abas Lista de Clientes / Unidades / Produtos.
export default function Clientes({ onFechar }) {
  const [clientes, setClientes] = useState([]);
  const [fCli, setFCli] = useState(null);
  const [unidades, setUnidades] = useState([]);
  const [fUni, setFUni] = useState(null);
  const [produtos, setProdutos] = useState([]);
  const [fProd, setFProd] = useState(null);
  const [referencias, setReferencias] = useState([]);
  const [uniCom, setUniCom] = useState([]);
  const [aba, setAba] = useState('lista');
  const [abertoCli, setAbertoCli] = useState(true); // dados do cliente: abertos na lista, recolhidos ao editar unidades/produtos (mais espaço)
  const [abaProd, setAbaProd] = useState('lista');
  const [conectar, setConectar] = useState(false);
  const [esconder, setEsconder] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [confirma, setConfirma] = useState(null);
  const notificar = useCallback((tipo, m) => setAviso({ tipo, m }), []);
  useEffect(() => { if (!aviso) return undefined; const t = setTimeout(() => setAviso(null), 9000); return () => clearTimeout(t); }, [aviso]);
  const campoNomeUni = useRef(null);
  const campoRazao = useRef(null);

  const recCli = useCallback(async (id) => {
    try { const r = await api.get(CAM); setClientes(r); setFCli((f) => { const a = id ?? f; return r.some((x) => x.id === a) ? a : r[0]?.id ?? null; }); } catch (e) { notificar('erro', e.message); }
  }, [notificar]);
  useEffect(() => { recCli(); api.get('/cadastros/produtos/referencias').then(setReferencias).catch(() => {}); }, [recCli]);

  const bCli = useBusca(clientes, B_CLI);
  const cli = useEdicao({ lista: bCli.visiveis, foco: fCli, setFoco: setFCli, caminho: CAM, recarregar: recCli, aviso: notificar, confirmar: setConfirma, padrao: () => ({ ativo: 'ATIVO', programacao_ativo: 'True', pessoa: 'JURIDICA', comanda_nf: '1' }), texto: (r) => `o cliente ${r?.razao_social ?? ''}` });

  const idCli = cli.atual?.id ?? null;
  const recUni = useCallback(async (id) => {
    try {
      const par = new URLSearchParams();
      if (conectar && idCli) par.set('cliente', idCli);
      if (esconder) par.set('esconder', '1');
      const r = await api.get(`${CAM}/unidades?${par}`);
      setUnidades(r); setFUni((f) => { const a = id ?? f; return r.some((x) => x.id === a) ? a : r[0]?.id ?? null; });
    } catch (e) { notificar('erro', e.message); }
  }, [conectar, esconder, idCli, notificar]);
  useEffect(() => { recUni(); }, [recUni]);
  const bUni = useBusca(unidades, B_UNI);
  const [pagUni, setPagUni] = useState(0); // grade de unidades paginada (desconectado: todas as unidades)
  const totPagUni = Math.max(1, Math.ceil(bUni.visiveis.length / POR_PAG));
  const pagUniOk = Math.min(pagUni, totPagUni - 1);
  const uniPagina = useMemo(() => bUni.visiveis.slice(pagUniOk * POR_PAG, (pagUniOk + 1) * POR_PAG), [bUni.visiveis, pagUniOk]);
  useEffect(() => { setPagUni(0); }, [bUni.termo, conectar, esconder, idCli]); // nova pesquisa/filtro volta à 1ª página
  useEffect(() => { const i = bUni.visiveis.findIndex((x) => x.id === fUni); if (i >= 0) setPagUni(Math.floor(i / POR_PAG)); }, [fUni]); // eslint-disable-line react-hooks/exhaustive-deps -- navegador (◀ ▶) leva à página da unidade
  const uni = useEdicao({ lista: bUni.visiveis, foco: fUni, setFoco: setFUni, caminho: `${CAM}/unidades`, recarregar: recUni, aviso: notificar, confirmar: setConfirma, padrao: () => ({ id_cliente: idCli, ativo: 'True' }), texto: (r) => `a unidade ${r?.nome ?? ''}` });

  const recProd = useCallback(async (id) => {
    if (!idCli) { setProdutos([]); setFProd(null); return; }
    try { const r = await api.get(`${CAM}/${idCli}/produtos`); setProdutos(r); setFProd((f) => { const a = id ?? f; return r.some((x) => x.id === a) ? a : r[0]?.id ?? null; }); } catch (e) { notificar('erro', e.message); }
  }, [idCli, notificar]);
  useEffect(() => { recProd(); }, [recProd]);
  const bProd = useBusca(produtos, B_PROD);
  const prod0 = useEdicao({ lista: bProd.visiveis, foco: fProd, setFoco: setFProd, caminho: '/cadastros/produtos', recarregar: recProd, aviso: notificar, confirmar: setConfirma, texto: (r) => `o produto ${r?.descricao ?? ''}`,
    padrao: () => ({ id_cliente: idCli, id_referencia: referencias[0]?.id ?? null, pm: 'PRODUTO', peso: '0.05', peso_bruto: '0.05', divisor_basico: 1 }) });
  const refDesc = (id) => referencias.find((r) => r.id === Number(id))?.descricao ?? '';
  // cbCortadoClick: ao marcar/desmarcar uma opção, a descrição da expedição é remontada
  const prod = useMemo(() => ({
    ...prod0,
    set: (k, val) => {
      prod0.set(k, val);
      if (EXTRAS.some(([x]) => x === k)) {
        const on = (x) => (x === k ? val === 'True' : String(prod0.v(x)) === 'True');
        prod0.set('descricao_expedicao', `${refDesc(prod0.v('id_referencia'))} ${EXTRAS.map(([x, t]) => (on(x) ? t : '')).join('')}`);
      }
    },
    incluir: async () => {
      if (prod0.sujo) { prod0.incluir(); return; }
      prod0.incluir();
      try { const r = await api.get(`/cadastros/produtos/proximo-codigo?cliente=${idCli}`); prod0.set('codigo', r.codigo); } catch (e) { notificar('erro', e.message); }
    },
  }), [prod0, referencias, idCli, notificar]); // eslint-disable-line react-hooks/exhaustive-deps

  const idCom = uni.v('id_cliente_comandas');
  useEffect(() => { // cxDBLookupComboBox2Enter: unidades do cliente de destino das comandas
    if (!idCom) { setUniCom([]); return; }
    api.get(`${CAM}/unidades?cliente=${Number(idCom)}`).then(setUniCom).catch(() => setUniCom([]));
  }, [idCom]);

  const tabela = () => { const { corpo, css } = tabelaPrecos(cli.atual?.razao_social ?? '', produtos); imprimirHtml(corpo, css); };
  const etiquetas = async (homenagem, unica) => {
    try {
      let us;
      if (unica) { if (!uni.atual) { notificar('erro', 'Selecione uma unidade.'); return; } us = [uni.atual]; } else us = await api.get(`${CAM}/nutricionistas`);
      if (!us.length) { notificar('erro', 'Nenhuma unidade com nutricionista informado.'); return; }
      await imprimirDocumento('etiqueta-nutricionista', { ...etiquetasNutricionista(us, homenagem), semNavegador: temDestino('etiqueta-nutricionista') }, notificar);
    } catch (e) { notificar('erro', e.message); }
  };
  const listagem = () => { const { corpo, css } = listagemUnidades(bUni.visiveis); imprimirHtml(corpo, css); };

  const offU = !uni.atual && !uni.novo;
  const offC = !cli.atual && !cli.novo;
  const tiposU = TIPOS.includes(uni.v('tipo_faturamento')) || !uni.v('tipo_faturamento') ? TIPOS : [uni.v('tipo_faturamento'), ...TIPOS];
  const irCliente = () => { // abre o cliente dono da unidade (limpa a pesquisa de clientes para ele aparecer)
    const id = Number(uni.v('id_cliente')); if (!id) return;
    if (uni.sujo) { notificar('erro', 'Grave ou desfaça as alterações da unidade antes de trocar de cliente.'); return; }
    bCli.setTermo('');
    if (cli.selecionar(id)) setAba('lista');
  };
  const ABAS = [['lista', 'Lista de clientes'], ['uni', 'Unidades'], ['prod', 'Produtos']];
  const BOTOES_ETQ = [['Dia do nutricionista — todas', () => etiquetas(true, false)], ['Boas Festas — todas', () => etiquetas(false, false)],
    ['Dia do nutricionista — esta unidade', () => etiquetas(true, true)], ['Boas Festas — esta unidade', () => etiquetas(false, true)], ['Listagem das unidades', listagem]];

  return (
    <div className="cd">
      <Toast aviso={aviso} />
      <div className="cd-barra">
        <Navegador ed={cli} onEditar={() => campoRazao.current?.focus()} />
        <b className="cd-titulo">{cli.novo ? cli.v('razao_social') || 'Novo cliente' : cli.atual?.razao_social}</b>
        <label className="cd-filtro" title="Ligado: a aba Unidades mostra só as unidades do cliente selecionado. Desligado: todas as unidades (paginadas)."><input type="checkbox" checked={conectar} onChange={(e) => setConectar(e.target.checked)} />Só unidades deste cliente</label>
        <button type="button" className="cd-btn" onClick={tabela}>🖨 Tabela de preços</button>
        <span className="cd-esp-barra" />
        <Busca busca={bCli} total={clientes.length} placeholder="Pesquisar cliente (nome, código, CNPJ, cidade…)" className="larga" />
        <button type="button" className="cd-btn" title="Fechar tela de clientes" onClick={onFechar}>Fechar</button>
      </div>

      <details className="cd-cliente" open={abertoCli} onToggle={(e) => setAbertoCli(e.currentTarget.open)}>
        <summary>Dados do cliente</summary>
        <div className="cd-secoes cd-4col">
          <Secao titulo="Identificação" icone="🏢">
            <Campo rotulo="Código" span={3}><Txt ed={cli} k="codigo" /></Campo>
            <Campo rotulo="Nome" span={9}><Txt ed={cli} k="razao_social" ref={campoRazao} /></Campo>
            <Campo rotulo="CNPJ" span={6}><Txt ed={cli} k="cnpj" /></Campo>
            <Campo rotulo="Inscrição estadual" span={6}><Txt ed={cli} k="ie" /></Campo>
            <div className="cd-radios" style={{ gridColumn: 'span 12' }}>
              <b>Pessoa</b>
              {['FISICA', 'JURIDICA'].map((o) => <label key={o}><input type="radio" name="pessoa" disabled={offC} checked={cli.v('pessoa') === o} onChange={() => cli.set('pessoa', o)} />{o === 'FISICA' ? 'Física' : 'Jurídica'}</label>)}
            </div>
            <Chave ed={cli} k="ativo" rotulo="Ativo" sim="ATIVO" nao="INATIVO" span={6} />
            <Chave ed={cli} k="programacao_ativo" rotulo="Programação" span={6} />
          </Secao>
          <Secao titulo="Endereço" icone="📍">
            <Campo rotulo="Endereço" span={9}><Txt ed={cli} k="endereco" /></Campo>
            <Campo rotulo="Nº" span={3}><Txt ed={cli} k="endereco_numero" /></Campo>
            <Campo rotulo="Bairro" span={12}><Txt ed={cli} k="bairro" /></Campo>
            <Campo rotulo="Cidade" span={6}><Txt ed={cli} k="cidade" /></Campo>
            <Campo rotulo="UF" span={2}><Txt ed={cli} k="uf" maxLength={2} /></Campo>
            <Campo rotulo="CEP" span={4}><Txt ed={cli} k="cep" /></Campo>
          </Secao>
          <Secao titulo="Contato" icone="☎️">
            <Campo rotulo="Telefone" span={12}><Txt ed={cli} k="fone" /></Campo>
            <Campo rotulo="Contato" span={12}><Txt ed={cli} k="contato" /></Campo>
            <Campo rotulo="E-mail para envio de Danfe/XML (NFe)" span={12}><Txt ed={cli} k="email_nfe" /></Campo>
          </Secao>
          <Secao titulo="Faturamento e NFe" icone="🧾">
            <Campo rotulo="Condições de pagamento (informações adicionais)" span={12}><Txt ed={cli} k="informacoes_nf1" /></Campo>
            <Campo rotulo="Informações para o corpo da NFe" span={12}><Txt ed={cli} k="informacoes_nf2" /></Campo>
            <Campo rotulo="Dias p/ vencimento" span={4}><Txt ed={cli} k="dias_vencto" inputMode="numeric" /></Campo>
            <div className="cd-radios" style={{ gridColumn: 'span 8' }}>
              <b>Faturar</b>
              {[['0', 'Por comanda'], ['1', 'Por NF']].map(([v, r]) => <label key={v}><input type="radio" name="comanda_nf" disabled={offC} checked={String(cli.v('comanda_nf')) === v} onChange={() => cli.set('comanda_nf', v)} />{r}</label>)}
            </div>
          </Secao>
        </div>
      </details>

      <div className="cd-abas" role="tablist">
        {ABAS.map(([k, r]) => <button key={k} type="button" role="tab" aria-selected={aba === k} className={aba === k ? 'on' : ''} onClick={() => { setAba(k); setAbertoCli(k === 'lista'); }}>{r}</button>)}
      </div>

      {aba === 'lista' && <div className="cd-corpo cd-unico"><GradeCad cols={COLS_CLI} rows={bCli.visiveis} foco={fCli} onSel={cli.selecionar} vazio="Nenhum cliente" /></div>}

      {aba === 'uni' && (
        <div className="cd-corpo cd-uni">
          <main className="cd-rola">
            <div className="cd-minibarra">
              <Navegador compacto ed={uni} onEditar={() => campoNomeUni.current?.focus()} />
              <Busca busca={bUni} total={unidades.length} placeholder="Pesquisar unidade (nome, código, endereço, bairro…)" />
              <label className="cd-filtro"><input type="checkbox" checked={esconder} onChange={(e) => setEsconder(e.target.checked)} />Esconder inativas</label>
            </div>
            <div className="cd-secoes">
              <Secao titulo="Unidade" icone="🏪">
                <Campo rotulo="Cliente dono da unidade" span={12}>
                  <span className="cd-dono">
                    <b>{clientes.find((c) => c.id === Number(uni.v('id_cliente')))?.razao_social || '—'}</b>
                    <button type="button" className="cd-btn" disabled={!uni.v('id_cliente') || uni.novo} onClick={irCliente} title="Abre o cadastro do cliente dono desta unidade">👤 Ir para o cliente</button>
                  </span>
                </Campo>
                <Campo rotulo="Código" span={3}><Txt ed={uni} k="codigo" /></Campo>
                <Campo rotulo="Nome" span={6}><Txt ed={uni} k="nome" ref={campoNomeUni} /></Campo>
                <Campo rotulo="Contato" span={3}><Txt ed={uni} k="contato" /></Campo>
                <Chave ed={uni} k="ativo" rotulo="Ativa" span={4} />
                <Chave ed={uni} k="emite_comanda_diaria" rotulo="Comanda diária" span={4} />
                <Chave ed={uni} k="quitar_automaticamente" rotulo="Quitar automaticamente" span={4} />
              </Secao>
              <Secao titulo="Endereço" icone="📍">
                <Campo rotulo="Endereço" span={7}><Txt ed={uni} k="endereco" /></Campo>
                <Campo rotulo="Nº" span={2}><Txt ed={uni} k="numero" /></Campo>
                <Campo rotulo="Complemento" span={3}><Txt ed={uni} k="complemento" /></Campo>
                <Campo rotulo="CEP" span={3}><Txt ed={uni} k="cep" /></Campo>
                <Campo rotulo="Bairro" span={3}><Txt ed={uni} k="bairro" /></Campo>
                <Campo rotulo="Cidade" span={4}><Txt ed={uni} k="cidade" /></Campo>
                <Campo rotulo="UF" span={2}><Txt ed={uni} k="uf" maxLength={2} /></Campo>
                <Campo rotulo="Telefone" span={4}><Txt ed={uni} k="telefone" /></Campo>
                <Campo rotulo="Região" span={4}><Txt ed={uni} k="regiao" list="cad-regioes" /><datalist id="cad-regioes">{REGIOES.map((r) => <option key={r} value={r} />)}</datalist></Campo>
                <Campo rotulo="Nutricionista" span={4}><Txt ed={uni} k="nutricionista_nome" /></Campo>
              </Secao>
              <Secao titulo="Fiscal e entrega" icone="🧾">
                <Campo rotulo="CNPJ" span={4}><Txt ed={uni} k="cnpj" /></Campo>
                <Campo rotulo="Inscrição estadual" span={4}><Txt ed={uni} k="ie" /></Campo>
                <Campo rotulo="Tipo de faturamento (NF)" span={4}>
                  <select disabled={offU} value={uni.v('tipo_faturamento') ?? ''} onChange={(e) => uni.set('tipo_faturamento', e.target.value)}><option value="" />{tiposU.map((t) => <option key={t}>{t}</option>)}</select>
                </Campo>
                <Campo rotulo="Placa do veículo" span={4}><Txt ed={uni} k="veiculo_placa" /></Campo>
                <Campo rotulo="UF do veículo" span={2}><Txt ed={uni} k="veiculo_uf" maxLength={2} /></Campo>
                <Campo rotulo="E-mail para Danfe/XML (NFe)" span={6}><Txt ed={uni} k="email_nfe" /></Campo>
              </Secao>
              <Secao titulo="Emitir comandas para outro destino" icone="🔀">
                <Campo rotulo="Cliente (código)" span={3}><Txt ed={uni} k="id_cliente_comandas" inputMode="numeric" /></Campo>
                <Campo rotulo="Cliente" span={9}>
                  <select disabled={offU} value={uni.v('id_cliente_comandas') ?? ''} onChange={(e) => uni.set('id_cliente_comandas', e.target.value === '' ? null : Number(e.target.value))}><option value="" />{clientes.map((c) => <option key={c.id} value={c.id}>{c.razao_social}</option>)}</select>
                </Campo>
                <Campo rotulo="Unidade (código)" span={3}><Txt ed={uni} k="id_unidade_comandas" inputMode="numeric" /></Campo>
                <Campo rotulo="Unidade" span={9}>
                  <select disabled={offU} value={uni.v('id_unidade_comandas') ?? ''} onChange={(e) => uni.set('id_unidade_comandas', e.target.value === '' ? null : Number(e.target.value))}><option value="" />{uniCom.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
                </Campo>
              </Secao>
              <Secao titulo="Etiquetas e listagem" icone="🏷️">
                {BOTOES_ETQ.map(([r, f]) => <button key={r} type="button" className="cd-btn" style={{ gridColumn: 'span 6' }} onClick={f}>{r}</button>)}
              </Secao>
            </div>
          </main>
          <section className="cd-lado larga">
            <GradeCad cols={COLS_UNI} rows={uniPagina} foco={fUni} onSel={uni.selecionar} onDbl={(id) => { if (uni.selecionar(id)) setTimeout(() => campoNomeUni.current?.focus(), 0); }} vazio="Nenhuma unidade" />
            <footer className="cd-rodape-lista cd-pag">
              <span>{bUni.visiveis.length} unidade(s){conectar ? ' deste cliente' : ' — todas'}</span>
              {totPagUni > 1 && <span className="cd-pag-ctl">
                <button type="button" className="cd-btn" disabled={pagUniOk === 0} onClick={() => setPagUni(0)} title="Primeira página">⏮</button>
                <button type="button" className="cd-btn" disabled={pagUniOk === 0} onClick={() => setPagUni(pagUniOk - 1)}>‹ Anterior</button>
                <b>Página {pagUniOk + 1} de {totPagUni}</b>
                <button type="button" className="cd-btn" disabled={pagUniOk >= totPagUni - 1} onClick={() => setPagUni(pagUniOk + 1)}>Próxima ›</button>
                <button type="button" className="cd-btn" disabled={pagUniOk >= totPagUni - 1} onClick={() => setPagUni(totPagUni - 1)} title="Última página">⏭</button>
              </span>}
            </footer>
          </section>
        </div>
      )}

      {aba === 'prod' && (
        <div className="cd-corpo cd-uni">
          <main className="cd-rola">
            <div className="cd-minibarra">
              <Navegador compacto ed={prod} onEditar={() => {}} desabilitado={!idCli} />
              <button type="button" className="cd-btn" onClick={tabela}>🖨 Tabela de preços</button>
            </div>
            <ProdutoForm ed={prod} layout="cli" clientes={clientes} referencias={referencias} />
          </main>
          <section className="cd-lado larga">
            <div className="cd-abas" role="tablist">
              {[['lista', 'Produtos do cliente'], ['refs', 'Referências']].map(([k, r]) => <button key={k} type="button" role="tab" aria-selected={abaProd === k} className={abaProd === k ? 'on' : ''} onClick={() => setAbaProd(k)}>{r}</button>)}
            </div>
            {abaProd === 'lista' && <div className="cd-busca-linha"><Busca busca={bProd} total={produtos.length} placeholder="Pesquisar produto…" /></div>}
            {abaProd === 'lista' && <GradeCad cols={COLS_PROD} rows={bProd.visiveis} foco={fProd} onSel={prod.selecionar} vazio="Nenhum produto" />}
            {abaProd === 'refs' && <GradeCad cols={COLS_REFS} rows={referencias} foco={null} onSel={() => {}} vazio="Nenhuma referência" />}
          </section>
        </div>
      )}
      {confirma && <Confirma texto={confirma.texto} onSim={confirma.sim} onFechar={() => setConfirma(null)} />}
    </div>
  );
}
