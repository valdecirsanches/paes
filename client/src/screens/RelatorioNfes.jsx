import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Calendario from '../components/Calendario.jsx';
import { Busca, useBusca } from '../components/cad.jsx';
import { Toast, confirmar, entrada } from '../components/toast.jsx';
import { imprimirHtml } from '../lib/print.js';
import { brData, hoje } from '../lib/rules.js';

const moeda = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const COLS = [
  ['data_emissao', 'Emissão', 'd'], ['vencto', 'Vencto', 'd'], ['nfe_numero', 'NFe'], ['cliente_nome', 'Cliente'], ['cliente_pedido', 'Pedido'],
  ['nf_valor_total', 'VR original', 'm'], ['valor_bruto', 'VR digitado', 'm'], ['valor_desconto', 'Desconto', 'm'], ['valor_liquido', 'VR líquido', 'm'],
  ['percentual', '%', 'p'], ['confirmada', 'Confirmada', 'c'], ['vr_a_receber', 'A receber', 'm'],
];
const cel = (r, [k, , t]) => (t === 'd' ? (r[k] ? brData(r[k]) : '') : t === 'm' ? moeda(r[k]) : t === 'p' ? (r[k] == null ? '' : `${moeda(r[k])}%`) : String(r[k] ?? ''));
const cmp = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a ?? '').localeCompare(String(b ?? ''), 'pt-BR', { numeric: true }));

