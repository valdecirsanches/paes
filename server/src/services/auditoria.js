// Auditoria: registra em tb_auditoria tudo o que é feito pelo app (toda gravação, downloads de DANFE/XML, relatórios,
// logins, negações e erros), com quem, de qual dispositivo/IP, o que foi enviado (sem senhas/tokens/arquivos) e o resultado.
// A tabela é criada sozinha. Falha de auditoria NUNCA derruba a operação (só avisa no console).
import { pool } from '../db.js';

const SEGREDO = /senha|password|passwd|token|secret|authorization|cookie|pfx|certificado_senha/i;
const LIMITE_TEXTO = 300;
const LIMITE_DETALHES = 8000;
/** Rotas que não valem registro (ruído ou a própria consulta da auditoria). */
const IGNORAR = [/^\/api\/health/, /^\/api\/dispositivo$/, /^\/api\/auditoria(\/|$)/, /^\/api\/auth\/me/, /^\/api\/impressao\/(status|destinos|config)/];
/** GET que importam (documentos fiscais, relatórios, arquivos). Os demais GET só entram se falharem com 5xx. */
const GET_RELEVANTE = [/^\/api\/nfe\/\d+\/(danfe|xml|xml-legado|arquivos|eventos)/, /^\/api\/nfe\/eventos\//, /^\/api\/relatorios/, /^\/api\/nfs/, /\/(exportar|csv|impressao)(\/|$|\?)/];

/** Remove segredos e encurta conteúdo grande (base64, listas) para caber na trilha. */
export function sanitiza(v, prof = 0) {
  if (v == null) return v;
  if (typeof v === 'string') {
    if (v.length > LIMITE_TEXTO) return /^[A-Za-z0-9+/=\s]{200,}$/.test(v.slice(0, 400)) ? `(arquivo/base64 de ${v.length} caracteres)` : `${v.slice(0, LIMITE_TEXTO)}… (${v.length} caracteres)`;
    return v;
  }
  if (typeof v !== 'object') return v;
  if (prof > 5) return '(…)';
  if (Array.isArray(v)) { const r = v.slice(0, 50).map((x) => sanitiza(x, prof + 1)); if (v.length > 50) r.push(`(+${v.length - 50} itens)`); return r; }
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SEGREDO.test(k) ? '***' : sanitiza(x, prof + 1)]));
}

/** Entidade (1º trecho da rota), ação legível e id do registro. Ex.: POST /api/nfe/6492/cancelar → { entidade: 'nfe', acao: 'POST nfe/:id/cancelar', idRegistro: '6492' }. */
export function descreve(metodo, caminho) {
  const partes = String(caminho).split('?')[0].replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const ids = partes.filter((p) => /^\d+$/.test(p));
  const generico = partes.map((p) => (/^\d+$/.test(p) ? ':id' : p));
  const entidade = (partes[0] === 'cadastros' ? partes[1] : partes[0]) ?? '';
  return { entidade: String(entidade).slice(0, 40), acao: `${metodo} ${generico.join('/')}`.slice(0, 120), idRegistro: ids[0] ?? '' };
}

/** IP real do usuário (atrás do túnel Cloudflare/proxy). */
export const ipDe = (req) => String(req.headers['cf-connecting-ip'] ?? String(req.headers['x-forwarded-for'] ?? '').split(',')[0] ?? '').trim() || req.ip;

export const deveRegistrar = (metodo, caminho, status) => {
  if (IGNORAR.some((r) => r.test(caminho))) return false;
  if (metodo !== 'GET' && metodo !== 'HEAD' && metodo !== 'OPTIONS') return true;
  if (metodo === 'OPTIONS' || metodo === 'HEAD') return false;
  return GET_RELEVANTE.some((r) => r.test(caminho)) || status >= 500;
};

