import { Router } from 'express';
import { pool } from '../db.js';
import { invalid, notFound, pick } from '../errors.js';

const router = Router();

// Reclamações da unidade (tbrcm / aba "Reclamações"). O status do dia identifica cliente e unidade.
async function statusDe(id) {
  const [[st]] = await pool.query('select id, data, id_cliente, id_unidade from tb_status where id = ?', [id]);
  if (!st) throw notFound('Movimento');
  return st;
}
const CAMPOS = ['reclamante', 'telefone', 'reclamacao', 'explicacao'];
const texto = (b) => {
  const o = pick(b, CAMPOS);
  for (const k of CAMPOS) if (o[k] !== undefined) o[k] = String(o[k] ?? '').slice(0, 5000);
  return o;
};

// Tela "Reclamações" da fábrica (u_reclamações): todas as reclamações/elogios do período, de todos os clientes.
router.get('/reclamacoes', async (req, res) => {
  const de = String(req.query.de ?? ''), ate = String(req.query.ate ?? req.query.de ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) throw invalid('Informe o período (AAAA-MM-DD).');
  const [rows] = await pool.query(
    `select r.*, u.nome, u.telefone as telefone_unidade from tb_reclamacoes r left join tb_unidades u on u.id = r.id_unidade
      where r.data between ? and ? order by r.data, r.hora, r.id limit 2000`, [de, ate]);
  res.json(rows);
});

router.get('/status/:id/reclamacoes', async (req, res) => {
  const st = await statusDe(req.params.id);
  const [rows] = await pool.query(
    `select r.*, u.nome from tb_reclamacoes r left join tb_unidades u on u.id = r.id_unidade
      where r.id_unidade = ? order by r.data desc, r.hora desc, r.id desc`, [st.id_unidade]);
  res.json(rows);
});

// tbrcmNewRecord: data = dia da tela, hora = agora, cliente/unidade do movimento
router.post('/status/:id/reclamacoes', async (req, res) => {
  const st = await statusDe(req.params.id);
  const c = texto(req.body);
  if (!String(c.reclamante ?? '').trim()) throw invalid('Informe o nome do reclamante.');
  const agora = new Date();
  const hora = [agora.getHours(), agora.getMinutes(), agora.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
  const [r] = await pool.query('insert into tb_reclamacoes set ?', [{
    ...c, data: String(st.data).slice(0, 10), hora, id_cliente: st.id_cliente, id_unidade: st.id_unidade, usuario_id: req.userId,
  }]);
  res.status(201).json({ id: r.insertId });
});

router.put('/reclamacoes/:id', async (req, res) => {
  const c = texto(req.body);
  if (c.reclamante !== undefined && !String(c.reclamante).trim()) throw invalid('Informe o nome do reclamante.');
  if (!Object.keys(c).length) throw invalid('Nada para gravar.');
  const [r] = await pool.query('update tb_reclamacoes set ? where id = ?', [c, req.params.id]);
  if (!r.affectedRows) throw notFound('Reclamação');
  res.json({ ok: true });
});

router.delete('/reclamacoes/:id', async (req, res) => {
  const [r] = await pool.query('delete from tb_reclamacoes where id = ?', [req.params.id]);
  if (!r.affectedRows) throw notFound('Reclamação');
  res.json({ ok: true });
});

// Aba "Configurações": cadastro da unidade (tbcli). Só as colunas que a tela antiga editava.
const CAMPOS_UNIDADE = ['verificar_pasta', 'imprimir_toda_programacao', 'endereco', 'bairro', 'cep', 'cidade', 'uf', 'telefone', 'contato'];
router.get('/status/:id/unidade', async (req, res) => {
  const st = await statusDe(req.params.id);
  const [[u]] = await pool.query(`select id, nome, ${CAMPOS_UNIDADE.join(', ')} from tb_unidades where id = ?`, [st.id_unidade]);
  if (!u) throw notFound('Unidade');
  res.json(u);
});
router.put('/status/:id/unidade', async (req, res) => {
  const st = await statusDe(req.params.id);
  const c = pick(req.body, CAMPOS_UNIDADE);
  for (const k of ['verificar_pasta', 'imprimir_toda_programacao']) if (c[k] !== undefined) c[k] = c[k] === true || c[k] === 'True' ? 'True' : 'False';
  for (const k of CAMPOS_UNIDADE.slice(2)) if (c[k] !== undefined) c[k] = String(c[k] ?? '').slice(0, 120);
  if (!Object.keys(c).length) throw invalid('Nada para gravar.');
  await pool.query('update tb_unidades set ? where id = ?', [c, st.id_unidade]);
  res.json({ ok: true });
});

export default router;
