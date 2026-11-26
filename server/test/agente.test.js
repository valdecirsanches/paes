import test from 'node:test';
import assert from 'node:assert/strict';
import { enderecoSite, instaladorBat, instaladorSh, pacote } from '../src/services/agente.js';

test('pacote traz os arquivos do agente em base64', () => {
  const p = pacote();
  assert.ok(p.versao);
  assert.match(Buffer.from(p.arquivos['src/server.js'], 'base64').toString(), /criaServidor/);
  assert.deepEqual(Object.keys(p.arquivos).sort(), ['package.json', 'src/admin.js', 'src/bandeja.ps1', 'src/bandeja.vbs', 'src/config.js', 'src/png.js', 'src/server.js', 'src/transportes.js', 'src/tunel.js']);
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

test('instalador Linux: shell válido, pacote embutido, token só quando pedido', () => {
  const tok = 'T'.repeat(32);
  const sh = instaladorSh('https://paes.x-star.com.br', 'instalar', pacote(), tok);
  assert.match(sh, /^#!\/usr\/bin\/env bash/);
  assert.match(sh, new RegExp(`TOKEN='${tok}'`)); assert.match(sh, /SITE='https:\/\/paes\.x-star\.com\.br'/);
  assert.match(sh, /systemctl enable --now paes-agente-impressao/);
  assert.doesNotMatch(sh, /@@/);
  assert.match(instaladorSh('https://a.com', 'instalar', pacote()), /TOKEN=''/);
  assert.match(instaladorSh('https://a.com', 'remover', pacote()), /MODO='remover'/);
  assert.throws(() => instaladorSh('https://a.com', 'instalar', pacote(), "x'; rm -rf /; '"), /Token/);
  assert.throws(() => instaladorSh("https://a.com'; rm -rf /; '", 'instalar', pacote()), /Endereço/);
});

test('instalador Windows abre a bandeja (wscript //B), sem janela do node', () => {
  const b = instaladorBat('https://paes.x-star.com.br', 'instalar', pacote());
  assert.match(b, /New-ScheduledTaskAction -Execute 'wscript\.exe' -Argument \('\/\/B \/\/Nologo/);
  assert.doesNotMatch(b, /New-ScheduledTaskAction -Execute \$node/);
  assert.match(b, /bandeja\.ps1/);
});
test('bandeja.ps1 tem BOM UTF-8 (acentos no PowerShell 5) e arquivos do pacote existem', () => {
  const ps = Buffer.from(pacote().arquivos['src/bandeja.ps1'], 'base64');
  assert.deepEqual([...ps.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(ps.toString('utf8'), /NotifyIcon/);
  assert.match(Buffer.from(pacote().arquivos['src/bandeja.vbs'], 'base64').toString(), /Run .*, 0, False/);
});
