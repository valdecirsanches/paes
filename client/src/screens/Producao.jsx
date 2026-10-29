import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import Calendario from '../components/Calendario.jsx';
import { Modal } from '../components/ui.jsx';
import { imprimirHtml, producaoEntrega, producaoResumo } from '../lib/print.js';
import { brData, diaExtenso, fmtQtde, hoje } from '../lib/rules.js';
import { Toast } from '../components/toast.jsx';

const nomeTipo = { salgados: 'Salgados', especiais: 'Especiais' };
const chaveMestre = (r) => `${r.producao_turno}-${r.id_referencia}`;
const chaveDestino = (r) => `${r.id_unidade}|${r.data}|${r.hora}|${r.id_referencia}|${r.producao_turno}`;
const cmp = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a ?? '').localeCompare(String(b ?? ''), 'pt-BR'));

/** Ordenação por clique no cabeçalho, como nas grades do sistema antigo (padrão: Hora, depois Destino). */
function useOrdem(padrao) {
  const [ord, setOrd] = useState(padrao); // [[coluna, 1|-1], ...]
  const alternar = (col) => setOrd((o) => (o[0]?.[0] === col ? [[col, -o[0][1]]] : [[col, 1]]));
  const ordenar = (rows) => [...rows].sort((a, b) => { for (const [c, d] of ord) { const r = cmp(a[c], b[c]) * d; if (r) return r; } return 0; });
  const seta = (col) => (ord[0]?.[0] === col ? (ord[0][1] === 1 ? ' ⏶' : ' ⏷') : '');
  return { alternar, ordenar, seta };
}

