import nodemailer from 'nodemailer';
import { AppError } from '../errors.js';

/**
 * Envio da NF-e por e-mail (substitui o ACBrMail do Delphi). Regras portadas de EnviaEmailNFe / u_nfe_email:
 *  - cliente: PARA = tb_clientes.email_nfe + tb_unidades.email_nfe; CC = email_cc (+ contabilidade quando
 *    "nfe_envia_danfe_contabilidade" está ligado); CCO = email_cco; anexos = XML autorizado + DANFE (PDF).
 *  - contabilidade: PARA = nfe_email_contabilidade; mesmos anexos.
 * SMTP e remetente vêm de tb_nfe_config (email_servidor, email_porta, email_usuario, email_senha, email_setSSL/TLS,
 * email_confirmacao = Reply-To, email_titulo = início do assunto).
 */
const RE_EMAIL = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;

/** "a@x.com; b@y.com,c@z.com" → ['a@x.com','b@y.com','c@z.com'] (sem repetição, sem inválidos). */
export function listaEmails(...textos) {
  const vistos = new Set(); const ok = []; const invalidos = [];
  for (const t of textos) {
    for (const p of String(t ?? '').split(/[;,\s]+/).map((x) => x.trim()).filter(Boolean)) {
      const k = p.toLowerCase();
      if (vistos.has(k)) continue; vistos.add(k);
      (RE_EMAIL.test(p) ? ok : invalidos).push(p);
    }
  }
  return { ok, invalidos };
}
const verdadeiro = (v) => ['true', '1', 'sim', 's'].includes(String(v ?? '').trim().toLowerCase());

/** Destinatários padrão de uma nota. `destino`: 'cliente' | 'contabilidade'. */
export function destinatarios(cfg, { emailCliente = '', emailUnidade = '' } = {}, destino = 'cliente') {
  if (destino === 'contabilidade') {
    const para = listaEmails(cfg.nfe_email_contabilidade);
    return { para: para.ok, cc: [], cco: [], invalidos: para.invalidos };
  }
  const para = listaEmails(emailCliente, emailUnidade);
  const cc = listaEmails(verdadeiro(cfg.nfe_envia_danfe_contabilidade) ? cfg.nfe_email_contabilidade : '', cfg.email_cc);
  const cco = listaEmails(cfg.email_cco);
  return { para: para.ok, cc: cc.ok, cco: cco.ok, invalidos: [...para.invalidos, ...cc.invalidos, ...cco.invalidos] };
}

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const moeda = (n) => Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function assuntoPadrao(cfg, nfe) {
  const base = String(cfg.email_titulo ?? '').trim() || 'Nota Fiscal Eletrônica';
  return `${base} - NFe ${nfe.nfe_numero}${nfe.nfe_serie ? `/${Number(nfe.nfe_serie) || nfe.nfe_serie}` : ''} - ${cfg.fantasia || cfg.razao || ''}`.trim().replace(/ -$/, '');
}
export function mensagemPadrao(cfg, nfe, destino = 'cliente') {
  const dest = destino === 'contabilidade' ? 'Prezados,' : `Prezado(a) ${nfe.cliente_razao_social || 'cliente'},`;
  return `${dest}\n\nSegue em anexo a Nota Fiscal Eletrônica nº ${nfe.nfe_numero} (série ${Number(nfe.nfe_serie) || nfe.nfe_serie || 1}), no valor de ${moeda(nfe.nf_valor_total)}, `
    + 'com o arquivo XML (guarda fiscal) e o DANFE em PDF.\n\n'
    + `Chave de acesso: ${nfe.nfe_chave}\n\nAtenciosamente,\n${cfg.razao || cfg.fantasia || ''}`;
}
/** Texto simples → HTML (parágrafos e quebras). */
export const htmlDaMensagem = (m) => `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">${esc(m).split(/\n{2,}/).map((p) => `<p>${p.replaceAll('\n', '<br>')}</p>`).join('')}</div>`;

/** Transporte SMTP a partir de tb_nfe_config. Porta 465 / email_setSSL = SSL direto; email_setTLS = STARTTLS. */
export function criaTransporte(cfg) {
  const host = String(cfg.email_servidor ?? '').trim();
  if (!host) throw new AppError(422, 'Servidor SMTP não configurado (Emitente e configurações › Envio de email).');
  const porta = Number(cfg.email_porta) || (verdadeiro(cfg.email_setSSL) ? 465 : 587);
  const user = String(cfg.email_usuario ?? '').trim();
  return nodemailer.createTransport({
    host, port: porta, secure: verdadeiro(cfg.email_setSSL) || porta === 465, requireTLS: verdadeiro(cfg.email_setTLS) && porta !== 465,
    auth: user ? { user, pass: String(cfg.email_senha ?? '') } : undefined,
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 60000,
  });
}
/** Remetente. O SMTP só aceita enviar como a caixa do próprio login (erro 553 "Sender address rejected: not owned by user"):
 *  se o usuário SMTP é um e-mail, ele é o remetente e o e-mail do emitente vira Responder-para. */
export const emailDoLogin = (cfg) => listaEmails(cfg.email_usuario).ok[0];
export const remetente = (cfg) => {
  const de = emailDoLogin(cfg) || listaEmails(cfg.email).ok[0];
  if (!de) throw new AppError(422, 'Informe o e-mail do emitente (ou um usuário SMTP que seja um e-mail) para usar como remetente.');
  return cfg.fantasia || cfg.razao ? `"${String(cfg.fantasia || cfg.razao).replace(/"/g, '')}" <${de}>` : de;
};

/** Monta e envia. `anexos` = [{ filename, content(Buffer), contentType }]. `transporte` injetável (testes). */
export async function enviaEmail(cfg, { para, cc = [], cco = [], assunto, mensagem, anexos = [] }, transporte = criaTransporte(cfg)) {
  if (!para.length) throw new AppError(422, 'Nenhum e-mail de destino válido.');
  const replyTo = [...new Set([...listaEmails(cfg.email_confirmacao).ok, ...(emailDoLogin(cfg) ? listaEmails(cfg.email).ok.filter((e) => e.toLowerCase() !== emailDoLogin(cfg).toLowerCase()) : [])])];
  try {
    const r = await transporte.sendMail({
      from: remetente(cfg), to: para, cc: cc.length ? cc : undefined, bcc: cco.length ? cco : undefined, replyTo: replyTo.length ? replyTo : undefined,
      subject: assunto, text: mensagem, html: htmlDaMensagem(mensagem), attachments: anexos,
    });
    return { messageId: r.messageId, aceitos: r.accepted ?? [], recusados: r.rejected ?? [] };
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(502, `Falha no envio do e-mail (${e.code || 'SMTP'}): ${e.response || e.message}`);
  }
}
