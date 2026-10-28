import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { bloqueado, criaToken, hashSenha, leToken, registraFalha } from '../src/services/auth.js';

test('hash = PASSWORD() do MySQL', () => {
  assert.equal(hashSenha('mypass'), '*6C8989366EAF75BB670AD8EA7A7FC1176A95CEF4');
  assert.equal(hashSenha(''), ''); // senha em branco
});
test('token: válido, adulterado e vencido', () => {
  const t = criaToken({ id: 7, usuario: 'ana', nome: 'Ana' });
  assert.equal(leToken(t).usuario, 'ana');
  const [c, s] = t.split('.');
  const falso = Buffer.from(JSON.stringify({ id: 1, usuario: 'sanches', exp: 9999999999 })).toString('base64url');
  assert.equal(leToken(`${falso}.${s}`), null);
  assert.equal(leToken(`${c}.${s}x`), null);
  assert.equal(leToken('lixo'), null);
  assert.equal(leToken(t, Date.now() + 13 * 3600 * 1000), null);
});
test('bloqueio após 5 falhas', () => {
  const k = 'ip|x';
  for (let i = 0; i < 5; i++) registraFalha(k, 1000);
  assert.ok(bloqueado(k, 2000) > 0);
  assert.equal(bloqueado(k, 1000 + 61_000), 0);
});

let server; let base;
test.before(async () => { await new Promise((ok) => { server = app.listen(0, ok); }); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const call = async (method, path, body, headers = {}) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json() };
};
test('sem sessão → 401 em rota protegida (x-user-id não vale)', async () => {
  assert.equal((await call('GET', '/api/status?data=2026-10-26', undefined, { 'x-user-id': '1' })).status, 401);
  assert.equal((await call('GET', '/api/cadastros/clientes')).status, 401);
  assert.equal((await call('GET', '/api/auth/me')).status, 401);
});
test('sessão válida passa pelo filtro', async () => {
  const c = `paes_sess=${criaToken({ id: 1, usuario: 'ana', nome: 'Ana' })}`;
  assert.equal((await call('GET', '/api/status?data=lixo', undefined, { cookie: c })).status, 422);
  assert.equal((await call('GET', '/api/auth/me', undefined, { cookie: c })).json.usuario, 'ana');
});
test('login: campos obrigatórios e tipos', async () => {
  assert.equal((await call('POST', '/api/auth/login', {})).status, 422);
  assert.equal((await call('POST', '/api/auth/login', { usuario: 'a' })).status, 422);
  assert.equal((await call('POST', '/api/auth/login', { usuario: { $ne: 1 }, senha: 'x' })).status, 422);
  assert.equal((await call('POST', '/api/auth/login', { usuario: 'a', senha: 'x'.repeat(101) })).status, 422);
});
test('alterar senha: exige sessão e confirmação', async () => {
  assert.equal((await call('POST', '/api/auth/senha', { atual: 'a', nova: 'b', confirma: 'b' })).status, 401);
  const c = `paes_sess=${criaToken({ id: 1, usuario: 'ana', nome: 'Ana' })}`;
  assert.equal((await call('POST', '/api/auth/senha', { atual: 'a', nova: 'b', confirma: 'c' }, { cookie: c })).status, 422);
});
