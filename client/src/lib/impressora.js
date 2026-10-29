// Cliente do agente de impressão local (127.0.0.1:9101) + roteamento por tipo de documento.
import { imprimirHtml } from './print.js';
import { cssAjustes, sincronizaLayout } from './ajustes.js';
import { bitsDeRgba, cupomEscPos, escposImagem, paraBase64, tsplImagem, zplImagem } from './rasterizar.js';

export const AGENTE = 'http://127.0.0.1:9101';
export const CHAVE = 'paes_impressoras';

/** Tipos de documento que podem ser enviados a uma impressora específica. `etiqueta` = tamanho fixo em mm. */
export const DOCS = {
  'etiqueta-item': { rotulo: 'Etiqueta adesiva do ítem (expedição)', etiqueta: true, mm: [62, 45] },
  'etiqueta-validade': { rotulo: 'Etiqueta adesiva de validade', etiqueta: true, mm: [62, 45] },
  'etiqueta-nutricionista': { rotulo: 'Etiquetas de nutricionista', etiqueta: true, mm: [62, 45] },
  // 41 mm = altura da banda do ppAdesivas no Delphi: é o passo real entre etiquetas na impressora de rolo (a página de 45 mm deixava ~10% a mais)
  'etiqueta-mercadorias': { rotulo: 'Etiquetas de mercadorias', etiqueta: true, mm: [62, 41] },
  'etiqueta-carga': { rotulo: 'Etiquetas de carga (expedição)', etiqueta: true, mm: [62, 45] },
  'comanda': { rotulo: 'Comanda e demonstrativo (faturamento)', cupom: true },
  'danfe': { rotulo: 'DANFE (NF-e) — impressão direta', pagina: true, mm: [210, 297] },
  'cupom-expedicao': { rotulo: 'Cupom da expedição (alterações)', cupom: true },
};

const ler = () => { try { return JSON.parse(localStorage.getItem(CHAVE) ?? '{}') || {}; } catch { return {}; } };
export const lerMapa = ler;
/** Este tipo de documento tem uma impressora do agente escolhida nesta estação? */
export const temDestino = (tipo) => Boolean(ler()[tipo]?.destino);
export function gravarMapa(m) { try { localStorage.setItem(CHAVE, JSON.stringify(m)); } catch { /* sem armazenamento: vale só nesta sessão */ } }

/** Como chegamos ao agente: 'local' (127.0.0.1 deste computador) ou 'servidor' (ponte do servidor → agente em outra máquina). */
let via = null;
export const viaAgente = () => via;
const SEM_REDE = Symbol('sem-rede');
async function pedido(base, caminho, opc, cab) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), opc.timeout ?? 4000);
  let r;
  try { r = await fetch(base + caminho, { ...opc, signal: ctl.signal, headers: { ...cab, ...(opc.body ? { 'Content-Type': 'application/json' } : {}) } }); }
  catch (e) { throw Object.assign(new Error('Sem resposta.'), { [SEM_REDE]: true, causa: e }); }
  finally { clearTimeout(t); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || `Agente respondeu ${r.status}.`);
  return d;
}
/** Tenta o agente local; se o navegador não o alcança (ex.: Ubuntu, celular, agente só no Windows do servidor), usa a ponte do servidor. */
async function chama(caminho, opc = {}) {
  let falhaLocal;
  if (via !== 'servidor') {
    try { const d = await pedido(AGENTE, caminho, opc, { 'X-Agente': 'paes' }); via = 'local'; return d; }
    catch (e) { if (!e[SEM_REDE]) throw e; falhaLocal = e; }
  }
  try { const d = await pedido('/api/impressao', caminho, { ...opc, timeout: Math.max(opc.timeout ?? 4000, 6000) }, {}); via = 'servidor'; return d; }
  catch (e) {
    if (via === 'servidor') via = null; // na próxima, tenta o local de novo
    if (e[SEM_REDE]) throw falhaLocal ? new Error('Nenhum agente de impressão respondeu (nem neste computador, nem pelo servidor).') : e;
    throw falhaLocal ? new Error(`${e.message}`) : e;
  }
}
export const statusAgente = async () => { const s = await chama('/status', { timeout: 1500 }); if (!s?.ok) throw new Error('Resposta inesperada.'); return { ...s, via }; };
export const destinosAgente = async () => { const d = await chama('/destinos', { timeout: 1500 }); if (!Array.isArray(d)) throw new Error('Resposta inesperada.'); return d; };
export const testarDestino = (destino) => chama('/testar', { method: 'POST', body: JSON.stringify({ destino }), timeout: 20000 });

