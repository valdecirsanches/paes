import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { criaServidor } from '../src/server.js';
import { carregaConfig, salvaConfig, validaDestino } from '../src/config.js';
import { PS_PNG, PS_RAW } from '../src/transportes.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
const monta = async ({ destinos = {}, deps = {} } = {}) => {
  const arquivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ag-')), 'c.json');
  const cfg = { porta: 0, origens: ['https://paes.exemplo.com'], destinos };
  const s = criaServidor({ cfg, arquivoCfg: arquivo, deps });
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
  cfg.porta = s.address().port;
  const base = `http://127.0.0.1:${cfg.porta}`;
  const call = async (m, u, b, h = {}) => { const r = await fetch(base + u, { method: m, headers: { 'content-type': 'application/json', ...h }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, headers: r.headers, json: await r.json().catch(() => ({})) }; };
  return { s, cfg, call, base, arquivo };
};
const H = { origin: 'https://paes.exemplo.com', 'x-agente': 'paes' };

test('destinos: validação', () => {
  assert.throws(() => validaDestino('', { tipo: 'rede' }));
  assert.throws(() => validaDestino('a', { tipo: 'xx' }));
  assert.throws(() => validaDestino('a', { tipo: 'rede', host: 'a b' }));
  assert.throws(() => validaDestino('a', { tipo: 'rede', host: '10.0.0.1', porta: 70000 }));
  assert.throws(() => validaDestino('a', { tipo: 'serial', com: 'LPT1' }));
  assert.throws(() => validaDestino('a', { tipo: 'rede', host: '10.0.0.1', linguagem: 'imagem-driver' }), /só existe para impressoras instaladas/);
  assert.deepEqual(validaDestino('a', { tipo: 'rede', host: '10.0.0.1', linguagem: 'zpl', dpi: 203 }), { tipo: 'rede', linguagem: 'zpl', host: '10.0.0.1', porta: 9100, dpi: 203 });
});
test('config: salva e recarrega, ignorando destino inválido', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ag-')), 'x', 'c.json');
  salvaConfig({ porta: 9101, origens: ['http://a'], destinos: { ok: { tipo: 'rede', linguagem: 'escpos', host: '1.2.3.4', porta: 9100 } } }, f);
  const j = JSON.parse(fs.readFileSync(f, 'utf8')); j.destinos.ruim = { tipo: 'serial', com: 'XX' }; fs.writeFileSync(f, JSON.stringify(j));
  assert.deepEqual(Object.keys(carregaConfig(f).destinos), ['ok']);
});
test('CORS: origem permitida recebe cabeçalhos (inclui Private Network); outra é barrada', async () => {
  const { s, call } = await monta();
  const ok = await call('GET', '/status', undefined, { origin: 'https://paes.exemplo.com' });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://paes.exemplo.com');
  assert.equal(ok.headers.get('access-control-allow-private-network'), 'true');
  assert.equal((await call('GET', '/status', undefined, { origin: 'https://evil.example' })).status, 403);
  const pre = await call('OPTIONS', '/imprimir', undefined, { origin: 'https://paes.exemplo.com' });
  assert.equal(pre.status, 204);
  s.close();
});
test('Host estranho (DNS rebinding) é recusado', async () => {
  const { s, base } = await monta();
  const r = await new Promise((ok) => { const q = net.connect({ host: '127.0.0.1', port: Number(new URL(base).port) }, () => q.write('GET /status HTTP/1.1\r\nHost: evil.example\r\nConnection: close\r\n\r\n')); let d = ''; q.on('data', (c) => { d += c; }); q.on('end', () => ok(d)); });
  assert.match(r, /^HTTP\/1.1 421/);
  s.close();
});
test('imprimir exige X-Agente, destino existente e dados válidos', async () => {
  const { s, call } = await monta({ destinos: { e: { tipo: 'rede', linguagem: 'escpos', host: '127.0.0.1', porta: 1 } } });
  assert.equal((await call('POST', '/imprimir', { destino: 'e', tipo: 'raw', dados_b64: 'AA==' }, { origin: H.origin })).status, 400);
  assert.equal((await call('POST', '/imprimir', { destino: 'nao', tipo: 'raw', dados_b64: 'AA==' }, H)).status, 404);
  assert.equal((await call('POST', '/imprimir', { destino: 'e', tipo: 'raw', dados_b64: '!!!' }, H)).status, 422);
  assert.equal((await call('POST', '/imprimir', { destino: 'e', tipo: 'xx', dados_b64: 'AA==' }, H)).status, 422);
  assert.equal((await call('POST', '/imprimir', { destino: 'e', tipo: 'png', dados_b64: PNG }, H)).status, 422); // png só no Windows
  s.close();
});
test('rede: os bytes chegam inteiros na impressora (TCP 9100)', async () => {
  const recebido = new Promise((ok) => { const srv = net.createServer((c) => { const p = []; c.on('data', (d) => p.push(d)); c.on('end', () => { ok(Buffer.concat(p)); srv.close(); }); }); srv.listen(0, '127.0.0.1', () => { global.__porta = srv.address().port; }); });
  await new Promise((r) => setTimeout(r, 50));
  const { s, call } = await monta({ destinos: { e: { tipo: 'rede', linguagem: 'escpos', host: '127.0.0.1', porta: global.__porta } } });
  const dados = Buffer.from([0x1b, 0x40, 0x41, 0x0a, 0x1d, 0x56, 0x42, 0x00, 0xff]);
  assert.equal((await call('POST', '/imprimir', { destino: 'e', tipo: 'raw', dados_b64: dados.toString('base64') }, H)).status, 200);
  assert.deepEqual(await recebido, dados);
  s.close();
});
test('rede fora do ar devolve erro legível', async () => {
  const { s, call } = await monta({ destinos: { e: { tipo: 'rede', linguagem: 'zpl', host: '127.0.0.1', porta: 1 } } });
  const r = await call('POST', '/imprimir', { destino: 'e', tipo: 'raw', dados_b64: 'AA==' }, H);
  assert.equal(r.status, 500); assert.match(r.json.message, /impressora de rede/);
  s.close();
});
test('windows: png e raw chegam ao transporte com os parâmetros certos, em fila', async () => {
  const chamadas = [];
  const deps = { windowsPng: async (d, png, o) => { chamadas.push(['png', d.impressora, png.length, o]); }, windowsRaw: async (d, b) => { chamadas.push(['raw', d.impressora, b.length]); } };
  const { s, call } = await monta({ destinos: { w: { tipo: 'windows', linguagem: 'imagem-driver', impressora: 'Brother QL-800', largura_mm: 62, altura_mm: 45 } }, deps });
  assert.equal((await call('POST', '/imprimir', { destino: 'w', tipo: 'png', dados_b64: PNG, copias: 3 }, H)).status, 200);
  assert.equal((await call('POST', '/imprimir', { destino: 'w', tipo: 'raw', dados_b64: 'AAEC' }, H)).status, 200);
  assert.deepEqual(chamadas[0], ['png', 'Brother QL-800', 16, { larguraMm: 62, alturaMm: 45, copias: 3 }]);
  assert.deepEqual(chamadas[1], ['raw', 'Brother QL-800', 3]);
  assert.equal((await call('POST', '/imprimir', { destino: 'w', tipo: 'png', dados_b64: Buffer.from('nao-png').toString('base64') }, H)).status, 422);
  s.close();
});
test('administração: só pela própria página; gravar/excluir destino', async () => {
  const { s, call, base, arquivo, cfg } = await monta();
  const novo = { nome: 'Cupom', tipo: 'rede', host: '10.0.0.5', linguagem: 'escpos' };
  assert.equal((await call('POST', '/api/destinos', novo, { origin: 'https://paes.exemplo.com' })).status, 403);
  assert.equal((await call('POST', '/api/destinos', novo)).status, 403); // sem Origin também não grava
  assert.equal((await call('POST', '/api/destinos', novo, { origin: base })).status, 200);
  assert.equal(JSON.parse(fs.readFileSync(arquivo, 'utf8')).destinos.Cupom.porta, 9100);
  assert.equal((await call('POST', '/api/destinos', { nome: 'x', tipo: 'rede', host: 'a b' }, { origin: base })).status, 422);
  const lista = await call('GET', '/destinos', undefined, { origin: 'https://paes.exemplo.com' });
  assert.equal(lista.json[0].nome, 'Cupom');
  assert.equal((await call('DELETE', '/api/destinos/Cupom', undefined, { origin: base })).status, 200);
  assert.deepEqual(cfg.destinos, {});
  assert.equal((await fetch(base + '/')).status, 200);
  s.close();
});
test('scripts do PowerShell: parâmetros por argumento (sem interpolação)', () => {
  for (const sc of [PS_RAW, PS_PNG]) { assert.match(sc, /^param\(/); assert.doesNotMatch(sc, /\$\{/); }
  assert.match(PS_PNG, /PaperSize/); assert.match(PS_RAW, /"RAW"/);
});

test('teste de destino: liberado ao sistema web e gera PNG próprio para imagem-driver', async () => {
  const chamadas = [];
  const deps = { windowsPng: async (d, png, o) => { chamadas.push([png.subarray(0, 4).toString('hex'), o]); }, windowsRaw: async (d, b) => { chamadas.push(['raw', b.length]); } };
  const { s, call } = await monta({ destinos: {
    img: { tipo: 'windows', linguagem: 'imagem-driver', impressora: 'X', largura_mm: 62, altura_mm: 45 },
    eps: { tipo: 'windows', linguagem: 'escpos', impressora: 'Y' } }, deps });
  assert.equal((await call('POST', '/testar', { destino: 'img' }, { origin: 'https://paes.exemplo.com' })).status, 400); // sem X-Agente
  assert.equal((await call('POST', '/testar', { destino: 'img' }, H)).status, 200);
  assert.equal((await call('POST', '/testar', { destino: 'eps' }, H)).status, 200);
  assert.equal((await call('POST', '/testar', { destino: 'nao' }, H)).status, 404);
  assert.deepEqual(chamadas[0], ['89504e47', { larguraMm: 62, alturaMm: 45, copias: 1 }]);
  assert.equal(chamadas[1][0], 'raw');
  s.close();
});

// ---- o agente só atende o próprio computador; o sistema o alcança pela conexão que o agente abre (túnel) ----
import http from 'node:http';
import { iniciaTunel } from '../src/tunel.js';
const comHost = (porta, caminho, host) => new Promise((ok, falha) => {
  const req = http.request({ host: '127.0.0.1', port: porta, path: caminho, headers: { Host: host } }, (res) => { res.resume(); res.on('end', () => ok(res.statusCode)); });
  req.on('error', falha); req.end();
});
test('Host que não é do próprio computador é recusado (421)', async () => {
  const { s, cfg } = await monta();
  try { assert.equal(await comHost(cfg.porta, '/status', '192.168.15.8:9101'), 421); assert.equal(await comHost(cfg.porta, '/status', `127.0.0.1:${cfg.porta}`), 200); } finally { s.close(); }
});
const esperaAte = async (fn, ms = 3000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 20)); };
test('túnel: busca o pedido no sistema, executa no próprio agente e devolve o resultado', async () => {
  const { s, cfg } = await monta({ destinos: { etq: { tipo: 'rede', linguagem: 'zpl', host: '10.0.0.9', porta: 9100 } } });
  cfg.sistema_url = 'http://sistema.test'; cfg.sistema_token = 't'.repeat(20);
  const pedidos = [{ id: 'a', metodo: 'GET', caminho: '/destinos' }, { id: 'b', metodo: 'POST', caminho: '/gravar', corpo: {} }]; const respostas = []; let auth;
  const fetchImpl = async (url, opc = {}) => {
    if (url.startsWith('http://sistema.test/api/agente-tunel/proximo')) { auth = opc.headers.Authorization; const j = pedidos.shift(); if (j) return new Response(JSON.stringify(j), { status: 200 }); await new Promise((r) => setTimeout(r, 30)); return new Response(null, { status: 204 }); }
    if (url === 'http://sistema.test/api/agente-tunel/resposta') { respostas.push(JSON.parse(opc.body)); return new Response('{}'); }
    return fetch(url, opc);
  };
  const t = iniciaTunel({ cfg, fetchImpl, esperaErroMs: 10 });
  try {
    await esperaAte(() => respostas.length === 2);
    assert.equal(auth, `Bearer ${'t'.repeat(20)}`);
    assert.equal(respostas[0].id, 'a'); assert.equal(respostas[0].status, 200); assert.equal(respostas[0].corpo[0].nome, 'etq');
    assert.equal(respostas[1].id, 'b'); assert.equal(respostas[1].status, 403); // /gravar não é liberado pelo túnel
  } finally { t.para(); s.close(); }
});
test('túnel: token recusado vira mensagem clara e o agente segue tentando', async () => {
  const { s, cfg } = await monta();
  cfg.sistema_url = 'http://sistema.test'; cfg.sistema_token = 'x'.repeat(20);
  const { estadoTunel } = await import('../src/tunel.js');
  const t = iniciaTunel({ cfg, fetchImpl: async () => new Response('{}', { status: 401 }), esperaErroMs: 10 });
  try { await esperaAte(() => estadoTunel.ultimoErro); assert.match(estadoTunel.ultimoErro, /recusou o token/); assert.equal(estadoTunel.conectado, false); } finally { t.para(); s.close(); }
});
test('POST /api/sistema grava endereço e token (só pela página do agente) e a escuta continua local', async () => {
  const { s, cfg, call } = await monta();
  const base = `http://127.0.0.1:${cfg.porta}`;
  try {
    assert.equal((await call('POST', '/api/sistema', { url: 'https://paes.x.com', token: 'k'.repeat(24) }, { origin: 'https://paes.x.com' })).status, 403);
    assert.equal((await call('POST', '/api/sistema', { url: 'ftp://x', token: 'k'.repeat(24) }, { origin: base })).status, 422);
    assert.equal((await call('POST', '/api/sistema', { url: 'https://paes.x.com/', token: 'curto' }, { origin: base })).status, 422);
    assert.equal((await call('POST', '/api/sistema', { url: 'https://paes.x.com/', token: 'k'.repeat(24) }, { origin: base })).status, 200);
    assert.equal(cfg.sistema_url, 'https://paes.x.com'); assert.equal(cfg.sistema_token, 'k'.repeat(24));
  } finally { s.close(); }
});
test('config antiga com escuta 0.0.0.0/token volta a escutar só no próprio computador', () => {
  const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ag-')), 'c.json');
  fs.writeFileSync(arq, JSON.stringify({ escuta: '0.0.0.0', token: 'segredo-bem-longo-123456' }));
  const c = carregaConfig(arq); assert.equal(c.escuta, '127.0.0.1'); assert.equal(c.token, undefined);
});