/** Uma aba (Produção salgados / Produção especial): lista por horário × referência + detalhamento de destino. */
function Painel({ tipo, data, recarga, ativo, onAviso, base, leitura }) {
  const [mestre, setMestre] = useState([]);
  const [sel, setSel] = useState(null);
  const [destinos, setDestinos] = useState([]);
  const [marcados, setMarcados] = useState(() => new Set());
  const [foco, setFoco] = useState(null);
  const [menu, setMenu] = useState(null);
  const ancora = useRef(null);
  const ordM = useOrdem([['producao_turno', 1]]);
  const ordD = useOrdem([['hora', 1], ['cliente_nome', 1]]);
  const sal = tipo === 'salgados';

  const linhasM = useMemo(() => ordM.ordenar(mestre), [mestre, ordM.ordenar]); // eslint-disable-line react-hooks/exhaustive-deps
  const linhasD = useMemo(() => ordD.ordenar(destinos), [destinos, ordD.ordenar]); // eslint-disable-line react-hooks/exhaustive-deps
  const atual = mestre.find((r) => chaveMestre(r) === sel) ?? null;

  const carregarMestre = useCallback(async () => {
    const rows = await api.get(`${base}/resumo?tipo=${tipo}&data=${data}`);
    setMestre(rows);
    setSel((s) => (rows.some((r) => chaveMestre(r) === s) ? s : (rows[0] ? chaveMestre(rows[0]) : null)));
  }, [tipo, data]);
  useEffect(() => { carregarMestre().catch((e) => { setMestre([]); onAviso('erro', e.message); }); }, [carregarMestre, recarga]); // eslint-disable-line react-hooks/exhaustive-deps

  const carregarDestinos = useCallback(async () => {
    if (!atual) { setDestinos([]); return; }
    const rows = await api.get(`${base}/destinos?tipo=${tipo}&data=${data}&turno=${atual.producao_turno}&referencia=${atual.id_referencia}`);
    setDestinos(rows);
    setMarcados(new Set()); setFoco(null); ancora.current = null;
  }, [tipo, data, atual?.producao_turno, atual?.id_referencia, atual?.producao_qtde]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carregarDestinos().catch((e) => { setDestinos([]); onAviso('erro', e.message); }); }, [carregarDestinos]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!menu) return undefined;
    const f = () => setMenu(null);
    window.addEventListener('click', f); window.addEventListener('keydown', f);
    return () => { window.removeEventListener('click', f); window.removeEventListener('keydown', f); };
  }, [menu]);

  const teclaMestre = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = linhasM.findIndex((r) => chaveMestre(r) === sel);
    const n = linhasM[Math.min(linhasM.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (n) setSel(chaveMestre(n));
  };

  // Seleção múltipla do detalhamento (MultiSelect do cxGrid): clique = só esta; Ctrl = alterna; Shift = intervalo.
  const clicarDestino = (e, r, i) => {
    setFoco(chaveDestino(r));
    setMarcados((atualSet) => {
      if (e.shiftKey && ancora.current != null) {
        const [a, b] = [Math.min(ancora.current, i), Math.max(ancora.current, i)];
        return new Set(linhasD.slice(a, b + 1).map(chaveDestino));
      }
      ancora.current = i;
      const k = chaveDestino(r);
      if (e.ctrlKey || e.metaKey) { const n = new Set(atualSet); if (n.has(k)) n.delete(k); else n.add(k); return n; }
      return new Set([k]);
    });
  };
  const menuDestino = (e, r, i) => {
    e.preventDefault(); e.stopPropagation();
    if (leitura) return; // fábrica: só consulta
    if (!marcados.has(chaveDestino(r))) clicarDestino({}, r, i);
    setMenu({ x: e.clientX, y: e.clientY });
  };

  // Enviarpara1horrio1Click / MenuItem1Click: move as linhas selecionadas para o horário escolhido.
  const enviarPara = async (turno) => {
    setMenu(null);
    const linhas = linhasD.filter((r) => marcados.has(chaveDestino(r)) && Number(r.producao_turno) !== turno);
    if (linhas.length === 0) return; // tudo já está nesse horário: não faz nada (como no Delphi)
    try {
      const r = await api.put('/producao/turno', {
        data, turno,
        itens: linhas.map((l) => ({ id_unidade: l.id_unidade, data: l.data, hora: l.hora, id_referencia: l.id_referencia, producao_turno: l.producao_turno })),
      });
      onAviso('ok', `${linhas.length} linha(s) enviada(s) para o ${turno}º horário (${r.alteradas} item(ns) da programação).`);
      await carregarMestre();
      await carregarDestinos();
    } catch (e) { onAviso('erro', e.message); }
  };

  const total = destinos.reduce((s, r) => s + Number(r.qtde_producao || 0), 0);

  return (
    <div className="pr-painel" hidden={!ativo}>
      <div className={`pr2-card pr-mestre ${sal ? 'sal' : 'esp'}`} tabIndex={0} onKeyDown={teclaMestre}>
        <table className="grade pr-grade">
          <thead>
            <tr>
              <th className="ind" />
              <th className="pr-c-hor" onClick={() => ordM.alternar('producao_turno')}>Horário{ordM.seta('producao_turno')}</th>
              <th className="pr-c-qtd" onClick={() => ordM.alternar('producao_qtde')}>Qtde{ordM.seta('producao_qtde')}</th>
              <th onClick={() => ordM.alternar('descricao')}>Descrição do produto{ordM.seta('descricao')}</th>
              <th className="pr-c-ref" onClick={() => ordM.alternar('codigo_referencia')}>Referência{ordM.seta('codigo_referencia')}</th>
            </tr>
          </thead>
          <tbody>
            {linhasM.map((r) => {
              const k = chaveMestre(r);
              return (
                <tr key={k} className={`pr-t${r.producao_turno}${sel === k ? ' sel' : ''}`} onClick={() => setSel(k)}>
                  <td className="ind" />
                  <td><span className={`pr2-turno t${r.producao_turno}`}>{r.producao_turno}º</span></td>
                  <td className="n">{Number(r.producao_qtde)}</td>
                  <td>{r.descricao}</td>
                  <td>{r.codigo_referencia}</td>
                </tr>
              );
            })}
            {linhasM.length === 0 && <tr className="semlinha"><td colSpan={5} className="vazio">Sem informações para esta data</td></tr>}
          </tbody>
        </table>
      </div>

      <fieldset className={`pr2-card pr-dest ${sal ? 'sal' : 'esp'}`}>
        <legend>Detalhamento de destino{atual ? ` — ${atual.descricao}` : ''}</legend>
        <div className="pr-dest-rolagem" onContextMenu={(e) => e.preventDefault()}>
          <table className="grade pr-grade-d">
            <thead>
              <tr>
                <th onClick={() => ordD.alternar('cliente_nome')}>Destino{ordD.seta('cliente_nome')}</th>
                <th onClick={() => ordD.alternar('hora')}>Hora{ordD.seta('hora')}</th>
                <th onClick={() => ordD.alternar('qtde_producao')}>Qtde{ordD.seta('qtde_producao')}</th>
                <th onClick={() => ordD.alternar('data')}>Entrega{ordD.seta('data')}</th>
                {sal && <th onClick={() => ordD.alternar('id_produto')}>id_produto{ordD.seta('id_produto')}</th>}
              </tr>
            </thead>
            <tbody>
              {linhasD.map((r, i) => {
                const k = chaveDestino(r);
                return (
                  <tr key={k} className={`clicavel${marcados.has(k) ? ' marcado' : ''}${foco === k ? ' foco' : ''}`}
                    onClick={(e) => clicarDestino(e, r, i)} onContextMenu={(e) => menuDestino(e, r, i)}>
                    <td>{r.cliente_nome}</td>
                    <td>{String(r.hora ?? '').slice(0, 8)}</td>
                    <td className="n">{fmtQtde(r.qtde_producao)}</td>
                    <td>{brData(r.data)}</td>
                    {sal && <td className="n">{r.id_produto}</td>}
                  </tr>
                );
              })}
              {linhasD.length === 0 && <tr className="semlinha"><td colSpan={sal ? 5 : 4} className="vazio">Sem informações para esta data</td></tr>}
            </tbody>
            <tfoot>
              <tr><td /><td /><td className="n">{fmtQtde(total)}</td><td />{sal && <td />}</tr>
            </tfoot>
          </table>
        </div>
      </fieldset>

      {menu && (
        <ul className="ctx" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {[1, 2, 3].map((t) => <li key={t}><button onClick={() => enviarPara(t)}>{t}º horário</button></li>)}
        </ul>
      )}
    </div>
  );
}

