import { Router } from 'express';
import { pool } from '../db.js';
import { invalid, notFound } from '../errors.js';
import { AppError } from '../errors.js';
import { garanteTabela, identifica, limpaCache, MENSAGEM } from '../services/dispositivos.js';

// Estado do dispositivo (público: a tela de bloqueio precisa do código antes do login).
export const publica = Router();
publica.get('/', async (req, res) => {
  try {
    const d = await identifica(req, res);
    res.json({ codigo: d.codigo, habilitado: d.habilitado, exigido: d.exigido, message: d.habilitado ? '' : MENSAGEM });
  } catch (e) { res.json({ codigo: '', habilitado: true, exigido: false, message: '', erro: e.message }); }
});

// Administração (só o administrador).
const admin = Router();
admin.use((req, _res, next) => (String(req.user?.usuario ?? '').toUpperCase() === 'SANCHES' ? next() : next(new AppError(403, 'Só o administrador gerencia os dispositivos.'))));
admin.get('/', async (req, res) => {
  const erro = await garanteTabela();
  if (erro) throw new AppError(500, `Não consegui criar/ler a tabela tb_dispositivos: ${erro.message}`);
  const [rows] = await pool.query('select id, codigo, descricao, ativo, criado_em, ultimo_acesso, ultimo_ip, navegador, ultimo_usuario from tb_dispositivos order by ativo desc, ultimo_acesso desc');
  res.json({ meu: req.dispositivo ?? null, itens: rows.map((r) => ({ ...r, ativo: Boolean(r.ativo) })) });
});
admin.put('/:id', async (req, res) => {
  const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) throw invalid('Dispositivo inválido.');
  const set = {};
  if ('ativo' in (req.body ?? {})) set.ativo = req.body.ativo ? 1 : 0;
  if ('descricao' in (req.body ?? {})) set.descricao = String(req.body.descricao ?? '').trim().slice(0, 80);
  if (!Object.keys(set).length) throw invalid('Nada para alterar.');
  const [r] = await pool.query('update tb_dispositivos set ? where id = ?', [set, id]);
  if (!r.affectedRows) throw notFound('Dispositivo');
  limpaCache();
  res.json({ ok: true });
});
admin.delete('/:id', async (req, res) => {
  const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) throw invalid('Dispositivo inválido.');
  const [r] = await pool.query('delete from tb_dispositivos where id = ?', [id]);
  if (!r.affectedRows) throw notFound('Dispositivo');
  limpaCache();
  res.json({ ok: true });
});
export default admin;
