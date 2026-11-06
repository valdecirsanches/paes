import { Router } from 'express';
import { pool } from '../db.js';
import { invalid, notFound } from '../errors.js';
import { consultaNcm, pesquisaNcm } from '../services/ncm.js';
import { emUso, idValido, limpaCampos } from '../services/campos.js';
import { SQL_ATIVO } from '../services/produtosAtivo.js';

// Cadastro de produtos (u_produtos / produtos do cliente em u_clientes).
const router = Router();
const MAX = 5000;
const EXTRAS = ['cortado', 'margarina', 'coco', 'acucar', 'plastico', 'papel', 'pacote'].map((e) => `extra_${e}`);
const SCHEMA = {
  codigo: 'txt', descricao: 'txt', descricao_expedicao: 'txt', un: 'txt', preco: 'num', divisor_basico: 'num', peso: 'num', peso_bruto: 'num', qtde_embalagem: 'num',
  classif_fiscal: 'txt', aliq_ipi: 'num', aliq_icms: 'num', sit_tributaria: 'txt', ncm: 'txt', ingredientes: 'memo', validade: 'txt', id_cliente: 'int', id_referencia: 'int',
  id_tributos: 'int', produto_producao: 'bool', ativo: 'bool', converter: 'bool', pm: 'txt', ...Object.fromEntries(EXTRAS.map((e) => [e, 'bool'])),
};
const ROT = { descricao: 'Descrição', peso: 'Peso líquido', aliq_ipi: 'IPI %', aliq_icms: 'ICMS %', divisor_basico: 'Cada', id_tributos: 'Tributação' };

const SQL_LISTA = `select p.*, (p.preco / if(p.divisor_basico = 0, 1, p.divisor_basico)) as preco_unitario, r.produto_especial, r.descricao as referencia_descricao
  from tb_produtos p left join tb_referencias r on r.id = p.id_referencia`;

// ?cliente= (cbFiltrar), ?q= (palavras na descrição/código) e ?situacao=ativos|inativos|todos (padrão: todos)
router.get('/', async (req, res) => {
  const onde = [];
  const args = [];
  const sit = String(req.query.situacao ?? 'todos');
  if (!['todos', 'ativos', 'inativos'].includes(sit)) throw invalid('Situação inválida (todos, ativos ou inativos).');
  if (sit === 'ativos') onde.push(SQL_ATIVO);
  if (sit === 'inativos') onde.push(`not (${SQL_ATIVO})`);
  if (req.query.cliente) { onde.push('p.id_cliente = ?'); args.push(idValido(req.query.cliente, 'Cliente')); }
  for (const w of String(req.query.q ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 10)) {
    onde.push('(p.descricao like ? or p.codigo like ?)'); const l = `%${w.replace(/[\\%_]/g, '\\$&')}%`; args.push(l, l);
  }
  const [rows] = await pool.query(`${SQL_LISTA} ${onde.length ? `where ${onde.join(' and ')}` : ''} order by p.descricao limit ${MAX + 1}`, args);
  res.json({ produtos: rows.slice(0, MAX), truncado: rows.length > MAX });
});
// Marcar vários e ativar/inativar de uma vez: { ids: [..], ativo: true|false }
router.post('/ativo', async (req, res) => {
  const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map((x) => idValido(x, 'Produto')))];
  if (!ids.length) throw invalid('Marque ao menos um produto.');
  if (ids.length > MAX) throw invalid(`Marque no máximo ${MAX} produtos por vez.`);
  if (typeof req.body?.ativo !== 'boolean') throw invalid('Informe se é para ativar ou inativar.');
  const [r] = await pool.query('update tb_produtos set ativo = ? where id in (?)', [req.body.ativo ? 'True' : 'False', ids]);
  res.json({ ok: true, alterados: r.affectedRows ?? ids.length });
});
// Produtos ativos sem uso há N meses (a tela só marca; inativar é por /ativo): não aparecem na programação diária desde a data de corte nem em nenhuma programação fixa.
const mesesSemUso = (v) => { const m = Number(v ?? 6); if (!Number.isInteger(m) || m < 1 || m > 120) throw invalid('Informe os meses (1 a 120).'); return m; };
const SEM_USO = `${SQL_ATIVO} and not exists (select 1 from tb_diaria d where d.id_produto = p.id and d.data >= date_sub(curdate(), interval ? month))
  and not exists (select 1 from tb_fixa f where f.id_produto = p.id)`;
