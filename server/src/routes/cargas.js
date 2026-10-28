import { Router } from 'express';
import { pool, tx } from '../db.js';
import { invalid, notFound } from '../errors.js';
import { ACOMODACOES, SQL_DIARIA, SQL_FIXA, filtroDiaria, filtroFixa } from '../services/cargas.js';

// Roteiro de cargas (u_cargas): carga diária (tb_diaria) e carga fixa (tb_fixa).
const router = Router();

const ids = (v) => {
  if (!Array.isArray(v) || v.length === 0) throw invalid('Selecione ao menos um item.');
  if (v.length > 2000) throw invalid('Itens demais de uma só vez (máximo 2000).');
  if (!v.every((n) => Number.isInteger(n) && n > 0)) throw invalid('Lista de itens inválida.');
  return [...new Set(v)];
};
const tabela = (t) => { if (t !== 'diaria' && t !== 'fixa') throw invalid('Origem inválida.'); return t === 'diaria' ? 'tb_diaria' : 'tb_fixa'; };
const idUm = (v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw invalid('Item inválido.'); return n; };

router.get('/diaria', async (req, res) => {
  const f = filtroDiaria(req.query);
  const [rows] = await pool.query(SQL_DIARIA(f.where), f.params);
  res.json(rows);
});
router.get('/fixa', async (req, res) => {
  const f = filtroFixa(req.query);
  const [rows] = await pool.query(SQL_FIXA(f.where), f.params);
  res.json(rows);
});

// Lista de roteiros para o combo "Etinerário" (chave = horário + motorista)
router.get('/roteiros', async (_req, res) => {
  const [rows] = await pool.query(
    `select r.id as roteiro_id, concat(left(r.horario, 5), ' ', coalesce(f.nome, '(sem motorista)')) as chave
       from tb_roteiro r left join tb_funcionarios f on f.id = r.id_funcionario
      where f.id is null or f.ativo = 'True' order by f.nome, r.horario`);
  res.json(rows);
});

// Combo "Embalagem na carga"/"Acomodação da carga" do item focado (navegador: editar/gravar) — diária ou fixa
router.put('/:tabela/:id', async (req, res) => {
  const tb = tabela(req.params.tabela); const id = idUm(req.params.id);
  const novo = {};
  if (req.body?.acomodacao_carga !== undefined) {
    if (!ACOMODACOES.includes(req.body.acomodacao_carga)) throw invalid('Acomodação inválida.');
    novo.acomodacao_carga = req.body.acomodacao_carga;
  }
  if (req.body?.id_roteiro !== undefined) {
    const r = Number(req.body.id_roteiro);
    if (!Number.isInteger(r) || r < 0) throw invalid('Etinerário inválido.');
    if (r > 0) { const [[ok]] = await pool.query('select id from tb_roteiro where id = ?', [r]); if (!ok) throw invalid('Etinerário não encontrado.'); }
    novo.id_roteiro = r;
  }
  if (!Object.keys(novo).length) throw invalid('Nada para gravar.');
  const [r] = await pool.query(`update ${tb} set ? where id = ?`, [novo, id]);
  if (!r.affectedRows) throw notFound('Item');
  res.json({ ok: true });
});

// Menu de contexto das grades: define a acomodação de todas as linhas marcadas (uma instrução só, não um update por linha)
router.post('/:tabela/acomodacao', async (req, res) => {
  const tb = tabela(req.params.tabela);
  if (!ACOMODACOES.includes(req.body?.valor)) throw invalid('Acomodação inválida.');
  const lista = ids(req.body?.ids);
  const [r] = await pool.query(`update ${tb} set acomodacao_carga = ? where id in (?)`, [req.body.valor, lista]);
  res.json({ ok: true, atualizados: r.affectedRows });
});

// Separação na expedição: o código de barras da etiqueta é o id do item (edSeparado + Enter)
router.post('/diaria/separar', async (req, res) => {
  const lista = ids(req.body?.ids);
  const [r] = await pool.query("update tb_diaria set separado = 'True' where id in (?)", [lista]);
  if (!r.affectedRows) throw notFound('Item');
  res.json({ ok: true, atualizados: r.affectedRows });
});

router.get('/diaria/:id/etiquetas', async (req, res) => {
  const [rows] = await pool.query(
    `select e.id, e.data_hora, e.origem, u.nome as usuario
       from tb_etiquetas_log e left join tb_usuarios u on u.id = e.id_usuario
      where e.id_diaria = ? order by e.data_hora`, [idUm(req.params.id)]);
  res.json(rows);
});

// Dados da etiqueta adesiva (lst1) — o cliente imprime
router.post('/etiquetas/dados', async (req, res) => {
  const lista = ids(req.body?.ids);
  const [rows] = await pool.query(
    `select p.*, (p.qtde_original + p.qtde_alterada) as xqtde_total, rf.produto_especial,
            concat(coalesce(fo.apelido, ''), ' ', left(rt.horario, 5), ' *** ', coalesce(p.acomodacao_carga, ''), ' ', coalesce(p.carga, '')) as inform,
            u.nome as unidade_nome
       from tb_diaria p
       left join tb_roteiro rt on rt.id = p.id_roteiro
       left join tb_funcionarios fo on fo.id = rt.id_funcionario
       left join tb_unidades u on u.id = p.id_unidade
       left join tb_produtos pr on pr.id = p.id_produto
       left join tb_referencias rf on rf.id = pr.id_referencia
      where p.id in (?) order by p.hora, p.id`, [lista]);
  res.json(rows);
});

// Confirma a impressão: log + contador, numa transação (origem CARGA)
router.post('/etiquetas', async (req, res) => {
  const lista = ids(req.body?.ids);
  await tx(async (c) => {
    await c.query("insert into tb_etiquetas_log (id_diaria, data_hora, id_usuario, origem) select id, now(), ?, 'CARGA' from tb_diaria where id in (?)", [req.userId, lista]);
    await c.query('update tb_diaria set etiqueta_adesiva = coalesce(etiqueta_adesiva, 0) + 1, registro_alterado = 0 where id in (?)', [lista]);
  });
  res.json({ ok: true, etiquetas: lista.length });
});

export default router;
