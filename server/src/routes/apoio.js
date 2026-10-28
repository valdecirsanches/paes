import { Router } from 'express';
import { pool } from '../db.js';
import { notFound } from '../errors.js';
import { produtoPorCodigo } from '../services/produtos.js';

const router = Router();

// Busca por código exato (campo "Produto" das telas)
router.get('/produtos/codigo/:codigo', async (req, res) => {
  const p = await produtoPorCodigo(pool, req.params.codigo);
  if (!p) throw notFound('Produto');
  res.json(p);
});

// Pesquisa simples para a janela "Localizar produto" (u_localiza_produto não foi enviada)
router.get('/produtos', async (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  const [rows] = await pool.query(
    `select p.id, p.codigo, p.descricao, p.descricao_expedicao, p.preco, p.divisor_basico
       from tb_produtos p where p.codigo like ? or p.descricao like ? order by p.descricao limit 50`, [q, q]);
  res.json(rows);
});

// Roteiros/motoristas que atendem a unidade do movimento
router.get('/status/:id/roteiros', async (req, res) => {
  const [rows] = await pool.query(
    `select rd.id_roteiro, left(rt.horario, 5) as horario, rt.id_funcionario, mt.nome, mt.celular
       from tb_status ps
       join tb_roteiro_distribuicao rd on rd.id_unidade = ps.id_unidade
       left join tb_roteiro rt on rt.id = rd.id_roteiro
       left join tb_funcionarios mt on mt.id = rt.id_funcionario
      where ps.id = ? order by rt.horario`, [req.params.id]);
  res.json(rows);
});

export default router;
