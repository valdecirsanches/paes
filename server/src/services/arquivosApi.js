// Procura XML/DANFE na pasta onde a própria API de NF-e guarda os arquivos:
//   <NFE_ARQUIVOS_DIR>/<cnpj>/NFe/<data da autorização>/<NFe ou Evento>/<arquivo>
// Ex.: /mnt/hdbackup/API/levpao/arquivos/nfe/EDSMonitorPLUS/Arqs/03707154000106/NFe/2026-10-28/NFe/<chave>-procNFe.xml
// O formato da pasta de data e o nome do arquivo não são fixos: tenta os formatos mais comuns e, se não achar, varre.
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const ARQUIVOS_DIR_PADRAO = '/mnt/hdbackup/API/levpao/arquivos/nfe/EDSMonitorPLUS/Arqs';
export const baseArquivos = () => (process.env.NFE_ARQUIVOS_DIR || ARQUIVOS_DIR_PADRAO).replace(/[\\/]+$/, '');

const so = (s) => String(s ?? '').replace(/\D/g, '');
const p2 = (n) => String(n).padStart(2, '0');

/** Data (Date ou texto aaaa-mm-dd[ hh:mm] / dd/mm/aaaa) → {a, m, d} ou null. */
export function partesData(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : { a: String(v.getFullYear()), m: p2(v.getMonth() + 1), d: p2(v.getDate()) };
  const t = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t); if (m) return { a: m[1], m: m[2], d: m[3] };
  m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t); if (m) return { a: m[3], m: m[2], d: m[1] };
  m = /^(\d{4})(\d{2})(\d{2})/.exec(t); if (m) return { a: m[1], m: m[2], d: m[3] };
  return null;
}
/** Nomes possíveis da pasta de data (e subcaminhos aaaa/mm/dd) para uma data. */
export function nomesPastaData({ a, m, d }) {
  return [`${a}-${m}-${d}`, `${a}${m}${d}`, `${d}-${m}-${a}`, `${d}${m}${a}`, `${d}.${m}.${a}`, `${a}.${m}.${d}`, `${a}_${m}_${d}`, `${d}_${m}_${a}`,
    `${a}/${m}/${d}`, `${a}${m}/${d}`, `${a}-${m}/${d}`, `${a}/${m}-${d}`, `${a}-${m}`, `${a}${m}`];
}

const ehDir = async (p) => { try { return (await stat(p)).isDirectory(); } catch { return false; } };
async function lista(p) { try { return await readdir(p, { withFileTypes: true }); } catch { return []; } }

/** Varre `dir` (até `prof` níveis) e devolve arquivos com a extensão, ignorando pastas de evento quando `semEventos`. */
async function varre(dir, exts, prof, limite = { n: 4000 }) {
  const achados = [];
  for (const e of await lista(dir)) {
    if (limite.n-- <= 0) break;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { if (prof > 0) achados.push(...await varre(f, exts, prof - 1, limite)); }
    else if (exts.includes(path.extname(e.name).toLowerCase())) achados.push(f);
  }
  return achados;
}

const ehEvento = (f) => /(^|[\\/])(evento|eventos|event|events)([\\/]|$)/i.test(f) || /(canc|cce|evento|-ret|-env|-ped|-sit)/i.test(path.basename(f));

/**
 * Acha o arquivo da nota na pasta da API.
 * @param {{chave:string, cnpj:string, datas:any[], tipo:'xml'|'pdf'}} q  datas = datas prováveis da autorização/emissão
 * @returns {{arquivo:string|null, tentou:string[], motivo?:string}}
 */
export async function acharArquivoNota({ chave, cnpj, datas = [], tipo = 'xml' }) {
  const ch = so(chave); const cn = so(cnpj);
  const tentou = [];
  const exts = tipo === 'pdf' ? ['.pdf'] : ['.xml'];
  if (ch.length !== 44) return { arquivo: null, tentou, motivo: 'Nota sem chave de acesso.' };
  const raizCnpj = path.join(baseArquivos(), cn);
  if (!(await ehDir(raizCnpj))) return { arquivo: null, tentou: [raizCnpj], motivo: `Pasta não encontrada: ${raizCnpj} (o servidor do app enxerga ${baseArquivos()}? Defina NFE_ARQUIVOS_DIR no .env).` };
  // a pasta "NFe" pode vir com outra caixa
  const sub = (await lista(raizCnpj)).find((e) => e.isDirectory() && e.name.toLowerCase() === 'nfe');
  const raiz = sub ? path.join(raizCnpj, sub.name) : raizCnpj;
  tentou.push(raiz);

  const decide = async (cands) => {
    const meus = cands.filter((f) => path.basename(f).replace(/\D/g, '').includes(ch) || path.basename(f).includes(ch));
    const nota = meus.filter((f) => !ehEvento(f));
    if (nota.length) {
      // prefere o arquivo "procNFe" (nota + protocolo), depois o mais novo/maior nome
      nota.sort((x, y) => Number(/proc/i.test(path.basename(y))) - Number(/proc/i.test(path.basename(x))) || x.length - y.length);
      return nota[0];
    }
    return null;
  };
  // 1) pastas de data prováveis
  const vistas = new Set();
  for (const dt of datas.map(partesData).filter(Boolean)) {
    for (const nome of nomesPastaData(dt)) {
      const dir = path.join(raiz, nome);
      if (vistas.has(dir)) continue; vistas.add(dir);
      if (!(await ehDir(dir))) continue;
      tentou.push(dir);
      const f = await decide(await varre(dir, exts, 3));
      if (f) return { arquivo: f, tentou };
    }
  }
  // 2) varre a pasta da nota inteira procurando pela chave no nome (mais lento)
  const f = await decide(await varre(raiz, exts, 4, { n: 60000 }));
  if (f) return { arquivo: f, tentou: [...tentou, `varredura de ${raiz}`] };
  return { arquivo: null, tentou: [...tentou, `varredura de ${raiz}`], motivo: `Nenhum ${tipo.toUpperCase()} com a chave ${ch} em ${raiz}.` };
}

/** Lê o arquivo achado (para XML, confere que é a nota e não um evento). */
export async function lerArquivoNota(q) {
  const r = await acharArquivoNota(q);
  if (!r.arquivo) return { ...r, buffer: null };
  const buffer = await readFile(r.arquivo);
  return { ...r, buffer };
}
