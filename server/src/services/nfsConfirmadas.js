// Leitura de NFs confirmadas (u_nf_confirmadas_gr do sistema antigo): converte planilhas/txt do cliente em linhas
// { nf, bruto, liquido, desconto } e grava em tb_nfs_confirmadas. As funções de leitura são puras (testáveis).
import * as XLSX from 'xlsx';

export const ID_CLIENTE_CONFIRMADAS = 10; // o sistema antigo gravava sempre id_cliente = 10
export const PERC_DESCONTO_PADRAO = 0.12; // inclusão manual: sugestão de 12% (cxButton5Click)

const arred = (n) => Math.round(n * 100) / 100;

/** Número vindo de célula/texto: número puro vale como está; texto segue o padrão BR (ponto = milhar, vírgula = decimal). O sinal é descartado. */
export function numeroBr(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.abs(v) : null;
  let s = String(v).replace(/R\$|\s/g, '').replace(/-/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replaceAll('.', '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replaceAll('.', ''); // "1.234" sem vírgula: milhar (como o Delphi, que acrescentava ",00")
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
/** Texto dos arquivos .txt: ponto decimal quando não há vírgula. */
const numeroTxt = (v) => { const t = String(v ?? '').trim(); if (!t) return null; return t.includes(',') ? numeroBr(t) : numeroBr(t.replace(/-/g, '').replace(/^(\d+)\.(\d{1,2})$/, '$1,$2')); };

/** Nº da NF na 1ª coluna: "123456-001" (com traço) perde os 4 últimos caracteres. */
export function nfDe(v) {
  if (v == null) return '';
  let s = typeof v === 'number' ? String(Math.trunc(v)) : String(v).trim();
  if (s.includes('-')) s = s.slice(0, -4);
  return s.trim();
}
const ehNf = (s) => /^\d{1,10}$/.test(s);
const linha = (nf, bruto, liquido, desconto) => ({ nf, bruto, liquido, desconto: desconto ?? (bruto != null && liquido != null ? arred(bruto - liquido) : null) });

export function lerPlanilha(buf, formato) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const saida = [];
  for (const nome of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: true, defval: null });
    rows.forEach((r, i) => {
      if (formato === 'planilha2') { // cabeçalho na linha 1; NF = 6 primeiros caracteres da 3ª coluna, bruto na 6ª, líquido na 7ª
        if (i === 0) return;
        const nf = String(r[2] ?? '').trim().slice(0, 6);
        if (ehNf(nf)) saida.push(linha(nf, numeroBr(r[5]), numeroBr(r[6])));
      } else { // NF | bruto | líquido, em todas as abas
        const nf = nfDe(r[0]);
        if (ehNf(nf) && (r[1] != null || r[2] != null)) saida.push(linha(nf, numeroBr(r[1]) ?? 0, numeroBr(r[2]) ?? 0));
      }
    });
  }
  return saida;
}

/** Colunas fixas (1-based como no Delphi): txt → NF 1-7, bruto 37(13), desconto 51(9), líquido 61(13); txt2 → NF 31(6), bruto 80(10), desconto 110(10), líquido 140(10). */
const LAYOUT_TXT = { txt: [[1, 7], [37, 13], [51, 9], [61, 13]], txt2: [[31, 6], [80, 10], [110, 10], [140, 10]] };
export function lerTexto(texto, formato) {
  const L = LAYOUT_TXT[formato];
  const cut = (l, [ini, larg]) => l.slice(ini - 1, ini - 1 + larg).trim();
  const saida = [];
  for (const l of String(texto).split(/\r?\n/)) {
    if (!/^\d/.test(l)) continue;
    const nf = cut(l, L[0]);
    if (!ehNf(nf)) continue;
    saida.push(linha(nf, numeroTxt(cut(l, L[1])), numeroTxt(cut(l, L[3])), numeroTxt(cut(l, L[2]))));
  }
  return saida;
}

export function lerArquivo(buf, formato) {
  if (formato === 'txt' || formato === 'txt2') return lerTexto(buf.toString('latin1'), formato);
  if (formato === 'planilha' || formato === 'planilha2') return lerPlanilha(buf, formato);
  throw Object.assign(new Error('Formato de arquivo desconhecido.'), { status: 400 });
}

async function valoresDasNotas(pool, nfs) {
  const mapa = new Map();
  if (!nfs.length) return mapa;
  try { const [r] = await pool.query('select numero_nf as nf, valor_total_nf as v from tb_notas_fiscais where numero_nf in (?)', [nfs]); r.forEach((x) => mapa.set(String(x.nf), Number(x.v))); } catch { /* tabela legada ausente */ }
  const [r2] = await pool.query('select nfe_numero as nf, nf_valor_total as v from tb_nfe where nfe_numero in (?)', [nfs]);
  r2.forEach((x) => { if (!mapa.has(String(x.nf))) mapa.set(String(x.nf), Number(x.v)); });
  return mapa;
}

/** Completa as linhas lidas: bruto zerado vem do valor da nota; sinaliza nota não localizada e notas que já estavam confirmadas. */
export async function enriquece(pool, linhas) {
  const nfs = [...new Set(linhas.map((l) => l.nf))];
  const notas = await valoresDasNotas(pool, nfs);
  let ja = new Set();
  if (nfs.length) { const [r] = await pool.query('select nf from tb_nfs_confirmadas where nf in (?)', [nfs]); ja = new Set(r.map((x) => String(x.nf))); }
  return linhas.map((l) => {
    const valorNota = notas.get(l.nf);
    let { bruto, liquido, desconto } = l;
    const avisos = [];
    if (liquido == null || bruto == null) avisos.push('valor ilegível');
    if (!bruto && valorNota != null) { bruto = valorNota; desconto = null; avisos.push('bruto = valor da nota'); }
    if (valorNota == null) avisos.push('nota não localizada');
    if (bruto != null && liquido != null && (desconto == null)) desconto = arred(bruto - liquido);
    return { nf: l.nf, bruto, liquido, desconto, valorNota: valorNota ?? null, existente: ja.has(l.nf), avisos, ok: bruto != null && liquido != null };
  });
}

/** Grava (substitui por NF) numa transação. */
export async function grava(pool, linhas) {
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    for (const l of linhas) {
      await c.query('delete from tb_nfs_confirmadas where nf = ?', [l.nf]);
      await c.query('insert into tb_nfs_confirmadas set id_cliente = ?, nf = ?, valor_bruto = ?, valor_liquido = ?, valor_desconto = ?', [ID_CLIENTE_CONFIRMADAS, l.nf, l.bruto, l.liquido, l.desconto]);
    }
    await c.commit();
  } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
  return linhas.length;
}
