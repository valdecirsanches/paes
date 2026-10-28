import { readFileSync } from 'node:fs';

/** Tabela de municípios do IBGE embutida (UF → nome normalizado → código de 7 dígitos). Substitui nf_municipio_ibge, que não existe no banco novo. */
const TABELA = JSON.parse(readFileSync(new URL('../data/municipios-ibge.json', import.meta.url), 'utf8'));

/** Maiúsculas, sem acentos e sem pontuação/espaços: "São Paulo", "SAO PAULO" e "sao-paulo" casam. */
export const normaliza = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// grafias antigas/alternativas comuns nos cadastros
const ALIAS = { PARATI: 'PARATY', SBERNARDODOCAMPO: 'SAOBERNARDODOCAMPO' };

/** Código IBGE (7 dígitos) do município, ou null se não achar. */
export function codigoMunicipio(uf, cidade) {
  const t = TABELA[String(uf ?? '').trim().toUpperCase()];
  if (!t) return null;
  const n = normaliza(cidade);
  return t[n] ?? t[ALIAS[n]] ?? null;
}