const TODOS = { id: 'todos', codigo: '', razao_social: 'TODOS OS CLIENTES' };
/** Outros › Relatório de NFEs (u_relatorio_nfes): NFe autorizadas do cliente no período e o que já foi confirmado/recebido. */
export default function RelatorioNfes({ onFechar }) {
  const [clientes, setClientes] = useState([]);
  const [cli, setCli] = useState(TODOS);
  const [d1, setD1] = useState(() => `${hoje().slice(0, 8)}01`);
  const [d2, setD2] = useState(hoje());
  const [linhas, setLinhas] = useState(null);
  const [ord, setOrd] = useState(null); // [coluna, 1|-1]
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState(null);
  const busca = useBusca(clientes, ['codigo', 'razao_social']);
  useEffect(() => { api.get('/nfs/clientes').then(setClientes).catch((e) => setAviso({ tipo: 'erro', m: e.message })); }, []);

  const atualizar = useCallback(async () => {
    setOcupado(true);
    try { const r = await api.get(`/nfs/relatorio?cliente=${cli.id}&de=${d1}&ate=${d2}`); setLinhas(r.linhas); }
    catch (e) { setLinhas([]); setAviso({ tipo: 'erro', m: e.message }); } finally { setOcupado(false); }
  }, [cli, d1, d2]);
  useEffect(() => { atualizar(); }, [atualizar]);

  const cols = useMemo(() => COLS.filter(([k]) => k !== 'cliente_nome' || cli.id === 'todos'), [cli]);
  const ordenadas = useMemo(() => {
    if (!linhas || !ord) return linhas ?? [];
    return [...linhas].sort((a, b) => cmp(a[ord[0]], b[ord[0]]) * ord[1]);
  }, [linhas, ord]);
  const tot = useMemo(() => (linhas ?? []).reduce((t, r) => ({
    n: t.n + 1, orig: t.orig + Number(r.nf_valor_total || 0), liq: t.liq + Number(r.valor_liquido || 0), rec: t.rec + Number(r.vr_a_receber || 0), conf: t.conf + (r.confirmada === 'SIM' ? 1 : 0),
  }), { n: 0, orig: 0, liq: 0, rec: 0, conf: 0 }), [linhas]);

  const num = (t) => Number(String(t).replace(/\./g, '').replace(',', '.'));
  // Ícone da linha: ✖ → informa que foi confirmada (pede o valor recebido, sugerido com o desconto padrão) e grava; ✔ → desfaz.
  const alternaConfirmada = async (r) => {
    try {
      if (r.confirmada === 'SIM') {
        if (!(await confirmar(`Remover a confirmação da NF ${r.nfe_numero}?`))) return;
        await api.del(`/nfs/confirmadas/${r.nfe_numero}`);
        setAviso({ tipo: 'ok', m: `NF ${r.nfe_numero} marcada como NÃO confirmada.` });
      } else {
        const sug = await api.get(`/nfs/confirmadas/consulta?nf=${r.nfe_numero}`);
        const v = await entrada(`NF ${r.nfe_numero} confirmada. Valor recebido (valor da NF ${moeda(sug.bruto)}):`, moeda(sug.liquido));
        if (v == null) return;
        const liquido = num(v);
        if (!Number.isFinite(liquido) || liquido < 0) { setAviso({ tipo: 'erro', m: 'Valor recebido inválido.' }); return; }
        await api.post('/nfs/confirmadas', { linhas: [{ nf: String(r.nfe_numero), bruto: sug.bruto, liquido, desconto: Math.round((sug.bruto - liquido) * 100) / 100 }] });
        setAviso({ tipo: 'ok', m: `NF ${r.nfe_numero} confirmada.` });
      }
      await atualizar();
    } catch (e) { setAviso({ tipo: 'erro', m: e.message }); }
  };
  const alternar = (k) => setOrd((o) => (o?.[0] === k ? [k, -o[1]] : [k, 1]));
  const imprimir = () => {
    if (!linhas?.length) { setAviso({ tipo: 'erro', m: 'Não há NFs para imprimir.' }); return; }
    const cab = cols.map(([, r]) => `<th>${r}</th>`).join('');
    const corpo = ordenadas.map((r) => `<tr>${cols.map((c) => `<td class="${['m', 'p'].includes(c[2]) ? 'n' : ''}">${esc(cel(r, c))}</td>`).join('')}</tr>`).join('');
    imprimirHtml(`<h1>Relatório de NFEs — ${esc(cli.razao_social)}</h1><p>Período: ${brData(d1)} a ${brData(d2)}</p><table><thead><tr>${cab}</tr></thead><tbody>${corpo}</tbody><tfoot><tr>${cols.map(([k], i) => `<td class="n">${i === 0 ? `Total (${tot.n} NFs)` : k === 'nf_valor_total' ? moeda(tot.orig) : k === 'valor_liquido' ? moeda(tot.liq) : k === 'vr_a_receber' ? moeda(tot.rec) : ''}</td>`).join('')}</tr></tfoot></table>`,
      'body{font:11px Arial}h1{font-size:16px;margin:0}p{margin:2px 0 8px}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #999;padding:2px 4px;text-align:left}td.n{text-align:right}tfoot td{font-weight:700;border-top:2px solid #000}');
  };
  const excel = async () => {
    setOcupado(true);
    try {
      const res = await fetch(`/api/nfs/relatorio/xlsx?cliente=${cli.id}&de=${d1}&ate=${d2}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Falha ao gerar a planilha.');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a'); a.href = url; a.download = `${cli.razao_social}_${hoje()}.xlsx`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setAviso({ tipo: 'erro', m: e.message }); } finally { setOcupado(false); }
  };

  return (
    <div className="tela rn">
      <Toast aviso={aviso} />
      <header className="rn-topo">
        <div className="rn-tit"><h1>📊 Relatório de NFEs</h1><span className="rn-sub">{cli.razao_social}</span></div>
        <button type="button" className="rn-x" onClick={() => onFechar?.()}>✕ Fechar</button>
      </header>
      <div className="rn-corpo">
        <aside className="rn-lado">
          <div className="rn-card"><div className="rn-t">De</div><Calendario data={d1} onChange={setD1} /></div>
          <div className="rn-card"><div className="rn-t">Até</div><Calendario data={d2} onChange={setD2} /></div>
          <div className="rn-card rn-clientes">
            <div className="rn-t">Cliente</div>
            <Busca busca={busca} placeholder="Pesquisar cliente…" total={clientes.length} />
            <ul>
              <li><button type="button" className={`rn-todos${cli.id === 'todos' ? ' on' : ''}`} onClick={() => setCli(TODOS)}>★ Todos os clientes</button></li>
              {busca.visiveis.map((c) => <li key={c.id}><button type="button" className={cli.id === c.id ? 'on' : ''} onClick={() => setCli(c)}><small>{c.codigo}</small>{c.razao_social}</button></li>)}
              {busca.visiveis.length === 0 && <li className="rn-vazio">Nenhum cliente.</li>}
            </ul>
          </div>
        </aside>
        <main className="rn-main">
          <div className="rn-barra">
            <button type="button" className="rn-bt prim" disabled={ocupado} onClick={atualizar}>↻ Atualizar</button>
            <button type="button" className="rn-bt" disabled={ocupado} onClick={imprimir}>🖨 Imprimir</button>
            <button type="button" className="rn-bt" disabled={ocupado} onClick={excel}>📗 Gerar planilha Excel</button>
            <span className="rn-chips">
              <span><b>{tot.n}</b> NFs</span><span className="ok"><b>{tot.conf}</b> confirmadas</span>
              <span>Original <b>{moeda(tot.orig)}</b></span><span>Líquido <b>{moeda(tot.liq)}</b></span><span className="rec">A receber <b>{moeda(tot.rec)}</b></span>
            </span>
          </div>
          <div className="rn-grade">
            <table>
              <thead><tr><th className="rn-ic" title="Confirmada?">✔/✖</th>{cols.map(([k, r, t]) => <th key={k} className={['m', 'p'].includes(t) ? 'n' : ''} onClick={() => alternar(k)}>{r}{ord?.[0] === k ? (ord[1] === 1 ? ' ⏶' : ' ⏷') : ''}</th>)}</tr></thead>
              <tbody>
                {ordenadas.map((r) => <tr key={r.id} className={Number(r.valor_liquido) > 0 ? 'conf' : ''}><td className="rn-ic"><button type="button" className={`rn-conf ${r.confirmada === 'SIM' ? 'sim' : 'nao'}`} title={r.confirmada === 'SIM' ? 'Confirmada — clique para desfazer' : 'Não confirmada — clique para informar que foi confirmada'} aria-label="Alternar confirmação" onClick={() => alternaConfirmada(r)}>{r.confirmada === 'SIM' ? '✔' : '✖'}</button></td>{cols.map((c) => <td key={c[0]} className={['m', 'p'].includes(c[2]) ? 'n' : ''}>{cel(r, c)}</td>)}</tr>)}
                {linhas && !linhas.length && <tr className="rn-vazio"><td colSpan={cols.length + 1}>Não há NFs neste período.</td></tr>}
                              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
