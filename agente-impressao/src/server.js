import { pngTeste } from './png.js';
import http from 'node:http';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { caminhoConfig, carregaConfig, salvaConfig, validaDestino } from './config.js';
import { estadoTunel, iniciaTunel } from './tunel.js';
import { enviaCupsPng, enviaCupsRaw, enviaRede, enviaSerial, enviaWindowsPng, enviaWindowsRaw, listaImpressoras, papeisWindows } from './transportes.js';
import { paginaAdmin } from './admin.js';

const VERSAO = '1.2.0'; // 1.2.0: o agente CONECTA ao sistema (túnel reverso, sem porta/IP/firewall) e o "acesso pela rede" deixou de existir; 1.1.2: 1.1.2: impressão por imagem sempre em orientação retrato (Brother vinha em paisagem); 1.1.1: DANFE A4 encaixado na área imprimível (rodapé não corta); 1.1.0: gravação do XML da NF-e no N: (POST /gravar)
const MAX_CORPO = 4 * 1024 * 1024;

/** Cria o servidor. `deps` permite trocar os transportes nos testes. */
export function criaServidor({ cfg, arquivoCfg, deps = {} } = {}) {
  const T = { rede: enviaRede, serial: enviaSerial, windowsRaw: enviaWindowsRaw, windowsPng: enviaWindowsPng, cupsRaw: enviaCupsRaw, cupsPng: enviaCupsPng, lista: listaImpressoras, papeis: papeisWindows, ...deps };
  const filas = new Map(); // um trabalho por vez em cada destino
  const naFila = (chave, fn) => { const p = (filas.get(chave) ?? Promise.resolve()).catch(() => {}).then(fn); filas.set(chave, p); return p; };

  const hostOk = (req) => /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(req.headers.host ?? '');
  const proprio = (origem) => !!origem && new RegExp(`^http://(127\\.0\\.0\\.1|localhost):${cfg.porta}$`).test(origem);
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

  const pastas = () => (Array.isArray(cfg.pastas_gravacao) && cfg.pastas_gravacao.length ? cfg.pastas_gravacao : ['N:/EDSMonitorPLUS/Arqs']).map((x) => String(x).replaceAll('\\', '/').replace(/\/+$/, ''));
  /** Grava o XML da NF-e numa pasta liberada (padrão do sistema antigo, ex.: N:/EDSMonitorPLUS/Arqs/<cnpj>/NFe/<ddmmaaaa>/NFe/<chave>-nfe.xml). */
  async function gravar(corpo) {
    const raizes = pastas();
    const cam = String(corpo.caminho ?? '').replaceAll('\\', '/');
    if (!raizes.some((r) => cam.toLowerCase().startsWith(`${r.toLowerCase()}/`))) throw erro(403, `Pasta não liberada para gravação (liberadas: ${raizes.join(', ')}).`);
    if (cam.split('/').some((p) => p === '..' || p === '.')) throw erro(422, 'Caminho inválido.');
    if (!/-nfe\.xml$/i.test(cam)) throw erro(422, 'Só é permitido gravar arquivos *-nfe.xml.');
    const dados = b64(corpo.dados_b64, 'Arquivo');
    if (dados.subarray(0, 64).toString('utf8').replace(/^\uFEFF/, '').trimStart()[0] !== '<') throw erro(422, 'O arquivo não parece um XML.');
    await mkdir(path.dirname(cam), { recursive: true });
    await writeFile(cam, dados);
    return cam;
  }

  async function imprimir(corpo) {
    const nome = corpo.destino;
    const d = cfg.destinos[nome];
    if (!d) throw erro(404, `Destino "${nome}" não está configurado neste computador.`);
    if (corpo.tipo === 'png') {
      if (d.tipo !== 'windows' && d.tipo !== 'cups') throw erro(422, 'Impressão por imagem só em impressora instalada no computador (Windows ou CUPS).');
      const brutas = Array.isArray(corpo.paginas_b64) ? corpo.paginas_b64 : [corpo.dados_b64];
      if (brutas.length < 1 || brutas.length > 60) throw erro(422, 'Envie de 1 a 60 páginas por trabalho.');
      const pngs = brutas.map((x) => b64(x, 'Imagem'));
      if (pngs.some((p) => p.subarray(0, 4).toString('hex') !== '89504e47')) throw erro(422, 'A imagem precisa ser PNG.');
      const png = Array.isArray(corpo.paginas_b64) ? pngs : pngs[0]; // várias páginas = um trabalho, uma etiqueta por página
      const larguraMm = Number(corpo.largura_mm ?? d.largura_mm); const alturaMm = Number(corpo.altura_mm ?? d.altura_mm);
      if (!(larguraMm >= 10 && larguraMm <= 220 && alturaMm >= 5 && alturaMm <= 600)) throw erro(422, 'Informe largura_mm e altura_mm válidas.');
      const copias = Math.min(99, Math.max(1, Math.trunc(Number(corpo.copias) || 1)));
      return naFila(nome, () => (d.tipo === 'cups' ? T.cupsPng : T.windowsPng)(d, png, { larguraMm, alturaMm, copias }));
    }
    if (corpo.tipo !== 'raw') throw erro(422, 'tipo deve ser "raw" ou "png".');
    const bytes = b64(corpo.dados_b64, 'Dados');
    return naFila(nome, () => (d.tipo === 'rede' ? T.rede(d, bytes) : d.tipo === 'serial' ? T.serial(d, bytes) : d.tipo === 'cups' ? T.cupsRaw(d, bytes) : T.windowsRaw(d, bytes)));
  }

  /** Teste de impressão: comandos nativos para escpos/zpl/tspl; PNG gerado aqui para "imagem pelo driver". */
  async function testar(nome) {
    const d = cfg.destinos[nome];
    if (!d) throw erro(404, 'Destino não encontrado.');
    if (d.linguagem === 'imagem-driver') {
      const l = d.largura_mm ?? 62; const a = d.altura_mm ?? 45;
      return imprimir({ destino: nome, tipo: 'png', dados_b64: pngTeste(l, a, d.dpi ?? 203).toString('base64'), largura_mm: l, altura_mm: a });
    }
    const t = { texto: Buffer.from('TESTE DE IMPRESSAO\nSistema Paes\n\n\n\n', 'latin1'),
      escpos: Buffer.concat([Buffer.from([0x1b, 0x40]), Buffer.from('TESTE DE IMPRESSAO\nSistema Paes\n\n\n\n', 'latin1'), Buffer.from([0x1d, 0x56, 0x42, 0x00])]),
      zpl: Buffer.from('^XA^CI28^FO30,30^A0N,40,40^FDTESTE DE IMPRESSAO^FS^FO30,90^A0N,30,30^FDSistema Paes^FS^XZ'),
      tspl: Buffer.from('SIZE 62 mm,45 mm\r\nGAP 2 mm,0\r\nCLS\r\nTEXT 30,30,"3",0,1,1,"TESTE DE IMPRESSAO"\r\nPRINT 1,1\r\n') }[d.linguagem];
    return imprimir({ destino: nome, tipo: 'raw', dados_b64: t.toString('base64') });
  }

  const servidor = http.createServer(async (req, res) => {
    try {
      if (!hostOk(req)) return resp(res, 421, { message: 'Host não permitido: o agente só atende o próprio computador (127.0.0.1); o sistema o alcança pela conexão que o agente abre.' });
      const origem = req.headers.origin;
      const cors = origem && permitida(origem) ? { 'Access-Control-Allow-Origin': origem, Vary: 'Origin', 'Access-Control-Allow-Private-Network': 'true' } : {};
      if (origem && !permitida(origem)) return resp(res, 403, { message: 'Origem não autorizada. Adicione-a em "origens" na configuração do agente.' });
      if (req.method === 'OPTIONS') return resp(res, 204, '', { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, x-agente', 'Access-Control-Max-Age': '600' });
      const url = new URL(req.url, 'http://x');
      const r = (status, corpo) => resp(res, status, corpo, cors);

      if (req.method === 'GET' && url.pathname === '/status') return r(200, { ok: true, versao: VERSAO, plataforma: process.platform, destinos: Object.keys(cfg.destinos).length, recursos: ['imprimir', 'gravar'] });
      if (req.method === 'GET' && url.pathname === '/destinos') return r(200, Object.entries(cfg.destinos).map(([nome, d]) => ({ nome, ...d })));
      if (req.method === 'POST' && url.pathname === '/imprimir') {
        if (req.headers['x-agente'] !== 'paes') return r(400, { message: 'Cabeçalho X-Agente ausente.' });
        await imprimir(await lerJson(req));
        return r(200, { ok: true });
      }

      if (req.method === 'POST' && url.pathname === '/gravar') {
        if (req.headers['x-agente'] !== 'paes') return r(400, { message: 'Cabeçalho X-Agente ausente.' });
        return r(200, { ok: true, caminho: await gravar(await lerJson(req)) });
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
        // pastas liberadas para gravar o XML da NF-e (sistema antigo) e se esta máquina as enxerga
        if (req.method === 'GET' && url.pathname === '/api/pastas') return r(200, await Promise.all(pastas().map(async (p) => ({ pasta: p, existe: await stat(p).then((x) => x.isDirectory(), () => false) }))));
        if (req.method === 'POST' && url.pathname === '/api/pastas') {
          const b = await lerJson(req);
          const lista = String(b.pastas ?? '').split(/[;\n]/).map((x) => x.trim().replaceAll('\\', '/').replace(/\/+$/, '')).filter(Boolean);
          if (!lista.length || lista.some((x) => !/^([A-Za-z]:|\/\/[^/]+\/[^/]+|\/)/.test(x) || x.split('/').includes('..'))) return r(422, { message: 'Informe pastas válidas (ex.: N:/EDSMonitorPLUS/Arqs), uma por linha.' });
          cfg.pastas_gravacao = lista; salvaConfig(cfg, arquivoCfg);
          return r(200, { ok: true, pastas: lista });
        }
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
        // conexão do agente com o sistema (endereço + token de pareamento) e o estado dela
        if (req.method === 'GET' && url.pathname === '/api/sistema') return r(200, { url: cfg.sistema_url, tem_token: Boolean(cfg.sistema_token), ...estadoTunel });
        if (req.method === 'POST' && url.pathname === '/api/sistema') {
          const b = await lerJson(req);
          const u = String(b.url ?? '').trim().replace(/\/+$/, '');
          if (u && !/^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(u)) return r(422, { message: 'Endereço inválido. Use o formato https://paes.seudominio.com.br' });
          const t = String(b.token ?? '').trim();
          if (t && (t.length < 16 || /\s/.test(t))) return r(422, { message: 'Token inválido (16 caracteres ou mais, sem espaços).' });
          cfg.sistema_url = u; if (t) cfg.sistema_token = t;
          if (u && !cfg.origens.includes(u)) cfg.origens.push(u); // o mesmo endereço também pode imprimir direto pelo navegador deste PC
          salvaConfig(cfg, arquivoCfg); deps.aoMudarSistema?.();
          return r(200, { ok: true, url: cfg.sistema_url, tem_token: Boolean(cfg.sistema_token) });
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
  servidor.on('error', (e) => console.error('Erro no servidor:', e.message));
  return servidor;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.on('uncaughtException', (e) => console.error('Erro não tratado (o agente continua):', e));
  process.on('unhandledRejection', (e) => console.error('Promessa rejeitada (o agente continua):', e));
  const arquivoCfg = caminhoConfig();
  const cfg = carregaConfig(arquivoCfg);
  let tunel;
  criaServidor({ cfg, arquivoCfg, deps: { aoMudarSistema: () => tunel?.reinicia() } }).listen(cfg.porta, '127.0.0.1', () => {
    console.log(`Agente de impressão ${VERSAO} em http://127.0.0.1:${cfg.porta} (config: ${arquivoCfg})`);
    cfg.versao = VERSAO; tunel = iniciaTunel({ cfg }); // conecta ao sistema (se já houver endereço e token)
  });
}
