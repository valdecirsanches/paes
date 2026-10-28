import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Guarda localmente só o que o app precisa para falar com o agente A3: o id do certificado na API (certificadoId).
 * NUNCA grava o tokenAgente (devolvido uma única vez, a API guarda só o hash) nem PIN.
 */
const arquivo = () => process.env.NFE_A3_FILE || path.resolve(process.cwd(), 'nfe-a3.json');
let cache;

export async function lerA3() {
  if (cache !== undefined) return cache;
  try { cache = JSON.parse(await readFile(arquivo(), 'utf8')); } catch { cache = {}; }
  return cache;
}
export async function gravarA3(dados) {
  cache = { ...(await lerA3()), ...dados };
  await writeFile(arquivo(), JSON.stringify(cache, null, 2));
  return cache;
}
export async function limparA3() { cache = {}; await writeFile(arquivo(), '{}'); }
export const limpaCacheA3 = () => { cache = undefined; };