router.get('/sem-uso', async (req, res) => {
  const m = mesesSemUso(req.query.meses);
  const [rows] = await pool.query(`select p.id, p.codigo, p.descricao from tb_produtos p where ${SEM_USO} order by p.descricao limit ${MAX + 1}`, [m]);
  res.json({ meses: m, total: rows.length, truncado: rows.length > MAX, produtos: rows.slice(0, MAX) });
});
router.get('/ncm', async (req, res) => res.json(await pesquisaNcm(req.query.q)));
router.get('/ncm/:codigo', async (req, res) => res.json(await consultaNcm(req.params.codigo)));
router.get('/referencias', async (_req, res) => { const [r] = await pool.query('select * from tb_referencias order by descricao'); res.json(r); });

// tbprodNewRecord (u_produto): código = <id do cliente>.<próximo número>
router.get('/proximo-codigo', async (req, res) => {
  const cli = idValido(req.query.cliente, 'Cliente');
  const [[r]] = await pool.query(
    `select max(cast(substring(codigo, locate('.', codigo) + 1, 5) as unsigned)) + 1 as x from tb_produtos where id_cliente = ? and codigo like concat(?, '.%')`, [cli, String(cli)]);
  res.json({ codigo: `${cli}.${r?.x ?? 1}` });
});

async function validaProduto(c, b, { criando, id }) {
  if (criando || 'codigo' in b) {
    if (!b.codigo) throw invalid('Informe o código do produto.');
    const [[dup]] = await c.query('select id from tb_produtos where codigo = ? and id <> ? limit 1', [b.codigo, id ?? 0]);
    if (dup) throw invalid(`Já existe um produto com o código ${b.codigo} (ID ${dup.id}).`);
  }
  if (criando || 'descricao' in b) if (!b.descricao) throw invalid('Informe a descrição do produto.');
  // BeforePost do Delphi: peso e alíquotas de IPI/ICMS não podem ser nulos
  for (const k of ['peso', 'aliq_ipi', 'aliq_icms']) {
    if ((criando && (b[k] === undefined || b[k] === null)) || (k in b && b[k] === null)) throw invalid(`Impossível salvar produto: "${ROT[k] ?? k}" não pode ser nulo.`);
  }
  if ('ncm' in b && b.ncm && String(b.ncm).replace(/\D/g, '').length) { // NCM informado: precisa existir (se a tabela não puder ser consultada, não bloqueia)
    const r = await consultaNcm(b.ncm);
    if (r.ok === false) throw invalid(r.motivo);
  }
  if ('divisor_basico' in b && !(b.divisor_basico > 0)) throw invalid('"Cada" deve ser maior que zero.');
  if (b.id_tributos) { const [[t]] = await c.query('select id from tb_tributos where id = ?', [b.id_tributos]); if (!t) throw invalid('Tributação inexistente.'); }
  if (b.id_referencia) { const [[t]] = await c.query('select id from tb_referencias where id = ?', [b.id_referencia]); if (!t) throw invalid('Referência inexistente.'); }
  if (b.id_cliente) { const [[t]] = await c.query('select id from tb_clientes where id = ?', [b.id_cliente]); if (!t) throw invalid('Cliente inexistente.'); }
}

router.post('/', async (req, res) => {
  const b = limpaCampos(req.body, SCHEMA, { rotulos: ROT });
  if (b.divisor_basico === undefined) b.divisor_basico = 1;
  await validaProduto(pool, b, { criando: true });
  const [r] = await pool.query('insert into tb_produtos set ?', [b]);
  const [[novo]] = await pool.query(`${SQL_LISTA} where p.id = ?`, [r.insertId]);
  res.status(201).json(novo);
});
router.put('/:id', async (req, res) => {
  const id = idValido(req.params.id, 'Produto');
  const b = limpaCampos(req.body, SCHEMA, { rotulos: ROT });
  if (!Object.keys(b).length) throw invalid('Nada para gravar.');
  await validaProduto(pool, b, { criando: false, id });
  const [r] = await pool.query('update tb_produtos set ? where id = ?', [b, id]);
  if (!r.affectedRows) throw notFound('Produto');
  const [[p]] = await pool.query(`${SQL_LISTA} where p.id = ?`, [id]);
  res.json(p);
});
router.delete('/:id', async (req, res) => {
  const id = idValido(req.params.id, 'Produto');
  for (const [tab, rot] of [['tb_fixa', 'programação fixa'], ['tb_diaria', 'programação diária'], ['tb_comandas_itens', 'comandas'], ['tb_nfe_itens', 'notas fiscais']]) {
    const [[u]] = await pool.query(`select 1 as n from ${tab} where id_produto = ? limit 1`, [id]);
    if (u) throw invalid(`Produto usado em ${rot}; não pode ser excluído.`);
  }
  try {
    const [r] = await pool.query('delete from tb_produtos where id = ?', [id]);
    if (!r.affectedRows) throw notFound('Produto');
  } catch (e) { throw emUso(e, 'Produto'); }
  res.json({ ok: true });
});

export default router;
