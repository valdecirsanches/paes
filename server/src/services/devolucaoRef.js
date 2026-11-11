import { pool } from '../db.js';

// Segurança da NF-e de devolução: a nota precisa apontar para a NF-e ORIGINAL certa. Este serviço confere cada chave referenciada
// (dígito verificador, se existe na base, se é do mesmo destinatário, se não está cancelada, se já foi devolvida, quantidades).
const dig = (v) => String(v ?? '').replace(/\D/g, '');
const num = (v) => Number(v ?? 0) || 0;

/** Chave de acesso: 44 dígitos e dígito verificador (módulo 11, pesos 2..9) correto. */
export function chaveValida(chave) {
  const c = dig(chave);
  if (c.length !== 44) return false;
  let soma = 0; let peso = 2;
  for (let i = 42; i >= 0; i -= 1) { soma += Number(c[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = soma % 11;
  const dv = r === 0 || r === 1 ? 0 : 11 - r;
  return dv === Number(c[43]);
}

const dataBr = (d) => (d instanceof Date ? d.toLocaleDateString('pt-BR') : String(d ?? '').slice(0, 10).split('-').reverse().join('/'));
const resumo = (o) => ({ id: o.id, numero: o.nfe_numero, serie: o.nfe_serie, emissao: dataBr(o.data_emissao), cliente: o.cliente_razao_social, cnpj: dig(o.cliente_cnpj), valor: num(o.nf_valor_total), status: o.status_e });

/** Analisa as chaves referenciadas por uma nota de devolução. `itens` = itens da nota de devolução. Devolve { chave, valida, encontrada, original, erros[], avisos[] } por chave. */
export async function analisaReferencias(nfe, referencias, itens = [], db = pool) {
  const chaves = [...new Set((referencias ?? []).map((r) => dig(r.refNFe ?? r.refNFE)).filter(Boolean))];
  const out = [];
  for (const chave of chaves) {
    const a = { chave, valida: chaveValida(chave), encontrada: false, original: null, erros: [], avisos: [] };
    if (!a.valida) { a.erros.push(chave.length !== 44 ? 'A chave deve ter 44 dígitos.' : 'Chave de acesso inválida (dígito verificador não confere) — confira a digitação.'); out.push(a); continue; }
    const [[o]] = await db.query('select id, nfe_numero, nfe_serie, data_emissao, cliente_razao_social, cliente_cnpj, nf_valor_total, status_e from tb_nfe where nfe_chave = ? limit 1', [chave]);
    if (!o) { a.avisos.push('Esta NF-e não foi emitida por este sistema (ou não está na base): não dá para conferir cliente, valores e itens. Confirme a chave com a nota original.'); out.push(a); continue; }
    a.encontrada = true; a.original = resumo(o);
    if (dig(o.cliente_cnpj) && dig(nfe?.cliente_cnpj) && dig(o.cliente_cnpj) !== dig(nfe.cliente_cnpj)) a.erros.push(`O destinatário da nota original (${dig(o.cliente_cnpj)}) é diferente do desta devolução (${dig(nfe.cliente_cnpj)}).`);
    if (o.status_e === 'CANCELADA') a.erros.push('A nota original está CANCELADA: não se devolve nota cancelada.');
    else if (!['AUTORIZADA', 'DEVOLVIDO'].includes(o.status_e)) a.erros.push(`A nota original não está autorizada (situação: ${o.status_e}).`);
    if (nfe?.id) {
      const [outras] = await db.query('select n.id, n.nfe_numero, n.status_e from tb_nfe_referencia r join tb_nfe n on n.id = r.id_nfe where r.refNFe = ? and n.id <> ? and n.status_e in (?, ?) ', [chave, nfe.id, 'AUTORIZADA', 'PENDENTE']);
      for (const x of outras) a.avisos.push(`Já existe outra devolução referenciando esta nota (${x.status_e === 'PENDENTE' ? 'pendente' : 'autorizada'}, nº ${x.nfe_numero || `interno ${x.id}`}): confira para não devolver duas vezes.`);
    }
    const [orig] = await db.query('select produto_codigo, qtde from tb_nfe_itens where id_nfe = ?', [o.id]);
    const porProd = new Map();
    for (const i of orig) porProd.set(String(i.produto_codigo), (porProd.get(String(i.produto_codigo)) ?? 0) + num(i.qtde));
    const dev = new Map();
    for (const i of itens) dev.set(String(i.produto_codigo), (dev.get(String(i.produto_codigo)) ?? 0) + num(i.qtde));
    for (const [cod, q] of dev) {
      if (!porProd.has(cod)) a.avisos.push(`Produto ${cod} não consta na nota original.`);
      else if (q > porProd.get(cod) + 0.0005) a.avisos.push(`Produto ${cod}: devolvendo ${q} e a original teve ${porProd.get(cod)}.`);
    }
    out.push(a);
  }
  return out;
}

/** Notas do mesmo destinatário que podem ser a original (autorizadas/devolvidas, mais recentes primeiro). */
export async function candidatasOriginal(nfe, db = pool, limite = 15) {
  const cnpj = dig(nfe?.cliente_cnpj);
  if (!cnpj) return [];
  const [rows] = await db.query(
    `select id, nfe_numero, nfe_serie, data_emissao, cliente_razao_social, cliente_cnpj, nf_valor_total, status_e, nfe_chave from tb_nfe
      where replace(replace(replace(cliente_cnpj, '.', ''), '/', ''), '-', '') = ? and status_e in ('AUTORIZADA', 'DEVOLVIDO') and nfe_chave is not null and nfe_chave <> '' and id <> ?
      order by data_emissao desc, id desc limit ${Number(limite) || 15}`, [cnpj, nfe?.id ?? 0]);
  return rows.map((o) => ({ ...resumo(o), chave: o.nfe_chave }));
}

/** Erros que BLOQUEIAM a autorização da devolução (os avisos só informam). */
export const errosDaAnalise = (analises) => analises.flatMap((a) => a.erros.map((e) => `NFe referenciada …${a.chave.slice(-9)}: ${e}`));
