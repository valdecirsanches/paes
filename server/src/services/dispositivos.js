// Dispositivos autorizados. Um site não consegue ler o MAC da placa de rede; em vez disso, cada navegador recebe do servidor um
// código único e permanente (cookie HttpOnly "paes_disp", 5 anos). O código aparece na tela quando o dispositivo não está
// habilitado, e o administrador o libera na tela Ferramentas › Dispositivos.
// Regra de partida: enquanto NENHUM dispositivo estiver habilitado, o controle fica desligado (não há como se trancar fora);
// ao habilitar o primeiro, quem não estiver na lista passa a ser barrado. DISPOSITIVOS_LIVRE=1 desliga o controle.
import crypto from 'node:crypto';
import { pool } from '../db.js';
import { leCookie } from './auth.js';

const COOKIE = 'paes_disp';
const CINCO_ANOS_S = 5 * 365 * 24 * 3600;
export const MENSAGEM = 'Dispositivo não habilitado para uso do aplicativo.';
const FORMATO = /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;

/** Áreas de acesso de um dispositivo: 'faturamento' (app completo, com login) e/ou 'fabrica' (só consulta, sem login). */
export const AREAS = ['faturamento', 'fabrica'];
export const TODAS = AREAS.join(',');
export function parseAreas(v) {
  const l = (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x) => String(x).trim().toLowerCase()).filter((x) => AREAS.includes(x));
  const u = [...new Set(l)];
  return u.length ? u : ['faturamento'];
}

export const novoCodigo = () => { const h = crypto.randomBytes(6).toString('hex').toUpperCase(); return `${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8)}`; };

let tabelaPronta = null;
/** Cria a tabela se não existir. Se o usuário do banco não puder criar, devolve o erro (o controle fica desligado). */
export function garanteTabela(db = pool) {
  tabelaPronta ??= db.query(`create table if not exists tb_dispositivos (
      id int not null auto_increment primary key,
      codigo varchar(20) not null,
      descricao varchar(80) not null default '',
      ativo tinyint(1) not null default 0,
      criado_em datetime not null default current_timestamp,
      ultimo_acesso datetime null,
      ultimo_ip varchar(64) null,
      navegador varchar(255) null,
      ultimo_usuario varchar(60) null,
      areas varchar(40) not null default 'faturamento',
      unique key uk_dispositivo_codigo (codigo)
    ) engine=InnoDB default charset=utf8mb4`)
    .then(async () => { // tabela da fase 111 não tinha "areas": acrescenta (dispositivos já liberados ficam em 'faturamento', que é tudo o que existia)
      const [[r]] = await db.query("select count(*) as n from information_schema.columns where table_schema = database() and table_name = 'tb_dispositivos' and column_name = 'areas'");
      if (!Number(r?.n)) await db.query("alter table tb_dispositivos add column areas varchar(40) not null default 'faturamento'");
      return null;
    })
    .then((x) => x, (e) => { tabelaPronta = null; return e; });
  return tabelaPronta;
}

// cache curto: a checagem roda em toda requisição
const cacheDisp = new Map(); // codigo -> { ativo, ate }
let cacheExigido = { v: false, ate: 0 };
const TTL_MS = 15_000;
export const limpaCache = () => { cacheDisp.clear(); cacheExigido = { v: false, ate: 0 }; };
const ultimoToque = new Map(); // codigo -> ms (grava ultimo_acesso no máximo a cada 5 min)

export const ipDaRequisicao = (req) => String(req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '').replace(/^::ffff:/, '').slice(0, 64);

async function controleLigado(db) {
  if (process.env.DISPOSITIVOS_LIVRE === '1') return false;
  const agora = Date.now();
  if (cacheExigido.ate > agora) return cacheExigido.v;
  const erro = await garanteTabela(db);
  let v = false;
  if (!erro) { const [[r]] = await db.query('select count(*) as n from tb_dispositivos where ativo = 1'); v = Number(r.n) > 0; }
  cacheExigido = { v, ate: agora + TTL_MS };
  return v;
}

/**
 * Identifica o dispositivo da requisição (gera o código e o cookie se ainda não tem) e diz se está habilitado.
 * @returns {{codigo:string, habilitado:boolean, exigido:boolean}}
 */
