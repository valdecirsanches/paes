import { useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Toast } from '../components/toast.jsx';

const FORMATOS = [
  ['planilha', 'Planilha Excel — colunas: NF | valor bruto | valor líquido (todas as abas)'],
  ['planilha2', 'Planilha Excel 2 — cabeçalho na linha 1; NF na 3ª coluna, bruto na 6ª, líquido na 7ª'],
  ['txt', 'Texto (relatório do cliente) — layout 1'],
  ['txt2', 'Texto (relatório do cliente) — layout 2'],
];
const moeda = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const num = (t) => { const n = Number(String(t).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };

/** Outros › Leitura de NFs confirmadas (u_nf_confirmadas_gr): lê o arquivo do cliente, mostra o que foi entendido e grava em tb_nfs_confirmadas. */
export default function NfsConfirmadas({ onFechar }) {
  const [formato, setFormato] = useState('planilha');
  const [arquivo, setArquivo] = useState(null);
  const [linhas, setLinhas] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [man, setMan] = useState({ nf: '', bruto: '', desconto: '', liquido: '', ok: false, existente: false });
  const entrada = useRef(null);
  const erro = (e) => setAviso({ tipo: 'erro', m: e.message });

  const ler = async () => {
    if (!arquivo) return;
    setOcupado(true);
    try { const r = await api.upload(`/nfs/confirmadas/ler?formato=${formato}`, arquivo); setLinhas(r.linhas); setAviso({ tipo: 'ok', m: `${r.linhas.length} nota(s) lida(s). Confira e grave.` }); }
    catch (e) { setLinhas(null); erro(e); } finally { setOcupado(false); }
  };
  const gravaveis = useMemo(() => (linhas ?? []).filter((l) => l.ok), [linhas]);
  const naoAchadas = (linhas ?? []).filter((l) => l.valorNota == null).length;
  const gravar = async () => {
    setOcupado(true);
    try {
      const n = await api.post('/nfs/confirmadas', { linhas: gravaveis.map((l) => ({ nf: l.nf, bruto: l.bruto, liquido: l.liquido, desconto: l.desconto })) });
      setAviso({ tipo: 'ok', m: `${n.gravadas} nota(s) confirmada(s) gravada(s).` }); setLinhas(null); setArquivo(null); if (entrada.current) entrada.current.value = '';
    } catch (e) { erro(e); } finally { setOcupado(false); }
  };

  const consultar = async () => {
    setOcupado(true);
    try { const r = await api.get(`/nfs/confirmadas/consulta?nf=${encodeURIComponent(man.nf.trim())}`); setMan({ nf: r.nf, bruto: moeda(r.bruto), desconto: moeda(r.desconto), liquido: moeda(r.liquido), ok: true, existente: r.existente }); }
    catch (e) { setMan((m) => ({ ...m, ok: false })); erro(e); } finally { setOcupado(false); }
  };
  const recalcula = (campo, v) => setMan((m) => {
    const n = { ...m, [campo]: v };
    const [b, d, l] = [num(n.bruto), num(n.desconto), num(n.liquido)];
    if (campo === 'bruto' || campo === 'desconto') { if (Number.isFinite(b) && Number.isFinite(d)) n.liquido = moeda(b - d); } else if (campo === 'liquido' && Number.isFinite(b) && Number.isFinite(l)) n.desconto = moeda(b - l);
    return n;
  });
  const gravarManual = async () => {
    const [b, d, l] = [num(man.bruto), num(man.desconto), num(man.liquido)];
    if (![b, l].every(Number.isFinite)) { erro(new Error('Informe os valores da nota e o recebido.')); return; }
    setOcupado(true);
    try { await api.post('/nfs/confirmadas', { linhas: [{ nf: man.nf, bruto: b, liquido: l, desconto: Number.isFinite(d) ? d : b - l }] }); setAviso({ tipo: 'ok', m: `NF ${man.nf} incluída com sucesso!` }); setMan({ nf: '', bruto: '', desconto: '', liquido: '', ok: false, existente: false }); }
    catch (e) { erro(e); } finally { setOcupado(false); }
  };

  return (
    <div className="tela nc">
      <Toast aviso={aviso} />
      <header className="rn-topo">
        <div className="rn-tit"><h1>📥 Leitura de NFs confirmadas</h1><span className="rn-sub">Notas pagas pelo cliente</span></div>
        <button type="button" className="rn-x" onClick={() => onFechar?.()}>✕ Fechar</button>
      </header>
      <section className="nc-topo">
        <div className="rn-card nc-arq">
          <div className="rn-t">1. Arquivo do cliente</div>
          <label className="nc-c"><span>Formato</span><select value={formato} onChange={(e) => { setFormato(e.target.value); setLinhas(null); }}>{FORMATOS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></label>
          <label className="nc-c"><span>Arquivo ({formato.startsWith('planilha') ? '.xlsx / .xls' : '.txt'})</span>
            <input ref={entrada} type="file" accept={formato.startsWith('planilha') ? '.xlsx,.xls,.xlsm' : '.txt,.prn,.dat'} onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); setLinhas(null); }} /></label>
          <div className="nc-bts">
            <button type="button" className="rn-bt prim" disabled={!arquivo || ocupado} onClick={ler}>Ler arquivo</button>
            <button type="button" className="rn-bt" disabled={!gravaveis.length || ocupado} onClick={gravar}>✔ Gravar {gravaveis.length || ''} nota(s)</button>
          </div>
          <p className="rn-dica">A leitura só mostra o que foi entendido; nada é gravado até clicar em Gravar. Notas já confirmadas são substituídas.</p>
        </div>
        <div className="rn-card nc-man">
          <div className="rn-t">Incluir nota fiscal manualmente</div>
          <div className="nc-lin">
            <label className="nc-c"><span>Nº da NF</span><input value={man.nf} inputMode="numeric" onChange={(e) => setMan({ nf: e.target.value, bruto: '', desconto: '', liquido: '', ok: false, existente: false })} onKeyDown={(e) => { if (e.key === 'Enter' && man.nf.trim()) consultar(); }} /></label>
            <button type="button" className="rn-bt" disabled={!man.nf.trim() || ocupado} onClick={consultar}>Buscar</button>
          </div>
          {man.ok && (<>
            <div className="nc-lin">
              <label className="nc-c"><span>Valor da NF</span><input value={man.bruto} onChange={(e) => recalcula('bruto', e.target.value)} /></label>
              <label className="nc-c"><span>Desconto</span><input value={man.desconto} onChange={(e) => recalcula('desconto', e.target.value)} /></label>
              <label className="nc-c"><span>Valor recebido</span><input value={man.liquido} onChange={(e) => recalcula('liquido', e.target.value)} /></label>
            </div>
            {man.existente && <p className="rn-dica aviso">Esta NF já estava confirmada; será substituída.</p>}
            <button type="button" className="rn-bt prim" disabled={ocupado} onClick={gravarManual}>✔ Incluir NF {man.nf}</button>
          </>)}
          <p className="rn-dica">Sugestão: desconto de 12% sobre o valor da nota.</p>
        </div>
      </section>
      <div className="rn-grade nc-grade">
        <table>
          <thead><tr><th>NF</th><th className="n">Bruto</th><th className="n">Desconto</th><th className="n">Líquido</th><th className="n">Valor da nota</th><th>Situação</th></tr></thead>
          <tbody>
            {(linhas ?? []).map((l, i) => (
              <tr key={`${l.nf}-${i}`} className={!l.ok ? 'erro' : l.valorNota == null ? 'aten' : ''}>
                <td>{l.nf}</td><td className="n">{moeda(l.bruto)}</td><td className="n">{moeda(l.desconto)}</td><td className="n">{moeda(l.liquido)}</td><td className="n">{moeda(l.valorNota)}</td>
                <td>{[l.existente ? 'já confirmada (será substituída)' : 'nova', ...l.avisos].join(' · ')}</td>
              </tr>
            ))}
            {!linhas && <tr className="rn-vazio"><td colSpan={6}>Escolha o arquivo e clique em “Ler arquivo”.</td></tr>}
          </tbody>
        </table>
        {linhas && naoAchadas > 0 && <p className="nc-aviso">⚠ {naoAchadas} nota(s) não localizada(s) ou não emitida(s): anote o número para inclusão manual.</p>}
      </div>
    </div>
  );
}
