import { Router } from 'express';
import { pool } from '../db.js';
import { invalid } from '../errors.js';
import { bloqueado, criaToken, gravaCookie, hashSenha, limpaFalhas, registraFalha } from '../services/auth.js';

// Login (u_acesso): usuário + senha conferidos em tb_usuarios (senha = PASSWORD() do MySQL, calculada aqui).
const router = Router();
const publico = (u) => ({ id: u.id, usuario: u.usuario, nome: u.nome, admin: String(u.usuario).toUpperCase() === 'SANCHES' });
const texto = (v, rot, vazio = false) => {
  if (typeof v !== 'string' || (!v.length && !vazio)) throw invalid(`Informe ${rot}.`);
  if (v.length > 100) throw invalid(`${rot[0].toUpperCase()}${rot.slice(1)} muito longo.`);
  return v;
};

router.post('/login', async (req, res) => {
  const usuario = texto(req.body?.usuario, 'o usuário');
  const senha = texto(req.body?.senha, 'a senha', true);
  const chave = `${req.ip}|${usuario.toLowerCase()}`;
  const espera = bloqueado(chave);
  if (espera) return res.status(429).json({ message: `Muitas tentativas. Aguarde ${espera}s e tente de novo.` });
  const [[u]] = await pool.query('select id, usuario, nome from tb_usuarios where usuario = ? and senha = ? limit 1', [usuario, hashSenha(senha)]);
  if (!u) {
    registraFalha(chave);
    return res.status(401).json({ message: 'Usuário ou senha inválido.' });
  }
  limpaFalhas(chave);
  gravaCookie(res, req, criaToken(u));
  res.json(publico(u));
});

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ message: 'Sem sessão.', login: true });
  res.json(publico(req.user));
});

router.post('/logout', (req, res) => { gravaCookie(res, req, null); res.json({ ok: true }); });

// Usuário > Alterar senha (u_altera_senha não foi enviado: regra mínima padrão).
router.post('/senha', async (req, res) => {
  if (!req.user) return res.status(401).json({ message: 'Sem sessão.', login: true });
  const atual = texto(req.body?.atual, 'a senha atual', true);
  const nova = texto(req.body?.nova, 'a nova senha');
  if (nova !== req.body?.confirma) throw invalid('A confirmação não confere com a nova senha.');
  const chave = `${req.ip}|senha|${req.user.id}`;
  const espera = bloqueado(chave);
  if (espera) return res.status(429).json({ message: `Muitas tentativas. Aguarde ${espera}s.` });
  const [[u]] = await pool.query('select id from tb_usuarios where id = ? and senha = ?', [req.user.id, hashSenha(atual)]);
  if (!u) { registraFalha(chave); return res.status(401).json({ message: 'Senha atual incorreta.' }); }
  limpaFalhas(chave);
  await pool.query('update tb_usuarios set senha = ? where id = ?', [hashSenha(nova), req.user.id]);
  res.json({ ok: true });
});

export default router;
