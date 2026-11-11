import { existsSync } from 'node:fs';
import { copyFile, mkdir, rename, rmdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { paraLocal } from './caminhosNfe.js';

/** Pasta por dia (…/NFe/11112026/NFe/<chave>-nfe.xml) → pasta por mês (…/NFe/202611/NFe/…). Devolve null se o caminho não está no padrão de dia. */
export function pastaDiaParaMes(valor) {
  const v = String(valor ?? '').trim(); if (!v) return null;
  const sep = v.includes('\\') && !v.includes('/') ? '\\' : '/';
  const n = v.replaceAll('\\', '/');
  const m = /^(.*\/NFe\/)(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(20\d{2}|19\d{2})(\/NFe\/[^/]+-nfe\.xml)$/i.exec(n);
  if (!m) return null;
  const novo = `${m[1]}${m[4]}${m[3]}${m[5]}`;
  return sep === '\\' ? novo.replaceAll('/', '\\') : novo;
}

async function move(de, para) {
  await mkdir(path.dirname(para), { recursive: true });
  try { await rename(de, para); } catch (e) { if (e.code !== 'EXDEV') throw e; await copyFile(de, para); await unlink(de); }
  await rmdir(path.dirname(path.dirname(de))).catch(() => {}); // pastas do dia que ficaram vazias (a do "NFe" interno e a do dia)
  await rmdir(path.dirname(de)).catch(() => {});
}

/**
 * Corrige XML gravado em pasta com dia: move o arquivo para a pasta do mês e atualiza o caminho em tb_nfe (campo do sistema antigo e do app).
 * Só mexe em arquivos que ESTE servidor enxerga; os que estão só no N: da máquina do cliente ficam como estão (contados em `invisiveis`).
 */
export async function migraPastasXml(db, { executar = false } = {}) {
  const [rows] = await db.query("select id, nfe_numero, nfe_xml_file, nfe_xml_app from tb_nfe where nfe_xml_file like '%NFe%NFe%' or nfe_xml_app like '%NFe%NFe%'");
  const r = { examinadas: rows.length, aMover: 0, movidos: 0, soBanco: 0, invisiveis: 0, erros: [], exemplos: [] };
  for (const n of rows) {
    const upd = {};
    for (const campo of ['nfe_xml_file', 'nfe_xml_app']) {
      const novo = pastaDiaParaMes(n[campo]); if (!novo) continue;
      const de = paraLocal(n[campo]); const para = paraLocal(novo);
      try {
        if (existsSync(de) && !existsSync(para)) { r.aMover++; if (executar) { await move(de, para); r.movidos++; upd[campo] = novo; } }
        else if (existsSync(para)) { r.soBanco++; if (executar) upd[campo] = novo; if (existsSync(de) && executar) await unlink(de).catch(() => {}); } // já está na pasta do mês: só acerta o banco
        else { r.invisiveis++; continue; }
        if (r.exemplos.length < 5) r.exemplos.push({ nota: n.nfe_numero, de: n[campo], para: novo });
      } catch (e) { r.erros.push(`NF ${n.nfe_numero}: ${e.message}`); }
    }
    if (executar && Object.keys(upd).length) await db.query('update tb_nfe set ? where id = ?', [upd, n.id]);
  }
  return r;
}