// ---- não perder impressoras ----
test('config com BOM (instalador do PowerShell 5) continua sendo lida', () => {
  const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ag-')), 'c.json');
  fs.writeFileSync(arq, '﻿' + JSON.stringify({ destinos: { etq: { tipo: 'rede', host: '10.0.0.9', linguagem: 'zpl' } } }));
  assert.deepEqual(Object.keys(carregaConfig(arq).destinos), ['etq']);
});
test('config ilegível: usa o .bak e guarda o arquivo ruim, sem começar do zero', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-')); const arq = path.join(dir, 'c.json');
  fs.writeFileSync(`${arq}.bak`, JSON.stringify({ destinos: { etq: { tipo: 'rede', host: '10.0.0.9', linguagem: 'zpl' } } }));
  fs.writeFileSync(arq, '{ quebrado');
  const c = carregaConfig(arq);
  assert.deepEqual(Object.keys(c.destinos), ['etq']);
  assert.ok(fs.readdirSync(dir).some((f) => f.includes('.corrompido-')));
});
test('destino inválido não é apagado ao salvar; salvar faz backup', () => {
  const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ag-')), 'c.json');
  fs.writeFileSync(arq, JSON.stringify({ destinos: { bom: { tipo: 'rede', host: '10.0.0.9', linguagem: 'zpl' }, velho: { tipo: 'rede', host: '10.0.0.8', linguagem: 'imagem-driver' } } }));
  const c = carregaConfig(arq);
  assert.deepEqual(Object.keys(c.destinos), ['bom']); assert.ok(c.invalidos.velho.motivo);
  salvaConfig(c, arq);
  const gravado = JSON.parse(fs.readFileSync(arq, 'utf8'));
  assert.deepEqual(Object.keys(gravado.destinos).sort(), ['bom', 'velho']);
  assert.ok(fs.existsSync(`${arq}.bak`));
});
test('editar: o POST com o mesmo nome atualiza o destino e limpa o inválido', async () => {
  const { s, cfg, call, arquivo } = await monta({ destinos: { etq: { tipo: 'rede', host: '10.0.0.9', porta: 9100, linguagem: 'zpl' } } });
  try {
    const r = await call('POST', '/api/destinos', { nome: 'etq', tipo: 'rede', host: '10.0.0.77', porta: 9100, linguagem: 'zpl', edicao: true }, { origin: `http://127.0.0.1:${cfg.porta}` });
    assert.equal(r.status, 200); assert.equal(cfg.destinos.etq.host, '10.0.0.77');
    assert.equal(JSON.parse(fs.readFileSync(arquivo, 'utf8')).destinos.etq.host, '10.0.0.77');
  } finally { s.close(); }
});