export async function identifica(req, res, db = pool) {
  let codigo = leCookie(req, COOKIE);
  if (!codigo || !FORMATO.test(codigo)) {
    codigo = novoCodigo();
    const seguro = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const anterior = res.getHeader('Set-Cookie');
    const c = `${COOKIE}=${codigo}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${CINCO_ANOS_S}${seguro ? '; Secure' : ''}`;
    res.setHeader('Set-Cookie', anterior ? [].concat(anterior, c) : c);
  }
  const exigido = await controleLigado(db);
  const erroTabela = await garanteTabela(db);
  if (erroTabela) return { codigo, habilitado: true, exigido: false, erroTabela: erroTabela.message };
  const agora = Date.now();
  let c = cacheDisp.get(codigo);
  if (!c || c.ate < agora) {
    const [[row]] = await db.query('select ativo, areas from tb_dispositivos where codigo = ?', [codigo]);
    if (!row) {
      await db.query('insert ignore into tb_dispositivos set codigo = ?, ativo = 0, ultimo_acesso = now(), ultimo_ip = ?, navegador = ?', [codigo, ipDaRequisicao(req), String(req.headers['user-agent'] || '').slice(0, 255)]);
      ultimoToque.set(codigo, agora);
    }
    c = { ativo: Boolean(row?.ativo), areas: parseAreas(row?.areas), ate: agora + TTL_MS }; cacheDisp.set(codigo, c);
  }
  if ((ultimoToque.get(codigo) ?? 0) + 300_000 < agora) {
    ultimoToque.set(codigo, agora);
    db.query('update tb_dispositivos set ultimo_acesso = now(), ultimo_ip = ?, navegador = ? where codigo = ?', [ipDaRequisicao(req), String(req.headers['user-agent'] || '').slice(0, 255), codigo]).catch(() => {});
  }
  const habilitado = !exigido || c.ativo;
  const areas = exigido ? (c.ativo ? c.areas : []) : AREAS; // controle desligado: tudo liberado (com login)
  // máquina liberada só para a fábrica: consulta sem usuário/senha
  const fabricaSemLogin = exigido && c.ativo && areas.includes('fabrica') && !areas.includes('faturamento');
  return { codigo, habilitado, exigido, areas, fabricaSemLogin };
}

// O que uma máquina só-Fábrica pode chamar (telas Programação diária/fixa, Mercadorias, Produção, Etinerário, Cargas, Reclamações e impressão de etiquetas).
const PREFIXOS_FABRICA = ['status', 'diaria', 'fixa', 'produtos', 'mercadorias', 'producao', 'cargas', 'itinerario', 'reclamacoes', 'extras', 'alteracoes', 'impressao', 'agente', 'layout-etiquetas'];
export function rotaDaFabrica(req) {
  const [, , seg, resto] = req.originalUrl.split('?')[0].split('/'); // ['', 'api', seg, ...]
  if (seg === 'auth') return resto === 'me';
  if (seg === 'produtos') return req.method === 'GET';
  return PREFIXOS_FABRICA.includes(seg);
}
/** Usuário único "fabrica" (tb_usuarios): aparece nos logs das alterações. Criado na primeira vez; a senha gravada não corresponde a nenhuma senha digitável (não dá para logar). */
let cacheFab = null;
export async function usuarioFabrica(db = pool) {
  if (cacheFab) return cacheFab;
  try {
    let [[u]] = await db.query("select id, usuario, nome from tb_usuarios where lower(usuario) = 'fabrica' limit 1");
    if (!u) {
      await db.query("insert into tb_usuarios (usuario, nome, senha) values ('fabrica', 'FABRICA', '!')");
      [[u]] = await db.query("select id, usuario, nome from tb_usuarios where lower(usuario) = 'fabrica' limit 1");
    }
    if (u) { cacheFab = { id: u.id, usuario: u.usuario, nome: u.nome, fabrica: true }; return cacheFab; }
  } catch (e) { console.error('[dispositivos] usuário fabrica:', e.message); }
  return { id: null, usuario: 'fabrica', nome: 'FABRICA', fabrica: true }; // sem cache: tenta criar de novo na próxima
}
const LIVRES = new Set(['/api/health', '/api/dispositivo', '/api/agente/pacote']);
/** Barra o dispositivo não habilitado (403) antes do login. Falha do banco não derruba o sistema: deixa passar e registra. */
export async function exigeDispositivo(req, res, next) {
  if (req.app.locals.exigirLogin === false || process.env.DISPOSITIVOS_LIVRE === '1') return next(); // testes / controle desligado
  if (LIVRES.has(req.originalUrl.split('?')[0])) return next();
  try {
    const d = await Promise.race([identifica(req, res), new Promise((_, ko) => setTimeout(() => ko(new Error('banco demorou')), 4000).unref())]); // banco fora do ar não trava o sistema
    req.dispositivo = d.codigo; req.areas = d.areas ?? AREAS; req.fabricaSemLogin = Boolean(d.fabricaSemLogin);
    if (d.habilitado) {
      if (d.fabricaSemLogin) {
        if (!rotaDaFabrica(req)) return res.status(403).json({ message: 'Este dispositivo está liberado apenas para a fábrica.', code: 'AREA_NEGADA' });
        req.user = await usuarioFabrica(); req.userId = req.user.id;
      } else if (!req.areas.includes('faturamento')) return res.status(403).json({ message: 'Este dispositivo não está liberado para o sistema.', code: 'AREA_NEGADA' });
      return next();
    }
    return res.status(403).json({ message: MENSAGEM, code: 'DISPOSITIVO_NAO_HABILITADO', codigo: d.codigo });
  } catch (e) { console.error('[dispositivos]', e.message); return next(); }
}
