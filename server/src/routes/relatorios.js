import { Router } from 'express';
import { pool } from '../db.js';
import { invalid } from '../errors.js';
import { FILTRO_STATUS, STATUS, isIsoDate, linhaDeAlteracao } from '../rules.js';

const router = Router();

// Dados da "Lista de alterações" (tblst + ppAlteracoes). Só produtos de produção, unidades ativas.
router.get('/alteracoes', async (req, res) => {
  const { data, filtro = 'todas', completa } = req.query;
  if (!isIsoDate(data)) throw invalid('Informe a data no formato AAAA-MM-DD.');
  const status = FILTRO_STATUS[filtro];
  if (filtro !== 'todas' && filtro !== 'nada' && !status) throw invalid('Filtro inválido.');
  const [rows] = await pool.query(
    `select ps.id, ps.status as status_x, u.imprimir_toda_programacao, u.nome, u.verificar_pasta,
            left(p.hora, 5) as hora, p.id as id_diaria, p.programacao_fixa, p.cancelado, p.obs_producao,
            p.qtde_original as xqtde_original, p.qtde_alterada,
            (p.qtde_original + p.qtde_alterada) as xqtde_final,
            if(p.programacao_fixa = 'True', p.qtde_alterada, 0) as sinal_alteracao,
            p.produto_descricao, p.produto_descricao_expedicao, pr.produto_producao, p.data
       from tb_status ps
       left join tb_diaria p on ps.id_unidade = p.id_unidade and ps.data = p.data
       left join tb_produtos pr on pr.id = p.id_produto
       left join tb_unidades u on u.id = p.id_unidade
      where p.data = ? and u.ativo = 'True' and pr.produto_producao = 'True'
        ${status ? 'and ps.status in (?)' : ''}
      order by u.nome, p.hora, pr.descricao`,
    status ? [data, status] : [data]);
  const linhas = rows
    .filter((r) => linhaDeAlteracao(r, completa === '1' || completa === 'true'))
    .map((r) => ({ ...r, status_descricao: STATUS[r.status_x] ?? 'NADA' }));
  res.json(linhas);
});

export default router;
