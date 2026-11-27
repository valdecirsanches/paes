import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Txt } from './cad.jsx';

const soDig = (v) => String(v ?? '').replace(/\D/g, '');
const mascara = (v) => { const d = soDig(v).slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };

/** CEP com lupa (e Enter): preenche endereço, bairro, cidade e UF. campos = { endereco, bairro, cidade, uf } (nomes dos campos do cadastro). */
export function CepCampo({ ed, k = 'cep', campos, avisa }) {
  const [busca, setBusca] = useState(false);
  const off = !ed.atual && !ed.novo;
  const buscar = async () => {
    const d = soDig(ed.v(k));
    if (d.length !== 8) { avisa?.('erro', 'Digite o CEP com 8 dígitos para pesquisar.'); return; }
    setBusca(true);
    try {
      const r = await api.get(`/cep/${d}`);
      ed.set(k, r.cep);
      if (r.endereco) ed.set(campos.endereco, r.endereco.toUpperCase());
      if (r.bairro) ed.set(campos.bairro, r.bairro.toUpperCase());
      if (r.cidade) ed.set(campos.cidade, r.cidade.toUpperCase());
      if (r.uf) ed.set(campos.uf, r.uf.toUpperCase());
      avisa?.('ok', `CEP encontrado (${r.cidade}/${r.uf}${r.ibge ? ` · IBGE ${r.ibge}` : ''}). Confira o número e o complemento.`);
    } catch (e) { avisa?.('erro', e.message); } finally { setBusca(false); }
  };
  return (
    <span className="ncm-linha">
      <Txt ed={ed} k={k} inputMode="numeric" maxLength={9} onChange={(e) => ed.set(k, mascara(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } }} />
      {!off && <button type="button" className="ncm-lupa" title="Buscar endereço e código IBGE pelo CEP" aria-label="Buscar pelo CEP" disabled={busca} onClick={buscar}>{busca ? '…' : '🔍'}</button>}
    </span>
  );
}

/** Código IBGE do município (somente leitura): vem da cidade/UF digitadas, com a mesma tabela que a geração da NFe usa. */
export function IbgeCampo({ uf, cidade }) {
  const [ibge, setIbge] = useState(undefined);
  useEffect(() => {
    const u = String(uf ?? '').trim(); const c = String(cidade ?? '').trim();
    if (u.length !== 2 || !c) { setIbge(undefined); return undefined; }
    let vivo = true;
    const t = setTimeout(() => { api.get(`/cep/municipio?uf=${encodeURIComponent(u)}&cidade=${encodeURIComponent(c)}`).then((r) => { if (vivo) setIbge(r.ibge ?? null); }).catch(() => { if (vivo) setIbge(undefined); }); }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [uf, cidade]);
  return (
    <>
      <input readOnly tabIndex={-1} value={ibge ?? ''} placeholder={ibge === null ? 'não encontrado' : '—'} style={ibge === null ? { borderColor: '#c62828', background: '#fdecec' } : undefined} />
      {ibge === null && <small style={{ color: '#c62828' }}>Município não encontrado na tabela do IBGE: corrija cidade/UF (sem isso a NFe é recusada).</small>}
    </>
  );
}
