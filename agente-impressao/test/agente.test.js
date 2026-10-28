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

// ---- acesso remoto (servidor do sistema em outra máquina) ----
import http from 'node:http';
const remoto = (porta, caminho, { metodo = 'GET', token, corpo, host = '192.168.15.8:9101' } = {}) => new Promise((ok, falha) => {
  const req = http.request({ host: '127.0.0.1', port: porta, path: caminho, method: metodo, headers: { Host: host, 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(corpo ? { 'x-agente': 'paes' } : {}) } }, (res) => {
    let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => ok({ status: res.statusCode, corpo: t ? JSON.parse(t) : null }));
  });
  req.on('error', falha); if (corpo) req.write(JSON.stringify(corpo)); req.end();
});
const TOKEN = 'segredo-bem-longo-123456';

test('remoto: sem token ou com token errado é recusado', async () => {
  const { s, cfg } = await monta(); cfg.token = TOKEN;
  try {
    assert.equal((await remoto(cfg.porta, '/status')).status, 421);
    assert.equal((await remoto(cfg.porta, '/status', { token: 'errado-errado-errado' })).status, 401);
  } finally { s.close(); }
});
test('remoto: sem token configurado nada passa, mesmo mandando um token', async () => {
  const { s, cfg } = await monta();
  try { assert.equal((await remoto(cfg.porta, '/status', { token: TOKEN })).status, 401); } finally { s.close(); }
});
test('remoto: com token lista destinos e imprime; administração fica bloqueada', async () => {
  const enviados = [];
  const { s, cfg } = await monta({ destinos: { etq: { tipo: 'rede', linguagem: 'zpl', host: '10.0.0.9', porta: 9100 } }, deps: { rede: async (d, b) => { enviados.push(b.toString()); } } });
  cfg.token = TOKEN;
  try {
    assert.equal((await remoto(cfg.porta, '/status', { token: TOKEN })).corpo.ok, true);
    assert.equal((await remoto(cfg.porta, '/destinos', { token: TOKEN })).corpo[0].nome, 'etq');
    const r = await remoto(cfg.porta, '/imprimir', { metodo: 'POST', token: TOKEN, corpo: { destino: 'etq', tipo: 'raw', dados_b64: Buffer.from('^XA^XZ').toString('base64') } });
    assert.equal(r.status, 200); assert.deepEqual(enviados, ['^XA^XZ']);
    assert.equal((await remoto(cfg.porta, '/', { token: TOKEN })).status, 403);
    assert.equal((await remoto(cfg.porta, '/api/destinos', { metodo: 'POST', token: TOKEN, corpo: { nome: 'x' } })).status, 403);
  } finally { s.close(); }
});
test('config: escuta na rede só com token de 16+ caracteres', () => {
  const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ag-')), 'c.json');
  fs.writeFileSync(arq, JSON.stringify({ escuta: '0.0.0.0', token: 'curto' }));
  assert.equal(carregaConfig(arq).escuta, '127.0.0.1');
  fs.writeFileSync(arq, JSON.stringify({ escuta: '0.0.0.0', token: TOKEN }));
  assert.equal(carregaConfig(arq).escuta, '0.0.0.0');
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

test('validaRede: liga com token gerado, mantém o atual e desliga', async () => {
  const { validaRede } = await import('../src/config.js');
  const a = validaRede({ permitir: true, token: '' }, '');
  assert.equal(a.escuta, '0.0.0.0'); assert.ok(a.token.length >= 16);
  assert.equal(validaRede({ permitir: true, token: '' }, a.token).token, a.token);
  assert.deepEqual(validaRede({ permitir: false }, a.token), { escuta: '127.0.0.1', token: a.token });
  assert.throws(() => validaRede({ permitir: true, token: 'curto' }, ''), /16/);
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
