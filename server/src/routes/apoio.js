import { Router } from 'express';
import { pool } from '../db.js';
import { notFound } from '../errors.js';
import { produtoPorCodigo } from '../services/produtos.js';
import { idValido } from '../services/campos.js';
import { SQL_ATIVO } from '../services/produtosAtivo.js';

const router = Router();

// Busca por código exato (campo "Produto" das telas)
router.get('/produtos/codigo/:codigo', async (req, res) => {
  const p = await produtoPorCodigo(pool, req.params.codigo);
  if (!p) throw notFound('Produto');
  if (p.ativo === 'False') throw notFound('Produto ativo'); // inativo não é aceito nas telas
  res.json(p);
});

// Pesquisa simples para a janela "Localizar produto" (u_localiza_produto não foi enviada)
router.get('/produtos', async (req, res) => {
  const q = `%${String(req.query.q || '').trim().replace(/[\\%_]/g, '\\$&')}%`;
  const args = [q, q];
  // só produtos ATIVOS; com ?cliente= só os do cliente, como o filtro do Delphi (u_localiza_produto)
  let cli = '';
  if (req.query.cliente) { cli = ' and p.id_cliente = ?'; args.push(idValido(req.query.cliente, 'Cliente')); }
  const [rows] = await pool.query(
    `select p.id, p.codigo, p.descricao, p.descricao_expedicao, p.preco, p.divisor_basico, p.un,
            (p.preco / if(p.divisor_basico = 0, 1, p.divisor_basico)) as preco_unitario
       from tb_produtos p where (p.codigo like ? or p.descricao like ?) and ${SQL_ATIVO}${cli} order by p.descricao limit 301`, args); // 301: o 301º só indica que há mais (a tela mostra 300 e avisa)
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
