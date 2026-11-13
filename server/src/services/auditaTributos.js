import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { paraLocal } from './caminhosNfe.js';

const tag = (s, t) => { const m = new RegExp(`<${t}(?:\\s[^>]*)?>([^<]*)</${t}>`, 'i').exec(s ?? ''); return m ? m[1].trim() : ''; };
const bloco = (s, t) => { const m = new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, 'i').exec(s ?? ''); return m ? m[1] : ''; };
const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const cst2 = (v) => String(v ?? '').replace(/\D/g, '').replace(/^(\d)$/, '0$1').slice(0, 2);
const cst3 = (v) => String(v ?? '').replace(/\D/g, '').padStart(3, '0');
const cls6 = (v) => String(v ?? '').replace(/\D/g, '').padStart(6, '0');
const ncm8 = (v) => String(v ?? '').replace(/\D/g, '');

/** Itens (um por <det>) com os campos fiscais que importam para conferir o Código de tributação. */
export function itensDoXml(xml) {
  const out = [];
  for (const m of String(xml).matchAll(/<det\s[^>]*>([\s\S]*?)<\/det>/gi)) {
    const det = m[1]; const prod = bloco(det, 'prod'); const imp = bloco(det, 'imposto');
    const icms = bloco(imp, 'ICMS'); const ipi = bloco(imp, 'IPI'); const pis = bloco(imp, 'PIS'); const cof = bloco(imp, 'COFINS'); const ibs = bloco(imp, 'IBSCBS');
    out.push({
      codigo: tag(prod, 'cProd'), ncm: ncm8(tag(prod, 'NCM')), cBenef: tag(prod, 'cBenef'),
      cst_icms: cst2(tag(icms, 'CST') || tag(icms, 'CSOSN')), aliq_icms: num(tag(icms, 'pICMS')), red_icms: num(tag(icms, 'pRedBC')),
      cst_ipi: cst2(tag(ipi, 'CST')), cst_pis: cst2(tag(pis, 'CST')), aliq_pis: num(tag(pis, 'pPIS')),
      cst_cofins: cst2(tag(cof, 'CST')), aliq_cofins: num(tag(cof, 'pCOFINS')),
      cst_ibs: ibs ? cst3(tag(ibs, 'CST')) : '', cClassTrib: ibs ? cls6(tag(ibs, 'cClassTrib')) : '', pIBS: num(tag(ibs, 'pIBSUF')), pCBS: num(tag(ibs, 'pCBS')),
    });
  }
  return out;
}

const CHAVES = [ // rótulo, campo do XML, valor esperado a partir de tb_tributos
  ['NCM', 'ncm', (t) => ncm8(t.ncm).slice(0, 8)],
  ['CST ICMS', 'cst_icms', (t) => cst2(t.sit_trib)],
  ['Alíq. ICMS', 'aliq_icms', (t) => num(t.aliq_icms)],
  ['Red. base ICMS', 'red_icms', (t) => Math.min(num(t.red_aliq) > 0 ? num(t.red_aliq) : num(t.red_b_c_icms), 99.99)],
  ['CST IPI', 'cst_ipi', (t) => cst2(t.cst_ipi)],
  ['CST PIS', 'cst_pis', (t) => cst2(t.cst_pis)],
  ['Alíq. PIS', 'aliq_pis', (t) => num(t.aliq_pis)],
  ['CST COFINS', 'cst_cofins', (t) => cst2(t.cst_cofins)],
  ['Alíq. COFINS', 'aliq_cofins', (t) => num(t.aliq_cofins)],
  ['CST IBS/CBS', 'cst_ibs', (t) => cst3(t.cst)],
  ['cClassTrib', 'cClassTrib', (t) => cls6(t.cClassTrib)],
  ['pIBS', 'pIBS', (t) => num(t.pIBS)],
  ['pCBS', 'pCBS', (t) => num(t.pCBS)],
  ['cBenef', 'cBenef', (t) => String(t.cBenef ?? '').trim()],
];
const igual = (a, b) => (typeof a === 'number' ? Math.abs(a - Number(b)) < 0.005 : String(a) === String(b));

/**
 * SOMENTE LEITURA. Lê os XMLs das últimas notas autorizadas, descobre o que foi realmente transmitido para cada código de produto
 * (o valor mais frequente) e compara com o Código de tributação (tb_tributos) ligado ao produto.
 */
export async function auditaTributos(db, { limite = 60, arqApp } = {}) {
  const [notas] = await db.query(
    `select id, nfe_numero, nfe_xml_file, nfe_xml_app from tb_nfe where status_e = 'AUTORIZADA' and (coalesce(nfe_xml_file,'') <> '' or coalesce(nfe_xml_app,'') <> '') order by id desc limit ?`, [Math.min(500, Math.max(1, Number(limite) || 60))]);
  const r = { notas: notas.length, lidas: 0, semArquivo: 0, itens: 0, produtos: [], semTributo: [], ok: 0 };
  const porProduto = new Map();
  for (const n of notas) {
    const f = arqApp(n, 'nfe_xml_file');
    if (!f || !existsSync(paraLocal(f))) { r.semArquivo += 1; continue; }
    let xml; try { xml = (await readFile(paraLocal(f))).toString('utf8'); } catch { r.semArquivo += 1; continue; }
    r.lidas += 1;
    for (const it of itensDoXml(xml)) {
      r.itens += 1;
      const g = porProduto.get(it.codigo) ?? { n: 0, vistos: new Map() };
      g.n += 1;
      const chave = JSON.stringify(it); g.vistos.set(chave, (g.vistos.get(chave) ?? 0) + 1);
      porProduto.set(it.codigo, g);
    }
  }
  const codigos = [...porProduto.keys()].filter(Boolean);
  if (!codigos.length) return r;
  const [prods] = await db.query('select p.codigo, p.id_tributos, t.* from tb_produtos p left join tb_tributos t on t.id = p.id_tributos where p.codigo in (?)', [codigos]);
  const mapa = new Map(prods.map((p) => [String(p.codigo), p]));
  for (const [codigo, g] of [...porProduto].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
    const usado = JSON.parse([...g.vistos].sort((a, b) => b[1] - a[1])[0][0]); // o que mais saiu nos XMLs
    const p = mapa.get(String(codigo));
    if (!p || !p.id_tributos || p.id == null) { r.semTributo.push({ codigo, notas: g.n, motivo: p ? 'produto sem Código de tributação' : 'produto não encontrado no cadastro' }); continue; }
    const dif = [];
    for (const [rot, campo, esperado] of CHAVES) { const e = esperado(p); if (!igual(usado[campo], e)) dif.push({ campo: rot, xml: usado[campo], tributo: e }); }
    if (dif.length) r.produtos.push({ codigo, id_tributo: p.id_tributos, descricao: p.descricao, notas: g.n, variantes: g.vistos.size, diferencas: dif });
    else r.ok += 1;
  }
  return r;
}
