import { Router } from 'express';
import { pool } from '../db.js';
import { AppError, invalid, notFound } from '../errors.js';
import { emUso, idValido } from '../services/campos.js';
import { hashSenha } from '../services/auth.js';

// Cadastro de usuários (tb_usuarios: usuario, nome, senha = PASSWORD() do MySQL). Só o administrador. A senha nunca volta para a tela.
const router = Router();
const ehAdmin = (req) => String(req.user?.usuario ?? '').toUpperCase() === 'SANCHES';
router.use((req, _res, next) => (ehAdmin(req) ? next() : next(new AppError(403, 'Só o administrador cadastra usuários.'))));

const RESERVADOS = ['fabrica']; // usuário automático das máquinas da fábrica: não se edita nem se apaga
const reservado = (u) => RESERVADOS.includes(String(u ?? '').toLowerCase());
const limpa = (v, rot, max, obrig = true) => {
  const t = String(v ?? '').trim();
  if (!t && obrig) throw invalid(`Informe ${rot}.`);
  if (t.length > max) throw invalid(`${rot[0].toUpperCase()}${rot.slice(1)}: máximo de ${max} caracteres.`);
  return t;
};
const pub = (u) => ({ id: u.id, usuario: u.usuario, nome: u.nome, reservado: reservado(u.usuario) });

router.get('/', async (_req, res) => { const [r] = await pool.query('select id, usuario, nome from tb_usuarios order by usuario'); res.json(r.map(pub)); });

router.post('/', async (req, res) => {
  const usuario = limpa(req.body?.usuario, 'o usuário (login)', 30); const nome = limpa(req.body?.nome, 'o nome', 60);
  const senha = String(req.body?.senha ?? ''); if (senha.length < 4) throw invalid('A senha precisa ter ao menos 4 caracteres.');
  if (/\s/.test(usuario)) throw invalid('O usuário não pode ter espaços.');
  if (reservado(usuario)) throw invalid('Esse usuário é reservado pelo sistema.');
  const [[e]] = await pool.query('select id from tb_usuarios where lower(usuario) = lower(?) limit 1', [usuario]);
  if (e) throw invalid('Já existe um usuário com esse login.');
  const [r] = await pool.query('insert into tb_usuarios (usuario, nome, senha) values (?, ?, ?)', [usuario, nome, hashSenha(senha)]);
  res.status(201).json(pub({ id: r.insertId, usuario, nome }));
});

router.put('/:id', async (req, res) => {
  const id = idValido(req.params.id, 'Usuário');
  const [[u]] = await pool.query('select id, usuario, nome from tb_usuarios where id = ?', [id]);
  if (!u) throw notFound('Usuário');
  if (reservado(u.usuario)) throw invalid('Esse usuário é reservado pelo sistema.');
  const campos = {};
  if (req.body?.nome !== undefined) campos.nome = limpa(req.body.nome, 'o nome', 60);
  if (req.body?.usuario !== undefined && String(req.body.usuario).trim() !== u.usuario) {
    if (String(u.usuario).toUpperCase() === 'SANCHES') throw invalid('O login do administrador não pode ser alterado.');
    const novo = limpa(req.body.usuario, 'o usuário (login)', 30);
    if (/\s/.test(novo) || reservado(novo)) throw invalid('Login inválido.');
    const [[e]] = await pool.query('select id from tb_usuarios where lower(usuario) = lower(?) and id <> ? limit 1', [novo, id]);
    if (e) throw invalid('Já existe um usuário com esse login.');
    campos.usuario = novo;
  }
  if (req.body?.senha) { if (String(req.body.senha).length < 4) throw invalid('A senha precisa ter ao menos 4 caracteres.'); campos.senha = hashSenha(String(req.body.senha)); }
  if (!Object.keys(campos).length) throw invalid('Nada para gravar.');
  await pool.query('update tb_usuarios set ? where id = ?', [campos, id]);
  res.json({ ...pub({ ...u, ...campos }), senhaRedefinida: Boolean(campos.senha) });
});

router.delete('/:id', async (req, res) => {
  const id = idValido(req.params.id, 'Usuário');
  const [[u]] = await pool.query('select id, usuario from tb_usuarios where id = ?', [id]);
  if (!u) throw notFound('Usuário');
  if (reservado(u.usuario) || String(u.usuario).toUpperCase() === 'SANCHES') throw invalid('Esse usuário não pode ser excluído.');
  if (id === req.user?.id) throw invalid('Você não pode excluir o próprio usuário.');
  try { await pool.query('delete from tb_usuarios where id = ?', [id]); } catch (e) { throw emUso(e, 'Usuário'); }
  res.json({ ok: true });
});
export default router;
