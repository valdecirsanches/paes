import { useState } from 'react';
import { api } from '../api.js';
import { FONTES, PREDEFINIDOS, lerTema, restaurarTema, salvarTema } from '../lib/tema.js';

/** Controles de aparência (temas prontos, modo claro/escuro, tamanho da letra e cores livres). Usado na tela Aparência e no seletor rápido da barra. */
export default function TemaControles({ compacto = false }) {
  const [t, setT] = useState(lerTema);
  const muda = (novo) => { const n = { ...t, ...novo }; setT(n); salvarTema(api, n); };
  const i = FONTES.indexOf(t.fonte);
  const padrao = () => { restaurarTema(api); setT(lerTema()); };
  return (
    <div className={`tc${compacto ? ' compacto' : ''}`}>
      <div className="tc-linha">
        <span className="tc-rot">Modo</span>
        <div className="tc-seg" role="group" aria-label="Modo">
          <button type="button" className={t.modo === 'claro' ? 'on' : ''} aria-pressed={t.modo === 'claro'} onClick={() => muda({ modo: 'claro' })}>☀ Claro</button>
          <button type="button" className={t.modo === 'escuro' ? 'on' : ''} aria-pressed={t.modo === 'escuro'} onClick={() => muda({ modo: 'escuro' })}>🌙 Escuro</button>
        </div>
      </div>
      <div className="tc-linha">
        <span className="tc-rot">Letra</span>
        <div className="tc-seg" role="group" aria-label="Tamanho da letra">
          <button type="button" disabled={i <= 0} onClick={() => muda({ fonte: FONTES[i - 1] })} title="Diminuir">A−</button>
          <span className="tc-val">{t.fonte}%</span>
          <button type="button" disabled={i >= FONTES.length - 1} onClick={() => muda({ fonte: FONTES[i + 1] })} title="Aumentar">A+</button>
        </div>
      </div>
      <div className="ap-pre">
        {PREDEFINIDOS.map((p) => (
          <button key={p.nome} type="button" className={`ap-p${p.btn === t.btn && p.barra === t.barra ? ' on' : ''}`} onClick={() => muda({ btn: p.btn, barra: p.barra })} title={p.nome}>
            <span style={{ background: p.barra }} /><span style={{ background: p.btn }} />{compacto ? '' : p.nome}
          </button>
        ))}
      </div>
      {!compacto && (
        <div className="ap-cores">
          <label>Botões de destaque <input type="color" value={t.btn} onChange={(e) => muda({ btn: e.target.value })} /></label>
          <label>Barra, cabeçalhos e botões comuns <input type="color" value={t.barra} onChange={(e) => muda({ barra: e.target.value })} /></label>
        </div>
      )}
      <button type="button" className="bt" onClick={padrao}>Voltar ao padrão</button>
    </div>
  );
}
