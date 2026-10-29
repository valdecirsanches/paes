import test from 'node:test';
import assert from 'node:assert/strict';
import { novoCodigo, identifica, limpaCache, MENSAGEM, parseAreas, rotaDaFabrica } from '../src/services/dispositivos.js';

// banco falso: guarda dispositivos em memória
function bancoFalso(ativos = [], areas = {}) {
  const linhas = new Map(ativos.map((c) => [c, { ativo: 1, areas: areas[c] ?? 'faturamento' }]));
  const db = { query: async (sql, par = []) => {
    if (/create table/i.test(sql)) return [[]];
    if (/information_schema/i.test(sql)) return [[{ n: 1 }]];
    if (/count\(\*\)/i.test(sql)) return [[{ n: [...linhas.values()].filter((l) => l.ativo).length }]];
    if (/^select ativo/i.test(sql)) return [[linhas.get(par[0])]];
    if (/^insert ignore/i.test(sql)) { linhas.set(par[0], { ativo: 0 }); return [{}]; }
    return [{}];
  }, linhas };
  return db;
}
const reqFalsa = (cookie) => ({ headers: cookie ? { cookie } : {}, socket: { remoteAddress: '10.0.0.5' }, app: { locals: {} }, originalUrl: '/api/x' });
const resFalsa = () => { const h = {}; return { h, setHeader: (k, v) => { h[k] = v; }, getHeader: (k) => h[k] }; };

test('código tem o formato XXXX-XXXX-XXXX', () => { assert.match(novoCodigo(), /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/); });

test('controle desligado enquanto não há dispositivo habilitado; gera cookie e registra pendente', async () => {
  limpaCache(); const db = bancoFalso(); const res = resFalsa();
  const d = await identifica(reqFalsa(), res, db);
  assert.equal(d.habilitado, true); assert.equal(d.exigido, false);
  assert.match(res.h['Set-Cookie'], /paes_disp=[0-9A-F-]{14}; HttpOnly/);
  assert.equal(db.linhas.get(d.codigo).ativo, 0);
});
test('com um dispositivo habilitado, os demais são barrados com a mensagem', async () => {
  limpaCache(); const db = bancoFalso(['AAAA-BBBB-CCCC']);
  const bom = await identifica(reqFalsa('paes_disp=AAAA-BBBB-CCCC'), resFalsa(), db);
  assert.equal(bom.habilitado, true); assert.equal(bom.exigido, true);
  const ruim = await identifica(reqFalsa('paes_disp=1111-2222-3333'), resFalsa(), db);
  assert.equal(ruim.habilitado, false); assert.equal(ruim.codigo, '1111-2222-3333');
  assert.match(MENSAGEM, /não habilitado/);
});

test('areas: texto inválido/vazio vira faturamento; aceita lista', () => {
  assert.deepEqual(parseAreas(''), ['faturamento']); assert.deepEqual(parseAreas('x,fabrica'), ['fabrica']);
  assert.deepEqual(parseAreas(['fabrica', 'faturamento', 'fabrica']), ['fabrica', 'faturamento']);
});
test('máquina só da fábrica: entra sem login na fábrica e é barrada no resto', async () => {
  limpaCache(); const db = bancoFalso(['AAAA-BBBB-CCCC', 'DDDD-EEEE-FFFF'], { 'AAAA-BBBB-CCCC': 'fabrica', 'DDDD-EEEE-FFFF': 'faturamento' });
  const f = await identifica(reqFalsa('paes_disp=AAAA-BBBB-CCCC'), resFalsa(), db);
  assert.deepEqual(f.areas, ['fabrica']); assert.equal(f.fabricaSemLogin, true);
  const g = await identifica(reqFalsa('paes_disp=DDDD-EEEE-FFFF'), resFalsa(), db);
  assert.deepEqual(g.areas, ['faturamento']); assert.equal(g.fabricaSemLogin, false);
  const x = await identifica(reqFalsa('paes_disp=1111-2222-3333'), resFalsa(), db);
  assert.deepEqual(x.areas, []); assert.equal(x.fabricaSemLogin, false);
});
test('controle desligado: nunca dispensa login', async () => {
  limpaCache(); const d = await identifica(reqFalsa(), resFalsa(), bancoFalso());
  assert.equal(d.fabricaSemLogin, false); assert.deepEqual(d.areas, ['faturamento', 'fabrica']);
});

test('máquina da fábrica: só chama as rotas da fábrica', () => {
  const r = (m, u) => ({ method: m, originalUrl: u });
  for (const u of ['/api/status/1', '/api/diaria/5', '/api/fixa/5', '/api/producao/resumo?x=1', '/api/mercadorias', '/api/cargas/diaria', '/api/itinerario/roteiros', '/api/reclamacoes/3', '/api/extras/opcoes', '/api/auth/me']) assert.equal(rotaDaFabrica(r('PUT', u)), true, u);
  for (const u of ['/api/nfe/1', '/api/faturamento', '/api/comandas', '/api/cadastros/clientes', '/api/dispositivos', '/api/auth/senha', '/api/tributos']) assert.equal(rotaDaFabrica(r('GET', u)), false, u);
  assert.equal(rotaDaFabrica(r('GET', '/api/produtos/codigo/1')), true); assert.equal(rotaDaFabrica(r('POST', '/api/produtos')), false);
});

test('cookie apagado: o número guardado no navegador (x-dispositivo) restaura o mesmo dispositivo e regrava o cookie', async () => {
  limpaCache(); const db = bancoFalso(['AAAA-BBBB-CCCC']); const res = resFalsa();
  const req = { ...reqFalsa(), headers: { 'x-dispositivo': 'aaaa-bbbb-cccc' } };
  const d = await identifica(req, res, db);
  assert.equal(d.codigo, 'AAAA-BBBB-CCCC'); assert.equal(d.habilitado, true);
  assert.match(res.h['Set-Cookie'], /paes_disp=AAAA-BBBB-CCCC;/);
});
test('cookie e cabeçalho diferentes: vale o cookie', async () => {
  limpaCache(); const d = await identifica({ ...reqFalsa('paes_disp=AAAA-BBBB-CCCC'), headers: { cookie: 'paes_disp=AAAA-BBBB-CCCC', 'x-dispositivo': '1111-2222-3333' } }, resFalsa(), bancoFalso(['AAAA-BBBB-CCCC']));
  assert.equal(d.codigo, 'AAAA-BBBB-CCCC');
});

test('máquina da fábrica: sem ajuste de preço/cobrança, layout de etiqueta e configuração da unidade', () => {
  const r = (m, u) => ({ method: m, originalUrl: u });
  for (const [m, u] of [['POST', '/api/diaria/ajusta-preco-lote'], ['POST', '/api/diaria/5/ajusta-preco'], ['POST', '/api/diaria/5/ajusta-cobranca'], ['PUT', '/api/layout-etiquetas/etiqueta-mercadorias'], ['PUT', '/api/status/3/unidade'], ['POST', '/api/cargas/etiquetas'], ['POST', '/api/cargas/etiquetas/dados'], ['POST', '/api/mercadorias/etiquetas']]) assert.equal(rotaDaFabrica(r(m, u)), false, u);
  for (const [m, u] of [['GET', '/api/layout-etiquetas'], ['GET', '/api/status/3/unidade'], ['PUT', '/api/diaria/5'], ['POST', '/api/diaria/5/etiqueta'], ['POST', '/api/cargas/diaria/separar'], ['PUT', '/api/cargas/diaria/7']]) assert.equal(rotaDaFabrica(r(m, u)), true, u);
});
