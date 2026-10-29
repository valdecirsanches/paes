import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Sessão assinada (HMAC) em cookie HttpOnly. Nada é guardado no banco.
const COOKIE = 'paes_sess';
const DURACAO_S = 12 * 60 * 60;
/** Segredo da sessão: SESSION_SECRET, ou um arquivo local gerado uma vez (para o login sobreviver a reinícios da API). */
function carregaSegredo() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const arq = path.resolve(process.cwd(), '.session-secret');
  try { const t = fs.readFileSync(arq, 'utf8').trim(); if (t.length >= 32) return t; } catch { /* ainda não existe */ }
  const novo = crypto.randomBytes(32).toString('hex');
  try { fs.writeFileSync(arq, novo, { mode: 0o600 }); } catch { console.warn('[auth] sem SESSION_SECRET e sem permissão para gravar .session-secret: as sessões caem a cada reinício.'); }
  return novo;
}
let segredo = carregaSegredo();

/** Mesmo resultado de PASSWORD('x') do MySQL 4.1+ (PASSWORD('') é '', senha em branco): '*' + SHA1(SHA1(x)) em hexadecimal maiúsculo. */
export const hashSenha = (senha) => (senha === '' ? '' : `*${crypto.createHash('sha1').update(crypto.createHash('sha1').update(String(senha), 'utf8').digest()).digest('hex').toUpperCase()}`);

const b64 = (b) => Buffer.from(b).toString('base64url');
const assina = (corpo) => crypto.createHmac('sha256', segredo).update(corpo).digest('base64url');

export function criaToken(usuario, agora = Date.now()) {
  const corpo = b64(JSON.stringify({ id: usuario.id, usuario: usuario.usuario, nome: usuario.nome, exp: Math.floor(agora / 1000) + DURACAO_S }));
  return `${corpo}.${assina(corpo)}`;
}
export function leToken(token, agora = Date.now()) {
  if (typeof token !== 'string') return null;
  const [corpo, sig, resto] = token.split('.');
  if (!corpo || !sig || resto !== undefined) return null;
  const esperado = assina(corpo);
  const a = Buffer.from(sig);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'));
    return p.exp > Math.floor(agora / 1000) && Number.isInteger(p.id) ? p : null;
  } catch { return null; }
}

export function leCookie(req, nome = COOKIE) {
  for (const parte of String(req.headers.cookie ?? '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}
export function gravaCookie(res, req, token) {
  const seguro = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const novo = `${COOKIE}=${encodeURIComponent(token ?? '')}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${token ? DURACAO_S : 0}${seguro ? '; Secure' : ''}`;
  const antes = res.getHeader('Set-Cookie'); // preserva outros cookies já definidos na resposta (ex.: código do dispositivo)
  res.setHeader('Set-Cookie', antes ? [].concat(antes, novo) : novo);
}

// Limite de tentativas: 5 erros seguidos para o mesmo IP+usuário bloqueiam por 60 s.
const falhas = new Map();
const MAX = 5;
const BLOQUEIO_MS = 60_000;
export function bloqueado(chave, agora = Date.now()) {
  const f = falhas.get(chave);
  if (!f) return 0;
  if (f.ate && f.ate > agora) return Math.ceil((f.ate - agora) / 1000);
  if (f.ate) falhas.delete(chave);
  return 0;
}
export function registraFalha(chave, agora = Date.now()) {
  const f = falhas.get(chave) ?? { n: 0, ate: 0 };
  f.n += 1;
  if (f.n >= MAX) { f.ate = agora + BLOQUEIO_MS; f.n = 0; }
  falhas.set(chave, f);
  if (falhas.size > 5000) falhas.clear();
}
export const limpaFalhas = (chave) => falhas.delete(chave);

const PUBLICAS = new Set(['/api/auth/login', '/api/health', '/api/agente/pacote']);
/** Exige sessão válida em todas as rotas /api, exceto login e health. */
export function exigeLogin(req, res, next) {
  if (req.app.locals.exigirLogin === false) { req.userId = Number(req.header('x-user-id')) || null; return next(); }
  const p = leToken(leCookie(req));
  if (p) { req.user = p; req.userId = p.id; return next(); }
  if (PUBLICAS.has(req.path === '/' ? req.baseUrl : `${req.baseUrl}${req.path}`)) return next();
  return res.status(401).json({ message: 'Sessão expirada. Faça login novamente.', login: true });
}
