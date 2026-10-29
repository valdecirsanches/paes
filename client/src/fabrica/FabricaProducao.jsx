import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import Calendario from '../components/Calendario.jsx';
import { brData, hoje } from '../lib/rules.js';

// Tela "Produção" do sistema da fábrica (u_producao), refeita igual à original: mesma disposição, cores e comportamento.
// Cores do OnCustomDrawCell: horário 1 = $0080FFFF (amarelo) + azul; 2 = $0080FF80 (verde) + azul; 3 = azul + branco; selecionada = vermelho + amarelo negrito.
const COR = { 1: { bg: '#ffff80', fg: '#0000ff' }, 2: { bg: '#80ff80', fg: '#0000ff' }, 3: { bg: '#0000ff', fg: '#ffffff' } };
const SEL = { bg: '#ff0000', fg: '#ffff00' };
const REFRESH_MS = 120000; // Timer1 do original: recarrega a aba ativa a cada 2 minutos
const fonteInicial = () => { try { const n = Number(localStorage.getItem('fab_producao_fonte')); return n >= 8 && n <= 60 ? n : 16; } catch { return 16; } };
const cmp = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a ?? '').localeCompare(String(b ?? ''), 'pt-BR'));
const num = (n) => Number(n ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/** Aba (Salgados / Especiais): lista mestre (horário × referência) + "Detalhamento de destino" à direita. */
function Aba({ tipo, data, recarga, ativa, fonte, onCarga }) {
  const [mestre, setMestre] = useState([]);
  const [sel, setSel] = useState(null);      // chave "turno-referencia"
  const [col, setCol] = useState(0);         // coluna da célula com foco (fica com a cor do horário, como no original)
  const [destinos, setDestinos] = useState([]);
  const [ordD, setOrdD] = useState([['hora', 1], ['cliente_nome', 1]]);
  const corpo = useRef(null);
  const chave = (r) => `${r.producao_turno}-${r.id_referencia}`;
  const atual = mestre.find((r) => chave(r) === sel) ?? null;

  const carrega = useCallback(async () => {
    onCarga(true);
    try {
      const rows = await api.get(`/producao/resumo?tipo=${tipo}&data=${data}`);
      setMestre(rows);
      setSel((s) => (rows.some((r) => chave(r) === s) ? s : rows[0] ? chave(rows[0]) : null)); // Locate('id_referencia') do original
    } catch { setMestre([]); } finally { onCarga(false); }
  }, [tipo, data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carrega(); }, [carrega, recarga]);
  useEffect(() => { // detalhe mestre-detalhe
    if (!atual) { setDestinos([]); return; }
    let vivo = true;
    api.get(`/producao/destinos?tipo=${tipo}&data=${data}&turno=${atual.producao_turno}&referencia=${atual.id_referencia}`).then((r) => vivo && setDestinos(r)).catch(() => vivo && setDestinos([]));
    return () => { vivo = false; };
  }, [tipo, data, atual?.producao_turno, atual?.id_referencia, atual?.producao_qtde]); // eslint-disable-line react-hooks/exhaustive-deps

  const linhasM = useMemo(() => [...mestre].sort((a, b) => cmp(a.producao_turno, b.producao_turno) || cmp(a.id_referencia, b.id_referencia)), [mestre]);
  const linhasD = useMemo(() => [...destinos].sort((a, b) => { for (const [c, d] of ordD) { const r = cmp(a[c], b[c]) * d; if (r) return r; } return 0; }), [destinos, ordD]);
  const alterna = (c) => setOrdD((o) => (o[0]?.[0] === c ? [[c, -o[0][1]]] : [[c, 1]]));
  const seta = (c) => (ordD[0]?.[0] === c ? (ordD[0][1] === 1 ? '▲' : '▼') : '');
  const tecla = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = linhasM.findIndex((r) => chave(r) === sel);
    const n = linhasM[Math.min(linhasM.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (n) setSel(chave(n));
  };
  useEffect(() => { if (ativa) corpo.current?.focus({ preventScroll: true }); }, [ativa, sel]);
  const total = destinos.reduce((s, r) => s + Number(r.qtde_producao || 0), 0);
  const esp = tipo === 'especiais';

  return (
    <div className="fbp-aba" hidden={!ativa}>
      <div className="fbp-grade" style={{ fontSize: `${fonte * 4 / 3}px` }} tabIndex={0} ref={corpo} onKeyDown={tecla}>
        <table>
          <thead><tr><th className="ind" /><th style={{ width: '11%' }}>Horário</th><th style={{ width: '14%' }}>Qtde</th><th>Descrição do produto</th></tr></thead>
          <tbody>
            {linhasM.map((r) => {
              const k = chave(r); const ehSel = k === sel; const base = COR[r.producao_turno] ?? COR[1];
              return (
                <tr key={k} onClick={() => setSel(k)}>
                  <td className={`ind${ehSel ? ' on' : ''}`}>{ehSel ? '▸' : ''}</td>
                  {[r.producao_turno, num(r.producao_qtde), esp ? r.referencia_descricao : r.descricao].map((v, i) => {
                    const s = ehSel && i !== col ? SEL : base;
                    return <td key={i} className={i === 1 ? 'n' : ''} onClick={() => setCol(i)} style={{ background: s.bg, color: s.fg, fontWeight: 'bold' }}>{v}</td>;
                  })}
                </tr>);
            })}
            {!linhasM.length && <tr><td className="ind" /><td colSpan={3} className="fbp-vazio">&lt;Não há informações&gt;</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="fbp-dest">
        <div className="fbp-dest-t">Detalhamento de destino</div>
        <div className="fbp-dest-g">
          <table>
            <thead><tr>
              <th onClick={() => alterna('cliente_nome')}>Destino <i>{seta('cliente_nome')}</i></th>
              <th onClick={() => alterna('hora')}>Hora <i>{seta('hora')}</i></th>
              <th onClick={() => alterna('qtde_producao')}>Qtde <i>{seta('qtde_producao')}</i></th>
              <th onClick={() => alterna('data')}>Entrega <i>{seta('data')}</i></th>
            </tr></thead>
            <tbody>
              {linhasD.map((r, i) => (
                <tr key={`${r.id_unidade}|${r.data}|${r.hora}|${i}`}>
                  <td>{r.cliente_nome}</td><td>{String(r.hora ?? '').slice(0, 8)}</td><td className="n">{num(r.qtde_producao)}</td><td>{brData(r.data)}</td>
                </tr>))}
              {!linhasD.length && <tr><td colSpan={4} className="fbp-vazio">&lt;Não há informações&gt;</td></tr>}
            </tbody>
            <tfoot><tr><td /><td /><td className="n">{linhasD.length ? num(total) : ''}</td><td /></tr></tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function FabricaProducao() {
  const [data, setData] = useState(hoje());
  const [aba, setAba] = useState('salgados');
  const [recarga, setRecarga] = useState({ salgados: 0, especiais: 0 });
  const [fonte, setFonte] = useState(fonteInicial);
  const [carregando, setCarregando] = useState(0);
  const [cal, setCal] = useState(false);
  const ref = useRef(null);
  const onCarga = useCallback((on) => setCarregando((n) => Math.max(0, n + (on ? 1 : -1))), []);
  const abrirAba = (t) => { setRecarga((r) => ({ ...r, [t]: r[t] + 1 })); setAba(t); }; // btnSalgadosDia / btnEspeciaisDia: recarrega e mostra a aba
  useEffect(() => { try { localStorage.setItem('fab_producao_fonte', String(fonte)); } catch { /* sem armazenamento */ } }, [fonte]);
  useEffect(() => { const t = setInterval(() => setRecarga((r) => ({ ...r, [aba]: r[aba] + 1 })), REFRESH_MS); return () => clearInterval(t); }, [aba]); // Timer1
  useEffect(() => { // dProducaoSelectionChanged: trocar a data recarrega as duas abas
    setRecarga((r) => ({ salgados: r.salgados + 1, especiais: r.especiais + 1 }));
  }, [data]);
  useEffect(() => {
    if (!cal) return undefined;
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setCal(false); };
    document.addEventListener('pointerdown', fora); return () => document.removeEventListener('pointerdown', fora);
  }, [cal]);
  const muda = (n) => setFonte((f) => Math.min(60, Math.max(8, f + n)));

  return (
    <div className="fbp">
      <div className="fbp-topo">
        <div className="fbp-data" ref={ref}>
          <button type="button" className="fbp-data-txt" onClick={() => setCal((c) => !c)}>{brData(data)}</button>
          <button type="button" className="fbp-data-seta" aria-label="Abrir calendário" onClick={() => setCal((c) => !c)}>▾</button>
          {cal && (
            <div className="fbp-cal">
              <Calendario data={data} onChange={(d) => { setData(d); setCal(false); }} />
              <div className="fbp-cal-bt"><button type="button" onClick={() => { setData(hoje()); setCal(false); }}>Hoje</button><button type="button" onClick={() => { setData(hoje()); setCal(false); }}>Agora</button></div>
            </div>)}
        </div>
        <button type="button" className={`fbp-bt${aba === 'especiais' ? ' on' : ''}`} onClick={() => abrirAba('especiais')}><img src="/fabrica/seta.png" alt="" />Especiais</button>
        <button type="button" className={`fbp-bt${aba === 'salgados' ? ' on' : ''}`} onClick={() => abrirAba('salgados')}><img src="/fabrica/seta.png" alt="" />Salgados</button>
        <div className="fbp-spin"><input type="number" min={8} max={60} value={fonte} onChange={(e) => setFonte(Math.min(60, Math.max(8, Number(e.target.value) || 16)))} aria-label="Tamanho da fonte" />
          <span><button type="button" tabIndex={-1} onClick={() => muda(1)} aria-label="Aumentar">▴</button><button type="button" tabIndex={-1} onClick={() => muda(-1)} aria-label="Diminuir">▾</button></span></div>
        {carregando > 0 && <div className="fbp-carregando">Carregando ...</div>}
      </div>
      <div className="fbp-corpo">
        <Aba tipo="salgados" data={data} recarga={recarga.salgados} ativa={aba === 'salgados'} fonte={fonte} onCarga={onCarga} />
        <Aba tipo="especiais" data={data} recarga={recarga.especiais} ativa={aba === 'especiais'} fonte={fonte} onCarga={onCarga} />
      </div>
    </div>
  );
}
