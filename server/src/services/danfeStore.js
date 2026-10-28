import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

/**
 * Preferências do DANFE guardadas em arquivo (sem alterar o banco): orientação (retrato/paisagem) e o logo da empresa.
 * O logo é enviado à API de NF-e (a API o aplica no DANFE); aqui fica a cópia para reenviar/mostrar.
 */
const dir = () => process.env.NFE_DANFE_DIR || process.cwd();
const arqCfg = () => path.join(dir(), 'nfe-danfe.json');
const arqLogo = () => path.join(dir(), 'nfe-logo.bin');
export const ORIENTACOES = ['retrato', 'paisagem'];

export async function lerDanfeCfg() {
  let c = {};
  try { c = JSON.parse(await readFile(arqCfg(), 'utf8')); } catch { /* ainda não configurado */ }
  return { orientacao: ORIENTACOES.includes(c.orientacao) ? c.orientacao : 'retrato', logoNome: c.logoNome || '', logoTipo: c.logoTipo || '', logoEnviadoEm: c.logoEnviadoEm || null };
}
export async function gravarDanfeCfg(parcial) {
  const novo = { ...(await lerDanfeCfg()), ...parcial };
  await writeFile(arqCfg(), JSON.stringify(novo, null, 2));
  return novo;
}
export async function gravarLogo(buffer, nome, tipo) {
  await writeFile(arqLogo(), buffer);
  return gravarDanfeCfg({ logoNome: nome, logoTipo: tipo, logoEnviadoEm: null });
}
export async function lerLogo() { try { return await readFile(arqLogo()); } catch { return null; } }
export async function removerLogo() {
  await rm(arqLogo(), { force: true });
  return gravarDanfeCfg({ logoNome: '', logoTipo: '', logoEnviadoEm: null });
}
