import { AppError, invalid, notFound } from '../errors.js';
import { codigoMunicipio } from './municipios.js';

/** Só os 8 dígitos do CEP, ou null. */
export const soDigitosCep = (c) => { const d = String(c ?? '').replace(/\D/g, ''); return d.length === 8 ? d : null; };

const get = async (url, f) => {
  const r = await f(url, { signal: AbortSignal.timeout(6000), headers: { accept: 'application/json' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

/** Endereço pelo CEP: ViaCEP (traz o código IBGE) e, se cair, BrasilAPI; o IBGE sempre confere com a tabela embutida do sistema. */
export async function consultaCep(cep, f = fetch) {
  const d = soDigitosCep(cep);
  if (!d) throw invalid('Informe o CEP com 8 dígitos.');
  let achou = null; let falhou = false;
  try {
    const v = await get(`https://viacep.com.br/ws/${d}/json/`, f);
    if (v && !v.erro) achou = { endereco: v.logradouro ?? '', bairro: v.bairro ?? '', cidade: v.localidade ?? '', uf: v.uf ?? '', ibge: String(v.ibge ?? ''), fonte: 'ViaCEP' };
  } catch { falhou = true; }
  if (!achou) {
    try {
      const b = await get(`https://brasilapi.com.br/api/cep/v1/${d}`, f);
      if (b) { achou = { endereco: b.street ?? '', bairro: b.neighborhood ?? '', cidade: b.city ?? '', uf: b.state ?? '', ibge: '', fonte: 'BrasilAPI' }; falhou = false; }
    } catch { falhou = true; }
  }
  if (!achou) {
    if (falhou) throw new AppError(502, 'Não consegui consultar o CEP agora (sem acesso à internet no servidor ou serviço fora do ar). Preencha o endereço à mão.');
    throw notFound('CEP');
  }
  const daTabela = codigoMunicipio(achou.uf, achou.cidade);
  return { cep: d.replace(/^(\d{5})(\d{3})$/, '$1-$2'), ...achou, ibge: /^\d{7}$/.test(achou.ibge) ? achou.ibge : daTabela ?? '' };
}
