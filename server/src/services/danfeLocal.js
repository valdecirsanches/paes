// DANFE gerado localmente a partir do XML autorizado (plano B quando a API/disco não entregam o PDF).
import { writeFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** XML (Buffer/string) → PDF (Buffer). `logo` é um Buffer opcional; `cancelada` marca a nota como cancelada. */
export async function danfeDoXml(xml, { logo = null, cancelada = false } = {}) {
  const txt = Buffer.isBuffer(xml) ? xml.toString('utf8') : String(xml ?? '');
  if (!/<(nfeProc|NFe)[\s>]/.test(txt)) throw new Error('XML inválido: não é uma NF-e.');
  const { gerarPDF } = await import('@alexssmusica/node-pdf-nfe');
  let dir = null; const opts = { cancelada: !!cancelada };
  try {
    if (logo?.length) { dir = await mkdtemp(path.join(tmpdir(), 'danfe-')); const p = path.join(dir, 'logo.png'); await writeFile(p, logo); opts.pathLogo = p; }
    const doc = await gerarPDF(txt, opts);
    const chunks = [];
    await new Promise((ok, ko) => { doc.on('data', (c) => chunks.push(c)); doc.on('end', ok); doc.on('error', ko); if (typeof doc.end === 'function' && !doc._ended) { /* stream já finalizada pela lib */ } });
    const buf = Buffer.concat(chunks);
    if (!buf.length) throw new Error('Falha ao gerar o PDF.');
    return buf;
  } finally { if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

/** Procura o XML da nota nas pastas locais (NFE_XML_DIR e pasta da API) pela chave ou pelo nome do arquivo gravado no banco. */
export async function achaXmlLocal({ chave, arquivoBanco, bases, limite = 20000 }) {
  const { readdir, readFile } = await import('node:fs/promises');
  const k = String(chave ?? '').replace(/\D/g, '');
  const nomeBanco = String(arquivoBanco ?? '').split(/[\\/]/).pop().toLowerCase();
  if (!k && !nomeBanco) return null;
  let visitados = 0;
  async function anda(dir, prof) {
    if (prof > 6 || visitados > limite) return null;
    let ents; try { ents = await readdir(dir, { withFileTypes: true }); } catch { return null; }
    for (const e of ents) {
      visitados += 1;
      const n = e.name.toLowerCase();
      if (e.isFile() && n.endsWith('.xml') && ((k && n.includes(k)) || (nomeBanco && n === nomeBanco))) {
        try { return await readFile(path.join(dir, e.name)); } catch { /* segue */ }
      }
    }
    for (const e of ents) if (e.isDirectory()) { const r = await anda(path.join(dir, e.name), prof + 1); if (r) return r; }
    return null;
  }
  for (const b of bases.filter(Boolean)) { const r = await anda(b, 0); if (r) return r; }
  return null;
}