/** `fabrica` = modo consulta da área da fábrica (rotas /fabrica/producao, sem trocar horário). */
export default function Producao({ onFechar, fabrica = false }) {
  const base = fabrica ? '/fabrica/producao' : '/producao';
  const [data, setData] = useState(hoje());
  const [aba, setAba] = useState('salgados');
  const [recarga, setRecarga] = useState({ salgados: 0, especiais: 0 });
  const [aviso, setAviso] = useState(null);
  const [confirma, setConfirma] = useState(null); // função a executar se o usuário disser "Sim"
  const [ocupado, setOcupado] = useState(false);
  const onAviso = useCallback((tipo, m) => setAviso({ tipo, m }), []);
  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(null), 9000);
    return () => clearTimeout(t);
  }, [aviso]);

  // btnSalgadosDiaClick / btnEspeciaisDiaClick: recarrega a lista do tipo e vai para a aba dele.
  const abrirAba = (tipo) => { setRecarga((r) => ({ ...r, [tipo]: r[tipo] + 1 })); setAba(tipo); };

  // Impressões. Como no Delphi, data de hoje ou anterior pede confirmação ("Você pode estar cometendo erro!!!").
  const imprimir = (tipo, modo) => {
    const executar = async () => {
      setOcupado(true);
      try {
        const linhas = await api.get(`${base}/${modo === 'resumo' ? 'resumo' : 'entrega'}?tipo=${tipo}&data=${data}`);
        if (!linhas.length) { onAviso('erro', `Não há produção de ${nomeTipo[tipo].toLowerCase()} para ${brData(data)}.`); return; }
        const { corpo, css } = modo === 'resumo' ? producaoResumo(tipo, linhas) : producaoEntrega(tipo, linhas);
        imprimirHtml(corpo, css);
      } catch (e) { onAviso('erro', e.message); } finally { setOcupado(false); }
    };
    if (data <= hoje()) setConfirma(() => executar); else executar();
  };

  return (
    <div className="tela producao pr2">
      <Toast aviso={aviso} />
      <header className="pr2-topo">
        <div className="pr2-tit"><h1>🍞 Produção</h1><span className="pr2-data">{diaExtenso(data)}</span></div>
        {!fabrica && <button type="button" className="pr2-x" title="Fechar esta tela" onClick={() => onFechar?.()}>✕ Fechar</button>}
      </header>
      <section className="pr2-painel">
        <div className="pr2-card pr2-cal"><Calendario data={data} onChange={setData} /></div>
        <div className="pr2-card pr2-acoes">
          {[['salgados', '🥐', 'Salgados'], ['especiais', '⭐', 'Especiais']].map(([tipo, ico, nome]) => (
            <div key={tipo} className={`pr2-grupo ${tipo}`}>
              <div className="pr2-gt"><span>{ico}</span>{nome}</div>
              <div className="pr2-gb">
                <button type="button" className="pr2-bt" disabled={ocupado} title={`Imprime o resumo da produção de ${nome.toLowerCase()}`} onClick={() => imprimir(tipo, 'resumo')}>🖨 Resumo</button>
                <button type="button" className="pr2-bt" disabled={ocupado} title={`Imprime a entrega de ${nome.toLowerCase()} por destino`} onClick={() => imprimir(tipo, 'entrega')}>🖨 Entrega por destino</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="pr2-abas" role="tablist">
        <button role="tab" aria-selected={aba === 'salgados'} className={aba === 'salgados' ? 'on' : ''} onClick={() => abrirAba('salgados')}>🥐 Produção salgados</button>
        <button role="tab" aria-selected={aba === 'especiais'} className={aba === 'especiais' ? 'on' : ''} onClick={() => abrirAba('especiais')}>⭐ Produção especial</button>
      </div>
      <div className="pr-corpo">
        <Painel tipo="salgados" data={data} recarga={recarga.salgados} ativo={aba === 'salgados'} onAviso={onAviso} base={base} leitura={fabrica} />
        <Painel tipo="especiais" data={data} recarga={recarga.especiais} ativo={aba === 'especiais'} onAviso={onAviso} base={base} leitura={fabrica} />
      </div>

      {confirma && (
        <Modal titulo="Confirmação" onFechar={() => setConfirma(null)}>
          <div className="pr-confirma">
            <p><b>Você pode estar cometendo erro!!!</b></p>
            <p>Veja se a data está correta.</p>
            <p>Se desejar prosseguir, pressione &quot;Sim&quot;</p>
            <div className="rodape-modal">
              <button type="button" className="bt" autoFocus onClick={() => { const f = confirma; setConfirma(null); f(); }}>Sim</button>
              <button type="button" className="bt" onClick={() => setConfirma(null)}>Não</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