test('png em várias páginas vai num único trabalho (uma etiqueta por página)', async () => {
  const chamadas = [];
  const { s, call } = await monta({ destinos: { ql: { tipo: 'windows', linguagem: 'imagem-driver', impressora: 'Brother QL-800', largura_mm: 62, altura_mm: 45 } }, deps: { windowsPng: async (d, png, o) => { chamadas.push([Array.isArray(png) ? png.length : 'um', o]); } } });
  try {
    assert.equal((await call('POST', '/imprimir', { destino: 'ql', tipo: 'png', paginas_b64: [PNG, PNG, PNG] }, H)).status, 200);
    assert.deepEqual(chamadas, [[3, { larguraMm: 62, alturaMm: 45, copias: 1 }]]);
    assert.equal((await call('POST', '/imprimir', { destino: 'ql', tipo: 'png', paginas_b64: [] }, H)).status, 422);
  } finally { s.close(); }
});

test('validaDestino guarda IP/host e COM informados mesmo para destino do Windows (Editar não volta em branco)', () => {
  const d = validaDestino('Etiquetas', { tipo: 'windows', impressora: 'ImpressoraTermica', linguagem: 'escpos', host: '192.168.15.50', porta: '9100', com: 'com3', baud: '9600' });
  assert.equal(d.host, '192.168.15.50'); assert.equal(d.porta, 9100); assert.equal(d.com, 'COM3'); assert.equal(d.baud, 9600);
  const so = validaDestino('Etiquetas', { tipo: 'windows', impressora: 'X', linguagem: 'escpos', host: '', com: '' });
  assert.equal(so.host, undefined); assert.equal(so.com, undefined);
  const r = validaDestino('Rede', { tipo: 'rede', host: '10.0.0.9', linguagem: 'zpl', impressora: 'Zebra' });
  assert.equal(r.impressora, 'Zebra');
  assert.throws(() => validaDestino('E', { tipo: 'windows', impressora: 'X', linguagem: 'escpos', host: 'a b' }), /Host/);
});

