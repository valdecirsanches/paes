import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

/**
 * Endereço (IP:porta) e token do agente de impressão que o SERVIDOR usa para imprimir (servidor Linux → Windows).
 * Gravado em arquivo (sem banco), pela tela Ferramentas › Configurar impressoras; AGENTE_URL/AGENTE_TOKEN do .env
 * continuam valendo como padrão quando o arquivo não existe.
 */
const arquivo = () => process.env.AGENTE_PONTE_FILE || path.resolve(process.cwd(), 'agente-ponte.json');
let cache;

/** "192.168.15.8", "192.168.15.8:9101" ou "http://host:9101/" → "http://192.168.15.8:9101" (porta padrão 9101). */
export function normalizaUrl(v) {
  let t = String(v ?? '').trim().replace(/\/+$/, '');
  if (!t) return '';
  if (!/^https?:\/\//i.test(t)) t = `http://${t}`;
  let u; try { u = new URL(t); } catch { throw new Error('Endereço inválido. Use o formato IP:porta (ex.: 192.168.15.8:9101).'); }
  if (!/^[A-Za-z0-9.-]+$/.test(u.hostname)) throw new Error('Endereço inválido. Use o formato IP:porta (ex.: 192.168.15.8:9101).');
  return `${u.protocol}//${u.hostname}:${u.port || '9101'}`;
}
async function le() {
  if (cache !== undefined) return cache;
  try { cache = JSON.parse(await readFile(arquivo(), 'utf8')) || {}; } catch { cache = {}; }
  return cache;
}
/** Config efetiva: arquivo > .env. */
export async function configPonte() {
  const a = await le();
  const url = a.url || String(process.env.AGENTE_URL || '').trim().replace(/\/+$/, '');
  const token = a.token || String(process.env.AGENTE_TOKEN || '').trim();
  return { url, token, origem: a.url || a.token ? 'arquivo' : (url || token ? 'env' : 'nenhuma') };
}
/** Grava; `token` vazio/undefined mantém o atual (como a senha de e-mail). */
export async function gravaPonte({ url, token }) {
  const atual = { ...(await le()) };
  if (url !== undefined) atual.url = normalizaUrl(url);
  if (typeof token === 'string' && token.trim()) {
    if (token.trim().length < 16) throw new Error('O token deve ter ao menos 16 caracteres (copie o que aparece na página do agente).');
    atual.token = token.trim();
  }
  if (!atual.url) delete atual.url;
  const tmp = `${arquivo()}.tmp`;
  await writeFile(tmp, JSON.stringify(atual, null, 2), { mode: 0o600 }); await rename(tmp, arquivo());
  cache = atual; return atual;
}
export const limpaCachePonte = () => { cache = undefined; };
