// PNG de teste (tons de cinza 8 bits) sem dependências: moldura, diagonais e faixa de blocos.
import zlib from 'node:zlib';

const crcTab = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcTab[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const bloco = (tipo, dados) => { const t = Buffer.from(tipo); const l = Buffer.alloc(4); l.writeUInt32BE(dados.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, dados]))); return Buffer.concat([l, t, dados, c]); };

export function pngTeste(larguraMm, alturaMm, dpi = 203) {
  const w = Math.max(40, Math.round((larguraMm / 25.4) * dpi)); const h = Math.max(40, Math.round((alturaMm / 25.4) * dpi));
  const px = Buffer.alloc((w + 1) * h, 255);
  for (let y = 0; y < h; y++) {
    px[y * (w + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const borda = x < 4 || y < 4 || x >= w - 4 || y >= h - 4;
      const diag = Math.abs(x - (y * w) / h) < 2 || Math.abs(x - w + (y * w) / h) < 2;
      const faixa = y > h * 0.78 && y < h * 0.9 && x > 12 && x < w - 12 && Math.floor((x - 12) / 12) % 2 === 0;
      if (borda || diag || faixa) px[y * (w + 1) + 1 + x] = 0;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloco('IHDR', ihdr), bloco('IDAT', zlib.deflateSync(px)), bloco('IEND', Buffer.alloc(0))]);
}
