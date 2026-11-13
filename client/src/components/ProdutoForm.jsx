import { Campo, Chave, Secao, Txt } from './cad.jsx';
import NcmCampo from './NcmCampo.jsx';

// Campos do produto em seções. layout 'tela' = cadastro de produtos; 'cli' = aba Produtos do cliente (versão enxuta).
const OPCOES = [['extra_cortado', 'Cortado'], ['extra_margarina', 'C/ margarina'], ['extra_coco', 'Cobertura côco'], ['extra_acucar', 'Cobertura açúcar'],
  ['extra_plastico', 'Embalado individual (plástico)'], ['extra_papel', 'Embalado individual (papel)'], ['extra_pacote', 'Embalado em pacote plástico']];

export default function ProdutoForm({ ed, layout = 'tela', clientes = [], referencias = [], tributos = [], aoMudarCliente, children }) {
  const off = !ed.atual && !ed.novo;
  const tela = layout === 'tela';
  const sel = (k, lista, rot, extra) => (
    <select disabled={off} value={ed.v(k) ?? ''} onChange={(e) => { const n = e.target.value === '' ? null : Number(e.target.value); ed.set(k, n); extra?.(n); }}>
      <option value="" />{lista.map((o) => <option key={o.id} value={o.id}>{rot(o)}</option>)}
      {ed.v(k) != null && ed.v(k) !== '' && !lista.some((o) => o.id === Number(ed.v(k))) && <option value={ed.v(k)}>{`${ed.v(k)} - (fora da lista)`}</option>}
    </select>
  );
  const num = (k) => <Txt ed={ed} k={k} inputMode="decimal" />;
  return (
    <div className={`cd-secoes${tela ? ' pf2' : ''}`}>
      {tela ? (
        <Secao titulo="Produto" icone="🏷️" className="pf-full">
          <Campo rotulo="ID" span={1}><input readOnly tabIndex={-1} value={ed.novo ? '' : ed.atual?.id ?? ''} /></Campo>
          <Campo rotulo="Código" span={2}><Txt ed={ed} k="codigo" /></Campo>
          <Campo rotulo="Cliente" span={5}>{sel('id_cliente', clientes, (x) => x.razao_social, aoMudarCliente)}</Campo>
          <Campo rotulo="Referência a ser produzido" span={4}>{sel('id_referencia', referencias, (r) => `${r.id} - ${r.descricao}`)}</Campo>
          <Campo rotulo="Descrição impressa na nota fiscal e na comanda" span={6}><Txt ed={ed} k="descricao" /></Campo>
          <Campo rotulo="Descrição para a expedição" span={6}><Txt ed={ed} k="descricao_expedicao" /></Campo>
        </Secao>
      ) : (
        <>
          <Secao titulo="Identificação" icone="🏷️">
            <Campo rotulo="Código" span={4}><Txt ed={ed} k="codigo" /></Campo>
            <Campo rotulo="Referência (produção)" span={8}>{sel('id_referencia', referencias, (r) => `${r.id} - ${r.descricao}`)}</Campo>
            <Campo rotulo="Cliente" span={12}>{sel('id_cliente', clientes, (x) => x.razao_social, aoMudarCliente)}</Campo>
          </Secao>
          <Secao titulo="Descrições" icone="📝">
            <Campo rotulo="Descrição impressa na nota fiscal e na comanda" span={12}><Txt ed={ed} k="descricao" /></Campo>
            <Campo rotulo="Descrição para a expedição" span={12}><Txt ed={ed} k="descricao_expedicao" /></Campo>
          </Secao>
        </>
      )}
      <Secao titulo="Preço e medidas" icone="⚖️">
        <Campo rotulo="Un." span={2}><Txt ed={ed} k="un" /></Campo>
        <Campo rotulo="Preço unit." span={tela ? 2 : 3}>{num('preco')}</Campo>
        <Campo rotulo="Cada" span={2}>{num('divisor_basico')}</Campo>
        <Campo rotulo="Peso líq." span={2}>{num('peso')}</Campo>
        <Campo rotulo="Peso bruto" span={tela ? 2 : 3}>{num('peso_bruto')}</Campo>
        {tela && <Campo rotulo="Qtde emb." span={2}>{num('qtde_embalagem')}</Campo>}
      </Secao>
      <Secao titulo="Fiscal" icone="📑">
        <Campo rotulo="NCM" span={tela ? 5 : 6}><NcmCampo valor={ed.v('ncm')} aoMudar={(x) => ed.set('ncm', x)} desabilitado={off} /></Campo>
        <Campo rotulo="Class. fiscal" span={tela ? 3 : 6}><Txt ed={ed} k="classif_fiscal" /></Campo>
        <Campo rotulo="IPI %" span={tela ? 1 : 2}>{num('aliq_ipi')}</Campo>
        <Campo rotulo="ICMS %" span={tela ? 1 : 2}>{num('aliq_icms')}</Campo>
        <Campo rotulo="S. trib." span={tela ? 2 : 2}><Txt ed={ed} k="sit_tributaria" /></Campo>
        {tela && <Campo rotulo="Tributação" span={12}>{sel('id_tributos', tributos, (t) => `${t.id} - ${t.descricao}`)}</Campo>}
      </Secao>
      <Secao titulo="Opções do produto" icone="🥖">
        {OPCOES.map(([k, r]) => <Chave key={k} ed={ed} k={k} rotulo={r} span={tela ? 6 : 6} />)}
        <Chave ed={ed} k="converter" rotulo={tela ? 'Converter em outro produto' : 'Converter para outro produto'} span={6} />
        <Chave ed={ed} k="produto_producao" rotulo={tela ? 'Linha de produção' : 'Produzido'} span={6} />
        <Chave ed={ed} k="ativo" rotulo="Produto ativo (aparece nas pesquisas)" span={12} />
      </Secao>
      {tela && (
        <Secao titulo="Ingredientes e validade" icone="📋" className="pf-full">
          <Campo rotulo="Ingredientes" span={9}><textarea rows={2} disabled={off} value={ed.v('ingredientes') ?? ''} onChange={(e) => ed.set('ingredientes', e.target.value)} /></Campo>
          <Campo rotulo="Validade" span={3}><Txt ed={ed} k="validade" /></Campo>
        </Secao>
      )}
      {children}
    </div>
  );
}
