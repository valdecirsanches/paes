import { useEffect, useMemo, useState } from 'react';
import { Modal } from './ui.jsx';
import { DOCS, imprimirDocumento, gravarMapa, lerMapa } from '../lib/impressora.js';
import { cssAjustes, ELEMENTOS, gravarAjustes, lerAjustes, publicaLayout, sincronizaLayout } from '../lib/ajustes.js';
import { etiquetaItem, etiquetaMercadoria, etiquetaValidade, etiquetasNutricionista } from '../lib/print.js';
import { mensagem } from './toast.jsx';

const HOJE = new Date().toISOString().slice(0, 10);
const AMOSTRAS = {
  'etiqueta-mercadorias': () => etiquetaMercadoria({ unidade_nome: 'Unidade 1005', data: HOJE, hora: '07:00:00', qtde_pendente: 12, produto_descricao_expedicao: 'PÃO FRANCÊS 50G CAIXA COM 12 UNIDADES' }),
  'etiqueta-item': () => etiquetaItem({ nome: 'Unidade 1005', data: HOJE, hora: '07:00:00', qtde_original: 10, qtde_alterada: 2, xqtde_total: 12, produto_descricao_expedicao: 'PÃO FRANCÊS 50G', obs_producao: 'Entregar na portaria', inform: 'Rota 3', etiqueta_adesiva: 1, cancelado: 'False' }),
  'etiqueta-carga': () => etiquetaItem({ nome: 'Unidade 1005', data: HOJE, hora: '07:00:00', qtde_original: 10, qtde_alterada: 2, xqtde_total: 12, produto_descricao_expedicao: 'PÃO FRANCÊS 50G', obs_producao: 'Entregar na portaria', inform: 'Rota 3', etiqueta_adesiva: 1, cancelado: 'False' }),
  'etiqueta-validade': () => etiquetaValidade({ produto_descricao: 'PÃO DE FORMA TRADICIONAL', ingredientes: 'Farinha de trigo, água, açúcar, sal, fermento biológico e melhorador.', data: HOJE, validade: '05/11/2026' }),
  'etiqueta-nutricionista': () => etiquetasNutricionista([{ nome: 'Unidade 1005', nutricionista_nome: 'Maria da Silva' }], false),
};
const PX_MM = 96 / 25.4;

/** Entrada numérica com − / + (passo de 0,1 mm; Shift = 0,5). */
function Passo({ valor, onChange, passo = 0.1, min, vazio, unidade = 'mm', rotulo }) {
  const v = valor === undefined || valor === '' ? '' : valor;
  const aplica = (d, e) => { const base = Number(v || 0); const q = e?.shiftKey ? passo * 5 : passo; let nv = Math.round((base + d * q) * 1000) / 1000; if (min !== undefined) nv = Math.max(min, nv); onChange(nv); };
  return (
    <span className="ee-passo">
      <button type="button" tabIndex={-1} aria-label={`Diminuir ${rotulo ?? ''}`} onClick={(e) => aplica(-1, e)}>−</button>
      <input type="number" step={passo} value={v} placeholder={vazio ?? '0'} aria-label={rotulo}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
      <button type="button" tabIndex={-1} aria-label={`Aumentar ${rotulo ?? ''}`} onClick={(e) => aplica(1, e)}>+</button>
      <small>{unidade}</small>
    </span>
  );
}

