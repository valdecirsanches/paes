import { Router } from 'express';
import { pool, tx } from '../db.js';
import { invalid, notFound } from '../errors.js';
import { isIsoDate } from '../rules.js';
import { produtoPorCodigo } from '../services/produtos.js';
import { geraFatura, trunc3 } from '../services/geraFatura.js';

// Tela "Controle de comandas" (u_comandas) + diálogo Edita/Desconto (u_comanda_desconto).
// Comandas/itens/detalhes de uma comanda aberta continuam em /api/faturamento/comandas/... (mesmas consultas do Delphi).
// A exclusão de comanda é DELETE /api/faturamento/comandas/:id.
const router = Router();

const MODOS = ['pendentes', 'faturadas', 'todas'];
const MAX_IDS = 500;
const idValido = (v, rotulo = 'Registro') => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > 2147483647) throw invalid(`${rotulo} inválido(a).`);
  return n;
};
const numero = (v, rotulo, { min = 0, minExclusivo = false, max = 1e9 } = {}) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  if (v === '' || v === null || v === undefined || !Number.isFinite(n)) throw invalid(`${rotulo} inválido(a).`);
  if (minExclusivo ? n <= min : n < min) throw invalid(`${rotulo} deve ser ${minExclusivo ? 'maior que' : 'no mínimo'} ${min}.`);
  if (n > max) throw invalid(`${rotulo} acima do limite.`);
  return n;
};
const r6 = (n) => Math.round(Number(n) * 1e6) / 1e6;
const jaFaturada = (c) => Number(c.id_nota_fiscal) > 0 || String(c.status ?? '').toUpperCase() === 'FATURADO';

// Lista de comandas da unidade (cmdCB, detalhe de id_unidade). Pendentes = tudo que não é FATURADO.
router.get('/', async (req, res) => {
  const unidade = idValido(req.query.unidade, 'Unidade');
  const modo = req.query.modo ?? 'pendentes';
  if (!MODOS.includes(modo)) throw invalid('Filtro de status inválido.');
  const emissao = req.query.emissao;
  if (emissao !== undefined && emissao !== '' && !isIsoDate(emissao)) throw invalid('Data de emissão inválida.');
  const onde = ['c.id_unidade = ?'];
  const args = [unidade];
  if (emissao) { onde.push('c.data_emissao = ?'); args.push(emissao); }
  if (modo === 'pendentes') onde.push("coalesce(c.status, '') <> 'FATURADO'");
  if (modo === 'faturadas') onde.push("c.status = 'FATURADO'");
  const [rows] = await pool.query(
    `select c.*, coalesce(nullif(c.usuario, ''), u.usuario) as usuario_resp,
            sum(truncate(truncate(i.preco, 3) * truncate(i.qtde / if(i.preco_cada = 0, 1, i.preco_cada), 3), 3)) as vr_comanda
       from tb_comandas c
       left join tb_comandas_itens i on i.id_comanda = c.id
       left join tb_usuarios u on u.id = c.id_usuario
      where ${onde.join(' and ')}
      group by c.id order by c.id`, args);
  res.json(rows);
});

// edtProdutoExit: busca o produto pelo código (preço, divisor básico).
router.get('/produto/:codigo', async (req, res) => {
  const codigo = String(req.params.codigo ?? '').trim();
  if (!codigo || codigo.length > 30) throw invalid('Código do produto inválido.');
  const p = await produtoPorCodigo(pool, codigo);
  if (!p) throw notFound('Produto');
  res.json({ id: p.id, codigo: p.codigo, descricao: p.descricao, preco: p.preco, divisor_basico: p.divisor_basico });
});

async function comandaEditavel(c, id) {
  const [[cmd]] = await c.query('select id, status, id_nota_fiscal from tb_comandas where id = ? for update', [id]);
  if (!cmd) throw notFound('Comanda');
  if (jaFaturada(cmd)) throw invalid('Esta comanda já foi faturada (nota fiscal gerada) e não pode ser alterada.');
  return cmd;
}

