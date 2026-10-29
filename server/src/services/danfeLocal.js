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
