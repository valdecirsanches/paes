import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { FILTROS, STATUS, diaExtenso, hoje } from '../lib/rules.js';
import Calendario from '../components/Calendario.jsx';
import DiariaTab from '../components/DiariaTab.jsx';
import FixaTab from '../components/FixaTab.jsx';
import ReclamacoesTab from '../components/ReclamacoesTab.jsx';
import ConfigTab from '../components/ConfigTab.jsx';
import { Toast } from '../components/toast.jsx';
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
  const [lista, setLista] = useState([]);
  const busca = useBusca(lista, B_DIA);
  const [selId, setSelId] = useState(null);
  const uniSel = useRef(null); // unidade selecionada (sobrevive à troca de data)
  const [aba, setAba] = useState('diaria');
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
    const rows = await api.get(`/status?data=${data}&filtro=${filtro}`);
    setLista(rows);
    // ao trocar a data os ids de status mudam: mantém a MESMA unidade/cliente selecionada (se ela existir no novo dia)
    setSelId((id) => (rows.some((r) => r.id === id) ? id : (rows.find((r) => uniSel.current != null && r.id_unidade === uniSel.current) ?? rows[0])?.id ?? null));
  }, [data, filtro]);

  useEffect(() => { carregarLista().catch((e) => { setLista([]); notify.erro(e.message); }); }, [carregarLista]);

  const sel = lista.find((r) => r.id === selId) || null;
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
    ['Verificar integridade de status', () => executar(() => api.post('/status/recalcular', { data }), (r) => `${r.verificados} status verificados.`)],
    ['Ajustar preços de todos os itens do dia', async () => (await confirmar('Trazer o preço atual do cadastro para todos os itens do dia?'))
      && executar(() => api.post('/diaria/ajusta-preco-lote', { data }), (r) => `${r.atualizados} itens atualizados.`)],
  ];
  const [menuAberto, setMenuAberto] = useState(false);
  const contagem = useMemo(() => { const c = [0, 0, 0, 0]; lista.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; }); return c; }, [lista]);
  const [diaSem, diaMes] = (() => { const d = new Date(`${data}T12:00:00`); return [d.toLocaleDateString('pt-BR', { weekday: 'long' }), d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })]; })();
  const ABAS = [['diaria', '📋 Programação diária'], ['fixa', '📌 Programação fixa'], ['rcm', '💬 Reclamações'], ['cfg', '⚙ Configurações']];

  return (
    <div className="tela dr2">
      <header className="dr2-topo">
        <div className="dr2-data"><small>{diaSem}</small><b>{diaMes}</b></div>
        <Relogio />
        <div className="dr2-resumo" title="Empresas do dia por status">
          {[1, 2, 0, 3].map((s) => <span key={s} className={`dr2-pill s${s}`}><i />{contagem[s]} {STATUS[s].toLowerCase()}</span>)}
        </div>
        <span className="dr2-esp" />
        <div className="dr2-mais">
          <button type="button" className="dr2-b prim" aria-haspopup="menu" aria-expanded={menuAberto} onClick={() => setMenuAberto((x) => !x)}>⚡ Ações do dia ▾</button>
          {menuAberto && (
            <>
              <div className="nf2-veu" onClick={() => setMenuAberto(false)} />
              <div className="nf2-menu" role="menu" onClick={() => setMenuAberto(false)}>
                {acoes.map(([rotulo, fn]) => <button key={rotulo} type="button" role="menuitem" onClick={fn}>{rotulo}</button>)}
                <small>Conflitos, etiquetas e relatórios: próximas fases</small>
              </div>
            </>
          )}
        </div>
        <button type="button" className="dr2-b" title="Fechar tela de programação" onClick={() => onFechar?.()}>Fechar</button>
      </header>

      <Toast aviso={aviso} />

      <div className="dr2-corpo">
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
            <div className="dr2-t">Clientes do dia <small>{lista.length}</small></div>
            <Busca busca={busca} total={lista.length} placeholder="Pesquisar cliente/unidade…" />
            <ul className="dr2-clientes" aria-label="Clientes do dia">
              {busca.visiveis.map((r) => (
                <li key={r.id}>
                  <button type="button" className={`dr2-cli s${r.status}${r.id === selId ? ' atual' : ''}`} onClick={() => setSelId(r.id)} title={STATUS[r.status]}>
                    <i className="dr2-dot" />{r.unidade_nome}
                  </button>
                </li>
              ))}
              {lista.length === 0 && <li className="vazio">Nenhuma empresa neste dia. Use ⚡ Ações do dia ▸ Ativar movimento do dia.</li>}
            </ul>
          </div>
        </aside>

        <section className="dr2-principal">
          <div className="dr2-cab">
            <div className="dr2-sel">
              <small>Empresa selecionada</small>
              <b>{sel ? sel.unidade_nome : '— nenhuma —'}</b>
              {sel?.cliente_razao_social && sel.cliente_razao_social !== sel.unidade_nome && <span>{sel.cliente_razao_social}</span>}
            </div>
            <div className="dr2-seg" role="group" aria-label="Status">
              {[0, 1, 2, 3].map((s) => (
                <button key={s} type="button" disabled={!sel} className={`s${s}${sel?.status === s ? ' on' : ''}`} onClick={() => mudarStatus(s)}>{STATUS[s]}</button>
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

          <nav className="dr2-abas" role="tablist" aria-label="Seções">
            {ABAS.map(([k, r]) => <button key={k} type="button" role="tab" aria-selected={aba === k} className={aba === k ? 'on' : ''} onClick={() => setAba(k)}>{r}</button>)}
          </nav>
          <main className="conteudo dr2-conteudo">
            {sel?.verificar_pasta === 'True' && <div className="pasta">⚠ FAVOR VERIFICAR PASTA</div>}
            {aba === 'diaria'
              ? <DiariaTab key={sel?.id ?? 'nenhuma'} status={sel} data={data} filtro={filtro} roteiros={roteiros} onChanged={carregarLista} notify={notify} />
              : aba === 'rcm' ? <ReclamacoesTab key={sel?.id ?? 'nenhuma'} status={sel} notify={notify} />
              : aba === 'cfg' ? <ConfigTab key={sel?.id ?? 'nenhuma'} status={sel} onChanged={carregarLista} notify={notify} />
              : sel ? <FixaTab key={sel.id} status={sel} roteiros={roteiros} onChanged={carregarLista} notify={notify} /> : <p className="vazio">Selecione uma empresa na lista.</p>}
          </main>
        </section>
      </div>
    </div>
  );
}
