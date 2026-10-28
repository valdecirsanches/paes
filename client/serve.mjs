// Servidor de produção do front: serve client/dist (com fallback de SPA) e encaminha /api para a API.
// Uso: PORT=5072 API_URL=http://127.0.0.1:5071 node serve.mjs
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const porta = Number(process.env.PORT || 5072);
const api = new URL(process.env.API_URL || 'http://127.0.0.1:5071');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.map': 'application/json', '.woff2': 'font/woff2' };

const agenteApi = new http.Agent({ keepAlive: true, maxSockets: 64 }); // reaproveita a conexão com a API (antes: uma nova por requisição)
http.createServer((req, res) => {
  if (req.url.startsWith('/api/') || req.url === '/api') {
    // proxy sem buffer; a autorização de NFe pode levar mais de um minuto
    const p = http.request({ host: api.hostname, port: api.port, path: req.url, method: req.method, agent: agenteApi, headers: { ...req.headers, host: api.host }, timeout: 180000 }, (r) => {
      res.writeHead(r.statusCode, r.headers); r.pipe(res);
    });
    p.on('timeout', () => p.destroy(new Error('timeout')));
    p.on('error', (e) => { if (!res.headersSent) res.writeHead(424, { 'content-type': 'application/json' }); res.end(JSON.stringify({ message: `API indisponível (${e.code || e.message}).` })); });
    req.pipe(p);
    return;
  }
  const limpo = decodeURIComponent(req.url.split('?')[0]);
  let arq = path.normalize(path.join(raiz, limpo));
  if (!arq.startsWith(raiz)) { res.writeHead(403).end(); return; }
  if (!existsSync(arq) || statSync(arq).isDirectory()) arq = path.join(raiz, 'index.html');
  const ext = path.extname(arq);
  res.writeHead(200, { 'content-type': TIPOS[ext] || 'application/octet-stream', 'cache-control': arq.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable' });
  createReadStream(arq).pipe(res);
}).listen(porta, '0.0.0.0', () => console.log(`front em :${porta} -> /api => ${api.origin}`));
