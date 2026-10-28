import { pngTeste } from './png.js';
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { caminhoConfig, carregaConfig, ipsDaMaquina, salvaConfig, validaDestino, validaRede } from './config.js';
import { enviaRede, enviaSerial, enviaWindowsPng, enviaWindowsRaw, listaWindows, papeisWindows } from './transportes.js';
import { paginaAdmin } from './admin.js';

const VERSAO = '1.0.0';
const MAX_CORPO = 4 * 1024 * 1024;

/** Cria o servidor. `deps` permite trocar os transportes nos testes. */
export function criaServidor({ cfg, arquivoCfg, deps = {} } = {}) {
  const T = { rede: enviaRede, serial: enviaSerial, windowsRaw: enviaWindowsRaw, windowsPng: enviaWindowsPng, lista: listaWindows, papeis: papeisWindows, ...deps };
  const filas = new Map(); // um trabalho por vez em cada destino
  const naFila = (chave, fn) => { const p = (filas.get(chave) ?? Promise.resolve()).catch(() => {}).then(fn); filas.set(chave, p); return p; };

  const hostOk = (req) => /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(req.headers.host ?? '');
  const proprio = (origem) => !!origem && new RegExp(`^http://(127\\.0\\.0\\.1|localhost):${cfg.porta}$`).test(origem);
  // Acesso remoto (servidor do sistema em outra máquina): exige o token do config.json; só as 4 rotas de impressão.
  const tokenOk = (req) => {
    if (!cfg.token) return false;
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? ''); if (!m) return false;
    const a = Buffer.from(m[1]); const b = Buffer.from(cfg.token);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  const ROTAS_REMOTAS = new Set(['GET /status', 'GET /destinos', 'POST /imprimir', 'POST /testar']);
  const permitida = (origem) => !origem || proprio(origem) || cfg.origens.includes(origem);

  const resp = (res, status, corpo, extra = {}) => {
    const txt = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
    res.writeHead(status, { 'Content-Type': typeof corpo === 'string' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
    res.end(txt);
  };
  const erro = (status, message) => Object.assign(new Error(message), { status });
  const lerJson = (req) => new Promise((ok, falha) => {
    let n = 0; const partes = [];
    req.on('data', (c) => { n += c.length; if (n > MAX_CORPO) { falha(erro(413, 'Arquivo de impressão grande demais.')); req.destroy(); } else partes.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}')); } catch { falha(erro(400, 'JSON inválido.')); } });
    req.on('error', falha);
  });
  const b64 = (v, rot) => { if (typeof v !== 'string' || !v || !/^[A-Za-z0-9+/=\r\n]+$/.test(v)) throw erro(422, `${rot} ausente ou inválido.`); const b = Buffer.from(v, 'base64'); if (!b.length) throw erro(422, `${rot} vazio.`); return b; };

  async function imprimir(corpo) {
    const nome = corpo.destino;
    const d = cfg.destinos[nome];
    if (!d) throw erro(404, `Destino "${nome}" não está configurado neste computador.`);
    if (corpo.tipo === 'png') {
      if (d.tipo !== 'windows') throw erro(422, 'Impressão por imagem só no driver do Windows.');
      const brutas = Array.isArray(corpo.paginas_b64) ? corpo.paginas_b64 : [corpo.dados_b64];
      if (brutas.length < 1 || brutas.length > 60) throw erro(422, 'Envie de 1 a 60 páginas por trabalho.');
      const pngs = brutas.map((x) => b64(x, 'Imagem'));
      if (pngs.some((p) => p.subarray(0, 4).toString('hex') !== '89504e47')) throw erro(422, 'A imagem precisa ser PNG.');
      const png = Array.isArray(corpo.paginas_b64) ? pngs : pngs[0]; // várias páginas = um trabalho, uma etiqueta por página
      const larguraMm = Number(corpo.largura_mm ?? d.largura_mm); const alturaMm = Number(corpo.altura_mm ?? d.altura_mm);
      if (!(larguraMm >= 10 && larguraMm <= 220 && alturaMm >= 5 && alturaMm <= 600)) throw erro(422, 'Informe largura_mm e altura_mm válidas.');
      const copias = Math.min(99, Math.max(1, Math.trunc(Number(corpo.copias) || 1)));
      return naFila(nome, () => T.windowsPng(d, png, { larguraMm, alturaMm, copias }));
    }
    if (corpo.tipo !== 'raw') throw erro(422, 'tipo deve ser "raw" ou "png".');
    const bytes = b64(corpo.dados_b64, 'Dados');
    return naFila(nome, () => (d.tipo === 'rede' ? T.rede(d, bytes) : d.tipo === 'serial' ? T.serial(d, bytes) : T.windowsRaw(d, bytes)));
  }

  /** Teste de impressão: comandos nativos para escpos/zpl/tspl; PNG gerado aqui para "imagem pelo driver". */
  async function testar(nome) {
    const d = cfg.destinos[nome];
    if (!d) throw erro(404, 'Destino não encontrado.');
    if (d.linguagem === 'imagem-driver') {
      const l = d.largura_mm ?? 62; const a = d.altura_mm ?? 45;
      return imprimir({ destino: nome, tipo: 'png', dados_b64: pngTeste(l, a, d.dpi ?? 203).toString('base64'), largura_mm: l, altura_mm: a });
    }
    const t = { escpos: Buffer.concat([Buffer.from([0x1b, 0x40]), Buffer.from('TESTE DE IMPRESSAO\nSistema Paes\n\n\n\n', 'latin1'), Buffer.from([0x1d, 0x56, 0x42, 0x00])]),
      zpl: Buffer.from('^XA^CI28^FO30,30^A0N,40,40^FDTESTE DE IMPRESSAO^FS^FO30,90^A0N,30,30^FDSistema Paes^FS^XZ'),
      tspl: Buffer.from('SIZE 62 mm,45 mm\r\nGAP 2 mm,0\r\nCLS\r\nTEXT 30,30,"3",0,1,1,"TESTE DE IMPRESSAO"\r\nPRINT 1,1\r\n') }[d.linguagem];
    return imprimir({ destino: nome, tipo: 'raw', dados_b64: t.toString('base64') });
  }

  const servidor = http.createServer(async (req, res) => {
    try {
      const remoto = !hostOk(req);
      if (remoto) {
        if (!tokenOk(req)) return resp(res, req.headers.authorization ? 401 : 421, { message: req.headers.authorization ? 'Token inválido.' : 'Host não permitido.' });
        if (!ROTAS_REMOTAS.has(`${req.method} ${new URL(req.url, 'http://x').pathname}`)) return resp(res, 403, { message: 'Rota não liberada para acesso remoto.' });
        if (req.headers.origin) return resp(res, 403, { message: 'Acesso remoto não é para navegador.' });
      }
      const origem = req.headers.origin;
      const cors = origem && permitida(origem) ? { 'Access-Control-Allow-Origin': origem, Vary: 'Origin', 'Access-Control-Allow-Private-Network': 'true' } : {};
      if (origem && !permitida(origem)) return resp(res, 403, { message: 'Origem não autorizada. Adicione-a em "origens" na configuração do agente.' });
      if (req.method === 'OPTIONS') return resp(res, 204, '', { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, x-agente', 'Access-Control-Max-Age': '600' });
      const url = new URL(req.url, 'http://x');
      const r = (status, corpo) => resp(res, status, corpo, cors);

      if (req.method === 'GET' && url.pathname === '/status') return r(200, { ok: true, versao: VERSAO, plataforma: process.platform, destinos: Object.keys(cfg.destinos).length });
      if (req.method === 'GET' && url.pathname === '/destinos') return r(200, Object.entries(cfg.destinos).map(([nome, d]) => ({ nome, ...d })));
      if (req.method === 'POST' && url.pathname === '/imprimir') {
        if (req.headers['x-agente'] !== 'paes') return r(400, { message: 'Cabeçalho X-Agente ausente.' });
        await imprimir(await lerJson(req));
        return r(200, { ok: true });
      }

      // teste de um destino: liberado também ao sistema web (origem autorizada), como /imprimir
      if (req.method === 'POST' && url.pathname === '/testar') {
        if (req.headers['x-agente'] !== 'paes') return r(400, { message: 'Cabeçalho X-Agente ausente.' });
        await testar((await lerJson(req)).destino);
        return r(200, { ok: true });
      }

      // ----- administração: só a própria página do agente (mesma origem) -----
      if (req.method === 'GET' && url.pathname === '/') return resp(res, 200, paginaAdmin(cfg, arquivoCfg ?? caminhoConfig()));
      const admin = url.pathname.startsWith('/api/');
      if (admin) {
        if (req.method !== 'GET' && !proprio(origem)) return r(403, { message: 'Alterações só pela página do próprio agente (http://127.0.0.1:' + cfg.porta + ').' });
        if (req.method === 'GET' && url.pathname === '/api/impressoras') return r(200, await T.lista());
        // papéis que o driver oferece (diagnóstico de etiqueta: ex. /api/papeis?impressora=Brother%20QL-800)
        if (req.method === 'GET' && url.pathname === '/api/papeis') return r(200, await T.papeis(String(url.searchParams.get('impressora') ?? '')));
        if (req.method === 'POST' && url.pathname === '/api/destinos') {
          const b = await lerJson(req);
          let d; try { d = validaDestino(b.nome, b); } catch (e) { return r(422, { message: e.message }); }
          const nome = b.nome.trim(); cfg.destinos[nome] = d; delete cfg.invalidos?.[nome]; salvaConfig(cfg, arquivoCfg); return r(200, { ok: true, atualizado: Boolean(b.edicao) });
        }
        const m = url.pathname.match(/^\/api\/destinos\/(.+)$/);
        if (req.method === 'DELETE' && m) { const n = decodeURIComponent(m[1]); delete cfg.destinos[n]; delete cfg.invalidos?.[n]; salvaConfig(cfg, arquivoCfg); return r(200, { ok: true }); }
        if (req.method === 'POST' && url.pathname === '/api/testar') { await testar((await lerJson(req)).destino); return r(200, { ok: true }); }
        if (req.method === 'POST' && url.pathname === '/api/rede') {
          const b = await lerJson(req);
          let n; try { n = validaRede({ permitir: !!b.permitir, token: b.token }, cfg.token); } catch (e) { return r(422, { message: e.message }); }
          cfg.escuta = n.escuta; cfg.token = n.token; salvaConfig(cfg, arquivoCfg);
          // aplica agora, sem reiniciar o programa: fecha e volta a escutar no endereço novo
          setTimeout(reescutar, 400);
          return r(200, { ok: true, escuta: cfg.escuta, token: cfg.token, porta: cfg.porta, ips: ipsDaMaquina() });
        }
        if (req.method === 'POST' && url.pathname === '/api/origens') {
          const b = await lerJson(req);
          const lista = (Array.isArray(b.origens) ? b.origens : []).map(String).filter((o) => /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(o));
          cfg.origens = [...new Set(lista)]; salvaConfig(cfg, arquivoCfg); return r(200, { ok: true });
        }
      }
      return r(404, { message: 'Rota não encontrada.' });
    } catch (e) {
      resp(res, e.status ?? 500, { message: e.message || 'Erro ao imprimir.' }, {});
    }
  });
  // Volta a escutar no endereço do config (sem reiniciar o programa). Se a porta ainda estiver ocupada (Windows demora a liberar),
  // tenta de novo; um erro de escuta nunca derruba o agente.
  function reescutar() {
    const tenta = (n) => {
      const falhou = (e) => { servidor.off('listening', ok); if (n < 20) setTimeout(() => tenta(n + 1), 500); else console.error('Não foi possível voltar a escutar:', e.message); };
      const ok = () => servidor.off('error', falhou);
      servidor.once('error', falhou); servidor.once('listening', ok);
      try { servidor.listen(cfg.porta, cfg.escuta); } catch (e) { falhou(e); }
    };
    try { servidor.closeAllConnections?.(); } catch { /* segue */ }
    if (servidor.listening) servidor.close(() => tenta(0)); else tenta(0);
  }
  servidor.on('error', (e) => console.error('Erro no servidor:', e.message));
  return servidor;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.on('uncaughtException', (e) => console.error('Erro não tratado (o agente continua):', e));
  process.on('unhandledRejection', (e) => console.error('Promessa rejeitada (o agente continua):', e));
  const arquivoCfg = caminhoConfig();
  const cfg = carregaConfig(arquivoCfg);
  criaServidor({ cfg, arquivoCfg }).listen(cfg.porta, cfg.escuta, () => console.log(`Agente de impressão ${VERSAO} em http://${cfg.escuta}:${cfg.porta} (config: ${arquivoCfg})`));
}
