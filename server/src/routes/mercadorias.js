import { Router } from 'express';
import { pool, tx } from '../db.js';
import { invalid, notFound, pick } from '../errors.js';
import { isIsoDate, unitario } from '../rules.js';
import { produtoPorCodigo } from '../services/produtos.js';
import { logDiaria } from '../services/log.js';
import { mercadoriasDaData } from '../services/mercCache.js';

const router = Router();

// Venda de mercadorias do dia (tbprm): itens NÃO produzidos na casa e não cancelados.
const consultaLista = async (data) => {
  // inner join (o filtro em pd já descartava as linhas sem produto) e sem ORDER BY: a tela ordena por data/hora/descrição
  const [rows] = await pool.query(
    `select p.id, p.id_unidade, p.data, p.hora, p.produto_codigo, p.produto_descricao,
            p.produto_descricao_expedicao, p.obs, p.obs_producao, p.registro_alterado,
            p.etiqueta_adesiva,
            (p.qtde_original + p.qtde_alterada) as qtde,
            ((p.qtde_original + p.qtde_alterada) * p.produto_preco) as produto_valor,
            u.nome
       from tb_diaria p
       join tb_produtos pd on pd.id = p.id_produto
       left join tb_unidades u on u.id = p.id_unidade
      where p.data = ? and pd.produto_producao <> 'True' and p.cancelado <> 'True'`, [data]);
  return rows;
};
export { consultaLista };

// cache no servidor (fresco 8 s, velho até 2 min com atualização em segundo plano); gravações pela API esvaziam
router.get('/', async (req, res) => {
  const { data } = req.query;
  if (!isIsoDate(data)) throw invalid('Informe a data no formato AAAA-MM-DD.');
  const r = await mercadoriasDaData(data, consultaLista);
  res.set('Server-Timing', `db;dur=${r.ms.toFixed(1)}, cache;desc="${r.origem}"`); // aparece na aba Rede do navegador
  if (r.origem === 'banco' && r.ms > 1500) console.warn(`[mercadorias] consulta lenta (${r.ms.toFixed(0)} ms) para ${data}: confira os índices (npm run indices).`);
  res.json(r.rows);
});

const idValido = (v) => {
  const id = Number(v);
  if (!Number.isInteger(id) || id <= 0) throw invalid('Item inválido.');
  return id;
};
const SQL_ITEM = `
  select p.id, p.id_cliente, p.id_unidade, p.data, p.hora, p.id_produto, p.produto_codigo, p.produto_descricao,
         p.produto_preco, p.produto_preco_cada, (p.qtde_original + p.qtde_alterada) as qtde,
         ((p.qtde_original + p.qtde_alterada) * (p.produto_preco / greatest(coalesce(nullif(p.produto_preco_cada, 0), 1), 1))) as preco_total,
         ((p.qtde_original + p.qtde_alterada) * p.produto_preco) as produto_valor,
         p.id_produto_conversao, p.conversao_produto_codigo, p.conversao_produto_descricao, p.conversao_produto_qtde,
         p.conversao_produto_preco, p.conversao_produto_valor, p.conversao_observacoes, p.quitado_manualmente, u.nome
    from tb_diaria p left join tb_unidades u on u.id = p.id_unidade where p.id = ?`;

// Janela "Conversão de mercadorias" (u_converte_mercadoria): dados completos do item
router.get('/:id', async (req, res) => {
  const [[item]] = await pool.query(SQL_ITEM, [idValido(req.params.id)]);
  if (!item) throw notFound('Item');
  res.json(item);
});

const CAMPOS_CONVERSAO = [
  'produto_codigo', 'produto_descricao', 'conversao_produto_codigo', 'conversao_produto_descricao',
  'conversao_produto_qtde', 'conversao_produto_preco', 'conversao_observacoes', 'quitado_manualmente',
];
const numero = (v, rotulo) => {
  const n = Number(v);
  if (v === '' || v === null || !Number.isFinite(n) || n < 0 || n > 999999999) throw invalid(`${rotulo} inválido(a).`);
  return n;
};

