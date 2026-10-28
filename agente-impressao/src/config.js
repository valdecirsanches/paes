import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const LINGUAGENS = ['imagem-driver', 'escpos', 'zpl', 'tspl'];
export const TIPOS = ['windows', 'rede', 'serial'];

export function caminhoConfig() {
  if (process.env.AGENTE_CONFIG) return process.env.AGENTE_CONFIG;
  const base = process.platform === 'win32' ? path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'PaesAgenteImpressao') : path.join(os.homedir(), '.paes-agente-impressao');
  return path.join(base, 'config.json');
}

const PADRAO = { porta: 9101, escuta: '127.0.0.1', token: '', origens: ['http://localhost:5072', 'http://127.0.0.1:5072', 'https://paes.x-star.com.br'], destinos: {} };

/** Valida um destino. Devolve o destino normalizado ou lança Error com mensagem em português. */
export function validaDestino(nome, d) {
  if (typeof nome !== 'string' || !nome.trim() || nome.length > 60) throw new Error('Nome do destino inválido (1 a 60 caracteres).');
  if (!d || !TIPOS.includes(d.tipo)) throw new Error(`Tipo inválido. Use: ${TIPOS.join(', ')}.`);
  const o = { tipo: d.tipo, linguagem: LINGUAGENS.includes(d.linguagem) ? d.linguagem : 'imagem-driver' };
  if (d.tipo === 'windows') {
    if (!d.impressora || typeof d.impressora !== 'string' || d.impressora.length > 200) throw new Error('Informe o nome da impressora do Windows.');
    o.impressora = d.impressora;
  } else if (d.tipo === 'rede') {
    if (!/^[A-Za-z0-9._-]{1,253}$/.test(d.host ?? '')) throw new Error('Host/IP inválido.');
    const p = Number(d.porta ?? 9100);
    if (!Number.isInteger(p) || p < 1 || p > 65535) throw new Error('Porta inválida.');
    o.host = d.host; o.porta = p;
  } else {
    if (!/^COM\d{1,3}$/i.test(d.com ?? '')) throw new Error('Porta serial inválida (ex.: COM3).');
    const b = Number(d.baud ?? 9600);
    if (![1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].includes(b)) throw new Error('Velocidade (baud) inválida.');
    o.com = d.com.toUpperCase(); o.baud = b;
  }
  // Dados de conexão informados em outro tipo também ficam gravados (antes eram descartados e, ao Editar, os campos voltavam em branco).
  const vazio = (v) => v === undefined || v === null || String(v).trim() === '';
  if (o.host === undefined && !vazio(d.host)) {
    if (!/^[A-Za-z0-9._-]{1,253}$/.test(String(d.host).trim())) throw new Error('Host/IP inválido.');
    const p = Number(vazio(d.porta) ? 9100 : d.porta);
    if (!Number.isInteger(p) || p < 1 || p > 65535) throw new Error('Porta inválida.');
    o.host = String(d.host).trim(); o.porta = p;
  }
  if (o.com === undefined && !vazio(d.com)) {
    if (!/^COM\d{1,3}$/i.test(String(d.com).trim())) throw new Error('Porta serial inválida (ex.: COM3).');
    const b = Number(vazio(d.baud) ? 9600 : d.baud);
    if (![1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].includes(b)) throw new Error('Velocidade (baud) inválida.');
    o.com = String(d.com).trim().toUpperCase(); o.baud = b;
  }
  if (o.impressora === undefined && typeof d.impressora === 'string' && d.impressora.trim() && d.impressora.length <= 200) o.impressora = d.impressora;
  if (o.tipo !== 'windows' && o.linguagem === 'imagem-driver') throw new Error('"Imagem pelo driver" só existe para impressoras instaladas no Windows (ex.: Brother QL-800): escolha Tipo = Impressora do Windows e a impressora na lista; o IP não é usado. Para tipo rede/serial escolha ESC/POS, ZPL ou TSPL.');
  const n = (v, min, max, rot) => { if (v === undefined || v === null || v === '') return undefined; const x = Number(v); if (!(x >= min && x <= max)) throw new Error(`${rot} fora do intervalo ${min}-${max}.`); return x; };
  const dpi = n(d.dpi, 100, 600, 'DPI'); if (dpi) o.dpi = dpi;
  const l = n(d.largura_mm, 10, 220, 'Largura (mm)'); if (l) o.largura_mm = l;
  const a = n(d.altura_mm, 5, 600, 'Altura (mm)'); if (a) o.altura_mm = a;
  if (d.cortar !== undefined) o.cortar = !!d.cortar;
  if (d.invertido !== undefined) o.invertido = !!d.invertido;
  return o;
}

