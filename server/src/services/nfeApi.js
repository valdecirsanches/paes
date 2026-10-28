import { AppError } from '../errors.js';
import { lerA3 } from './a3Store.js';

/**
 * Cliente da API de NF-e (substitui o ACBrMonitor/EDSMonitorPlus do Delphi).
 * A API recebe um JSON com a nota, assina com o certificado A1 da empresa e transmite à SEFAZ.
 * Variáveis: NFE_API_URL, NFE_API_TOKEN (Bearer) e, opcionalmente, NFE_EMPRESA_ID
 * (sem ela, o id é descoberto uma vez por CNPJ: GET /api/empresas/por-cnpj/{cnpj}).
 */
const base = () => String(process.env.NFE_API_URL || 'http://127.0.0.1:5240').replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.NFE_API_TIMEOUT_MS || 90000); // a SEFAZ pode demorar

const empresaPorCnpj = new Map();

/** Token limpo: remove espaços, aspas e um eventual prefixo "Bearer " colado no .env. */
export const tokenLimpo = () => String(process.env.NFE_API_TOKEN ?? '').trim().replace(/^["']|["']$/g, '').replace(/^bearer\s+/i, '').trim();
/** Cabeçalho de autenticação. Padrão: Authorization: Bearer <token>. Ajustável por NFE_API_AUTH_HEADER (ex.: X-Api-Key) e NFE_API_AUTH_SCHEME (vazio = token puro). */
export function cabecalhoAuth() {
  const nome = process.env.NFE_API_AUTH_HEADER || 'Authorization';
  const esquema = process.env.NFE_API_AUTH_SCHEME ?? (nome.toLowerCase() === 'authorization' ? 'Bearer' : '');
  return [nome, `${esquema ? `${esquema} ` : ''}${tokenLimpo()}`];
}

export function nfeApiConfigurada() {
  return Boolean(process.env.NFE_API_TOKEN);
}

/** Chamada HTTP; devolve { status, body, buffer }. Nunca lança por 4xx (a API usa 422 para rejeição da SEFAZ). */
export async function chamar(metodo, caminho, { json, form, query, binario = false, idempotencyKey } = {}) {
  if (!nfeApiConfigurada()) throw new AppError(503, 'API de NF-e não configurada: defina NFE_API_TOKEN (e NFE_API_URL) no server/.env.');
  const url = new URL(base() + caminho);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  const [hNome, hValor] = cabecalhoAuth();
  const headers = { [hNome]: hValor, Accept: binario ? '*/*' : 'application/json' };
  if (json !== undefined) headers['Content-Type'] = 'application/json'; // com `form` (FormData) o fetch define o Content-Type com o boundary
  if (idempotencyKey) headers['Idempotency-Key'] = String(idempotencyKey);
  let r;
  try {
    r = await fetch(url, { method: metodo, headers, body: form ?? (json !== undefined ? JSON.stringify(json) : undefined), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    const motivo = e.name === 'TimeoutError' ? 'tempo esgotado' : e.cause?.code || e.message;
    throw new AppError(502, `Não foi possível falar com a API de NF-e (${base()}): ${motivo}.`);
  }
  if (r.status === 401) throw new AppError(502, `A API de NF-e recusou o token (401). Enviado em "${hNome}" (${tokenLimpo().length} caracteres). Confira NFE_API_TOKEN e, se a API usa outro cabeçalho, NFE_API_AUTH_HEADER/NFE_API_AUTH_SCHEME.`);
  if (binario) return { status: r.status, buffer: Buffer.from(await r.arrayBuffer()), tipo: r.headers.get('content-type') };
  const texto = await r.text();
  let body = null;
  try { body = texto ? JSON.parse(texto) : null; } catch { body = { erro: texto.slice(0, 500) }; }
  return { status: r.status, body };
}

/** Id (GUID) da empresa na API: NFE_EMPRESA_ID ou descoberto pelo CNPJ (14 dígitos) e guardado em memória. */
export async function empresaId(cnpj) {
  if (process.env.NFE_EMPRESA_ID) return process.env.NFE_EMPRESA_ID;
  const d = String(cnpj ?? '').replace(/\D/g, '');
  if (d.length !== 14) throw new AppError(422, 'CNPJ do emitente inválido em tb_nfe_config (precisa de 14 dígitos).');
  if (empresaPorCnpj.has(d)) return empresaPorCnpj.get(d);
  const r = await chamar('GET', `/api/empresas/por-cnpj/${d}`);
  if (r.status === 404) throw new AppError(502, `Empresa ${d} não cadastrada na API de NF-e (cadastre a empresa e o certificado A1 no painel).`);
  if (r.status !== 200 || !r.body?.id) throw new AppError(502, `Falha ao localizar a empresa na API (HTTP ${r.status}).`);
  // com A3 cadastrado o certificado fica no agente da máquina do token: o flag de A1 não vale
  if (r.body.temCertificadoAtivo === false && !(await lerA3()).certificadoId) throw new AppError(502, 'A empresa não tem certificado A1 ativo na API de NF-e.');
  empresaPorCnpj.set(d, r.body.id);
  return r.body.id;
}

export const limpaCacheEmpresa = () => empresaPorCnpj.clear();

/** Passo 0 da documentação: cadastra/atualiza a empresa e envia o A1 (.pfx + senha) numa chamada transacional. */
export function onboarding({ cnpj, razaoSocial, uf, regimeTributario, ambientePadrao, senha, arquivo, nomeArquivo }) {
  const form = new FormData();
  for (const [k, v] of Object.entries({ cnpj, razaoSocial, uf, regimeTributario, ambientePadrao, senha })) form.append(k, String(v));
  form.append('arquivo', new Blob([arquivo], { type: 'application/x-pkcs12' }), nomeArquivo || 'certificado.pfx');
  return chamar('POST', '/api/empresas/onboarding', { form });
}
export const empresaPorCnpjStatus = (cnpj) => chamar('GET', `/api/empresas/por-cnpj/${cnpj}`);
export const healthApi = async () => { // /health é liberado sem token
  try { const r = await fetch(`${base()}/health`, { signal: AbortSignal.timeout(8000) }); return { ok: r.ok, status: r.status }; } catch (e) { return { ok: false, erro: e.cause?.code || e.message }; }
};

/** Cadastro do A3: só o certificado público (.cer) — sem .pfx e sem PIN. A resposta traz o tokenAgente (uma única vez). */
export function cadastrarA3(empId, { arquivo, nomeArquivo, descricao, nomeAgente }) {
  const form = new FormData();
  form.append('descricao', descricao);
  form.append('nomeAgente', nomeAgente);
  form.append('arquivo', new Blob([arquivo], { type: 'application/x-x509-ca-cert' }), nomeArquivo || 'certificado.cer');
  return chamar('POST', `/api/certificados/empresa/${empId}/a3`, { form });
}
export const agenteA3 = (certId) => chamar('GET', `/api/certificados/${certId}/agente`);
export const revogarAgenteA3 = (certId, agenteId) => chamar('DELETE', `/api/certificados/${certId}/agente/${agenteId}`);
/** Cadastro JSON da empresa (upsert por CNPJ), usado quando só há A3 e não houve onboarding com A1. */
export const cadastrarEmpresa = (json) => chamar('POST', '/api/empresas', { json });

export const emitir = (empId, json, chave) => chamar('POST', `/api/empresas/${empId}/nfe`, { json, idempotencyKey: chave });
export const porNumero = (empId, numero, serie) => chamar('GET', `/api/empresas/${empId}/nfe/por-numero/${numero}`, { query: { serie } });
export const cancelar = (docId, justificativa) => chamar('POST', `/api/nfe/${docId}/cancelar`, { json: { justificativa } });
export const cartaCorrecao = (docId, correcao) => chamar('POST', `/api/nfe/${docId}/carta-correcao`, { json: { correcao } });
export const inutilizar = (empId, json) => chamar('POST', `/api/empresas/${empId}/inutilizacoes`, { json });
export const statusServico = (empId, json) => chamar('POST', `/api/status/empresa/${empId}/consultar`, { json });
export const danfePdf = (docId, orientacao) => chamar('GET', `/api/nfe/${docId}/danfe.pdf`, { binario: true, query: { orientacao } });
/** Descobre no swagger/OpenAPI da API as operações de logo (caminho, método e formato do corpo). */
export async function descobreLogo(empId) {
  for (const doc of ['/swagger/v1/swagger.json', '/openapi.json', '/swagger.json', '/openapi/v1.json']) {
    const r = await chamar('GET', doc);
    if (r.status !== 200 || !r.body?.paths) continue;
    const ops = [];
    for (const [caminho, def] of Object.entries(r.body.paths)) {
      if (!/logo/i.test(caminho)) continue;
      for (const [metodo, op] of Object.entries(def)) {
        if (!['put', 'post', 'patch', 'delete'].includes(metodo)) continue;
        const cont = op.requestBody?.content ?? {};
        const tipo = Object.keys(cont).find((t) => /multipart/.test(t)) ?? Object.keys(cont)[0] ?? null;
        let sch = cont[tipo]?.schema ?? {};
        if (sch.$ref) sch = r.body.components?.schemas?.[sch.$ref.split('/').pop()] ?? {};
        const props = Object.entries(sch.properties ?? {});
        const campo = (props.find(([, v]) => v.format === 'binary') ?? props.find(([k]) => /logo|imagem|arquivo|file/i.test(k)) ?? [])[0];
        ops.push({ metodo: metodo.toUpperCase(), caminho: caminho.replace(/\{[^}]*\}/, empId), tipo, campo, props: props.map(([k]) => k) });
      }
    }
    return ops;
  }
  return [];
}

/**
 * Logo da empresa no DANFE. A API aceita a empresa pelo CNPJ ou pelo Id e três formatos de corpo (multipart "arquivo", imagem bruta, JSON base64).
 * Tenta, nesta ordem, /por-cnpj/{cnpj}/logo, /{cnpj}/logo e /{id}/logo, cada um em multipart → bruto → JSON; para no primeiro 2xx e confere com GET.
 */
export async function enviarLogo(empId, { arquivo, nomeArquivo, tipo, cnpj }) {
  const dc = String(cnpj ?? '').replace(/\D/g, '');
  const caminhos = [...(dc.length === 14 ? [`/api/empresas/por-cnpj/${dc}/logo`, `/api/empresas/${dc}/logo`] : []), ...(empId ? [`/api/empresas/${empId}/logo`] : [])];
  if (!caminhos.length) return { status: 0, body: { erro: 'CNPJ do emitente inválido (14 dígitos) e empresa não localizada na API.' }, tentativa: 'nenhuma' };
  const formatos = [
    ['multipart', (c) => { const form = new FormData(); form.append('arquivo', new Blob([arquivo], { type: tipo || 'image/png' }), nomeArquivo || 'logo.png'); return chamar('POST', c, { form }); }],
    ['imagem bruta', (c) => chamarBruto('POST', c, arquivo, tipo || 'image/png')],
    ['json base64', (c) => chamar('POST', c, { json: { arquivo: `data:${tipo || 'image/png'};base64,${Buffer.from(arquivo).toString('base64')}` } })],
  ];
  const tentativas = []; let ok;
  for (const c of caminhos) {
    for (const [nome, envia] of formatos) {
      const r = await envia(c);
      tentativas.push(`${nome} ${c} → HTTP ${r.status}${r.status >= 400 ? ` ${JSON.stringify(r.body ?? '').slice(0, 160)}` : ''}`);
      if ([200, 201, 204].includes(r.status)) { ok = { ...r, tentativa: `POST ${c} (${nome})` }; break; }
      if (r.status === 401 || r.status === 413) break;
    }
    if (ok) break;
  }
  if (!ok) { const u = tentativas.at(-1) ?? ''; return { status: Number(/HTTP (\d+)/.exec(u)?.[1]) || 0, body: { erro: tentativas.join(' | ') }, tentativa: 'todas as tentativas', tentativas }; }
  const g = await chamar('GET', ok.tentativa.split(' ')[1], { binario: true });
  return { ...ok, tentativas, confirmado: g.status === 200 && g.buffer?.length > 0, bytesNaApi: g.status === 200 ? g.buffer.length : 0 };
}
async function chamarBruto(metodo, caminho, corpo, tipo) {
  const [hNome, hValor] = cabecalhoAuth();
  try {
    const r = await fetch(new URL(base() + caminho), { method: metodo, headers: { [hNome]: hValor, 'Content-Type': tipo, Accept: 'application/json' }, body: corpo, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const t = await r.text(); let body = null; try { body = t ? JSON.parse(t) : null; } catch { body = { erro: t.slice(0, 300) }; }
    return { status: r.status, body };
  } catch (e) { return { status: 0, body: { erro: e.cause?.code || e.message } }; }
}
export async function removerLogoApi(empId) {
  const o = (await descobreLogo(empId).catch(() => [])).find((x) => x.metodo === 'DELETE');
  return chamar('DELETE', o?.caminho ?? `/api/empresas/${empId}/logo`);
}
export const xmlAutorizado = (docId) => chamar('GET', `/api/nfe/${docId}/xml`, { binario: true });

/** Id do documento na API a partir do número (a API não devolve esse id para o que foi emitido antes). */
export async function documentoId(empId, numero, serie) {
  const r = await porNumero(empId, numero, serie);
  const id = r.body?.documento?.id;
  if (!r.body?.existe || !id) throw new AppError(404, `A API de NF-e não tem registro da nota ${numero}${serie ? `/${serie}` : ''}. Se ela foi autorizada fora desta API (ACBrMonitor), cancele/consulte pelo sistema antigo.`);
  return id;
}

// ---- eventos fiscais e consultas (EMISSAO_NFE.md)
export const reenviar = (docId, contingencia) => chamar('POST', `/api/nfe/${docId}/reenviar`, { query: { contingencia: contingencia ? 'true' : undefined } });
export const detalhe = (docId) => chamar('GET', `/api/nfe/${docId}`);
export const listaInutilizacoes = (empId) => chamar('GET', `/api/empresas/${empId}/inutilizacoes`);
export const consultarProtocolo = (empId, json) => chamar('POST', `/api/empresas/${empId}/nfe/consultar`, { json });
export const listaSeries = (empId) => chamar('GET', `/api/empresas/${empId}/series`);
export const gravaSerie = (empId, json) => chamar('PUT', `/api/empresas/${empId}/series`, { json });
/** Arquivos do documento: cancelamento.pdf, danfe-cancelamento.pdf, cancelamento.xml, carta-correcao.xml, retorno-sefaz, eventos */
export const arquivoEvento = (docId, nome, query) => chamar('GET', `/api/nfe/${docId}/${nome}`, { binario: true, query });

/** Folhas (caminho -> tipo) do schema do grupo IBS/CBS do item, lidas do swagger da API; [] se não houver swagger. */
let cacheSchemaIbs;
export async function schemaIbsCbs() {
  if (cacheSchemaIbs) return cacheSchemaIbs;
  for (const doc of ['/swagger/v1/swagger.json', '/openapi.json', '/swagger.json', '/openapi/v1.json']) {
    const r = await chamar('GET', doc);
    const esq = r.body?.components?.schemas;
    if (r.status !== 200 || !esq) continue;
    const deref = (x) => (x?.$ref ? esq[x.$ref.split('/').pop()] ?? {} : x ?? {});
    const nome = Object.keys(esq).find((k) => esq[k]?.properties && 'classificacaoTributaria' in esq[k].properties);
    if (!nome) continue;
    const folhas = [];
    const anda = (sch, pre, nivel) => {
      for (const [k, v0] of Object.entries(deref(sch).properties ?? {})) {
        const v = deref(v0);
        if (v.properties && nivel < 3) anda(v, [...pre, k], nivel + 1); else folhas.push({ caminho: [...pre, k], tipo: v.type });
      }
    };
    anda(esq[nome], [], 0);
    return (cacheSchemaIbs = { schema: nome, folhas });
  }
  return { schema: null, folhas: [] };
}