// Salvar da conversão: valida tudo antes de tocar no banco; valores derivados são recalculados aqui.
router.put('/:id', async (req, res) => {
  const id = idValido(req.params.id);
  const b = pick(req.body, CAMPOS_CONVERSAO);
  if (!Object.keys(b).length) throw invalid('Nada para gravar.');
  for (const k of ['produto_codigo', 'produto_descricao', 'conversao_produto_codigo', 'conversao_produto_descricao']) {
    if (b[k] !== undefined) b[k] = String(b[k] ?? '').trim().slice(0, 255);
  }
  if (b.conversao_observacoes !== undefined) b.conversao_observacoes = String(b.conversao_observacoes ?? '').slice(0, 1000);
  if (b.conversao_produto_qtde !== undefined) b.conversao_produto_qtde = numero(b.conversao_produto_qtde, 'Quantidade');
  if (b.conversao_produto_preco !== undefined) b.conversao_produto_preco = numero(b.conversao_produto_preco, 'Preço unitário');
  if (b.quitado_manualmente !== undefined) b.quitado_manualmente = b.quitado_manualmente === true || b.quitado_manualmente === 'True' ? 'True' : 'False';
  if (b.produto_descricao !== undefined && !b.produto_descricao) throw invalid('Informe a descrição da mercadoria.');

  await tx(async (c) => {
    const [[atual]] = await c.query('select * from tb_diaria where id = ? for update', [id]);
    if (!atual) throw notFound('Item');
    const novo = { ...b };
    const mudancas = [];

    // Troca do produto cobrado na nota: busca o cadastro (dsprmDataChange / produto_codigo)
    if (b.produto_codigo !== undefined && b.produto_codigo !== atual.produto_codigo) {
      const p = await produtoPorCodigo(c, b.produto_codigo);
      if (!p) throw invalid('Produto não encontrado!!!');
      Object.assign(novo, {
        id_produto: p.id, produto_codigo: p.codigo, produto_descricao: b.produto_descricao || p.descricao,
        produto_preco: p.preco, produto_preco_cada: p.divisor_basico, produto_preco_unitario: unitario(p.preco, p.divisor_basico),
      });
      mudancas.push(`Alterou produto para ${p.codigo}`);
    }
    // Produto "cobrar como": id e preço vêm do cadastro; quantidade/valor são recalculados
    if (b.conversao_produto_codigo !== undefined && b.conversao_produto_codigo !== (atual.conversao_produto_codigo ?? '')) {
      if (b.conversao_produto_codigo) {
        const p = await produtoPorCodigo(c, b.conversao_produto_codigo);
        if (!p) throw invalid('Produto não encontrado!!!');
        novo.id_produto_conversao = p.id;
        novo.conversao_produto_preco_cada = p.divisor_basico;
        if (b.conversao_produto_descricao === undefined) novo.conversao_produto_descricao = p.descricao;
        if (b.conversao_produto_preco === undefined) novo.conversao_produto_preco = p.preco;
      } else novo.id_produto_conversao = 0;
      mudancas.push(`Alterou produto cobrado para ${b.conversao_produto_codigo || '(nenhum)'}`);
    }
    const qtde = novo.conversao_produto_qtde ?? atual.conversao_produto_qtde;
    const preco = novo.conversao_produto_preco ?? atual.conversao_produto_preco;
    if (novo.conversao_produto_qtde !== undefined || novo.conversao_produto_preco !== undefined) {
      novo.conversao_produto_valor = Math.round((Number(qtde) || 0) * (Number(preco) || 0) * 100) / 100;
    }
    if (novo.conversao_produto_qtde !== undefined && Number(novo.conversao_produto_qtde) !== Number(atual.conversao_produto_qtde)) mudancas.push(`Alterou qtde cobrada para ${novo.conversao_produto_qtde}`);
    if (novo.conversao_produto_preco !== undefined && Number(novo.conversao_produto_preco) !== Number(atual.conversao_produto_preco)) mudancas.push(`Alterou preço cobrado para ${novo.conversao_produto_preco}`);
    if (novo.produto_descricao !== undefined && novo.produto_descricao !== atual.produto_descricao) mudancas.push(`Alterou descrição da comanda para ${novo.produto_descricao}`);

    await c.query('update tb_diaria set ? where id = ?', [novo, id]);
    if (mudancas.length) await logDiaria(c, id, req.userId, `Conversao de mercadoria ${atual.hora}/${String(atual.data).slice(0, 10)}\n${mudancas.join('\n')}`);
  });
  res.json({ ok: true });
});

// Log de impressão de etiquetas do item focado (tbLog)
router.get('/:id/etiquetas', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw invalid('Item inválido.');
  const [rows] = await pool.query(
    `select e.id, e.data_hora, e.origem, u.nome as usuario
       from tb_etiquetas_log e left join tb_usuarios u on u.id = e.id_usuario
      where e.id_diaria = ? order by e.data_hora desc`, [id]);
  res.json(rows);
});

// Dados para as etiquetas adesivas (ppAdsv) — o cliente imprime
router.post('/etiquetas/dados', async (req, res) => {
  const ids = idsValidos(req.body?.ids);
  const [rows] = await pool.query(
    `select p.id, p.data, p.hora, p.produto_descricao_expedicao,
            (p.qtde_original + p.qtde_alterada) as qtde_pendente, u.nome as unidade_nome
       from tb_diaria p left join tb_unidades u on u.id = p.id_unidade
      where p.id in (?) order by p.produto_descricao`, [ids]);
  res.json(rows);
});

// Confirma a impressão: grava o log e soma 1 ao contador (btnAdesivaClick), tudo em uma transação.
router.post('/etiquetas', async (req, res) => {
  const ids = idsValidos(req.body?.ids);
  await tx(async (c) => {
    await c.query(
      `insert into tb_etiquetas_log (id_diaria, data_hora, id_usuario, origem)
       select id, now(), ?, 'MERCADORIAS' from tb_diaria where id in (?)`, [req.userId, ids]);
    await c.query(
      'update tb_diaria set etiqueta_adesiva = coalesce(etiqueta_adesiva, 0) + 1, registro_alterado = 0 where id in (?)', [ids]);
  });
  res.json({ ok: true, etiquetas: ids.length });
});

function idsValidos(ids) {
  if (!Array.isArray(ids) || ids.length === 0) throw invalid('Selecione ao menos um item para impressão.');
  if (ids.length > 500) throw invalid('Itens demais em uma única impressão (máximo 500).');
  if (!ids.every((n) => Number.isInteger(n) && n > 0)) throw invalid('Lista de itens inválida.');
  return [...new Set(ids)];
}

export default router;
