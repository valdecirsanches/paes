import { ehFabrica } from '../lib/perfil.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { lerOrdem, gravaOrdem, ordenaPor } from '../lib/ordena.js';
import { aoPedirDiaria, pedeAbrirConflitos, pegaPedidoDiaria } from '../lib/navega.js';
import { FILTROS, STATUS, diaExtenso, hoje } from '../lib/rules.js';
import Calendario from '../components/Calendario.jsx';
import DiariaTab from '../components/DiariaTab.jsx';
import FixaTab from '../components/FixaTab.jsx';
import ReclamacoesTab from '../components/ReclamacoesTab.jsx';
import ConfigTab from '../components/ConfigTab.jsx';
import { Toast } from '../components/toast.jsx';
import { useDigitaNaLista } from '../lib/digitaNaLista.js';
import { Busca, useBusca } from '../components/cad.jsx';
import { confirmar } from '../components/toast.jsx';

function Relogio() {
  const [agora, setAgora] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 1000); return () => clearInterval(t); }, []);
  return <span className="relogio">{agora.toLocaleTimeString('pt-BR')}</span>;
}

const B_DIA = ['unidade_nome', 'cliente_razao_social'];
export default function Diaria({ onFechar }) {
  const [data, setData] = useState(hoje());
  const [filtro, setFiltro] = useState('todas');
  const gravaItem = useRef(null); // o item em edição se registra aqui; ao trocar de cliente a alteração pendente é gravada antes (nada se perde)
  const trocaClienteClique = async (id) => {
    if (id === selId) return;
    if (editandoItem && gravaItem.current && !(await gravaItem.current())) return; // falhou a gravação (ex.: campo inválido): fica no cliente atual
    setSelId(id);
  };
  const painelAberto = useRef(false); // painel de edição do item: continua aberto ao passar de um cliente para outro
  const [ord, setOrd] = useState(() => lerOrdem('clientes', { campo: 'entrega', dir: 1 })); // campo: entrega | nome; dir: 1 crescente, -1 decrescente
  const mudaOrdem = (campo) => setOrd((o) => { const n = { campo, dir: o.campo === campo ? -o.dir : 1 }; gravaOrdem('clientes', n); return n; });
  const ordem = ord.campo;
  const [lista, setLista] = useState([]);
  const busca = useBusca(lista, B_DIA);
  const [selId, setSelId] = useState(null);
  const alvoAbrir = useRef(null); // { id_status, id_unidade } pedido por "Verificar problemas ▸ Abrir"
  const alvoItem = useRef(null); // { tipo: 'diaria' | 'fixa', id } item a destacar depois de carregar
  const [recarga, setRecarga] = useState(0);
  const uniSel = useRef(null); // unidade selecionada (sobrevive à troca de data)
  const [aba, setAba] = useState('diaria');
  const [editandoItem, setEditandoItem] = useState(false); // item em edição: a faixa de calendário/clientes recolhe para dar espaço ao formulário
  const [aviso, setAviso] = useState(null);
  const [roteiros, setRoteiros] = useState([]);

  const notify = {
    ok: (m) => setAviso({ tipo: 'ok', m }),
    erro: (m) => setAviso({ tipo: 'erro', m }),
  };
  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(null), 9000);
    return () => clearTimeout(t);
  }, [aviso]);

  const carregarLista = useCallback(async () => {
    const rows = ordenaPor(await api.get(`/status?data=${data}&filtro=${filtro}`), ord.campo === 'nome' ? (r) => r.nome : (r) => r.primeira_entrega, ord.dir);
    setLista(rows);
    const a = alvoAbrir.current;
    if (a) { // veio de "Verificar problemas": posiciona exatamente na empresa do problema (pelo id do status; senão pela unidade)
      alvoAbrir.current = null;
      const hit = rows.find((r) => (a.id_status != null && r.id === a.id_status) || (a.id_status == null && r.id_unidade === a.id_unidade));
      if (hit) { uniSel.current = hit.id_unidade; setSelId(hit.id); requestAnimationFrame(() => document.querySelector('.dr2-cli.atual')?.scrollIntoView({ block: 'center' })); return; }
    }
    // ao trocar a data os ids de status mudam: mantém a MESMA unidade/cliente selecionada (se ela existir no novo dia)
    setSelId((id) => (rows.some((r) => r.id === id) ? id : (rows.find((r) => uniSel.current != null && r.id_unidade === uniSel.current) ?? rows[0])?.id ?? null));
  }, [data, filtro, ord]);

  // "Verificar problemas" pede para abrir esta tela numa data/empresa (também se a tela acabou de ser aberta)
  useEffect(() => {
    const aplica = () => {
      const p = pegaPedidoDiaria(); if (!p) return;
      alvoAbrir.current = { id_status: p.id_status ?? null, id_unidade: p.id_unidade ?? null };
      const fixa = p.destino === 'fixa';
      alvoItem.current = p.id_item != null ? { tipo: fixa ? 'fixa' : 'diaria', id: p.id_item } : null;
      if (p.id_unidade != null) uniSel.current = p.id_unidade;
      setFiltro('todas'); busca.setTermo(''); setAba(fixa ? 'fixa' : 'diaria'); setEditandoItem(false);
      if (p.data) setData(String(p.data).slice(0, 10));
      setRecarga((x) => x + 1); // mesma data/filtro: força recarregar a lista para posicionar
    };
    aplica();
    return aoPedirDiaria(aplica);
  }, []);
  useEffect(() => { carregarLista().catch((e) => { setLista([]); notify.erro(e.message); }); }, [carregarLista, recarga]);

  const sel = lista.find((r) => r.id === selId) || null;
  // digitar direto na lista de clientes: posiciona a unidade/cliente que combina
  const digCli = useDigitaNaLista({ itens: busca.visiveis, texto: (r) => `${r.unidade_nome} ${r.cliente_razao_social ?? ''}`, onAchar: (r) => { if (editandoItem) return; setSelId(r.id); requestAnimationFrame(() => document.querySelector('.dr2-cli.atual')?.scrollIntoView({ block: 'nearest' })); } });
  // ↑ ↓ PageUp PageDown Home End trocam o cliente selecionado: com o foco na lista/pesquisa OU em qualquer ponto da tela
  // (fora de campos de formulário); não vale com o item em edição.
  const raiz = useRef(null);
  const trocaCliente = (e) => {
    const passo = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8, Home: -Infinity, End: Infinity }[e.key];
    if (passo === undefined || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || editandoItem) return;
    const t = e.target;
    if (t?.closest?.('select, textarea, [contenteditable=true], dialog, [role=menu], .dr2-mais, .cal')) return;
    if (t?.tagName === 'INPUT' && !t.closest('.dr2-lista') && t.type !== 'checkbox') return; // outros campos mantêm as setas
    if (t?.tagName === 'INPUT' && (e.key === 'Home' || e.key === 'End')) return; // na pesquisa, Home/End movem o cursor do texto
    const v = busca.visiveis; if (!v.length) return;
    e.preventDefault();
    const i = v.findIndex((r) => r.id === selId);
    const n = v[Math.min(v.length - 1, Math.max(0, i < 0 ? (passo > 0 ? 0 : v.length - 1) : i + passo))];
    const dobotao = t?.tagName === 'BUTTON' && t.closest('.dr2-lista');
    setSelId(n.id);
    requestAnimationFrame(() => { const b = document.querySelector('.dr2-cli.atual'); b?.scrollIntoView({ block: 'nearest' }); if (dobotao) b?.focus({ preventScroll: true }); });
  };
  const trocaRef = useRef(trocaCliente); trocaRef.current = trocaCliente;
  useEffect(() => { // tecla em qualquer ponto da tela (só se esta tela estiver visível)
    const h = (e) => { if (raiz.current && raiz.current.offsetParent !== null) trocaRef.current(e); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);
  useEffect(() => { if (sel) uniSel.current = sel.id_unidade; }, [sel?.id_unidade]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!sel) { setRoteiros([]); return; }
    api.get(`/status/${sel.id}/roteiros`).then(setRoteiros).catch(() => setRoteiros([]));
  }, [sel?.id]);

  const executar = async (fn, msg) => {
    try { const r = await fn(); await carregarLista(); if (msg) notify.ok(msg(r)); } catch (e) { notify.erro(e.message); }
  };

  const mudarStatus = async (novo) => {
    if (!sel) return;
    if ((novo === 0 || novo === 3)
      && !(await confirmar('Você confirma esta alteração?\nEm caso de transtornos aos procedimentos você será o responsável. Certifique-se!'))) return;
    executar(() => api.patch(`/status/${sel.id}`, { status: novo }), () => `Status: ${STATUS[novo]}`);
  };

  const acoes = [
    ['Ativar movimento do dia', async () => (await confirmar(`Ativar movimento diário de programação para ${diaExtenso(data)}?`))
      && executar(() => api.post('/status/movimento-dia', { data }), (r) => `${r.criados} empresa(s) incluída(s).`)],
    ['Ativar programação FIXA para todas as empresas', async () => (await confirmar(`Ativar todas as empresas que possuem programação fixa, para ${diaExtenso(data)}?`))
      && executar(() => api.post('/status/fixa-todas', { data }), (r) => (r.falhas.length
        ? `${r.criados} itens criados. Falhou em ${r.falhas.length} empresa(s).` : `Programação fixa ativada (${r.criados} itens).`))],
    ['Verificar possíveis problemas de programação', () => pedeAbrirConflitos({ data })],
    ['Verificar integridade de status', () => executar(() => api.post('/status/recalcular', { data }), (r) => `${r.verificados} status verificados.`)],
    ...(ehFabrica() ? [] : [['Ajustar preços de todos os itens do dia', async () => (await confirmar('Trazer o preço atual do cadastro para todos os itens do dia?'))
      && executar(() => api.post('/diaria/ajusta-preco-lote', { data }), (r) => `${r.atualizados} itens atualizados.`)]]),
  ];
  const [menuAberto, setMenuAberto] = useState(false);
  const contagem = useMemo(() => { const c = [0, 0, 0, 0]; lista.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; }); return c; }, [lista]);
  const [diaSem, diaMes] = (() => { const d = new Date(`${data}T12:00:00`); return [d.toLocaleDateString('pt-BR', { weekday: 'long' }), d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })]; })();
  const ABAS = [['diaria', '📋 Programação diária'], ['fixa', '📌 Programação fixa'], ['rcm', '💬 Reclamações'], ...(ehFabrica() ? [] : [['cfg', '⚙ Configurações']])];

  return (
    <div className="tela dr2" ref={raiz}>

      <Toast aviso={aviso} />

      <div className={`dr2-corpo${editandoItem ? ' editando' : ''}`}>
        <aside className="dr2-lado">
          <Calendario data={data} onChange={setData} />
          <div className="dr2-card">
            <div className="dr2-t">Apresentação</div>
            <div className="dr2-chips">
              {FILTROS.map(([v, r]) => (
                <label key={v} className={`dr2-chip${filtro === v ? ' on' : ''}`}><input type="radio" name="filtro" checked={filtro === v} onChange={() => setFiltro(v)} />{r}</label>
              ))}
            </div>
          </div>
          <div className="dr2-card dr2-lista">
            <div className="dr2-t">Clientes do dia <small>{lista.length}</small>
              <span className="dr2-ordem" role="group" aria-label="Ordem dos clientes">
                <button type="button" className={ordem === 'entrega' ? 'on' : ''} aria-pressed={ordem === 'entrega'} onClick={() => mudaOrdem('entrega')} title="Pelo primeiro horário de entrega do dia (clique de novo para inverter)">🕒 Entrega{ord.campo === 'entrega' ? (ord.dir > 0 ? ' ▲' : ' ▼') : ''}</button>
                <button type="button" className={ordem === 'nome' ? 'on' : ''} aria-pressed={ordem === 'nome'} onClick={() => mudaOrdem('nome')} title="Por nome (clique de novo para inverter)">Nome{ord.campo === 'nome' ? (ord.dir > 0 ? ' ▲' : ' ▼') : ''}</button>
              </span>
            </div>
            <Busca busca={busca} total={lista.length} placeholder="Pesquisar cliente/unidade…" />
            {digCli.digitado && <div className="dg-badge" role="status">⌨ {digCli.digitado}</div>}
            <ul className="dr2-clientes" aria-label="Clientes do dia" {...digCli.props} title="Digite aqui para localizar cliente/unidade">
              {busca.visiveis.map((r) => (
                <li key={r.id}>
                  <button type="button" className={`dr2-cli s${r.status}${r.id === selId ? ' atual' : ''}`} onClick={() => trocaClienteClique(r.id)} title={STATUS[r.status]}>
                    <i className="dr2-dot" />{ordem === 'entrega' && r.primeira_entrega && <b className="dr2-hr">{String(r.primeira_entrega).slice(0, 5)}</b>}{r.unidade_nome}
                  </button>
                </li>
              ))}
              {lista.length === 0 && <li className="vazio">Nenhuma empresa neste dia. Use ⚡ Ações do dia ▸ Ativar movimento do dia.</li>}
            </ul>
          </div>
          <div className="dr2-card dr2-dia">
            <div className="dr2-data"><small>{diaSem}</small><b>{diaMes}</b></div>
            <Relogio />
            <div className="dr2-resumo" title="Empresas do dia por status">
              {[1, 2, 0, 3].map((s) => <span key={s} className={`dr2-pill s${s}`}><i />{contagem[s]} {STATUS[s].toLowerCase()}</span>)}
            </div>
            <div className="dr2-mais">
              {!ehFabrica() && <><button type="button" className="dr2-b prim" aria-haspopup="menu" aria-expanded={menuAberto} onClick={() => setMenuAberto((x) => !x)}>⚡ Ações do dia ▾</button>
              {menuAberto && (
                <>
                  <div className="nf2-veu" onClick={() => setMenuAberto(false)} />
                  <div className="nf2-menu" role="menu" onClick={() => setMenuAberto(false)}>
                    {acoes.map(([rotulo, fn]) => <button key={rotulo} type="button" role="menuitem" onClick={fn}>{rotulo}</button>)}
                  </div>
                </>
              )}</>}
              <button type="button" className="dr2-b" title="Fechar tela de programação" onClick={() => onFechar?.()}>Fechar</button>
            </div>
          </div>
          <div className="dr2-cab dr2-card">
            <div className="dr2-sel">
              <small>Empresa selecionada</small>
              <b>{sel ? sel.unidade_nome : '— nenhuma —'}</b>
              {sel?.cliente_razao_social && sel.cliente_razao_social !== sel.unidade_nome && <span>{sel.cliente_razao_social}</span>}
            </div>
            <div className="dr2-seg" role="group" aria-label="Status">
              {[0, 1, 2, 3].map((s) => (
                <button key={s} type="button" disabled={!sel || ehFabrica()} className={`s${s}${sel?.status === s ? ' on' : ''}`} onClick={() => mudarStatus(s)}>{STATUS[s]}</button>
              ))}
            </div>
            <div className="dr2-rot">
              <small>🧭 Itinerário / Motorista</small>
              {roteiros.length === 0 ? <em>&lt;Sem informações&gt;</em> : (
                <table><tbody>
                  {roteiros.map((r) => <tr key={r.id_roteiro}><td>{r.horario}</td><td>{r.nome}</td><td>{r.celular}</td></tr>)}
                </tbody></table>
              )}
            </div>
          </div>

        </aside>

        <section className="dr2-principal">
          <nav className="dr2-abas" role="tablist" aria-label="Seções">
            {ABAS.map(([k, r]) => <button key={k} type="button" role="tab" aria-selected={aba === k} className={aba === k ? 'on' : ''} onClick={() => setAba(k)}>{r}</button>)}
          </nav>
          <main className="conteudo dr2-conteudo">
            {sel?.verificar_pasta === 'True' && <div className="pasta">⚠ FAVOR VERIFICAR PASTA</div>}
            {aba === 'diaria'
              ? <DiariaTab key={sel?.id ?? 'nenhuma'} registraGravar={(f) => { gravaItem.current = f; }} painelInicial={painelAberto.current} onPainel={(v) => { painelAberto.current = v; }} status={sel} data={data} filtro={filtro} roteiros={roteiros} onChanged={carregarLista} notify={notify} alvo={alvoItem} recarga={recarga} onEditando={setEditandoItem} />
              : aba === 'rcm' ? <ReclamacoesTab key={sel?.id ?? 'nenhuma'} status={sel} notify={notify} />
              : aba === 'cfg' ? <ConfigTab key={sel?.id ?? 'nenhuma'} status={sel} onChanged={carregarLista} notify={notify} />
              : sel ? <FixaTab key={sel.id} status={sel} roteiros={roteiros} onChanged={carregarLista} notify={notify} onEditando={setEditandoItem} alvo={alvoItem} recarga={recarga} /> : <p className="vazio">Selecione uma empresa na lista.</p>}
          </main>
        </section>
      </div>
    </div>
  );
}
