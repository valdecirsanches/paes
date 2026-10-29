import { Router } from 'express';
import { pool } from '../db.js';
import { invalid, notFound } from '../errors.js';

// Pedidos extras (u_extras da fábrica / tb_extras). A grade mostra só os ainda não digitados na programação (digitado = 'False').
// data/hora = quando o cliente quer a entrega; data_programacao/hora_programacao = quando o pedido foi lançado.
const router = Router();
const p2 = (n) => String(n).padStart(2, '0');
const agoraHora = () => { const d = new Date(); return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; };
const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };

router.get('/', async (_req, res) => {
  const [rows] = await pool.query("select * from tb_extras where digitado = 'False' or digitado is null order by data desc, hora desc, id desc limit 2000");
  res.json(rows);
});

// Listas das caixas de escolha (empresa, solicitante, produto/mercadoria já usados, funcionários).
router.get('/opcoes', async (_req, res) => {
  const [[emp], [ctt], [des], [fun]] = await Promise.all([
    pool.query('select nome from tb_unidades order by nome'),
    pool.query("select distinct contato as v from tb_extras where contato is not null and contato <> '' order by contato limit 1000"),
    pool.query("select distinct descricao as v from tb_extras where descricao is not null and descricao <> '' order by descricao limit 1000"),
    pool.query('select nome from tb_funcionarios order by nome'),
  ]);
  res.json({ empresas: emp.map((r) => r.nome), contatos: ctt.map((r) => r.v), descricoes: des.map((r) => r.v), funcionarios: fun.map((r) => r.nome) });
});

function corpo(b = {}) {
  const t = (v, max) => String(v ?? '').trim().slice(0, max);
  const o = { empresa: t(b.empresa, 120), contato: t(b.contato, 80), funcionario: t(b.funcionario, 80), descricao: t(b.descricao, 2000), fone: t(b.fone, 30) };
  if (!o.funcionario) throw invalid('Obrigatório o preenchimento do nome do funcionário.');
  if (!o.descricao) throw invalid('Informe o produto ou mercadoria.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.data ?? ''))) throw invalid('Informe a data da entrega.');
  if (!/^\d{2}:\d{2}$/.test(String(b.hora ?? ''))) throw invalid('Informe a hora (HH:MM).');
  return { ...o, data: b.data, hora: `${b.hora}:00`, data_programacao: hojeIso(), hora_programacao: agoraHora() };
}

router.post('/', async (req, res) => {
  const [r] = await pool.query('insert into tb_extras set ?', [{ ...corpo(req.body), digitado: 'False' }]);
  res.status(201).json({ id: r.insertId });
});

router.put('/:id', async (req, res) => {
  const [[x]] = await pool.query('select digitado from tb_extras where id = ?', [req.params.id]);
  if (!x) throw notFound('Pedido extra');
  if (String(x.digitado) === 'True') throw invalid('Este pedido já foi digitado na programação e não pode ser alterado.');
  await pool.query('update tb_extras set ? where id = ?', [corpo(req.body), req.params.id]);
  res.json({ ok: true });
});

export default router;