/** Acesso pela rede (servidor em outra máquina): { permitir, token } → { escuta, token }. Token novo é gerado se faltar. */
export function validaRede({ permitir, token }, atual = '') {
  if (!permitir) return { escuta: '127.0.0.1', token: typeof atual === 'string' ? atual : '' };
  let t = String(token ?? '').trim() || String(atual ?? '').trim();
  if (!t) t = crypto.randomBytes(24).toString('base64url');
  if (t.length < 16 || /\s/.test(t)) throw new Error('O token deve ter ao menos 16 caracteres, sem espaços.');
  return { escuta: '0.0.0.0', token: t };
}
/** IPv4 desta máquina na rede (para informar ao servidor). */
export function ipsDaMaquina() {
  return Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')).map((i) => i.address);
}

/** Lê o JSON tolerando BOM (o PowerShell 5 grava UTF-8 com BOM: o instalador antigo fazia o agente "esquecer" tudo). */
const leJson = (arq) => JSON.parse(fs.readFileSync(arq, 'utf8').replace(/^\uFEFF/, ''));

export function carregaConfig(arquivo = caminhoConfig()) {
  let c = {};
  let origem = 'nova';
  try { c = leJson(arquivo); origem = 'arquivo'; } catch (e) {
    if (e.code !== 'ENOENT') {
      // existe mas não deu para ler: nunca começar do zero (o próximo "salvar" apagaria as impressoras). Usa a cópia .bak
      // e guarda o arquivo problemático ao lado para conserto manual.
      try { c = leJson(`${arquivo}.bak`); origem = 'backup'; console.warn(`[config] ${arquivo} ilegível (${e.message}); usando ${arquivo}.bak`); } catch { console.warn(`[config] ${arquivo} ilegível (${e.message}) e sem backup.`); }
      try { fs.copyFileSync(arquivo, `${arquivo}.corrompido-${Date.now()}`); } catch { /* sem permissão: segue */ }
    }
  }
  const cfg = { ...PADRAO, ...c, destinos: {}, invalidos: {}, _origem: origem };
  for (const [n, d] of Object.entries(c.destinos ?? {})) {
    try { cfg.destinos[n] = validaDestino(n, d); } catch (e) {
      // destino que não passa na validação NÃO é descartado: fica guardado como está (e volta ao salvar) até o usuário corrigir/excluir
      cfg.invalidos[n] = { bruto: d, motivo: e.message }; console.warn(`[config] destino "${n}" inválido, mantido sem uso: ${e.message}`);
    }
  }
  if (!Array.isArray(cfg.origens)) cfg.origens = PADRAO.origens;
  cfg.token = typeof cfg.token === 'string' ? cfg.token.trim() : '';
  // escutar na rede só faz sentido (e só é aceito) com token: sem ele o agente fica restrito a este computador
  if (cfg.escuta !== '0.0.0.0' || cfg.token.length < 16) cfg.escuta = '127.0.0.1';
  return cfg;
}
export function salvaConfig(cfg, arquivo = caminhoConfig()) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const destinos = { ...Object.fromEntries(Object.entries(cfg.invalidos ?? {}).map(([n, v]) => [n, v.bruto])), ...cfg.destinos };
  const texto = JSON.stringify({ porta: cfg.porta, escuta: cfg.escuta, token: cfg.token, origens: cfg.origens, destinos }, null, 2);
  try { if (fs.existsSync(arquivo)) { leJson(arquivo); fs.copyFileSync(arquivo, `${arquivo}.bak`); } } catch { /* o atual está ilegível: não sobrescreve um bom .bak */ }
  const tmp = `${arquivo}.tmp`;
  try {
    fs.writeFileSync(tmp, texto);
    fs.renameSync(tmp, arquivo);
  } catch (e) {
    // Windows: rename pode dar EPERM/EBUSY (antivírus, arquivo criado por outro usuário). Grava direto e limpa o temporário.
    try { fs.rmSync(tmp, { force: true }); } catch { /* ignora */ }
    try { fs.writeFileSync(arquivo, texto); } catch (e2) { throw new Error(`Sem permissão para gravar ${arquivo}. Rode o instalador de novo (ele libera a pasta) ou dê "Modificar" ao seu usuário nessa pasta. (${e2.code ?? e.code})`); }
  }
}
