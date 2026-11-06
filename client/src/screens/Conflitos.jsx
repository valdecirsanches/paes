import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { brData, hoje, somaDias } from '../lib/rules.js';
import { aoPedirConflitos, pedeAbrirDiaria, pegaPedidoConflitos } from '../lib/navega.js';
import { imprimirHtml } from '../lib/print.js';

const GRAV = { erro: ['Erro', '⛔'], aviso: ['Atenção', '⚠️'], info: ['Informação', 'ℹ️'] };

/** "Verificar possíveis problemas de programação": confere o que foi lançado e lista o que costuma ser erro de operador. */
export default function Conflitos({ onFechar, abrirTela }) {
  const [de, setDe] = useState(hoje());
  const [ate, setAte] = useState(hoje());
  const [r, setR] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [grav, setGrav] = useState({ erro: true, aviso: true, info: false });
  const [regra, setRegra] = useState('');
  const [busca, setBusca] = useState('');
  const [agrupar, setAgrupar] = useState(false); // agrupa por empresa, como a lista do sistema antigo

  const verificar = useCallback(async (d = de, a = ate) => {
    setCarregando(true); setErro('');
    try { setR(await api.get(`/conflitos?de=${d}&ate=${a}`)); } catch (e) { setR(null); setErro(e.message || 'Não foi possível verificar.'); } finally { setCarregando(false); }
  }, [de, ate]);
  useEffect(() => { // pode ser aberta já numa data (Programação ▸ Ações do dia ▸ Verificar problemas)
    const aplica = () => { const p = pegaPedidoConflitos(); if (p?.data) { setDe(p.data); setAte(p.data); verificar(p.data, p.data); return true; } return false; };
    if (!aplica()) verificar();
    return aoPedirConflitos(aplica);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const atalho = (d, a) => { setDe(d); setAte(a); verificar(d, a); };
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (r?.problemas ?? []).filter((p) => grav[p.gravidade] && (!regra || p.tipo === regra)
      && (!t || `${p.unidade} ${p.produto ?? ''} ${p.detalhe} ${p.titulo}`.toLowerCase().includes(t)));
  }, [r, grav, regra, busca]);

  const abrir = (p) => { pedeAbrirDiaria({ data: p.data, id_unidade: p.id_unidade }); abrirTela?.('diaria'); };
  const multiDia = r && r.periodo.dias > 1;
  const grupos = useMemo(() => {
    if (!agrupar) return null;
    const m = new Map();
    for (const p of lista) { const k = `${p.data}|${p.unidade}`; if (!m.has(k)) m.set(k, { chave: k, unidade: p.unidade, data: p.data, itens: [] }); m.get(k).itens.push(p); }
    return [...m.values()].sort((a, b) => a.data.localeCompare(b.data) || String(a.unidade).localeCompare(String(b.unidade)));
  }, [lista, agrupar]);

  const exportar = () => {
    const cel = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [['Gravidade', 'Problema', 'Data', 'Empresa', 'Hora', 'Produto', 'O que verificar'].map(cel).join(';'),
      ...lista.map((p) => [GRAV[p.gravidade][0], p.titulo, brData(p.data), p.unidade, p.hora, p.produto, p.detalhe].map(cel).join(';'))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    a.download = `Problemas-programacao-${r.periodo.de}.csv`; document.body.appendChild(a); a.click(); a.remove();
  };
  const imprimir = () => {
    const esc = (v) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const corpo = `<h2>Problemas de programação — ${esc(r.periodo.rotulo)}</h2><table><thead><tr><th>Problema</th><th>Data</th><th>Empresa</th><th>Hora</th><th>Produto</th><th>O que verificar</th></tr></thead><tbody>${
      lista.map((p) => `<tr><td>${esc(GRAV[p.gravidade][1])} ${esc(p.titulo)}</td><td>${brData(p.data)}</td><td>${esc(p.unidade)}</td><td>${esc(p.hora)}</td><td>${esc(p.produto)}</td><td>${esc(p.detalhe)}</td></tr>`).join('')}</tbody></table>`;
    imprimirHtml(corpo, 'body{font:12px Arial}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:3px 5px;text-align:left;vertical-align:top}th{background:#eee}h2{font-size:15px}');
  };
  const linha = (p, i) => (
    <tr key={`${p.tipo}-${p.id_item ?? p.id_status}-${p.id_unidade}-${p.data}-${i}`} className={`cf-l cf-${p.gravidade}`} onClick={() => abrir(p)} title="Clique para abrir esta empresa na Programação diária">
      <td className="g" title={GRAV[p.gravidade][0]}>{GRAV[p.gravidade][1]}</td>
      <td className="t">{p.titulo}</td>
      {multiDia && !agrupar && <td>{brData(p.data)}</td>}
      {!agrupar && <td>{p.unidade}</td>}
      <td>{p.hora ?? ''}</td>
      <td>{p.produto ?? ''}</td>
      <td className="d">{p.detalhe}</td>
      <td><button type="button" className="bt" onClick={(e) => { e.stopPropagation(); abrir(p); }}>Abrir ▸</button></td>
    </tr>
  );

  return (
    <div className="cf">
      <header className="cf-topo">
        <div>
          <h2>Verificar possíveis problemas de programação</h2>
          <p>Confere os lançamentos do período e aponta o que costuma ser erro de digitação ou esquecimento.</p>
        </div>
        <div className="cf-filtro">
          <label>De <input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></label>
          <label>Até <input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} /></label>
          <button type="button" className="bt prim" onClick={() => verificar()} disabled={carregando}>{carregando ? 'Verificando…' : '🔎 Verificar'}</button>
          <button type="button" className="bt" onClick={() => atalho(hoje(), hoje())}>Hoje</button>
          <button type="button" className="bt" onClick={() => atalho(somaDias(hoje(), 1), somaDias(hoje(), 1))}>Amanhã</button>
          <button type="button" className="bt" onClick={() => atalho(hoje(), somaDias(hoje(), 6))}>Próximos 7 dias</button>
          <button type="button" className="bt" onClick={() => onFechar?.()}>Fechar</button>
        </div>
      </header>

      {erro && <div className="db-erro" role="alert">{erro}</div>}
      {r && (
        <>
          <div className="cf-resumo">
            {Object.entries(GRAV).map(([k, [nome, ico]]) => (
              <label key={k} className={`cf-chip ${k}${grav[k] ? ' on' : ''}`}>
                <input type="checkbox" checked={grav[k]} onChange={(e) => setGrav({ ...grav, [k]: e.target.checked })} />
                <span>{ico} {nome}</span><b>{r.totais[k]}</b>
              </label>
            ))}
            <select value={regra} onChange={(e) => setRegra(e.target.value)} aria-label="Tipo de problema">
              <option value="">Todos os tipos</option>
              {r.por_regra.filter((x) => x.qtde > 0).map((x) => <option key={x.tipo} value={x.tipo}>{x.titulo} ({x.qtde})</option>)}
            </select>
            <input type="search" placeholder="Filtrar por empresa, produto ou texto…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <label className="cf-chip on"><input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} /><span>Agrupar por empresa</span></label>
            <button type="button" className="bt" onClick={exportar} disabled={!lista.length}>⇩ Exportar</button>
            <button type="button" className="bt" onClick={imprimir} disabled={!lista.length}>🖨 Imprimir</button>
            <span className="cf-per">Período: {r.periodo.rotulo}</span>
          </div>

          {r.problemas.length === 0 ? (
            <div className="cf-ok">✅ Nenhum problema encontrado na programação de {r.periodo.rotulo}.</div>
          ) : lista.length === 0 ? <p className="db-vazio">Nenhum problema com esses filtros.</p> : (
            <div className="cf-tab">
              <table>
                <thead><tr><th /><th>Problema</th>{multiDia && !agrupar && <th>Data</th>}{!agrupar && <th>Empresa</th>}<th>Hora</th><th>Produto</th><th>O que verificar</th><th /></tr></thead>
                {grupos ? grupos.map((g) => (
                  <tbody key={g.chave}>
                    <tr className="cf-grupo"><td colSpan={7}>{g.unidade}{multiDia ? ` · ${brData(g.data)}` : ''} <small>{g.itens.length} apontamento(s)</small></td></tr>
                    {g.itens.map(linha)}
                  </tbody>
                )) : <tbody>{lista.map(linha)}</tbody>}
              </table>
            </div>
          )}
          <footer className="cf-rodape">{lista.length} de {r.problemas.length} apontamento(s) · Cada tipo mostra no máximo 500 ocorrências.</footer>
        </>
      )}
      {!r && !erro && <p className="db-vazio">Verificando…</p>}
    </div>
  );
}
