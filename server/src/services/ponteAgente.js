import { readFile, writeFile, rename } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

/**
 * Token de pareamento do agente de impressão. O agente (no computador das impressoras) é quem CONECTA ao sistema com este
 * token e busca os trabalhos de impressão (túnel reverso, services/tunelAgente.js); por isso funciona igual com o servidor
 * na mesma rede, em outra rede ou na internet, sem abrir porta nem informar IP.
 * Gravado em arquivo (sem banco); AGENTE_TOKEN do .env vale como padrão quando o arquivo não existe.
 */
const arquivo = () => process.env.AGENTE_PONTE_FILE || path.resolve(process.cwd(), 'agente-ponte.json');
let cache;

async function le() {
  if (cache !== undefined) return cache;
  try { cache = JSON.parse(await readFile(arquivo(), 'utf8')) || {}; } catch { cache = {}; }
  return cache;
}
async function grava(obj) {
  const tmp = `${arquivo()}.tmp`;
  await writeFile(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 }); await rename(tmp, arquivo());
  cache = obj; return obj;
}
/** Token atual; se ainda não existe, gera e grava um (o instalador e a tela o mostram). */
export async function tokenAgente() {
  const a = await le();
  const env = String(process.env.AGENTE_TOKEN || '').trim();
  if (a.token) return a.token;
  if (env.length >= 16) return env;
  return (await grava({ ...a, token: crypto.randomBytes(24).toString('base64url') })).token;
}
/** Gera outro token (o agente conectado com o antigo é desligado e precisa do novo). */
export async function novoTokenAgente() {
  const a = await le();
  return (await grava({ ...a, token: crypto.randomBytes(24).toString('base64url') })).token;
}
export const limpaCachePonte = () => { cache = undefined; };
