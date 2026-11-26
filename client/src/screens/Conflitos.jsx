import { useCallback, useEffect, useState } from 'react';
import { useAoReativar } from '../lib/dataHoje.js';
import { api } from '../api.js';
import { brData, hoje, somaDias } from '../lib/rules.js';
import { aoPedirConflitos, pedeAbrirDiaria, pegaPedidoConflitos } from '../lib/navega.js';
import { imprimirHtml } from '../lib/print.js';

const amanha = () => somaDias(hoje(), 1);
const num = (v) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/** "Problemas encontrados" (u_prg_conflitos do sistema antigo): só 3 conferências — item da fixa que não consta na diária e produção fora do esquema (fixa e diária). */
export default function Conflitos({ onFechar, abrirTela, ativa = true }) {
  const [data, setData] = useState(amanha());
  useAoReativar(ativa, () => { setData(amanha()); });
  const [r, setR] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [vistos, setVistos] = useState(() => new Set()); // quadradinho da linha: só para você ir conferindo (não grava)

  const verificar = useCallback(async (d = data) => {
    setCarregando(true); setErro(''); setVistos(new Set());
    try { setR(await api.get(`/conflitos?de=${d}`)); } catch (e) { setR(null); setErro(e.message || 'Não foi possível verificar.'); } finally { setCarregando(false); }
  }, [data]);
  useEffect(() => { // pode ser aberta já numa data (Programação ▸ Ações do dia ▸ Verificar problemas)
    const aplica = () => { const p = pegaPedidoConflitos(); if (p?.data) { setData(p.data); verificar(p.data); return true; } return false; };
    if (!aplica()) verificar();
    return aoPedirConflitos(aplica);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = (p) => { pedeAbrirDiaria({ data: p.data, id_unidade: p.id_unidade, id_status: p.id_status, id_item: p.id_item, destino: p.destino }); abrirTela?.('diaria'); };
  const grupos = (r?.por_regra ?? []).filter((g) => g.qtde > 0).map((g) => ({ ...g, itens: r.problemas.filter((p) => p.tipo === g.tipo) }));
  const marca = (k) => setVistos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const imprimir = () => {
    const esc = (v) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const corpo = `<h2>Problemas encontrados — ${esc(brData(data))}</h2>${grupos.map((g) => `<h3>${esc(g.titulo)}</h3><pre>${g.itens.map((p) => esc(`${p.unidade.padEnd(24)} *** Verificar ${p.hora ?? '     '} ${String(num(p.qtde)).padStart(7)} ${String(p.produto ?? '').padEnd(36)} ${p.dias_prod} ${p.detalhe}`)).join('\n')}</pre>`).join('')}`;
    imprimirHtml(corpo, 'body{font:12px Arial}pre{font:11px "Courier New",monospace;margin:0 0 12px}h2{font-size:15px}h3{font-size:13px;margin:10px 0 4px}');
  };

  return (
    <div className="cf2">
      <header className="cf2-topo">
        <h2>Problemas encontrados</h2>
        <label>Data <input type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
        <button type="button" className="bt prim" onClick={() => verificar()} disabled={carregando}>{carregando ? 'Verificando…' : '🔎 Verificar'}</button>
        <button type="button" className="bt" onClick={imprimir} disabled={!r?.total}>🖨 Imprimir</button>
        <button type="button" className="bt" onClick={() => onFechar?.()}>Fechar</button>
      </header>
      {erro && <div className="db-erro" role="alert">{erro}</div>}
      {!r && !erro && <p className="db-vazio">Verificando…</p>}
      {r && r.total === 0 && <div className="cf-ok">✅ Nenhum problema encontrado na programação de {r.periodo.rotulo}.</div>}
      {r && r.total > 0 && (
        <div className="cf2-lista" role="list">
          {grupos.map((g) => (
            <section key={g.tipo}>
              <h3>{g.titulo} <small>{g.itens.length}</small></h3>
              {g.itens.map((p, i) => {
                const k = `${p.tipo}-${p.id_item ?? p.id_status}-${p.id_unidade}-${p.hora}-${i}`;
                return (
                  <div key={k} role="listitem" className={`cf2-l${vistos.has(k) ? ' visto' : ''}`} onDoubleClick={() => abrir(p)} title="Duplo clique abre esta empresa/item na programação">
                    <input type="checkbox" checked={vistos.has(k)} onChange={() => marca(k)} aria-label="Já conferi" />
                    <span className="u">{p.unidade}</span><span className="a">***</span><span className="h">Verificar {p.hora ?? ''}</span>
                    <span className="q">{num(p.qtde)}</span><span className="p">{p.produto ?? ''}</span><span className="d">{p.dias_prod}</span><span className="m">{p.detalhe}</span>
                    <button type="button" className="bt" onClick={() => abrir(p)}>Abrir ▸</button>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
