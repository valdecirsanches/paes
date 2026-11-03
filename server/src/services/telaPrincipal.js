import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

// Imagem da tela principal escolhida pelo administrador (vale para todos). Fica em arquivo, sem mexer no banco.
const dir = () => process.env.NFE_DANFE_DIR || process.cwd();
const arqImg = () => path.join(dir(), 'tela-principal.bin');
const arqMeta = () => path.join(dir(), 'tela-principal.json');
export const MAX_BYTES = 4 * 1024 * 1024;

/** Tipo da imagem pelos primeiros bytes (não confia na extensão): png, jpeg ou webp; senão null. */
export function tipoImagem(b) {
  if (!Buffer.isBuffer(b) || b.length < 12) return null;
  if (b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}
export async function lerMeta() { try { return JSON.parse(await readFile(arqMeta(), 'utf8')); } catch { return null; } }
export async function lerImagem() { try { return await readFile(arqImg()); } catch { return null; } }
export async function gravarImagem(buffer, nome, tipo) {
  await writeFile(arqImg(), buffer);
  const meta = { nome: String(nome ?? '').slice(0, 120), tipo, bytes: buffer.length, versao: Date.now() };
  await writeFile(arqMeta(), JSON.stringify(meta));
  return meta;
}
export async function removerImagem() { await rm(arqImg(), { force: true }); await rm(arqMeta(), { force: true }); }
