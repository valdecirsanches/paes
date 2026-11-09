import TemaControles from '../components/TemaControles.jsx';

/** Ferramentas › Aparência: tema, modo claro/escuro, tamanho da letra e cores. Muda na hora e fica salvo no seu usuário (vale em qualquer computador). */
export default function Aparencia() {
  return (
    <section className="ap">
      <header><h2>🎨 Aparência</h2><small>A mudança aparece na hora e fica salva no seu usuário, em qualquer computador. Atalho rápido: botão 🎨 na barra do topo.</small></header>
      <TemaControles />
      <fieldset className="ap-demo"><legend>Pré-visualização</legend>
        <button type="button" className="trb2-btn principal">✔ Botão de destaque</button>
        <button type="button" className="bt">Botão comum</button>
        <div className="barra-azul" style={{ marginTop: 8 }}>Barra / cabeçalho</div>
      </fieldset>
    </section>
  );
}
