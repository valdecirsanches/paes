// Formulário do tributo, em grupos: [título, [[campo, rótulo, largura(colunas)]]]
export const GRUPOS = [
  ['Classificação', [['ncm', 'NCM'], ['cest', 'CEST'], ['cfop', 'CFOP'], ['tipo_trib', 'Tipo de tributação'], ['natureza', 'Natureza', 2]]],
  ['ICMS / IPI', [['sit_trib', 'Sit. tributária'], ['aliq_icms', 'Alíq. ICMS'], ['red_b_c_icms', 'Red. base ICMS'], ['aliq_ipi', 'Alíq. IPI'], ['cst_ipi', 'CST IPI']]],
  ['PIS / COFINS', [['cst_pis', 'CST PIS'], ['aliq_pis', 'Alíq. PIS'], ['cst_cofins', 'CST COFINS'], ['aliq_cofins', 'Alíq. COFINS']]],
  ['IBS / CBS (reforma tributária)', [['cst', 'CST'], ['cClassTrib', 'cClassTrib'], ['pIBS', 'pIBS'], ['pCBS', 'pCBS'], ['red_aliq', 'Red. da base'], ['cBenef', 'cBenef']]],
  ['Legislação', [['legislacao', 'Legislação', 4], ['base_legal_icms', 'Base legal ICMS', 2], ['base_legal_pis_cofins', 'Base legal PIS/COFINS', 2]]],
];

/** Campos do tributo que a emissão da NFe NÃO lê (conferido no código: nfeJson/geraFatura/nfe.js). Ficam no cadastro, mas fora do caminho do usuário.
 *  IPI: o JSON da NFe não envia IPI. CFOP do tributo: o CFOP do item vem da operação/nota. */
export const NAO_USADOS_NFE = new Set(['cest', 'tipo_trib', 'natureza', 'cfop', 'aliq_ipi', 'cst_ipi', 'legislacao', 'base_legal_icms', 'base_legal_pis_cofins']);
