import { useEffect, useState } from 'react';
import { useAoFicarVisivel } from '../lib/useVisivel.js';
import { api } from '../api.js';
import { brData, fmtQtde, hoje, somaDias } from '../lib/rules.js';

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const fmtPct = (v) => `${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const diaSemana = (iso) => DIAS[new Date(`${iso}T12:00:00`).getDay()];

/** Variação em relação a outro dia: seta, percentual e cor (sem base → traço). */
function Delta({ pct, rotulo }) {
  if (pct === null || pct === undefined) return <span className="db-delta nd" title={rotulo}>— {rotulo}</span>;
  const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'eq';
  return <span className={`db-delta ${cls}`} title={rotulo}>{pct > 0 ? '▲' : pct < 0 ? '▼' : '='} {Math.abs(pct).toLocaleString('pt-BR')}% {rotulo}</span>;
}

function Cartao({ titulo, valor, sub, comp, campo, destaque }) {
  return (
    <article className={`db-card${destaque ? ' dest' : ''}`}>
      <h3>{titulo}</h3>
      <strong>{valor}</strong>
      {sub && <small>{sub}</small>}
      {comp && <div className="db-deltas"><Delta pct={comp.ontem[campo]} rotulo="vs ontem" /><Delta pct={comp.semana_passada[campo]} rotulo="vs sem. passada" /></div>}
    </article>
  );
}

/** Barras horizontais simples (sem biblioteca): largura proporcional ao maior valor. */
function Barras({ titulo, dados, rotulo, valor, fmt = fmtQtde, vazio = 'Sem dados neste dia.' }) {
  const max = Math.max(1, ...dados.map((d) => Number(d[valor]) || 0));
  return (
    <section className="db-painel">
      <h3>{titulo}</h3>
      {dados.length === 0 ? <p className="db-vazio">{vazio}</p> : (
        <ul className="db-barras">
          {dados.map((d) => (
            <li key={d[rotulo]}>
              <span className="db-rot" title={d[rotulo]}>{d[rotulo]}</span>
              <span className="db-trilho"><i style={{ width: `${Math.max(2, (Number(d[valor]) / max) * 100)}%` }} /></span>
              <b>{fmt(d[valor])}</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const STATUS = [['normal', 'Normal', 'var(--lista-s1)'], ['alterado', 'Alterado', 'var(--lista-s2)'], ['cancelado', 'Cancelado', '#e57373'], ['nada', 'Sem itens', 'var(--lista-s0)']];

export default function Dashboard() {
  const [data, setData] = useState(hoje());
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  const carregar = async (dia) => {
    setCarregando(true); setErro('');
    try { setD(await api.get(`/dashboard?data=${dia}`)); } catch (e) { setErro(e.message || 'Não foi possível carregar o painel.'); } finally { setCarregando(false); }
  };
  useEffect(() => { carregar(data); }, [data]);
  const raiz = useAoFicarVisivel(() => carregar(data)); // volta para a aba → números atualizados

  const totalSt = d ? STATUS.reduce((s, [k]) => s + (d.status[k] || 0), 0) : 0;
  const pctNf = (v) => (d && d.notas.total > 0 ? Math.round((v / d.notas.total) * 100) : 0);
  const pctCobrado = d && d.qtde > 0 ? Math.min(100, Math.round((d.qtde_cobrada / d.qtde) * 100)) : 0;

  return (
    <div className="db" ref={raiz}>
      <header className="db-topo">
        <div>
          <h2>Dashboard</h2>
          <p>{diaSemana(data)}, {brData(data)}{data === hoje() ? ' · hoje' : ''}</p>
        </div>
        <div className="db-nav">
          <button className="bt" onClick={() => setData(somaDias(data, -1))} title="Dia anterior">◀</button>
          <input type="date" value={data} onChange={(e) => e.target.value && setData(e.target.value)} />
          <button className="bt" onClick={() => setData(somaDias(data, 1))} title="Próximo dia">▶</button>
          <button className="bt" onClick={() => setData(hoje())}>Hoje</button>
          <button className="bt" onClick={() => setData(somaDias(hoje(), 1))} title="Programação de amanhã">Amanhã</button>
          <button className="bt" onClick={() => carregar(data)} disabled={carregando}>{carregando ? 'Atualizando…' : '↻ Atualizar'}</button>
        </div>
      </header>

      {erro && <div className="db-erro" role="alert">{erro}</div>}
      {!d && !erro && <p className="db-vazio">Carregando…</p>}

      {d && (
        <>
          <div className="db-cards">
            <Cartao destaque titulo="Quantidade total" valor={fmtQtde(d.qtde)} sub="unidades programadas" comp={d.comparativo} campo="qtde" />
            <article className="db-card">
              <h3>Notas emitidas</h3>
              <strong>{fmtQtde(d.notas.emitidas)}</strong>
              <small>{d.notas.total > 0 ? `${pctNf(d.notas.emitidas)}% autorizadas · ${d.notas.canceladas + d.notas.devolvidas} cancel./devolv. · ${d.notas.rejeitadas + d.notas.pendentes} pend./rejeit.` : 'nenhuma nota emitida no dia'}</small>
              <div className="db-deltas"><Delta pct={d.notas.comparativo.ontem} rotulo="vs ontem" /><Delta pct={d.notas.comparativo.semana_passada} rotulo="vs sem. passada" /></div>
            </article>
            <Cartao titulo="Itens" valor={fmtQtde(d.itens)} sub={`${d.clientes} cliente(s) · ${d.cancelados} cancelado(s)`} comp={d.comparativo} campo="itens" />
            <Cartao titulo="Alterações do dia" valor={fmtQtde(d.avulsos + d.fixos_alterados)} sub={`${d.avulsos} avulso(s) · ${d.fixos_alterados} fixo(s) com extra`} />
            <article className="db-card">
              <h3>Cobrado / pendente</h3>
              <strong>{pctCobrado}%</strong>
              <small>{fmtQtde(d.qtde_cobrada)} cobrado · {fmtQtde(d.pendente)} pendente</small>
              <span className="db-trilho grande"><i style={{ width: `${pctCobrado}%` }} /></span>
            </article>
          </div>

          <section className="db-painel">
            <h3>Situação dos clientes ({totalSt})</h3>
            {totalSt === 0 ? <p className="db-vazio">Nenhum cliente com movimento ativado neste dia.</p> : (
              <>
                <div className="db-pilha" role="img" aria-label="Distribuição por situação">
                  {STATUS.filter(([k]) => d.status[k] > 0).map(([k, , cor]) => <i key={k} style={{ flex: d.status[k], background: cor }} title={`${d.status[k]}`} />)}
                </div>
                <ul className="db-legenda">
                  {STATUS.map(([k, nome, cor]) => <li key={k}><i style={{ background: cor }} />{nome}: <b>{d.status[k]}</b></li>)}
                </ul>
              </>
            )}
          </section>

          <div className="db-grade">
            <Barras titulo="Entregas por hora" dados={d.por_hora} rotulo="hora" valor="qtde" />
            <Barras titulo="Produção por turno" dados={d.por_turno.map((t) => ({ ...t, turno: t.turno === '—' ? 'Sem turno' : `${t.turno}º turno` }))} rotulo="turno" valor="qtde" />
            <Barras titulo="Por acomodação" dados={d.por_acomodacao} rotulo="acomodacao" valor="qtde" />
            <Barras titulo="Produtos com maior participação" dados={d.top_produtos} rotulo="produto" valor="pct" fmt={fmtPct} />
            <Barras titulo="Clientes com maior participação" dados={d.top_clientes} rotulo="cliente" valor="pct" fmt={fmtPct} />
          </div>
        </>
      )}
    </div>
  );
}
