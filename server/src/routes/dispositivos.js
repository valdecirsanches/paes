import { Router } from 'express';
import { pool } from '../db.js';
import { invalid, notFound } from '../errors.js';
import { AppError } from '../errors.js';
import { garanteTabela, identifica, limpaCache, MENSAGEM, parseAreas } from '../services/dispositivos.js';

// Estado do dispositivo (público: a tela de bloqueio precisa do código antes do login).
export const publica = Router();
publica.get('/', async (req, res) => {
  try {
    const d = await identifica(req, res);
    res.json({ codigo: d.codigo, habilitado: d.habilitado, exigido: d.exigido, areas: d.areas ?? [], fabrica: Boolean(d.fabricaSemLogin), message: d.habilitado ? '' : MENSAGEM });
  } catch (e) { res.json({ codigo: '', habilitado: true, exigido: false, message: '', erro: e.message }); }
});

// Administração (só o administrador).
const admin = Router();
admin.use((req, _res, next) => (String(req.user?.usuario ?? '').toUpperCase() === 'SANCHES' ? next() : next(new AppError(403, 'Só o administrador gerencia os dispositivos.'))));
admin.get('/', async (req, res) => {
  const erro = await garanteTabela();
  if (erro) throw new AppError(500, `Não consegui criar/ler a tabela tb_dispositivos: ${erro.message}`);
  const [rows] = await pool.query('select id, codigo, descricao, ativo, criado_em, ultimo_acesso, ultimo_ip, navegador, ultimo_usuario, areas from tb_dispositivos order by ativo desc, ultimo_acesso desc');
  res.json({ meu: req.dispositivo ?? null, itens: rows.map((r) => ({ ...r, ativo: Boolean(r.ativo), areas: parseAreas(r.areas) })) });
});
admin.put('/:id', async (req, res) => {
  const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) throw invalid('Dispositivo inválido.');
  const set = {};
  if ('ativo' in (req.body ?? {})) set.ativo = req.body.ativo ? 1 : 0;
  if ('descricao' in (req.body ?? {})) set.descricao = String(req.body.descricao ?? '').trim().slice(0, 80);
  if ('areas' in (req.body ?? {})) {
    const a = parseAreas(req.body.areas);
    const [[d]] = await pool.query('select codigo from tb_dispositivos where id = ?', [id]);
    if (d && d.codigo === req.dispositivo && !a.includes('faturamento')) throw invalid('Não tire o acesso ao faturamento do dispositivo que você está usando: você se trancaria fora.');
    set.areas = a.join(',');
  }
  if (!Object.keys(set).length) throw invalid('Nada para alterar.');
  const [r] = await pool.query('update tb_dispositivos set ? where id = ?', [set, id]);
  if (!r.affectedRows) throw notFound('Dispositivo');
  limpaCache();
  res.json({ ok: true });
});
// Passa a liberação de um dispositivo antigo (número perdido) para este (novo número): copia habilitado, áreas e descrição e apaga o antigo.
admin.post('/:id/assume', async (req, res) => {
  const id = Number(req.params.id); const origem = Number(req.body?.origem);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(origem) || origem <= 0 || id === origem) throw invalid('Dispositivos inválidos.');
  const [[velho]] = await pool.query('select descricao, ativo, areas from tb_dispositivos where id = ?', [origem]);
  const [[novo]] = await pool.query('select id from tb_dispositivos where id = ?', [id]);
  if (!velho || !novo) throw notFound('Dispositivo');
  await pool.query('update tb_dispositivos set descricao = ?, ativo = ?, areas = ? where id = ?', [velho.descricao, velho.ativo, velho.areas, id]);
  await pool.query('delete from tb_dispositivos where id = ?', [origem]);
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
