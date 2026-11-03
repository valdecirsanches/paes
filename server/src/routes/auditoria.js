import { Router } from 'express';
import { pool } from '../db.js';
import { AppError, invalid } from '../errors.js';
import { isIsoDate } from '../rules.js';
import { garanteTabela, registra, ipDe } from '../services/auditoria.js';

// Consulta da trilha de auditoria (só o administrador) e entrada de eventos que acontecem só no navegador (impressão direta, N:…).
const router = Router();
const ehAdmin = (req) => String(req.user?.usuario ?? '').toUpperCase() === 'SANCHES';
const soAdmin = (req, _res, next) => (ehAdmin(req) ? next() : next(new AppError(403, 'Só o administrador consulta a auditoria.')));

/** Eventos do navegador: o cliente informa o que fez (ex.: "imprimiu DANFE no agente"). Usuário/IP/dispositivo vêm da sessão, não do corpo. */
router.post('/evento', async (req, res) => {
  const acao = String(req.body?.acao ?? '').trim().slice(0, 120);
  if (!acao) throw invalid('Informe a ação.');
  await registra({
    idUsuario: req.user?.id, usuario: req.user?.usuario ?? '', dispositivo: req.dispositivo ?? '', ip: ipDe(req), metodo: 'APP', rota: String(req.body?.tela ?? '').slice(0, 255),
    entidade: String(req.body?.entidade ?? 'app').slice(0, 40), acao, idRegistro: String(req.body?.idRegistro ?? '').slice(0, 40), status: req.body?.ok === false ? 499 : 200,
    erro: req.body?.ok === false ? String(req.body?.erro ?? '') : '', detalhes: req.body?.detalhes ?? null, origem: 'navegador',
  });
  res.status(201).json({ ok: true });
});

function filtros(q) {
  const onde = []; const args = [];
  if (q.de) { if (!isIsoDate(q.de)) throw invalid('Data inicial inválida.'); onde.push('data_hora >= ?'); args.push(`${q.de} 00:00:00`); }
  if (q.ate) { if (!isIsoDate(q.ate)) throw invalid('Data final inválida.'); onde.push('data_hora <= ?'); args.push(`${q.ate} 23:59:59`); }
  if (q.usuario) { onde.push('usuario = ?'); args.push(String(q.usuario).slice(0, 60)); }
  if (q.entidade) { onde.push('entidade = ?'); args.push(String(q.entidade).slice(0, 40)); }
  if (q.metodo) { onde.push('metodo = ?'); args.push(String(q.metodo).slice(0, 8).toUpperCase()); }
  if (q.idRegistro) { onde.push('id_registro = ?'); args.push(String(q.idRegistro).slice(0, 40)); }
  if (q.dispositivo) { onde.push('dispositivo = ?'); args.push(String(q.dispositivo).slice(0, 40)); }
  if (q.erros === '1') onde.push('status >= 400');
  if (q.q) { onde.push('(rota like ? or acao like ? or detalhes like ? or erro like ?)'); const l = `%${String(q.q).slice(0, 80).replace(/[%_\\]/g, '\\$&')}%`; args.push(l, l, l, l); }
  return { sql: onde.length ? `where ${onde.join(' and ')}` : '', args };
}
const COLS = 'id, data_hora, id_usuario, usuario, dispositivo, ip, metodo, rota, entidade, acao, id_registro, status, duracao_ms, erro, origem';

router.get('/', soAdmin, async (req, res) => {
  await garanteTabela();
  const { sql, args } = filtros(req.query);
  const limite = Math.min(Math.max(Number(req.query.limite) || 200, 1), 1000); const desloc = Math.max(Number(req.query.desloc) || 0, 0);
  const [linhas] = await pool.query(`select ${COLS} from tb_auditoria ${sql} order by id desc limit ${limite} offset ${desloc}`, args);
  const [[{ total }]] = await pool.query(`select count(*) as total from tb_auditoria ${sql}`, args);
  const [usuarios] = await pool.query("select distinct usuario from tb_auditoria where usuario <> '' order by usuario limit 200");
  const [entidades] = await pool.query("select distinct entidade from tb_auditoria where entidade <> '' order by entidade limit 100");
  res.json({ total, linhas, usuarios: usuarios.map((u) => u.usuario), entidades: entidades.map((e) => e.entidade) });
});
router.get('/export.csv', soAdmin, async (req, res) => {
  await garanteTabela();
  const { sql, args } = filtros(req.query);
  const [l] = await pool.query(`select ${COLS}, detalhes from tb_auditoria ${sql} order by id desc limit 50000`, args);
  const cel = (v) => { const t = String(v ?? '').replace(/"/g, '""'); return /^[=+\-@]/.test(t) ? `"'${t}"` : `"${t}"`; }; // evita fórmula no Excel
  const cab = ['id', 'data_hora', 'usuario', 'dispositivo', 'ip', 'metodo', 'rota', 'entidade', 'acao', 'id_registro', 'status', 'duracao_ms', 'erro', 'origem', 'detalhes'];
  const csv = [cab.join(';'), ...l.map((r) => cab.map((c) => cel(r[c])).join(';'))].join('\r\n');
  res.type('text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="auditoria.csv"').send(`﻿${csv}`);
});
router.get('/:id', soAdmin, async (req, res) => {
  await garanteTabela();
  const [[r]] = await pool.query('select * from tb_auditoria where id = ?', [Number(req.params.id) || 0]);
  if (!r) throw new AppError(404, 'Registro não encontrado.');
  res.json(r);
});
export default router;
