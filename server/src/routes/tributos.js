import { Router } from 'express';
import { pool, tx } from '../db.js';
import { AppError, invalid, notFound, pick } from '../errors.js';
import { ncmDoTributo, ncmLimpo } from '../services/ncm.js';

// Tela "Códigos de Tributação de produtos" (uTributo): cadastro de tb_tributos e vínculo com tb_produtos.id_tributos.
const router = Router();

const CAMPOS = ['descricao', 'tipo_trib', 'aliq_ipi', 'sit_trib', 'aliq_icms', 'ncm', 'cest', 'cfop', 'red_b_c_icms', 'cst_ipi', 'cst_pis', 'cst_cofins',
  'aliq_pis', 'aliq_cofins', 'cst', 'cClassTrib', 'pIBS', 'pCBS', 'natureza', 'legislacao', 'red_aliq', 'base_legal_icms', 'base_legal_pis_cofins', 'cBenef'];
const NUMERICOS = ['aliq_ipi', 'aliq_icms', 'red_b_c_icms', 'aliq_pis', 'aliq_cofins', 'pIBS', 'pCBS', 'red_aliq'];
const MAX_PRODUTOS = 5000;
const MAX_IDS = 5000;

const idValido = (v, rotulo = 'Registro') => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > 2147483647) throw invalid(`${rotulo} inválido(a).`);
  return n;
};
/** Palavras do filtro (ExtractStrings por espaço): cada uma vira um LIKE %palavra%, sempre parametrizado. */
const palavras = (t) => String(t ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 12).map((w) => `%${w.replace(/[\\%_]/g, '\\$&')}%`);

export function limpa(body, { criando }) {
  const b = pick(body, CAMPOS);
  for (const k of Object.keys(b)) {
    if (b[k] === null || b[k] === undefined) { b[k] = null; continue; }
    b[k] = String(b[k]).trim();
    if (b[k].length > 255) throw invalid(`Texto muito longo (${k}).`);
    if (b[k] === '') b[k] = null;
  }
  if (b.ncm) b.ncm = ncmLimpo(b.ncm) || b.ncm; // grava só dígitos (sem máscara nem ".0")
  for (const k of NUMERICOS) {
    if (b[k] === undefined || b[k] === null) continue;
    const v = b[k].replace(',', '.');
    if (!Number.isFinite(Number(v))) throw invalid(`Valor inválido em "${k}".`);
    b[k] = v;
  }
  if (criando && !b.descricao) throw invalid('Informe a descrição do tributo.');
  if (b.descricao === null) throw invalid('A descrição não pode ficar vazia.');
  return b;
}

// Edit2Change: filtra por descrição (palavras), ordenado por id.
router.get('/', async (req, res) => {
  const w = palavras(req.query.q);
  const [rows] = await pool.query(`select * from tb_tributos where 1 = 1 ${w.map(() => 'and descricao like ?').join(' ')} order by id`, w);
  res.json(rows);
});

// BitBtn1Click: produtos por descrição/código (palavras) e, opcionalmente, só os sem tributo.
router.get('/produtos', async (req, res) => {
  const w = palavras(req.query.q);
  const esconder = req.query.esconder === '1' || req.query.esconder === 'true';
  const [rows] = await pool.query(
    `select id, descricao, id_tributos, codigo from tb_produtos where 1 = 1
       ${w.map(() => 'and (descricao like ? or codigo like ?)').join(' ')} ${esconder ? 'and id_tributos is null' : ''}
      order by descricao limit ${MAX_PRODUTOS + 1}`, w.flatMap((x) => [x, x]));
  const truncado = rows.length > MAX_PRODUTOS;
  res.json({ produtos: truncado ? rows.slice(0, MAX_PRODUTOS) : rows, truncado });
});

// BitBtn2Click: indica o tributo a todos os produtos marcados.
router.post('/atribuir', async (req, res) => {
  const tributo = idValido(req.body?.tributo_id, 'Tributo');
  const ids = req.body?.produtos;
  if (!Array.isArray(ids) || ids.length === 0) throw invalid('Marque ao menos um produto.');
  if (ids.length > MAX_IDS) throw invalid(`Marque no máximo ${MAX_IDS} produtos por vez.`);
  const lista = [...new Set(ids.map((i) => idValido(i, 'Produto')))];
  const n = await tx(async (c) => {
    const [[t]] = await c.query('select id from tb_tributos where id = ?', [tributo]);
    if (!t) throw notFound('Tributo');
    const [r] = await c.query('update tb_produtos set id_tributos = ? where id in (?)', [tributo, lista]);
    return r.affectedRows;
  });
  res.json({ ok: true, produtos: n });
});