test('/gravar: grava *-nfe.xml só em pasta liberada', async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'arqs-')).replaceAll('\\', '/');
  const { s, cfg, call } = await monta();
  cfg.pastas_gravacao = [raiz];
  const xml = Buffer.from('<nfeProc/>').toString('base64');
  try {
    const dest = `${raiz}/03707154000106/NFe/29102026/NFe/35261003707154000106550010000712361229244540-nfe.xml`;
    assert.equal((await call('POST', '/gravar', { caminho: dest, dados_b64: xml }, H)).status, 200);
    assert.equal(fs.readFileSync(dest, 'utf8'), '<nfeProc/>');
    assert.equal((await call('POST', '/gravar', { caminho: '/etc/x-nfe.xml', dados_b64: xml }, H)).status, 403);
    assert.equal((await call('POST', '/gravar', { caminho: `${raiz}/../fora-nfe.xml`, dados_b64: xml }, H)).status, 422);
    assert.equal((await call('POST', '/gravar', { caminho: `${raiz}/a.exe`, dados_b64: xml }, H)).status, 422);
    assert.equal((await call('POST', '/gravar', { caminho: `${raiz}/a-nfe.xml`, dados_b64: Buffer.from('MZ').toString('base64') }, H)).status, 422);
    assert.equal((await call('POST', '/gravar', { caminho: `${raiz}/a-nfe.xml`, dados_b64: xml }, { origin: H.origin })).status, 400);
  } finally { s.close(); }
});

