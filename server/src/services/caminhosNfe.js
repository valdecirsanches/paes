// Onde o app grava XML/DANFE e o que vai para tb_nfe.nfe_xml_file / nfe_pdf_file.
// O sistema antigo (Delphi, outras máquinas) lê esses campos como caminho de rede. O app roda em Linux e grava em
// NFE_XML_DIR; NFE_XML_DB_PREFIXO diz como essa mesma pasta é vista pelas outras máquinas (ex.: \\192.168.15.8\nfe ou Z:\nfe).
// No banco vai PREFIXO + caminho relativo (com \ se o prefixo usa \); ao ler, o prefixo volta a ser a pasta local.
import path from 'node:path';

export const baseGravacao = () => path.resolve(process.env.NFE_XML_DIR || path.resolve(process.cwd(), 'xmls'));
export const prefixoBanco = () => String(process.env.NFE_XML_DB_PREFIXO || '').trim().replace(/[\\/]+$/, '');

const barras = (s) => String(s).replaceAll('\\', '/');

/** Caminho local (Linux) → valor gravado no banco. */
export function paraBanco(local) {
  const l = barras(local); const pre = prefixoBanco();
  if (!pre) return l;
  const base = barras(baseGravacao()).replace(/\/+$/, '');
  if (!l.toLowerCase().startsWith(`${base.toLowerCase()}/`)) return l;
  const rel = l.slice(base.length + 1);
  return pre.includes('\\') ? `${pre}\\${rel.replaceAll('/', '\\')}` : `${pre}/${rel}`;
}
/** Valor do banco → caminho local legível pelo servidor (se começa com o prefixo de rede, troca pela pasta local). */
export function paraLocal(valor) {
  const v = String(valor ?? '').trim(); if (!v) return '';
  const pre = barras(prefixoBanco()).replace(/\/+$/, '');
  if (pre && barras(v).toLowerCase().startsWith(`${pre.toLowerCase()}/`)) return path.join(baseGravacao(), ...barras(v).slice(pre.length + 1).split('/'));
  return v;
}
