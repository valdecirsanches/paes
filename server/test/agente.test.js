import test from 'node:test';
import assert from 'node:assert/strict';
import { enderecoSite, instaladorBat, pacote } from '../src/services/agente.js';

test('pacote traz os arquivos do agente em base64', () => {
  const p = pacote();
  assert.ok(p.versao);
  assert.match(Buffer.from(p.arquivos['src/server.js'], 'base64').toString(), /criaServidor/);
  assert.deepEqual(Object.keys(p.arquivos).sort(), ['package.json', 'src/admin.js', 'src/config.js', 'src/png.js', 'src/server.js', 'src/transportes.js', 'src/tunel.js']);
});
test('instalador: endereço embutido, auto-elevação e marcador', () => {
  const b = instaladorBat('https://paes.x-star.com.br');
  assert.match(b, /\$PACOTE = /);
  assert.match(b, /Tls12/);
  assert.match(b, /\$site = 'https:\/\/paes\.x-star\.com\.br'/);
  assert.match(b, /-Verb RunAs/);
  assert.ok(b.includes('#PS#BEGIN'));
  assert.match(instaladorBat('http://192.168.15.8:5072', 'remover', pacote()), /'remover' -eq 'remover'/);
  assert.throws(() => instaladorBat("http://x';calc;'"), /inválido/);
  assert.ok(!/[^\r]\n/.test(b), 'só CRLF');
});
test('endereço do site respeita o proxy', () => {
  assert.equal(enderecoSite({ headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'paes.x-star.com.br' }, protocol: 'http' }), 'https://paes.x-star.com.br');
  assert.equal(enderecoSite({ headers: { host: '192.168.15.8:5072' }, protocol: 'http' }), 'http://192.168.15.8:5072');
});

test('instalador: embute o token de pareamento e grava endereço/token do sistema no config', () => {
  const tok = 'T'.repeat(32);
  const b = instaladorBat('https://paes.x-star.com.br', 'instalar', pacote(), tok);
  assert.match(b, new RegExp(`\\$tokenSistema = '${tok}'`));
  assert.match(b, /sistema_url/); assert.match(b, /sistema_token/);
  assert.throws(() => instaladorBat('https://paes.x-star.com.br', 'instalar', pacote(), "x'; calc; '"), /Token/);
});

test('instalador sem token não conecta o agente ao sistema (só grava o token quando informado)', () => {
  const b = instaladorBat('https://paes.x-star.com.br', 'instalar', pacote());
  assert.match(b, /\$tokenSistema = ''/);
  assert.match(b, /if \(\$tokenSistema\)/);
});
