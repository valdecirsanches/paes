// Senha de acesso da Fábrica ao Itinerário (definida no Faturamento). Em tb_config_app: o hash (scrypt com sal), que confere a senha, e uma cópia
// CRIPTOGRAFADA (AES-256-GCM) só para o Faturamento poder rever a senha atual (👁). A chave da cópia NÃO fica no banco: SENHA_CIFRA_CHAVE do .env
// ou o arquivo local .senha-chave (gerado uma vez, modo 600). Sem a chave (ou se ela mudar) a cópia não abre; basta definir a senha de novo.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db.js';

const CHAVE = 'senha_itinerario_fabrica';
const CHAVE_CIFRA = 'senha_itinerario_fabrica_cifrada';
let chaveCache = null;
function chaveCifra() {
  if (chaveCache) return chaveCache;
  let base = process.env.SENHA_CIFRA_CHAVE;
  if (!base) {
    const arq = path.resolve(process.cwd(), '.senha-chave');
    try { base = fs.readFileSync(arq, 'utf8').trim(); } catch { /* ainda não existe */ }
    if (!base || base.length < 32) {
      base = crypto.randomBytes(32).toString('hex');
      try { fs.writeFileSync(arq, base, { mode: 0o600 }); } catch { /* sem permissão: a chave vale só até reiniciar a API */ }
    }
  }
  return (chaveCache = crypto.createHash('sha256').update(base).digest());
}
export function cifra(txt, chave = chaveCifra()) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', chave, iv);
  const d = Buffer.concat([c.update(String(txt), 'utf8'), c.final()]);
  return `v1:${iv.toString('hex')}:${c.getAuthTag().toString('hex')}:${d.toString('hex')}`;
}
export function decifra(guardado, chave = chaveCifra()) {
  try {
    const [v, iv, tag, d] = String(guardado ?? '').split(':');
    if (v !== 'v1' || !iv || !tag || !d) return null;
    const c = crypto.createDecipheriv('aes-256-gcm', chave, Buffer.from(iv, 'hex')); c.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([c.update(Buffer.from(d, 'hex')), c.final()]).toString('utf8');
  } catch { return null; }
}
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
  const up = 'insert into tb_config_app (chave, valor, atualizado_em) values (?, ?, now()) on duplicate key update valor = values(valor), atualizado_em = now()';
  await pool.query(up, [CHAVE, hashNovo(senha)]);
  await pool.query(up, [CHAVE_CIFRA, cifra(senha)]);
}
export async function removeSenha() { await garanteTabela(); await pool.query('delete from tb_config_app where chave in (?, ?)', [CHAVE, CHAVE_CIFRA]); }
/** Senha atual em texto (só para o Faturamento). null = não há cópia legível (senha definida antes desta versão, ou chave trocada): definir de novo. */
export async function verSenha() {
  await garanteTabela();
  const [[r]] = await pool.query('select valor from tb_config_app where chave = ?', [CHAVE_CIFRA]);
  return r?.valor ? decifra(r.valor) : null;
}
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