test('/api/pastas: lista e grava as pastas liberadas; status informa a versão e o recurso gravar', async () => {
  const { s, call, cfg } = await monta();
  try {
    const st = await call('GET', '/status', undefined, {});
    assert.match(st.json.versao, /^1\.[1-9]/); assert.ok(st.json.recursos.includes('gravar'));
    const origem = { origin: `http://127.0.0.1:${cfg.porta}` };
    assert.equal((await call('POST', '/api/pastas', { pastas: 'N:/EDSMonitorPLUS/Arqs\nD:/x' }, origem)).status, 200);
    assert.deepEqual(cfg.pastas_gravacao, ['N:/EDSMonitorPLUS/Arqs', 'D:/x']);
    assert.equal((await call('POST', '/api/pastas', { pastas: '../x' }, origem)).status, 422);
    assert.equal((await call('GET', '/api/pastas', undefined, origem)).json.length, 2);
  } finally { s.close(); }
});

test('CUPS: destino exige nome sem espaços; imagem pelo driver vale para cups; imprime raw e png via lp', async () => {
  assert.throws(() => validaDestino('c', { tipo: 'cups', impressora: 'Brother QL 800' }), /CUPS/);
  assert.throws(() => validaDestino('c', { tipo: 'cups', impressora: '-o raw' }), /CUPS/);
  assert.equal(validaDestino('c', { tipo: 'cups', impressora: 'Brother_QL-800', linguagem: 'imagem-driver' }).tipo, 'cups');
  const chamadas = [];
  const { s, call } = await monta({ destinos: { q: { tipo: 'cups', impressora: 'Brother_QL-800', linguagem: 'imagem-driver', largura_mm: 62, altura_mm: 45 }, t: { tipo: 'cups', impressora: 'termica', linguagem: 'escpos' } },
    deps: { cupsPng: async (d, png, o) => chamadas.push(['png', d.impressora, png.length, o]), cupsRaw: async (d, b) => chamadas.push(['raw', d.impressora, b.length]) } });
  try {
    assert.equal((await call('POST', '/imprimir', { destino: 'q', tipo: 'png', paginas_b64: [PNG, PNG] }, H)).status, 200);
    assert.equal((await call('POST', '/imprimir', { destino: 't', tipo: 'raw', dados_b64: Buffer.from('ABC').toString('base64') }, H)).status, 200);
    assert.deepEqual(chamadas, [['png', 'Brother_QL-800', 2, { larguraMm: 62, alturaMm: 45, copias: 1 }], ['raw', 'termica', 3]]);
  } finally { s.close(); }
});

test('túnel: endereço https para um sistema que só fala http é corrigido sozinho', async () => {
  const { s, cfg } = await monta();
  cfg.sistema_url = 'https://127.0.0.1:5071'; cfg.sistema_token = 'x'.repeat(20);
  let salvou = '';
  const fetchImpl = async (url) => {
    if (url.startsWith('https://')) { const e = new TypeError('fetch failed'); e.cause = { code: 'ERR_SSL_WRONG_VERSION_NUMBER' }; throw e; }
    if (url.startsWith('http://127.0.0.1:5071')) { await new Promise((r) => setTimeout(r, 20)); return new Response(null, { status: 204 }); }
    return fetch(url);
  };
  const { estadoTunel } = await import('../src/tunel.js');
  const t = iniciaTunel({ cfg, fetchImpl, esperaErroMs: 10, aoCorrigirUrl: (u) => { salvou = u; } });
  try { await esperaAte(() => estadoTunel.conectado); assert.equal(cfg.sistema_url, 'http://127.0.0.1:5071'); assert.equal(salvou, 'http://127.0.0.1:5071'); } finally { t.para(); s.close(); }
});