// bAplicar → insert (produto novo digitado após "Incluir")
router.post('/:id/itens', async (req, res) => {
  const id = idValido(req.params.id, 'Comanda');
  const b = req.body ?? {};
  const codigo = String(b.produto_codigo ?? '').trim();
  if (!codigo) throw invalid('Informe o código do produto.');
  const qtde = numero(b.qtde, 'Quantidade', { minExclusivo: true });
  const cada = numero(b.cada ?? 1, 'Cada', { minExclusivo: true });
  const preco = numero(b.preco, 'Preço');
  const descricao = b.descricao === undefined ? null : String(b.descricao).trim().slice(0, 100);
  const out = await tx(async (c) => {
    await comandaEditavel(c, id);
    const p = await produtoPorCodigo(c, codigo);
    if (!p) throw invalid('Produto não encontrado!');
    const qtdeBanco = r6(qtde * cada);
    const total = r6(preco * qtdeBanco);
    const [r] = await c.query(
      `insert into tb_comandas_itens set id_comanda = ?, id_produto = ?, produto_codigo = ?, descricao_generica = ?, preco = ?, preco_cada = 1, qtde = ?, preco_total = ?`,
      [id, p.id, p.codigo, descricao || p.descricao, preco, qtdeBanco, total]);
    return { id: r.insertId };
  });
  res.status(201).json(out);
});

// bAplicar → update (qtde e preço do item existente). qtde gravada = qtde × cada (como no Delphi).
router.put('/itens/:itemId', async (req, res) => {
  const itemId = idValido(req.params.itemId, 'Item');
  const b = req.body ?? {};
  const qtde = numero(b.qtde, 'Quantidade', { min: 0 });
  const cada = numero(b.cada ?? 1, 'Cada', { minExclusivo: true });
  const preco = numero(b.preco, 'Preço');
  await tx(async (c) => {
    const [[it]] = await c.query('select * from tb_comandas_itens where id = ? for update', [itemId]);
    if (!it) throw notFound('Item da comanda');
    await comandaEditavel(c, it.id_comanda);
    const qtdeBanco = r6(qtde * cada);
    // preco_total fica coerente com a consulta (vr_item); o Delphi só atualizava qtde e preço.
    const total = trunc3(trunc3(preco) * trunc3(qtdeBanco / (Number(it.preco_cada) || 1)));
    await c.query('update tb_comandas_itens set qtde = ?, preco = ?, preco_total = ? where id = ?', [qtdeBanco, preco, total, itemId]);
  });
  res.json({ ok: true });
});

// bAplicar com "Excluir" marcado
router.delete('/itens/:itemId', async (req, res) => {
  const itemId = idValido(req.params.itemId, 'Item');
  await tx(async (c) => {
    const [[it]] = await c.query('select id, id_comanda from tb_comandas_itens where id = ? for update', [itemId]);
    if (!it) throw notFound('Item da comanda');
    await comandaEditavel(c, it.id_comanda);
    await c.query('delete from tb_comandas_itens where id = ?', [itemId]);
  });
  res.json({ ok: true });
});

// bNfeClick: gera uma única NF-e PENDENTE com as comandas selecionadas da unidade.
router.post('/nfe', async (req, res) => {
  const b = req.body ?? {};
  if (!Array.isArray(b.ids) || b.ids.length === 0) throw invalid('Selecione ao menos uma comanda.');
  if (b.ids.length > MAX_IDS) throw invalid(`Selecione no máximo ${MAX_IDS} comandas por vez.`);
  const ids = [...new Set(b.ids.map((i) => idValido(i, 'Comanda')))];
  const unidade = idValido(b.unidade, 'Unidade');
  if (!isIsoDate(b.data_saida)) throw invalid('Data de saída inválida.');
  const r = await tx(async (c) => {
    const [cmds] = await c.query('select id, id_cliente, id_unidade, status, id_nota_fiscal from tb_comandas where id in (?) for update', [ids]);
    if (cmds.length !== ids.length) throw notFound('Comanda');
    for (const m of cmds) {
      if (Number(m.id_unidade) !== unidade) throw invalid(`A comanda ${m.id} não pertence à unidade selecionada.`);
      if (jaFaturada(m)) throw invalid(`A comanda ${m.id} já possui nota fiscal.`);
    }
    if (new Set(cmds.map((m) => Number(m.id_cliente))).size !== 1) throw invalid('As comandas selecionadas são de clientes diferentes.');
    const [[{ n }]] = await c.query('select count(*) as n from tb_comandas_itens where id_comanda in (?)', [ids]);
    if (!n) throw invalid('Não há itens para emissão da NF.');
    const [[usr]] = req.userId ? await c.query('select usuario from tb_usuarios where id = ?', [req.userId]) : [[null]];
    return geraFatura(c, { comandas: ids, idCliente: cmds[0].id_cliente, idUnidade: unidade, saida: b.data_saida, usuario: usr?.usuario ?? '' });
  });
  res.status(201).json(r);
});

export default router;
