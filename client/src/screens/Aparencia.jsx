import { useState } from 'react';
import { PADRAO, PREDEFINIDOS, aplicarTema, gravarTema, lerTema, limparTema } from '../lib/tema.js';

/** Ferramentas › Aparência: escolhe a cor dos botões e da barra; mostra na hora e salva (neste navegador). */
export default function Aparencia() {
  const [t, setT] = useState(lerTema);
  const muda = (novo) => { const n = { ...t, ...novo }; setT(n); aplicarTema(n); gravarTema(n); }; // imediato + salvo
  const padrao = () => { setT({ ...PADRAO }); limparTema(); aplicarTema(PADRAO); };
  return (
    <section className="ap">
      <header><h2>🎨 Aparência</h2><small>Escolha as cores: a mudança aparece na hora e fica salva neste navegador.</small></header>
      <div className="ap-pre">
        {PREDEFINIDOS.map((p) => (
          <button key={p.nome} type="button" className={`ap-p${p.btn === t.btn && p.barra === t.barra ? ' on' : ''}`} onClick={() => muda({ btn: p.btn, barra: p.barra })} title={p.nome}>
            <span style={{ background: p.barra }} /><span style={{ background: p.btn }} />{p.nome}
          </button>
        ))}
      </div>
      <div className="ap-cores">
        <label>Botões de destaque <input type="color" value={t.btn} onChange={(e) => muda({ btn: e.target.value })} /></label>
        <label>Barra, cabeçalhos e botões comuns <input type="color" value={t.barra} onChange={(e) => muda({ barra: e.target.value })} /></label>
        <button type="button" className="bt" onClick={padrao}>Voltar ao padrão</button>
      </div>
      <fieldset className="ap-demo"><legend>Pré-visualização</legend>
        <button type="button" className="trb2-btn principal">✔ Botão de destaque</button>
        <button type="button" className="bt">Botão comum</button>
        <div className="barra-azul" style={{ marginTop: 8 }}>Barra / cabeçalho</div>
      </fieldset>
    </section>
  );
}
