import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import SeletorData from '../components/SeletorData.jsx';
import { Modal } from '../components/ui.jsx';
import { imprimirHtml, producaoEntrega, producaoResumo } from '../lib/print.js';
import { brData, diaExtenso, fmtQtde, hoje } from '../lib/rules.js';
import { Toast } from '../components/toast.jsx';

const nomeTipo = { salgados: 'Salgados', especiais: 'Especiais' };
const chaveMestre = (r) => `${r.producao_turno}-${r.id_referencia}`;
const chaveDestino = (r) => `${r.id_unidade}|${r.data}|${r.hora}|${r.id_referencia}|${r.producao_turno}`;
const semAc = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const filtra = (rows, termo, campos) => { const ws = semAc(termo).split(/\s+/).filter(Boolean); return !ws.length ? rows : rows.filter((r) => { const t = campos.map((c) => semAc(r[c])).join(' '); return ws.every((w) => t.includes(w)); }); };
/** Barra de filtro + ordenação (botões visíveis, além do clique no título da coluna). */
function BarraFiltro({ termo, setTermo, ordem, opcoes, placeholder }) {
  return (
    <div className="pr2-filtro">
      <label className="pr2-fl-busca"><span aria-hidden="true">🔎</span>
        <input type="search" value={termo} placeholder={placeholder} aria-label={placeholder} onChange={(e) => setTermo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setTermo(''); }} />
        {termo && <button type="button" className="pr2-fl-x" title="Limpar filtro" onClick={() => setTermo('')}>✕</button>}
      </label>
      <label className="pr2-fl-ord"><span>Ordenar</span>
        <select value={ordem.campo ?? ''} onChange={(e) => ordem.definir(e.target.value)}>{opcoes.map(([c, r]) => <option key={c} value={c}>{r}</option>)}</select>
      </label>
      <button type="button" className="pr2-bt pr2-fl-dir" title={ordem.dir === 1 ? 'Crescente (clique para inverter)' : 'Decrescente (clique para inverter)'} onClick={ordem.inverte}>{ordem.dir === 1 ? '⏶ Crescente' : '⏷ Decrescente'}</button>
    </div>
  );
}

const cmp = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a ?? '').localeCompare(String(b ?? ''), 'pt-BR'));

/** Ordenação por clique no cabeçalho, como nas grades do sistema antigo (padrão: Hora, depois Destino). */
function useOrdem(padrao) {
  const [ord, setOrd] = useState(padrao); // [[coluna, 1|-1], ...]
  const alternar = (col) => setOrd((o) => (o[0]?.[0] === col ? [[col, -o[0][1]]] : [[col, 1]]));
  const ordenar = (rows) => [...rows].sort((a, b) => { for (const [c, d] of ord) { const r = cmp(a[c], b[c]) * d; if (r) return r; } return 0; });
  const seta = (col) => (ord[0]?.[0] === col ? (ord[0][1] === 1 ? ' ⏶' : ' ⏷') : '');
  const campo = ord[0]?.[0]; const dir = ord[0]?.[1] ?? 1;
  const definir = (col) => setOrd([[col, dir]]);
  const inverte = () => setOrd([[campo, -dir]]);
  return { alternar, ordenar, seta, campo, dir, definir, inverte };
}

/** Uma aba (Produção salgados / Produção especial): lista por horário × referência + detalhamento de destino. */
function Painel({ tipo, data, recarga, ativo, onAviso }) {
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
  const [fM, setFM] = useState(''); const [fD, setFD] = useState('');

  const linhasM = useMemo(() => ordM.ordenar(filtra(mestre, fM, ['descricao', 'codigo_referencia'])), [mestre, fM, ordM.ordenar]); // eslint-disable-line react-hooks/exhaustive-deps
  const linhasD = useMemo(() => ordD.ordenar(filtra(destinos, fD, ['cliente_nome'])), [destinos, fD, ordD.ordenar]); // eslint-disable-line react-hooks/exhaustive-deps
  const atual = mestre.find((r) => chaveMestre(r) === sel) ?? null;

  const carregarMestre = useCallback(async () => {
    const rows = await api.get(`/producao/resumo?tipo=${tipo}&data=${data}`);
    setMestre(rows);
    setSel((s) => (rows.some((r) => chaveMestre(r) === s) ? s : (rows[0] ? chaveMestre(rows[0]) : null)));
  }, [tipo, data]);
  useEffect(() => { carregarMestre().catch((e) => { setMestre([]); onAviso('erro', e.message); }); }, [carregarMestre, recarga]); // eslint-disable-line react-hooks/exhaustive-deps

  const carregarDestinos = useCallback(async () => {
    if (!atual) { setDestinos([]); return; }
    const rows = await api.get(`/producao/destinos?tipo=${tipo}&data=${data}&turno=${atual.producao_turno}&referencia=${atual.id_referencia}`);
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
        <BarraFiltro termo={fM} setTermo={setFM} ordem={ordM} placeholder="Filtrar produto ou referência…"
          opcoes={[['producao_turno', 'Horário'], ['producao_qtde', 'Qtde'], ['descricao', 'Descrição'], ['codigo_referencia', 'Referência']]} />
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
        <BarraFiltro termo={fD} setTermo={setFD} ordem={ordD} placeholder="Filtrar destino…"
          opcoes={[['cliente_nome', 'Destino'], ['hora', 'Hora'], ['qtde_producao', 'Qtde'], ['data', 'Entrega']]} />
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

export default function Producao({ onFechar }) {
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
        const linhas = await api.get(`/producao/${modo === 'resumo' ? 'resumo' : 'entrega'}?tipo=${tipo}&data=${data}`);
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
      <section className="pr2-linha">
        <SeletorData data={data} onChange={setData} />
        {[['salgados', '🥐', 'Salgados'], ['especiais', '⭐', 'Especiais']].map(([tipo, ico, nome]) => (
          <div key={tipo} className={`pr2-grupo ${tipo}`}>
            <div className="pr2-gt" title={diaExtenso(data)}><span>{ico}</span>{nome}</div>
            <div className="pr2-gb" role="tablist">
              <button type="button" role="tab" aria-selected={aba === tipo} className={`pr2-bt${aba === tipo ? ' on' : ''}`} title={`Mostra a produção de ${nome.toLowerCase()} (recarrega)`} onClick={() => abrirAba(tipo)}>📋 Ver</button>
              <button type="button" className="pr2-bt" disabled={ocupado} title={`Imprime o resumo da produção de ${nome.toLowerCase()}`} onClick={() => imprimir(tipo, 'resumo')}>🖨 Resumo</button>
              <button type="button" className="pr2-bt" disabled={ocupado} title={`Imprime a entrega de ${nome.toLowerCase()} por destino`} onClick={() => imprimir(tipo, 'entrega')}>🖨 Entrega</button>
            </div>
          </div>
        ))}
        <span className="pr2-dia">{diaExtenso(data)}</span>
        <button type="button" className="pr2-bt pr2-x" title="Fechar esta tela" onClick={() => onFechar?.()}>✕ Fechar</button>
      </section>
      <div className="pr-corpo">
        <Painel tipo="salgados" data={data} recarga={recarga.salgados} ativo={aba === 'salgados'} onAviso={onAviso} />
        <Painel tipo="especiais" data={data} recarga={recarga.especiais} ativo={aba === 'especiais'} onAviso={onAviso} />
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