/** Editor de layout da etiqueta: mexe milímetro a milímetro e vê o resultado antes de imprimir. */
export default function EditorEtiqueta({ tipo, onFechar }) {
  const def = DOCS[tipo];
  const els = ELEMENTOS[tipo] ?? [];
  const [aj, setAj] = useState(() => lerAjustes());
  const [mapa, setMapa] = useState(() => lerMapa());
  const [sel, setSel] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const atual = aj[tipo] ?? {};
  const altura = Number(mapa[tipo]?.altura) > 0 ? Number(mapa[tipo].altura) : def.mm[1];
  const [largura] = def.mm;

  useEffect(() => { sincronizaLayout({ forcar: true }).then(() => { setAj(lerAjustes()); setMapa(lerMapa()); }); }, []); // começa do layout mais recente do servidor
  const salva = (novo) => { setAj(novo); gravarAjustes(novo); publicaLayout(tipo); };
  const muda = (campo, v) => salva({ ...aj, [tipo]: { ...atual, [campo]: v } });
  const mudaEl = (cls, campo, v) => {
    const e = { ...(atual.el?.[cls] ?? {}), [campo]: v };
    if (v === undefined) delete e[campo];
    salva({ ...aj, [tipo]: { ...atual, el: { ...atual.el, [cls]: e } } });
  };
  const mudaAltura = (v) => {
    const n = { ...mapa, [tipo]: { ...mapa[tipo], altura: v } };
    if (v === undefined) delete n[tipo].altura;
    if (!n[tipo].destino && !n[tipo].altura) delete n[tipo];
    setMapa(n); gravarMapa(n); publicaLayout(tipo); window.dispatchEvent(new Event('impressoras-alteradas'));
  };
  const restaurar = () => { const n = { ...aj }; delete n[tipo]; salva(n); mudaAltura(undefined); mensagem('ok', 'Layout padrão restaurado.'); };

  const amostra = useMemo(() => AMOSTRAS[tipo](), [tipo]);
  const srcDoc = useMemo(() => {
    const realce = sel ? `.${sel}{outline:.25mm dashed #d6336c;outline-offset:.2mm}` : '';
    const css = `${amostra.css.replace(/@page\s*\{[^}]*\}/g, '')}${cssAjustes(tipo, aj)}${realce}`;
    const grade = 'background-image:linear-gradient(#0001 1px,transparent 1px),linear-gradient(90deg,#0001 1px,transparent 1px);background-size:5mm 5mm';
    return `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0}body{width:${largura}mm;height:${altura}mm;position:relative;overflow:hidden;background:#fff;font-family:Arial,Helvetica,sans-serif}
      ${css}.__g{position:absolute;inset:0;pointer-events:none;${grade}}</style>${amostra.corpo}<div class="__g"></div>`;
  }, [amostra, aj, tipo, sel, altura, largura]);

  const ESC = 3; // zoom do preview
  const imprimirAmostra = async () => {
    setOcupado(true);
    try { await imprimirDocumento(tipo, amostra, (t, m) => mensagem(t === 'ok' ? 'ok' : 'erro', m)); } finally { setOcupado(false); }
  };

  return (
    <Modal titulo={`Editor de impressão — ${def.rotulo}`} onFechar={onFechar} largo>
      <div className="ee">
        <div className="ee-prev">
          <div className="ee-moldura" style={{ width: largura * PX_MM * ESC, height: altura * PX_MM * ESC }}>
            <iframe title="Pré-visualização da etiqueta" srcDoc={srcDoc} style={{ width: largura * PX_MM, height: altura * PX_MM, transform: `scale(${ESC})` }} />
          </div>
          <p className="ee-leg">Página {largura} × {altura} mm · quadriculado de 5 mm · tracejado rosa = elemento selecionado</p>
          <div className="ee-acoes">
            <button type="button" className="imp-btn principal" onClick={imprimirAmostra} disabled={ocupado}>{ocupado ? 'Enviando…' : '🖨 Imprimir amostra'}</button>
            <button type="button" className="imp-btn" onClick={restaurar}>↺ Restaurar padrão</button>
            <button type="button" className="imp-btn" onClick={onFechar}>Concluir</button>
          </div>
          <p className="ee-dica">Imprima a amostra, meça com uma régua e corrija. As alterações ficam salvas neste computador e valem para todas as impressões desta etiqueta.</p>
        </div>
        <div className="ee-ctl">
          <section className="ee-bloco">
            <h4>Página inteira</h4>
            <label><span title="Positivo = para a direita">Deslocar → (esq/dir)</span><Passo valor={atual.dx} onChange={(v) => muda('dx', v)} rotulo="deslocamento horizontal" /></label>
            <label><span title="Positivo = para baixo">Deslocar ↓ (cima/baixo)</span><Passo valor={atual.dy} onChange={(v) => muda('dy', v)} rotulo="deslocamento vertical" /></label>
            <label><span title="Passo entre etiquetas. Se cada etiqueta sai mais abaixo que a anterior, diminua; se sai apertada ou cortada, aumente.">Altura da página (passo)</span><Passo valor={mapa[tipo]?.altura} vazio={String(def.mm[1])} passo={0.1} min={20} onChange={mudaAltura} rotulo="altura da página" /></label>
          </section>
          {els.length > 0 && (
            <section className="ee-bloco">
              <h4>Cada elemento <small>(soma com o deslocamento da página)</small></h4>
              <div className="ee-cab"><span>Elemento</span><span>← → mm</span><span>↑ ↓ mm</span><span>Fonte pt</span></div>
              {els.map(([cls, rotulo, fs]) => {
                const e = atual.el?.[cls] ?? {};
                return (
                  <div key={cls} className={`ee-el${sel === cls ? ' sel' : ''}`} onFocusCapture={() => setSel(cls)} onMouseEnter={() => setSel(cls)}>
                    <b>{rotulo}</b>
                    <Passo valor={e.x} onChange={(v) => mudaEl(cls, 'x', v)} unidade="" rotulo={`${rotulo}: horizontal`} />
                    <Passo valor={e.y} onChange={(v) => mudaEl(cls, 'y', v)} unidade="" rotulo={`${rotulo}: vertical`} />
                    {fs ? <Passo valor={e.fs} vazio={String(fs)} passo={0.5} min={3} onChange={(v) => mudaEl(cls, 'fs', v)} unidade="" rotulo={`${rotulo}: fonte`} /> : <span className="ee-nd">—</span>}
                  </div>
                );
              })}
            </section>
          )}
        </div>
      </div>
    </Modal>
  );
}
