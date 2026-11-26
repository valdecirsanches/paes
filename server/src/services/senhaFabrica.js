// Senha de acesso da Fábrica ao Itinerário (definida no Faturamento). Guardada só como hash (scrypt com sal) em tb_config_app.
import crypto from 'node:crypto';
import { pool } from '../db.js';

const CHAVE = 'senha_itinerario_fabrica';
let pronta = null;
const garanteTabela = () => (pronta ??= pool.query('create table if not exists tb_config_app (chave varchar(60) primary key, valor text null, atualizado_em datetime null)').catch((e) => { pronta = null; throw e; }));

export const hashNovo = (senha, sal = crypto.randomBytes(16).toString('hex')) => `${sal}:${crypto.scryptSync(String(senha), sal, 32).toString('hex')}`;
export function confereHash(senha, guardado) {
  const [sal, h] = String(guardado ?? '').split(':');
  if (!sal || !h) return false;
  const a = Buffer.from(crypto.scryptSync(String(senha), sal, 32).toString('hex')); const b = Buffer.from(h);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export async function temSenha() {
  await garanteTabela();
  const [[r]] = await pool.query('select valor from tb_config_app where chave = ?', [CHAVE]);
  return Boolean(r?.valor);
}
export async function defineSenha(senha) {
  await garanteTabela();
  await pool.query('insert into tb_config_app (chave, valor, atualizado_em) values (?, ?, now()) on duplicate key update valor = values(valor), atualizado_em = now()', [CHAVE, hashNovo(senha)]);
}
export async function removeSenha() { await garanteTabela(); await pool.query('delete from tb_config_app where chave = ?', [CHAVE]); }
export async function confereSenha(senha) {
  await garanteTabela();
  const [[r]] = await pool.query('select valor from tb_config_app where chave = ?', [CHAVE]);
  return Boolean(r?.valor) && confereHash(senha, r.valor);
}

// freio de tentativas (por IP): 5 erradas bloqueiam por 1 minuto
const falhas = new Map();
export function freio(ip) { const f = falhas.get(ip); return f && f.ate > Date.now() ? Math.ceil((f.ate - Date.now()) / 1000) : 0; }
export function erro(ip) { const f = falhas.get(ip) ?? { n: 0, ate: 0 }; f.n += 1; if (f.n >= 5) { f.ate = Date.now() + 60000; f.n = 0; } falhas.set(ip, f); if (falhas.size > 1000) falhas.clear(); }
export const acerto = (ip) => falhas.delete(ip);