let pronta = null;
export function garanteTabela() {
  pronta ??= pool.query(`create table if not exists tb_auditoria (
    id bigint unsigned not null auto_increment primary key,
    data_hora datetime not null,
    id_usuario int null,
    usuario varchar(60) not null default '',
    dispositivo varchar(40) not null default '',
    ip varchar(64) not null default '',
    metodo varchar(8) not null default '',
    rota varchar(255) not null default '',
    entidade varchar(40) not null default '',
    acao varchar(120) not null default '',
    id_registro varchar(40) not null default '',
    status smallint not null default 0,
    duracao_ms int not null default 0,
    erro varchar(500) not null default '',
    detalhes mediumtext null,
    origem varchar(20) not null default 'api',
    index ix_aud_data (data_hora), index ix_aud_usuario (usuario, data_hora), index ix_aud_entidade (entidade, id_registro), index ix_aud_status (status)
  ) engine=InnoDB default charset=utf8mb4`).catch((e) => { pronta = null; throw e; });
  return pronta;
}

/** Grava uma linha de auditoria (melhor esforço). */
export async function registra(l) {
  try {
    await garanteTabela();
    let detalhes = l.detalhes == null ? null : JSON.stringify(sanitiza(l.detalhes));
    if (detalhes && detalhes.length > LIMITE_DETALHES) detalhes = `${detalhes.slice(0, LIMITE_DETALHES)}…(cortado)`;
    await pool.query(
      'insert into tb_auditoria (data_hora, id_usuario, usuario, dispositivo, ip, metodo, rota, entidade, acao, id_registro, status, duracao_ms, erro, detalhes, origem) values (now(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [l.idUsuario ?? null, String(l.usuario ?? '').slice(0, 60), String(l.dispositivo ?? '').slice(0, 40), String(l.ip ?? '').slice(0, 64), String(l.metodo ?? '').slice(0, 8), String(l.rota ?? '').slice(0, 255),
        String(l.entidade ?? '').slice(0, 40), String(l.acao ?? '').slice(0, 120), String(l.idRegistro ?? '').slice(0, 40), Number(l.status) || 0, Math.round(Number(l.duracao) || 0), String(l.erro ?? '').slice(0, 500), detalhes, String(l.origem ?? 'api').slice(0, 20)]);
  } catch (e) { console.warn(`[auditoria] não gravou: ${e.message}`); }
}

/** Middleware: montar no INÍCIO de /api (antes de dispositivo/login) para também registrar negações e logins. */
export function auditoria(req, res, next) {
  if (process.env.AUDITORIA === '0' || req.app.locals.exigirLogin === false) return next(); // exigirLogin=false só nos testes
  const t0 = Date.now(); let corpoResp = null;
  const json = res.json.bind(res);
  res.json = (b) => { corpoResp = b; return json(b); };
  res.on('finish', () => {
    const caminho = req.originalUrl.split('?')[0];
    if (!deveRegistrar(req.method, caminho, res.statusCode)) return;
    const { entidade, acao, idRegistro } = descreve(req.method, caminho);
    const login = caminho === '/api/auth/login';
    const detalhes = {};
    if (req.body && Object.keys(req.body).length) detalhes.corpo = login ? { usuario: req.body.usuario } : req.body;
    if (Object.keys(req.query ?? {}).length) detalhes.consulta = req.query;
    if (res.statusCode < 400 && corpoResp && typeof corpoResp === 'object' && !Array.isArray(corpoResp)) {
      const r = {}; for (const k of ['id', 'ok', 'numero', 'status', 'mensagem']) if (corpoResp[k] !== undefined) r[k] = corpoResp[k];
      if (Object.keys(r).length) detalhes.resposta = r;
    }
    registra({
      idUsuario: req.user?.id, usuario: req.user?.usuario ?? (login ? String(req.body?.usuario ?? '') : ''), dispositivo: req.dispositivo ?? '', ip: ipDe(req),
      metodo: req.method, rota: req.originalUrl, entidade: login ? 'login' : entidade, acao: login ? `LOGIN ${res.statusCode < 400 ? 'ok' : 'falhou'}` : acao, idRegistro, status: res.statusCode, duracao: Date.now() - t0,
      erro: res.statusCode >= 400 ? String(corpoResp?.message ?? '') : '', detalhes: Object.keys(detalhes).length ? detalhes : null,
    });
  });
  next();
}
