// Conversão de imagem/linhas em comandos de impressoras térmicas. Funções puras (testadas em Node).

/** RGBA (Uint8ClampedArray) → bits (1 = ponto preto), linhas alinhadas em bytes, bit mais significativo à esquerda. */
export function bitsDeRgba(rgba, largura, altura, { limiar = 170 } = {}) {
  const lb = Math.ceil(largura / 8);
  const bits = new Uint8Array(lb * altura);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = (y * largura + x) * 4;
      const a = rgba[i + 3] / 255;
      const lum = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * a + 255 * (1 - a); // transparente = branco
      if (lum < limiar) bits[y * lb + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { bits, largura, altura, bytesPorLinha: lb };
}

const concat = (...partes) => {
  const n = partes.reduce((s, p) => s + p.length, 0);
  const o = new Uint8Array(n); let k = 0;
  for (const p of partes) { o.set(p, k); k += p.length; }
  return o;
};
const ascii = (t) => Uint8Array.from(t, (c) => c.charCodeAt(0) & 0xff);

/** ESC/POS: GS v 0 (raster), em faixas de até 255 linhas (limite de muitas impressoras). */
export function escposImagem({ bits, altura, bytesPorLinha }, { cortar = false, copias = 1, avanco = 3 } = {}) {
  const um = [new Uint8Array([0x1b, 0x40])];
  for (let y = 0; y < altura; y += 255) {
    const h = Math.min(255, altura - y);
    um.push(new Uint8Array([0x1d, 0x76, 0x30, 0x00, bytesPorLinha & 0xff, bytesPorLinha >> 8, h & 0xff, h >> 8]), bits.subarray(y * bytesPorLinha, (y + h) * bytesPorLinha));
  }
  um.push(new Uint8Array([0x1b, 0x64, avanco])); // avança linhas
  if (cortar) um.push(new Uint8Array([0x1d, 0x56, 0x42, 0x00]));
  const um1 = concat(...um);
  return concat(...Array.from({ length: Math.max(1, copias) }, () => um1));
}

const HEX = '0123456789ABCDEF';
const paraHex = (b) => { let s = ''; for (const v of b) s += HEX[v >> 4] + HEX[v & 15]; return s; };

/** ZPL II: ^GFA (ASCII hex, sem compressão). */
export function zplImagem({ bits, largura, altura, bytesPorLinha }, { copias = 1 } = {}) {
  const total = bits.length;
  return ascii(`^XA^CI28^PW${largura}^LL${altura}^LH0,0^FO0,0^GFA,${total},${total},${bytesPorLinha},${paraHex(bits)}^FS^PQ${Math.max(1, copias)}^XZ`);
}

/** TSPL/TSPL2: BITMAP modo 0. No TSPL o bit 1 é "sem ponto", por isso os bits são invertidos (padrão). */
export function tsplImagem({ bits, altura, bytesPorLinha }, { larguraMm, alturaMm, copias = 1, gapMm = 2, invertido = true } = {}) {
  const dados = invertido ? bits.map((b) => (~b) & 0xff) : bits;
  return concat(ascii(`SIZE ${larguraMm} mm,${alturaMm} mm\r\nGAP ${gapMm} mm,0\r\nDIRECTION 1\r\nCLS\r\nBITMAP 0,0,${bytesPorLinha},${altura},0,`), dados, ascii(`\r\nPRINT ${Math.max(1, copias)},1\r\n`));
}

// cp1252 → bytes (ESC t 16 = WPC1252 na maioria das Epson/Bematech/Daruma)
const CP1252_EXTRA = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f };
export const cp1252 = (t) => Uint8Array.from(String(t ?? ''), (c) => { const n = c.charCodeAt(0); return n < 0x100 ? n : (CP1252_EXTRA[c] ?? 0x3f); });

/** ESC/POS texto nativo (cupom): linhas monoespaçadas, negrito opcional, corte. */
export function cupomEscPos(linhas, { cortar = true, colunas = 48, negrito = true, copias = 1 } = {}) {
  // Linha = texto simples, ou { t, e } com estilo: g = largo/negrito (altura dupla), n = normal, c = condensado (fonte B, 64 colunas)
  const ESTILO = { g: [new Uint8Array([0x1b, 0x4d, 0, 0x1d, 0x21, 0x01, 0x1b, 0x45, 1]), 48], n: [new Uint8Array([0x1b, 0x4d, 0, 0x1d, 0x21, 0, 0x1b, 0x45, 0]), 48], c: [new Uint8Array([0x1b, 0x4d, 1, 0x1d, 0x21, 0, 0x1b, 0x45, 0]), 64] };
  const linha = (l) => {
    if (l && typeof l === 'object') { const [cmd, cols] = ESTILO[l.e] ?? ESTILO.n; return concat(cmd, cp1252(String(l.t ?? '').slice(0, cols)), new Uint8Array([0x0a])); }
    return concat(cp1252(String(l ?? '').slice(0, colunas)), new Uint8Array([0x0a]));
  };
  const um = concat(
    new Uint8Array([0x1b, 0x40, 0x1b, 0x74, 16, 0x1b, 0x45, negrito ? 1 : 0]),
    ...linhas.map(linha),
    new Uint8Array([0x1b, 0x45, 0, 0x1d, 0x21, 0, 0x1b, 0x4d, 0, 0x1b, 0x64, 4]),
    cortar ? new Uint8Array([0x1d, 0x56, 0x42, 0x00]) : new Uint8Array(),
  );
  return concat(...Array.from({ length: Math.max(1, copias) }, () => um));
}

export const paraBase64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
