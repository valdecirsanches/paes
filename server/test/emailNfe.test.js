import test from 'node:test';
import assert from 'node:assert/strict';
import { listaEmails, destinatarios, assuntoPadrao, mensagemPadrao, enviaEmail, htmlDaMensagem } from '../src/services/emailNfe.js';

const cfg = { razao: 'LEVPAO LTDA', fantasia: 'LEVPAO', email: 'nfe@levpao.com.br', email_titulo: 'NF-e LEVPAO', nfe_email_contabilidade: 'contab@x.com', nfe_envia_danfe_contabilidade: 'True', email_cc: 'fin@levpao.com.br', email_cco: 'arq@levpao.com.br', email_confirmacao: 'resp@levpao.com.br' };

test('listaEmails separa por ; , espaço, tira repetidos e aponta inválidos', () => {
  const r = listaEmails('A@x.com; b@y.com,a@X.com  c@', null);
  assert.deepEqual(r.ok, ['A@x.com', 'b@y.com']); assert.deepEqual(r.invalidos, ['c@']);
});
test('cliente: PARA = cliente + unidade; contabilidade vai em CC quando ligada; CCO da configuração', () => {
  const d = destinatarios(cfg, { emailCliente: 'cli@x.com', emailUnidade: 'uni@x.com;cli@x.com' });
  assert.deepEqual(d.para, ['cli@x.com', 'uni@x.com']); assert.deepEqual(d.cc, ['contab@x.com', 'fin@levpao.com.br']); assert.deepEqual(d.cco, ['arq@levpao.com.br']);
  assert.deepEqual(destinatarios({ ...cfg, nfe_envia_danfe_contabilidade: 'False' }, { emailCliente: 'cli@x.com' }).cc, ['fin@levpao.com.br']);
});
test('contabilidade: só o e-mail da contabilidade, sem cópias', () => {
  assert.deepEqual(destinatarios(cfg, {}, 'contabilidade'), { para: ['contab@x.com'], cc: [], cco: [], invalidos: [] });
});
test('assunto e mensagem padrão trazem número, valor e chave', () => {
  const n = { nfe_numero: 274, nfe_serie: '001', cliente_razao_social: 'PADARIA', nf_valor_total: 90, nfe_chave: '3526' };
  assert.equal(assuntoPadrao(cfg, n), 'NF-e LEVPAO - NFe 274/1 - LEVPAO');
  const m = mensagemPadrao(cfg, n); assert.match(m, /nº 274/); assert.match(m, /R\$\s?90,00/); assert.match(m, /Chave de acesso: 3526/); assert.match(m, /Prezado\(a\) PADARIA/);
  assert.match(htmlDaMensagem('a<b\n\nc'), /a&lt;b/);
});
test('enviaEmail usa o transporte com to/cc/bcc/replyTo/anexos e recusa sem destino', async () => {
  let envio; const transp = { sendMail: async (o) => { envio = o; return { messageId: 'm1', accepted: o.to, rejected: [] }; } };
  const r = await enviaEmail(cfg, { para: ['cli@x.com'], cc: ['c@x.com'], cco: ['b@x.com'], assunto: 'A', mensagem: 'oi', anexos: [{ filename: 'n.xml', content: Buffer.from('x') }] }, transp);
  assert.equal(r.messageId, 'm1'); assert.deepEqual(envio.to, ['cli@x.com']); assert.deepEqual(envio.bcc, ['b@x.com']); assert.deepEqual(envio.replyTo, ['resp@levpao.com.br']);
  assert.match(envio.from, /nfe@levpao\.com\.br/); assert.equal(envio.attachments.length, 1);
  await assert.rejects(() => enviaEmail(cfg, { para: [], assunto: 'A', mensagem: 'x' }, transp), /destino/);
});