/* ---------- HTML → canvas (uma etiqueta = um filho de primeiro nível) ---------- */
const MM = 25.4;
async function imagensEmbutidas(html) {
  const urls = [...new Set([...html.matchAll(/(?:src="|url\()([^")]+)/g)].map((m) => m[1]).filter((u) => !u.startsWith('data:')))];
  let saida = html;
  for (const u of urls) {
    try {
      const b = await (await fetch(u)).blob();
      const d = await new Promise((ok, err) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = err; f.readAsDataURL(b); });
      saida = saida.split(u).join(d);
    } catch { /* imagem indisponível: segue sem ela */ }
  }
  return saida;
}

/** Desenha cada etiqueta (filho direto do corpo) em um canvas de larguraMm × alturaMm a `dpi`. */
export async function htmlParaCanvas(corpo, css, larguraMm, alturaMm, dpi = 203) {
  const raiz = document.createElement('div'); raiz.innerHTML = corpo;
  const ser = new XMLSerializer();
  const partes = [...raiz.children].map((e) => ser.serializeToString(e)); // XMLSerializer gera XHTML válido (<hr/>, <br/>, entidades numéricas); outerHTML gerava <hr> e &nbsp;, que o parser XML rejeita
  const w = Math.round((larguraMm / MM) * dpi); const h = Math.round((alturaMm / MM) * dpi);
  const k = dpi / 96; // CSS usa 96 px por polegada
  const estilo = css.replace(/@page\s*\{[^}]*\}/g, '').replace(/(^|\})\s*body\s*\{/g, '$1.paes-raiz{');
  const out = [];
  for (const parte of partes.length ? partes : [corpo]) {
    const xhtml = new XMLSerializer().serializeToString(new DOMParser().parseFromString(`<div xmlns="http://www.w3.org/1999/xhtml" class="paes-raiz" style="width:${larguraMm}mm;height:${alturaMm}mm;background:#fff;font-family:Arial">${parte}</div>`, 'application/xhtml+xml').documentElement);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="${(w / k)}" height="${(h / k)}" transform="scale(${k})"><style>*{box-sizing:border-box}${estilo.replace(/</g, '\\3c ')}</style>${await imagensEmbutidas(xhtml)}</foreignObject></svg>`;
    const img = new Image();
    await new Promise((ok, err) => { img.onload = ok; img.onerror = () => err(new Error('Não foi possível desenhar a etiqueta.')); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; });
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0);
    out.push(c);
  }
  return out;
}
const pngB64 = (c) => c.toDataURL('image/png').split(',')[1];

/** Cupom de texto (comanda/demonstrativo) desenhado como UMA imagem contínua, para destinos que não são ESC/POS (ex.: driver do Windows). */
export function cupomComoImagem(linhas, lmm) {
  const colunas = 60; // a maior linha condensada tem 59 colunas
  const cPt = Math.max(5, Math.min(9, (((lmm - 6) / colunas) / 0.6) / 0.3528)); // Courier: cada coluna = 0,6 em
  const pt = { c: cPt, n: cPt * 1.25, g: cPt * 1.5 };
  const L = linhas.map((l) => { const o = typeof l === 'object' && l ? l : { e: 'n', t: String(l ?? '') }; return { e: pt[o.e] ? o.e : 'n', t: o.t }; });
  const mmLinha = (e) => pt[e] * 0.3528 * 1.2;
  const altura = Math.min(600, Math.ceil(L.reduce((n, l) => n + mmLinha(l.e), 0) + 10));
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const corpo = `<div>${L.map((l) => `<div class="${l.e}">${esc(l.t) || ' '}</div>`).join('')}</div>`; // linha vazia = espaço (white-space:pre mantém a altura); &nbsp; quebraria o parser XML
  const css = `body{font-family:"Courier New",monospace;font-weight:bold;padding:3mm}.g{font-size:${pt.g}pt;white-space:pre}.n{font-size:${pt.n}pt;white-space:pre}.c{font-size:${pt.c}pt;white-space:pre}`;
  return { corpo, css, altura };
}

/* ---------- envio ---------- */
const concatena = (lista) => { const t = lista.reduce((n, b) => n + b.length, 0); const o = new Uint8Array(t); let p = 0; for (const b of lista) { o.set(b, p); p += b.length; } return o; };
async function enviar(destino, corpoReq) { return chama('/imprimir', { method: 'POST', body: JSON.stringify({ destino, ...corpoReq }), timeout: 30000 }); }

/**
 * Imprime um documento. Se o tipo estiver ligado a um destino do agente, envia para ele; caso contrário (ou se o
 * agente estiver fora do ar) cai no diálogo de impressão do navegador. `aviso(tipo, texto)` mostra o resultado.
 * `doc` = { corpo, css, linhas? (cupom), copias? }
 */
export async function imprimirDocumento(tipo, doc0, aviso = () => {}) {
  await sincronizaLayout({ espera: 2500 }); // pega o layout publicado por qualquer estação antes de desenhar
  const doc = { ...doc0, css: `${doc0.css ?? ''}${cssAjustes(tipo)}` }; // ajustes milimétricos do editor de layout
  const def = DOCS[tipo]; const cfg = lerMapa()[tipo];
  const navegador = () => imprimirHtml(doc.corpo, doc.css);
  if (!def || !cfg?.destino) { navegador(); return 'navegador'; }
  try {
    const destinos = await destinosAgente();
    const d = destinos.find((x) => x.nome === cfg.destino);
    if (!d) throw new Error(`Destino "${cfg.destino}" não existe mais no agente.`);
    const copias = Math.max(1, Number(doc.copias ?? cfg.copias ?? 1));
    // altura da página (= passo entre etiquetas): ajuste do documento nesta estação > padrão do documento > altura do destino
    const [lmm, amm] = [d.largura_mm ?? def.mm?.[0] ?? 62, Number(cfg.altura) > 0 ? Number(cfg.altura) : def.mm?.[1] ?? d.altura_mm ?? 45];
    const dpi = d.dpi ?? 203;
    const cupomImagem = def.cupom && !(d.linguagem === 'escpos' && doc.linhas);
    if (cupomImagem && !doc.linhas) throw new Error('este documento não tem texto para a impressora');
    if (def.cupom && !cupomImagem) {
      await enviar(cfg.destino, { tipo: 'raw', dados_b64: paraBase64(cupomEscPos(doc.linhas, { cortar: d.cortar !== false, copias })) });
    } else {
      // Um único trabalho com várias etiquetas (antes: um trabalho por etiqueta, e cada trabalho puxava papel/corte
      // próprio da impressora — daí o espaço enorme entre as etiquetas). Etiquetas continuam separadas (uma página cada).
      let lm = lmm; let am = amm; let corpoImg = doc.corpo; let cssImg = doc.css;
      if (cupomImagem) { lm = d.largura_mm ?? 80; const im = cupomComoImagem(doc.linhas, lm); corpoImg = im.corpo; cssImg = im.css; am = im.altura; }
      const cs = (await htmlParaCanvas(corpoImg, cssImg, lm, am, dpi)).flatMap((c) => Array(copias).fill(c));
      if (d.linguagem === 'imagem-driver') {
        // um trabalho com uma PÁGINA por etiqueta (a Brother QL corta a cada página); lotes de 20 por pedido
        for (let i = 0; i < cs.length; i += 20) await enviar(cfg.destino, { tipo: 'png', paginas_b64: cs.slice(i, i + 20).map(pngB64), largura_mm: lm, altura_mm: am, copias: 1 });
      } else {
        const partes = cs.map((c, k) => {
          const im = bitsDeRgba(c.getContext('2d').getImageData(0, 0, c.width, c.height).data, c.width, c.height);
          return d.linguagem === 'zpl' ? zplImagem(im, { copias: 1 })
            : d.linguagem === 'tspl' ? tsplImagem(im, { larguraMm: lm, alturaMm: am, copias: 1, invertido: d.invertido !== false })
              : escposImagem(im, { cortar: k === cs.length - 1 && d.cortar !== false, copias: 1, avanco: k === cs.length - 1 ? 3 : 0 }); // rolo contínuo: corta/avança só ao fim do lote
        });
        for (let i = 0; i < partes.length; i += 20) await enviar(cfg.destino, { tipo: 'raw', dados_b64: paraBase64(concatena(partes.slice(i, i + 20))) });
      }
    }
    return 'agente';
  } catch (e) {
    if (doc0.semNavegador) { aviso('erro', `Impressora ${cfg.destino} indisponível: ${e.message}`); return 'erro'; } // comanda/demonstrativo: não abre a pré-visualização do navegador
    aviso('erro', `Impressora ${cfg.destino} indisponível (${e.message}). Abrindo a impressão do navegador.`);
    navegador();
    return 'navegador';
  }
}

/** PDF → páginas PNG (pdf.js carregado só quando preciso). `dpi` 150 basta para o DANFE em A4. */
export async function pdfParaPngs(buffer, dpi = 150) {
  const pdfjs = await import('pdfjs-dist/build/pdf.min.mjs');
  // worker empacotado como .js pelo Vite (o .mjs solto era servido com tipo MIME errado e o navegador recusava)
  if (!pdfjs.GlobalWorkerOptions.workerPort) pdfjs.GlobalWorkerOptions.workerPort = new (await import('pdfjs-dist/build/pdf.worker.min.mjs?worker')).default();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const out = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const pg = await pdf.getPage(n); const vp = pg.getViewport({ scale: dpi / 72 });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: g, viewport: vp }).promise;
    out.push({ png: pngB64(c), larguraMm: (vp.width / dpi) * MM, alturaMm: (vp.height / dpi) * MM });
  }
  return out;
}

/**
 * Impressão direta do DANFE (PDF) na impressora do agente, sem pré-visualização.
 * Devolve 'agente' se imprimiu; lança Error se não há destino ou o agente falhou (o chamador mostra o preview).
 */
export async function imprimirPdfDireto(buffer) {
  const cfg = lerMapa().danfe;
  if (!cfg?.destino) throw new Error('nenhuma impressora definida para o DANFE (Ferramentas › Configurar impressoras)');
  const destinos = await destinosAgente();
  const d = destinos.find((x) => x.nome === cfg.destino);
  if (!d) throw new Error(`o destino "${cfg.destino}" não existe mais no agente`);
  if (d.tipo !== 'windows') throw new Error(`o destino "${cfg.destino}" não é uma impressora do Windows (rede/serial/etiqueta não imprimem página A4)`);
  const copias = Math.max(1, Number(cfg.copias ?? 1));
  const pags = await pdfParaPngs(buffer);
  let lote = []; let bytes = 0;
  const manda = async () => { if (!lote.length) return; await enviar(cfg.destino, { tipo: 'png', paginas_b64: lote.map((x) => x.png), largura_mm: Math.min(220, Math.round(lote[0].larguraMm)), altura_mm: Math.round(lote[0].alturaMm), copias }); lote = []; bytes = 0; };
  for (const p of pags) { if (bytes + p.png.length > 2.8 * 1024 * 1024) await manda(); lote.push(p); bytes += p.png.length; }
  await manda();
  return 'agente';
}