router.post('/', async (req, res) => {
  const b = limpa(req.body, { criando: true });
  const [r] = await pool.query('insert into tb_tributos set ?', [b]);
  const [[novo]] = await pool.query('select * from tb_tributos where id = ?', [r.insertId]);
  res.status(201).json(novo);
});

/**
 * A emissão da NFe usa SÓ o NCM do tributo. Onde o tributo está sem NCM válido, traz o NCM dos produtos ligados a ele (o que antes valia como reserva).
 * ?aplicar=1 grava; sem isso só mostra o que faria. Só o administrador. Não mexe em tributo que já tem NCM; conflito (produtos com NCMs diferentes) não é gravado.
 */
async function migraNcm(aplicar) {
  const [tribs] = await pool.query('select id, descricao, ncm from tb_tributos order by id');
  const [prods] = await pool.query("select id_tributos, ncm from tb_produtos where id_tributos is not null and coalesce(ncm,'') <> ''");
  const porTrib = new Map();
  for (const p of prods) { const d = String(p.ncm).split('.')[0].replace(/\D/g, ''); if (d.length !== 8) continue; const m = porTrib.get(p.id_tributos) ?? new Map(); m.set(d, (m.get(d) ?? 0) + 1); porTrib.set(p.id_tributos, m); }
  const r = { tributos: tribs.length, jaTemNcm: 0, aMigrar: [], conflitos: [], semProdutoComNcm: [], gravados: 0 };
  for (const t of tribs) {
    if (ncmDoTributo(t)) { r.jaTemNcm += 1; continue; }
    const m = porTrib.get(t.id);
    if (!m) { r.semProdutoComNcm.push({ id: t.id, descricao: t.descricao }); continue; }
    if (m.size > 1) { r.conflitos.push({ id: t.id, descricao: t.descricao, ncms: Object.fromEntries(m) }); continue; }
    const ncm = [...m.keys()][0];
    r.aMigrar.push({ id: t.id, descricao: t.descricao, ncm, produtos: m.get(ncm) });
    if (aplicar) { await pool.query('update tb_tributos set ncm = ? where id = ?', [ncm, t.id]); r.gravados += 1; }
  }
  return r;
}
const soAdmin = (req) => { if (String(req.user?.usuario ?? '').toUpperCase() !== 'SANCHES') throw new AppError(403, 'Só o administrador faz esta migração.'); };
router.get('/migrar-ncm', async (req, res) => { soAdmin(req); res.json(await migraNcm(false)); });
router.post('/migrar-ncm', async (req, res) => { soAdmin(req); res.json(await migraNcm(true)); });

router.put('/:id', async (req, res) => {
  const id = idValido(req.params.id, 'Tributo');
  const b = limpa(req.body, { criando: false });
  if (!Object.keys(b).length) throw invalid('Nada para gravar.');
  const [r] = await pool.query('update tb_tributos set ? where id = ?', [b, id]);
  if (!r.affectedRows) throw notFound('Tributo');
  const [[t]] = await pool.query('select * from tb_tributos where id = ?', [id]);
  res.json(t);
});

// nbDelete do navegador. O Delphi apagava mesmo em uso; aqui não, para não deixar produtos/itens sem tributo.
router.delete('/:id', async (req, res) => {
  const id = idValido(req.params.id, 'Tributo');
  await tx(async (c) => {
    const [[p]] = await c.query('select count(*) as n from tb_produtos where id_tributos = ?', [id]);
    if (p.n) throw invalid(`Tributo em uso por ${p.n} produto(s). Indique outro tributo a eles antes de excluir.`);
    const [[i]] = await c.query('select count(*) as n from tb_nfe_itens where id_tributo = ?', [id]);
    if (i.n) throw invalid(`Tributo em uso por ${i.n} item(ns) de notas fiscais e não pode ser excluído.`);
    const [r] = await c.query('delete from tb_tributos where id = ?', [id]);
    if (!r.affectedRows) throw notFound('Tributo');
  });
  res.json({ ok: true });
});

export default router;
