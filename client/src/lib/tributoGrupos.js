// Formulário do tributo: SÓ o que a emissão da NFe lê (conferido em nfeJson/geraFatura/nfe.js).
// Campos antigos que a NFe não usa (CEST, tipo de tributação, natureza, CFOP, IPI, legislação, bases legais) saíram da tela; continuam no banco e no CSV.
// [título, colunas, [[campo, rótulo, dica]]]
export const GRUPOS = [
  ['ICMS', 6, [['ncm', 'NCM', 'Vale para o item da NFe e para o produto'], ['sit_trib', 'CST ICMS', 'Situação tributária do ICMS (ex.: 00, 20, 40)'], ['aliq_icms', 'Alíq. ICMS %', ''],
    ['red_b_c_icms', 'Red. base (cálc.) %', 'Redução da base do ICMS usada para calcular base e valor do item'], ['red_aliq', 'Red. ICMS NF-e %', 'Percentual de redução de ICMS enviado no XML (CST 20); 100 vai como 99,99'], ['cBenef', 'cBenef', 'Código de benefício fiscal']]],
  ['PIS / COFINS', 2, [['cst_pis', 'CST PIS', ''], ['aliq_pis', 'Alíq. PIS %', ''], ['cst_cofins', 'CST COFINS', ''], ['aliq_cofins', 'Alíq. COFINS %', '']]],
  ['IBS / CBS', 2, [['cst', 'CST', 'CST do IBS/CBS (3 dígitos)'], ['cClassTrib', 'cClassTrib', 'Classificação tributária (6 dígitos)'], ['pIBS', 'pIBS %', ''], ['pCBS', 'pCBS %', '']]],
];
