import express, { Router } from 'express';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pool, tx } from '../db.js';
import { AppError, invalid, notFound, pick } from '../errors.js';
import { isIsoDate } from '../rules.js';
import * as api from '../services/nfeApi.js';
import { consultaNcm, pesquisaNcm } from '../services/ncm.js';
import { lerDanfeCfg, gravarDanfeCfg, gravarLogo, lerLogo, removerLogo, ORIENTACOES } from '../services/danfeStore.js';
import { danfeDoXml, achaXmlLocal } from '../services/danfeLocal.js';
import { lerA3, gravarA3, limparA3 } from '../services/a3Store.js';
import { impostos, usuarioNfe } from '../services/geraFatura.js';
import { destinatarios, assuntoPadrao, mensagemPadrao, enviaEmail, criaTransporte, listaEmails } from '../services/emailNfe.js';
import { enriquece, arquivoDoEvento } from '../services/eventosNfe.js';
import { baseGravacao, paraBanco, paraLocal, caminhoXmlLegado, ehCaminhoLegado } from '../services/caminhosNfe.js';
import { acharArquivoNota, lerArquivoNota, baseArquivos } from '../services/arquivosApi.js';
import { aplicaReducaoIbs, montaJsonNfe, validaParaAutorizar, dataHoraBr, regimeDoCrt, ehDevolucao } from '../services/nfeJson.js';

const router = Router();
const idValido = (v, rotulo = 'Nota') => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw invalid(`${rotulo} inválido(a).`);
  return n;
};
const txt = (s) => String(s ?? '').trim();
const STATUS = ['PENDENTE', 'AUTORIZADA', 'CANCELADA', 'INUTILIZADA', 'DEVOLVIDO', 'REJEITADA'];

/** Pasta dos XML/PDF: NFE_XML_DIR ou server/xmls, uma subpasta por CNPJ e ambiente. */
const pastaBase = baseGravacao;
async function gravaArquivo(cnpj, ambiente, nome, dados) {
  const dir = path.join(pastaBase(), String(cnpj).replace(/\D/g, ''), ambiente === 1 ? 'producao' : 'homologacao');
  await mkdir(dir, { recursive: true });
  const f = path.join(dir, nome);
  await writeFile(f, dados);
  return paraBanco(f); // valor para tb_nfe: caminho que as outras máquinas (sistema antigo) enxergam
}

const getCfg = async (c = pool) => { const [[cfg]] = await c.query('select * from tb_nfe_config limit 1'); if (!cfg) throw new AppError(422, 'tb_nfe_config está vazia (dados do emitente).'); return cfg; };
const getNfe = async (id, c = pool) => { const [[n]] = await c.query('select * from tb_nfe where id = ?', [id]); if (!n) throw notFound('Nota'); return n; };

// fila: só uma autorização por vez (a numeração é sequencial e é controlada por nós)
let fila = Promise.resolve();
const emFila = (fn) => { const p = fila.then(fn, fn); fila = p.catch(() => {}); return p; };

// ------------------------------------------------------------------ configuração do emitente (tb_nfe_config)
const CFG_CAMPOS = ['razao', 'fantasia', 'cnpj', 'ie', 'im', 'cnae', 'nfe_crt', 'csosn', 'cst_pis_cofins', 'isentoicms', 'aliquota_iss',
  'permite_reaproveitamento_icms', 'aliquota_reaproveitamento_icms', 'ws_ibpt', 'endereco', 'endereco_numero', 'endereco_complemento', 'bairro', 'cidade', 'cep', 'uf',
  'ddd', 'fones', 'faxddd', 'fax', 'site', 'email', 'email_setSSL', 'email_setTLS', 'email_titulo', 'email_servidor', 'email_porta', 'email_usuario', 'email_senha',
  'email_codificacao', 'email_confirmacao', 'email_cc', 'email_cco', 'nfe_email_contabilidade', 'nfe_envia_danfe_contabilidade',
  'nfe_configuracoes_webservice_ambiente', 'nfe_configuracoes_forma_emissao', 'nfe_numero', 'nfe_carta_correcao_seq', 'nfe_certificado_vencimento', 'veiculo_placa', 'veiculo_uf'];

router.get('/config', async (_req, res) => {
  const cfg = await getCfg();
  const { email_senha: senha, ...resto } = cfg;
  res.json({ ...resto, tem_senha_email: Boolean(senha), api: { url: process.env.NFE_API_URL || 'http://127.0.0.1:5240', configurada: api.nfeApiConfigurada() } });
});
/** Ambiente de emissão em uso (1 produção / 2 homologação) — mostrado no menu do sistema. */
router.get('/ambiente', async (_req, res) => {
  const cfg = await getCfg();
  res.json({ ambiente: Number(cfg.nfe_configuracoes_webservice_ambiente) === 1 ? 1 : 2 });
});
router.put('/config', async (req, res) => {
  const b = pick(req.body, CFG_CAMPOS);
  if (b.nfe_configuracoes_webservice_ambiente !== undefined) {
    const novo = Number(b.nfe_configuracoes_webservice_ambiente);
    if (novo !== 1 && novo !== 2) throw invalid('Ambiente inválido: use 1 (Produção) ou 2 (Homologação).');
    b.nfe_configuracoes_webservice_ambiente = novo;
    const atual = Number((await getCfg()).nfe_configuracoes_webservice_ambiente) === 1 ? 1 : 2;
    if (novo === 1 && atual !== 1 && req.body.confirmacao !== 'PRODUCAO') throw invalid('Para passar para PRODUÇÃO é preciso confirmar digitando PRODUCAO.');
  }
  if (b.email_senha === '' || b.email_senha === undefined) delete b.email_senha; // não apaga a senha por engano
  if (b.nfe_numero !== undefined) { b.nfe_numero = Number(b.nfe_numero); if (!Number.isInteger(b.nfe_numero) || b.nfe_numero < 0) throw invalid('Número da última NFe inválido.'); }
  if (b.cnpj !== undefined && String(b.cnpj).replace(/\D/g, '').length !== 14) throw invalid('CNPJ do emitente precisa ter 14 dígitos.');
  if (!Object.keys(b).length) throw invalid('Nada para gravar.');
  const cfg = await getCfg();
  await pool.query('update tb_nfe_config set ? where id = ?', [b, cfg.id]);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ certificado A1 / cadastro da empresa na API (Passo 0 do COMECE_AQUI.md)
const cnpjDe = (cfg) => { const d = String(cfg.cnpj ?? '').replace(/\D/g, ''); if (d.length !== 14) throw invalid('CNPJ do emitente em Configurações precisa ter 14 dígitos antes de cadastrar o certificado.'); return d; };
/** Estado do agente A3 (GET /api/certificados/{id}/agente → online). Sem certificado A3 salvo localmente devolve {}. */
async function estadoA3() {
  const { certificadoId } = await lerA3();
  if (!certificadoId) return {};
  try {
    const r = await api.agenteA3(certificadoId);
    if (r.status !== 200) return { certificadoId, online: null, erro: `HTTP ${r.status}` };
    const b = r.body ?? {};
    const ag = Array.isArray(b.agentes) ? b.agentes.find((x) => x.ativo !== false) ?? b.agentes[0] : b;
    return { certificadoId, online: b.online ?? ag?.online ?? null, agenteId: b.agenteId ?? ag?.agenteId ?? ag?.id ?? null, nomeAgente: b.nomeAgente ?? ag?.nomeAgente ?? ag?.nome ?? null, ultimoContato: b.ultimoContato ?? b.ultimaConexao ?? ag?.ultimoContato ?? ag?.ultimaConexao ?? null, bruto: b };
  } catch (e) { return { certificadoId, online: null, erro: e.message }; }
}
router.get('/certificado', async (_req, res) => {
  const cfg = await getCfg();
  const saida = { cnpj: String(cfg.cnpj ?? '').replace(/\D/g, ''), tokenConfigurado: api.nfeApiConfigurada(), url: process.env.NFE_API_URL || 'http://127.0.0.1:5240', vencimento: cfg.nfe_certificado_vencimento ?? null };
  saida.health = await api.healthApi();
  if (!saida.tokenConfigurado) return res.json({ ...saida, situacao: 'sem_token', mensagem: 'Defina NFE_API_TOKEN no server/.env.' });
  if (!saida.health.ok) return res.json({ ...saida, situacao: 'api_fora', mensagem: `API de NF-e inacessível (${saida.health.erro ?? `HTTP ${saida.health.status}`}).` });
  if (saida.cnpj.length !== 14) return res.json({ ...saida, situacao: 'sem_cnpj', mensagem: 'Informe o CNPJ (14 dígitos) em Configurações → Dados fiscais.' });
  const a3 = await estadoA3();
  const r = await api.empresaPorCnpjStatus(saida.cnpj);
  saida.a3 = a3;
  if (r.status === 404) return res.json({ ...saida, situacao: 'sem_empresa', mensagem: 'Empresa ainda não cadastrada na API. Envie o certificado A1 para cadastrar.' });
  if (r.status !== 200) return res.json({ ...saida, situacao: 'erro', mensagem: `Falha ao consultar a API (HTTP ${r.status}).` });
  const a3ok = a3.certificadoId && a3.online === true;
  const situacao = a3.certificadoId ? (a3.online === true ? 'ok' : 'a3_offline') : (r.body.temCertificadoAtivo ? 'ok' : 'sem_certificado');
  const mensagem = { ok: a3ok ? 'Empresa com certificado A3 e agente ONLINE: pronto para emitir.' : 'Empresa e certificado A1 ativos: pronto para emitir.', a3_offline: 'Certificado A3 cadastrado, mas o agente da máquina do token está OFFLINE (ligue a máquina, plugue o token e rode o NFeAgenteA3).', sem_certificado: 'Empresa cadastrada, mas sem certificado ativo (A1 ou A3).' }[situacao];
  res.json({ ...saida, empresa: r.body, situacao, mensagem });
});
router.post('/certificado', express.json({ limit: '3mb' }), async (req, res) => {
  const senha = String(req.body?.senha ?? '');
  const nomeArquivo = txt(req.body?.nomeArquivo) || 'certificado.pfx';
  if (!senha) throw invalid('Informe a senha do certificado.');
  if (!/\.(pfx|p12)$/i.test(nomeArquivo)) throw invalid('Selecione o arquivo do certificado A1 (.pfx ou .p12).');
  const arquivo = Buffer.from(String(req.body?.arquivoBase64 ?? ''), 'base64');
  if (arquivo.length < 100) throw invalid('Arquivo do certificado vazio ou inválido.');
  if (arquivo.length > 1024 * 1024) throw invalid('Arquivo do certificado muito grande (máx. 1 MB).');
  const cfg = await getCfg();
  const cnpj = cnpjDe(cfg);
  const regime = regimeDoCrt(cfg.nfe_crt);
  if (!regime) throw invalid('Regime tributário (CRT) do emitente não informado em Configurações → Dados fiscais.');
  if (!txt(cfg.razao)) throw invalid('Razão social do emitente não informada em Configurações.');
  if (!/^[A-Za-z]{2}$/.test(txt(cfg.uf))) throw invalid('UF do emitente não informada em Configurações → Endereço.');
  const r = await api.onboarding({ cnpj, razaoSocial: txt(cfg.razao), uf: txt(cfg.uf).toUpperCase(), regimeTributario: regime, ambientePadrao: Number(cfg.nfe_configuracoes_webservice_ambiente) === 1 ? 1 : 2, senha, arquivo, nomeArquivo });
  api.limpaCacheEmpresa();
  if (r.status === 200 || r.status === 201) {
    const b = r.body ?? {};
    return res.status(r.status).json({ ok: true, atualizado: Boolean(b.atualizado), camposAlterados: b.camposAlterados ?? [], mensagem: b.atualizado ? 'Empresa já existia: dados e certificado atualizados.' : 'Empresa cadastrada e certificado A1 ativo.' });
  }
  const detalhe = r.body?.erro ?? r.body?.mensagem ?? r.body?.detalhe ?? r.body?.title ?? JSON.stringify(r.body ?? {});
  throw new AppError(422, `A API recusou o certificado (HTTP ${r.status}): ${String(detalhe).slice(0, 300)}. Confira a senha, o CNPJ do certificado (${cnpj}) e a validade.`);
});

// --- Certificado A3 (docs/INTEGRACAO_A3.md): cadastra o .cer público; o agente da máquina do token assina
router.post('/certificado/a3', async (req, res) => {
  const nomeArquivo = txt(req.body?.nomeArquivo) || 'certificado.cer';
  const descricao = txt(req.body?.descricao);
  const nomeAgente = txt(req.body?.nomeAgente);
  if (!/\.(cer|crt|pem)$/i.test(nomeArquivo)) throw invalid('Selecione o certificado PÚBLICO do A3 (.cer). Nunca envie .pfx nem PIN.');
  if (/\.(pfx|p12)$/i.test(nomeArquivo)) throw invalid('Não envie .pfx para o A3: só o certificado público (.cer).');
  if (!descricao) throw invalid('Informe a descrição do certificado.');
  if (!nomeAgente) throw invalid('Informe o nome do agente (ex.: o nome da máquina do token).');
  const arquivo = Buffer.from(String(req.body?.arquivoBase64 ?? ''), 'base64');
  if (arquivo.length < 100) throw invalid('Arquivo do certificado vazio ou inválido.');
  if (arquivo.length > 1024 * 1024) throw invalid('Arquivo do certificado muito grande (máx. 1 MB).');
  const cfg = await getCfg();
  const cnpj = cnpjDe(cfg);
  // a empresa precisa existir na API; se não existir (só A3, sem onboarding com A1) é cadastrada por JSON (upsert por CNPJ)
  let r0 = await api.empresaPorCnpjStatus(cnpj);
  if (r0.status === 404) {
    const regime = regimeDoCrt(cfg.nfe_crt);
    if (!regime || !txt(cfg.razao) || !/^[A-Za-z]{2}$/.test(txt(cfg.uf))) throw invalid('Preencha razão social, UF e regime (CRT) em Configurações antes de cadastrar o A3.');
    const c = await api.cadastrarEmpresa({ cnpj, razaoSocial: txt(cfg.razao), uf: txt(cfg.uf).toUpperCase(), regimeTributario: regime, ambientePadrao: Number(cfg.nfe_configuracoes_webservice_ambiente) === 1 ? 1 : 2 });
    if (![200, 201].includes(c.status)) throw new AppError(422, `A API recusou o cadastro da empresa (HTTP ${c.status}): ${JSON.stringify(c.body ?? {}).slice(0, 300)}`);
    r0 = await api.empresaPorCnpjStatus(cnpj);
  }
  if (r0.status !== 200 || !r0.body?.id) throw new AppError(502, `Falha ao localizar a empresa na API (HTTP ${r0.status}).`);
  const r = await api.cadastrarA3(r0.body.id, { arquivo, nomeArquivo, descricao, nomeAgente });
  api.limpaCacheEmpresa();
  if (![200, 201].includes(r.status)) throw new AppError(422, `A API recusou o certificado A3 (HTTP ${r.status}): ${String(r.body?.erro ?? r.body?.mensagem ?? r.body?.detalhe ?? JSON.stringify(r.body ?? {})).slice(0, 300)}`);
  const b = r.body ?? {};
  const certificadoId = b.certificadoId ?? b.id ?? b.certificado?.id ?? null;
  if (certificadoId) await gravarA3({ certificadoId });
  // tokenAgente: devolvido UMA vez; vai só para a tela, nunca é gravado aqui
  res.status(201).json({ ok: true, certificadoId, tokenAgente: b.tokenAgente ?? b.agente?.token ?? null, agenteId: b.agenteId ?? null,
    mensagem: 'Certificado A3 cadastrado. Anote o token do agente agora: ele não será mostrado de novo. Agentes anteriores foram revogados.' });
});
router.put('/certificado/a3/id', async (req, res) => {
  const id = txt(req.body?.certificadoId);
  if (!/^[0-9a-fA-F-]{8,64}$/.test(id)) throw invalid('certificadoId inválido (GUID).');
  await gravarA3({ certificadoId: id });
  res.json({ ok: true });
});
router.delete('/certificado/a3/agente/:agenteId', async (req, res) => {
  const { certificadoId } = await lerA3();
  if (!certificadoId) throw invalid('Nenhum certificado A3 cadastrado neste sistema.');
  const ag = txt(req.params.agenteId);
  if (!/^[0-9a-fA-F-]{8,64}$/.test(ag)) throw invalid('agenteId inválido.');
  const r = await api.revogarAgenteA3(certificadoId, ag);
  if (![200, 204].includes(r.status)) throw new AppError(422, `A API não revogou o agente (HTTP ${r.status}).`);
  res.json({ ok: true, mensagem: 'Agente revogado. Cadastre o A3 de novo para gerar um novo token e parear.' });
});
router.delete('/certificado/a3', async (_req, res) => { await limparA3(); res.json({ ok: true }); }); // só esquece o id localmente

// ------------------------------------------------------------------ lista (bFiltroClick)
export const LIMITE_LISTA = 1500;
const COLUNAS_LISTA = ['id', 'cfop_codigo', 'status_e', 'nfe_impresso', 'nfe_email_enviado', 'nfe_numero', 'data_emissao', 'data_saida', 'nfe_protocolo_data_hora', 'cliente_pedido',
  'nf_valor_total', 'valor_produtos', 'usuario_autorizacao_nfe', 'comandas_faturadas', 'nfe_xml_file'].map((c) => `n.${c}`).join(', ');
router.get('/', async (req, res) => {
  const q = req.query;
  let onde = ' where 1=1';
  const par = [];
  const nfe1 = Number(q.nfe1 || 0); const nfe2 = Number(q.nfe2 || 0);
  let status = String(q.status ?? '').split(',').filter((s) => STATUS.includes(s));
  if (nfe1 > 0) {
    // busca por número ignora os outros filtros e olha só autorizadas/canceladas/inutilizadas
    status = ['AUTORIZADA', 'CANCELADA', 'INUTILIZADA'];
    onde += ' and nfe_numero >= ? and nfe_numero <= ?'; par.push(nfe1, nfe2 || nfe1);
  } else {
    if (q.cliente) { onde += ' and n.id_cliente = ?'; par.push(idValido(q.cliente, 'Cliente')); }
    if (q.inicio && q.fim) {
      if (!isIsoDate(q.inicio) || !isIsoDate(q.fim)) throw invalid('Período inválido.');
      const col = { emissao: 'data_emissao', saida: 'data_saida', autorizacao: "str_to_date(nfe_protocolo_data_hora, '%d/%m/%Y %H:%i:%s')" }[q.campo] ?? 'data_emissao';
      onde += ` and (${col} between ? and ?)`; par.push(`${q.inicio} 00:00:00`, `${q.fim} 23:59:59`);
    }
    if (txt(q.ref)) { onde += ' and cliente_pedido like ?'; par.push(`%${txt(q.ref)}%`); }
  }
  onde += status.length ? ` and status_e in (${status.map(() => '?').join(',')})` : " and status_e in ('')";
  par.push(...status);
  const fixa = Number(q.fixa) > 0 ? idValido(q.fixa) : 0; // nota em foco: continua na lista mesmo que o filtro (ex.: só PENDENTE) já não a inclua
  if (fixa) { onde = ` where (${onde.slice(7)}) or n.id = ?`; par.push(fixa); }
  // Só as colunas da grade (a nota completa vem de GET /nfe/:id ao selecionar) e as LIMITE_LISTA mais recentes: antes eram
  // `n.*` × até 4000 linhas, o que travava o navegador. Ordem final continua crescente por id.
  const [rows] = await pool.query(`select * from (select ${COLUNAS_LISTA} from tb_nfe n${onde} order by n.id desc limit ${LIMITE_LISTA}) t order by t.id`, par);
  res.json(rows);
});

// ------------------------------------------------------------------ criar / duplicar / apagar
router.post('/', async (_req, res) => {
  const [r] = await pool.query("insert into tb_nfe set status_e = 'PENDENTE', movimento_es = '1', data_emissao = curdate(), data_saida = curdate(), hora_saida = curtime(), cliente_pessoa = 'J'");
  res.status(201).json(await getNfe(r.insertId));
});

const LIMPAR_NA_COPIA = { status_e: 'PENDENTE', nfe_numero: 0, nfe_protocolo_data_hora: null, nfe_chave: '', nfe_xml_file: '', nfe_pdf_file: '', nfe_protocolo: '', nfe_recibo: '', nfe_recibo_datahora: null, nfe_email_enviado: null, nfe_impresso: null, nfe_cancelamento_justificativa: null, nfe: '' };
router.post('/:id/duplicar', async (req, res) => {
  const id = idValido(req.params.id);
  const novo = await tx(async (c) => {
    const [[o]] = await c.query('select * from tb_nfe where id = ?', [id]);
    if (!o) throw notFound('Nota');
    const copia = { ...o, ...Object.fromEntries(Object.entries(LIMPAR_NA_COPIA).filter(([k]) => k in o)), data_saida: new Date().toISOString().slice(0, 10) };
    delete copia.id;
    const [r] = await c.query('insert into tb_nfe set ?', [copia]);
    const [itens] = await c.query('select * from tb_nfe_itens where id_nfe = ?', [id]);
    for (const it of itens) { const { id: _i, ...resto } = it; await c.query('insert into tb_nfe_itens set ?', [{ ...resto, id_nfe: r.insertId }]); }
    return r.insertId;
  });
  res.status(201).json({ id: novo });
});

router.delete('/:id', async (req, res) => {
  const id = idValido(req.params.id);
  await tx(async (c) => {
    const [[n]] = await c.query('select id, status_e from tb_nfe where id = ? for update', [id]);
    if (!n) throw notFound('Nota');
    if (['AUTORIZADA', 'CANCELADA'].includes(n.status_e)) throw invalid('Nota autorizada/cancelada não pode ser apagada (guarda fiscal).');
    await c.query('delete from tb_nfe_itens where id_nfe = ?', [id]);
    await c.query('delete from tb_nfe_detalhes where id_nfe = ?', [id]);
    await c.query("update tb_comandas set status = 'PROCESSADO', id_nfe = 0, id_nota_fiscal = 0 where id_nfe = ?", [id]);
    await c.query('delete from tb_receita where id_nfe = ?', [id]);
    await c.query('delete from tb_nfe where id = ?', [id]);
  });
  res.json({ ok: true });
});

// ------------------------------------------------------------------ eventos fiscais modernizados (docs: EMISSAO_NFE.md)
const ambienteCfg = (cfg) => (Number(cfg.nfe_configuracoes_webservice_ambiente) === 1 ? 1 : 2);
const ehAdmin = (req) => String(req.user?.usuario ?? '').toUpperCase() === 'SANCHES';

/** Devolução total (bDevolucaoNFeClick): cria a nota de entrada CFOP 1202 referenciando a original, que vira DEVOLVIDO. */
router.post('/:id/devolucao', async (req, res) => {
  const id = idValido(req.params.id);
  const novo = await tx(async (c) => {
    const [[o]] = await c.query('select * from tb_nfe where id = ? for update', [id]);
    if (!o) throw notFound('Nota');
    if (o.status_e === 'DEVOLVIDO') throw invalid('Esta nota já foi devolvida.');
    if (o.status_e !== 'AUTORIZADA') throw invalid('Só é possível devolver nota AUTORIZADA.');
    if (!txt(o.nfe_chave)) throw invalid('A nota não tem chave de acesso para referenciar.');
    const [[cf]] = await c.query("select descricao from tb_cfop where codigo = '1202'");
    const emissao = o.data_emissao instanceof Date ? o.data_emissao.toLocaleDateString('pt-BR') : String(o.data_emissao ?? '').slice(0, 10).split('-').reverse().join('/');
    const copia = {
      ...o, ...Object.fromEntries(Object.entries(LIMPAR_NA_COPIA).filter(([k]) => k in o)),
      forma_pagamento: '90', movimento_es: '0', cfop_codigo: '1202', csosn: '900', cfop_descricao: cf?.descricao ?? o.cfop_descricao,
      data_saida: new Date().toISOString().slice(0, 10), data_emissao: new Date().toISOString().slice(0, 10),
      texto_corpo: `Entrada por devolução total da NFe ${o.nfe_numero} emitida em ${emissao}.`,
    };
    delete copia.id;
    const [r] = await c.query('insert into tb_nfe set ?', [copia]);
    const [itens] = await c.query('select * from tb_nfe_itens where id_nfe = ?', [id]);
    for (const it of itens) { const { id: _i, ...resto } = it; await c.query('insert into tb_nfe_itens set ?', [{ ...resto, id_nfe: r.insertId, cfop_cst_ipi: '03', cfop_cst_pis: '98', cfop_cst_cofins: '98' }]); }
    await c.query("update tb_nfe set status_e = 'DEVOLVIDO', nfe_email_enviado = null, nfe_impresso = null where id = ?", [id]);
    await c.query('insert into tb_nfe_referencia set id_nfe = ?, refNFe = ?', [r.insertId, o.nfe_chave]);
    await c.query("update tb_comandas set status = 'PROCESSADO', id_nfe = 0, id_nota_fiscal = 0 where id_nfe = ?", [id]);
    await evento(c, id, 'DEVOLUCAO', { resposta: `Nota de devolução ${r.insertId} gerada`, obs: copia.texto_corpo });
    return r.insertId;
  });
  res.status(201).json({ ok: true, id: novo, mensagem: 'Nota de devolução criada (PENDENTE). Confira e autorize.' });
});

/** Devolver ao estoque (bDevolveEstoqueClick): libera as comandas da nota. Só administrador (no Delphi era a senha fixa 'lev2020'). */
router.post('/:id/devolve-estoque', async (req, res) => {
  if (!ehAdmin(req)) throw new AppError(403, 'Somente o administrador pode devolver ao estoque.');
  const id = idValido(req.params.id);
  const n = await getNfe(id);
  const [r] = await pool.query("update tb_comandas set status = 'PROCESSADO', id_nfe = 0, id_nota_fiscal = 0 where id_nfe = ?", [id]);
  await evento(pool, id, 'DEVOLUCAO ESTOQUE', { resposta: `${r.affectedRows} comanda(s) liberada(s)`, obs: `Nota ${n.nfe_numero || id}` });
  res.json({ ok: true, comandas: r.affectedRows });
});

/** Situação da nota na API (GET por-numero) — sempre 200 com existe/status/podeEmitir. */
router.get('/:id/situacao', async (req, res) => {
  const nfe = await getNfe(idValido(req.params.id)); const cfg = await getCfg();
  if (!nfe.nfe_numero) throw invalid('A nota ainda não tem número.');
  const empId = await api.empresaId(cfg.cnpj);
  const r = await api.porNumero(empId, Number(nfe.nfe_numero), Number(nfe.nfe_serie) || undefined);
  res.json({ http: r.status, local: nfe.status_e, api: r.body });
});

/** Reenvio idempotente do mesmo XML (nota PENDENTE com ErroTransmissao/retorno perdido). 200 já autorizada → só atualiza o local. */
router.post('/:id/reenviar', async (req, res) => {
  const id = idValido(req.params.id);
  const nfe = await getNfe(id); const cfg = await getCfg();
  if (nfe.status_e !== 'PENDENTE') throw invalid('Só é possível reenviar nota PENDENTE.');
  if (!nfe.nfe_numero) throw invalid('A nota ainda não tem número: use Autorizar.');
  const empId = await api.empresaId(cfg.cnpj);
  const pn = await api.porNumero(empId, Number(nfe.nfe_numero), Number(nfe.nfe_serie) || undefined);
  if (!pn.body?.existe || !pn.body?.id && !pn.body?.documento?.id) throw invalid('A API não tem esta nota: use Autorizar para emitir.');
  const docId = pn.body.documento?.id ?? pn.body.id;
  const r = await api.reenviar(docId, Boolean(req.body?.contingencia));
  const doc = r.body ?? {};
  if (r.status === 200 && doc.chaveAcesso && doc.autorizado !== false) {
    let usuario = '';
    if (req.userId) { const [[u]] = await pool.query('select nome from tb_usuarios where id = ?', [req.userId]); usuario = u?.nome ?? ''; }
    const log = await gravaAutorizada(id, cfg, doc, { ambiente: ambienteCfg(cfg), numero: Number(nfe.nfe_numero), usuario, incrementa: false });
    return res.json({ ok: true, log, resposta: { ...doc, xmlBase64: undefined, danfePdfBase64: undefined } });
  }
  const m = r.status === 422 ? `Rejeitada pela SEFAZ: ${doc.codigoStatusRetorno ?? ''} ${motivo(doc)}` : `Reenvio sem sucesso (HTTP ${r.status}): ${motivo(doc)}`;
  res.status(r.status === 422 ? 422 : 502).json({ ok: false, message: m.trim(), retorno: doc });
});

// arquivos dos eventos: sempre da API (PDF/XML do cancelamento, XML da CC-e, retorno bruto da SEFAZ)
const ARQUIVOS = {
  'cancelamento.pdf': ['application/pdf', 'cancelamento.pdf'],
  'danfe-cancelamento.pdf': ['application/pdf', 'danfe-cancelamento.pdf'],
  'cancelamento.xml': ['application/xml', 'cancelamento.xml'],
  'carta-correcao.xml': ['application/xml', 'carta-correcao.xml'],
  'retorno-sefaz': ['application/json', 'retorno-sefaz.json'],
};
router.get('/:id/arquivo/:nome', async (req, res) => {
  const def = ARQUIVOS[req.params.nome];
  if (!def) throw notFound('Arquivo');
  const nfe = await getNfe(idValido(req.params.id)); const cfg = await getCfg();
  const { docId } = await docDaNota(nfe, cfg);
  const seq = req.params.nome === 'carta-correcao.xml' ? Number(req.query.seq) || undefined : undefined;
  const r = await api.arquivoEvento(docId, req.params.nome, { seq });
  if (r.status !== 200) throw new AppError(r.status === 404 ? 404 : 502, r.status === 404 ? 'A API não tem este arquivo (evento não registrado).' : `A API de NF-e não devolveu o arquivo (HTTP ${r.status}).`);
  res.type(def[0]).set('Content-Disposition', `inline; filename="${nfe.nfe_chave || nfe.id}-${def[1]}"`).send(r.buffer);
});

/** Histórico de inutilizações registradas na API. */
router.get('/inutilizacoes', async (_req, res) => {
  const cfg = await getCfg(); const empId = await api.empresaId(cfg.cnpj);
  const r = await api.listaInutilizacoes(empId);
  if (r.status !== 200) throw new AppError(502, `A API de NF-e não listou as inutilizações (HTTP ${r.status}).`);
  res.json(Array.isArray(r.body) ? r.body : r.body?.itens ?? r.body?.items ?? []);
});

/** Baixa da API o XML autorizado e o DANFE da nota e guarda nos lugares do app (disco + tb_nfe.nfe_xml_file/nfe_pdf_file). Devolve o que conseguiu. */
async function sincronizaArquivos(nfe, cfg, docId, orientacao) {
  const ambiente = Number(cfg.nfe_configuracoes_webservice_ambiente) === 1 ? 1 : 2;
  const o = orientacao || (await lerDanfeCfg()).orientacao;
  const feito = {};
  for (const [campo, ext, tipo, baixa] of [['nfe_xml_file', '-procNFe.xml', 'xml', () => api.xmlAutorizado(docId)], ['nfe_pdf_file', '.pdf', 'pdf', () => api.danfePdf(docId, o)]]) {
    try {
      let r = await baixa().catch((e) => ({ status: 0, erro: e.message }));
      if (r.status !== 200 || !r.buffer?.length) {
        const l = await consultaPastaApi(nfe, cfg, tipo).catch(() => ({}));
        if (l.buffer?.length) r = { status: 200, buffer: l.buffer };
        else if (tipo === 'pdf' && nfe.nfe_xml_file) {
          try { r = { status: 200, buffer: await danfeDoXml(await readFile(paraLocal(nfe.nfe_xml_file)), { logo: await lerLogo(), cancelada: nfe.status_e === 'CANCELADA' }) }; }
          catch { feito[tipo] = r.erro || `HTTP ${r.status}`; continue; }
        } else { feito[tipo] = r.erro || `HTTP ${r.status}${l.motivo ? ` — ${l.motivo}` : ''}`; continue; }
      }
      const p = await gravaArquivo(cfg.cnpj, ambiente, `${nfe.nfe_chave}${ext}`, r.buffer);
      if (!(campo === 'nfe_xml_file' && ehCaminhoLegado(nfe[campo]))) { await pool.query(`update tb_nfe set ${campo} = ? where id = ?`, [p, nfe.id]); nfe[campo] = p; }
      feito[tipo] = 'ok';
    } catch (e) { feito[tipo] = e.message; }
  }
  return feito;
}
/** Nota local (autorizada/cancelada) pelo número+série ou pela chave, para atualizar os arquivos após uma consulta. */
async function notaLocal({ numero, serie, chave }) {
  const [[n]] = chave
    ? await pool.query('select * from tb_nfe where nfe_chave = ? limit 1', [chave])
    : await pool.query('select * from tb_nfe where nfe_numero = ? and nfe_serie = ? and nfe_chave <> ? order by id desc limit 1', [numero, serie, '']);
  return n ?? null;
}

/** Nota que a API já tem como autorizada mas o app ainda vê como PENDENTE (retorno perdido): atualiza chave, protocolo, status, XML e DANFE. */
async function ajustaLocalPelaApi(cfg, { chave, numero, serie, d, xmlBase64 }) {
  if (!d?.autorizado && !d?.autorizada) return null;
  chave = String(d.chaveAcesso || chave || '').replace(/\D/g, '');
  if (chave.length !== 44 || chave.slice(6, 20) !== String(cfg.cnpj ?? '').replace(/\D/g, '')) return null;
  numero = Number(numero) || Number(chave.slice(25, 34)); serie = Number(serie) || Number(chave.slice(22, 25));
  // acha a nota do app: pela chave (ignorando máscara) ou pelo número (série igual ou não informada), preferindo a que ainda não tem XML
  const [[nfe]] = await pool.query(
    `select * from tb_nfe where replace(replace(nfe_chave, ' ', ''), '.', '') = ?
       or (nfe_numero = ? and (nfe_serie = ? or nfe_serie is null or nfe_serie = '' or nfe_serie = 0) and status_e not in ('INUTILIZADA'))
     order by (replace(replace(nfe_chave, ' ', ''), '.', '') = ?) desc, (nfe_xml_file is null or nfe_xml_file = '') desc, id desc limit 1`, [chave, numero, serie, chave]);
  if (!nfe) return { achou: false, numero, serie };
  const docId = d.id ?? d.documentoId;
  if (nfe.status_e === 'PENDENTE') {
    const doc = { chaveAcesso: chave, protocolo: d.protocolo ?? d.numeroProtocolo, dataAutorizacao: d.dataAutorizacao, motivoRetorno: d.motivoRetorno ?? d.motivo, xmlBase64 };
    await gravaAutorizada(nfe.id, cfg, doc, { ambiente: ambienteCfg(cfg), numero, usuario: '', incrementa: numero > Number(cfg.nfe_numero || 0) });
    nfe.nfe_chave = chave; nfe.status_e = 'AUTORIZADA';
  } else if (nfe.status_e === 'AUTORIZADA' && String(nfe.nfe_chave ?? '').replace(/\D/g, '') !== chave) { // autorizada em outro sistema: completa chave e protocolo
    const q = dataHoraBr(d.dataAutorizacao);
    await pool.query('update tb_nfe set nfe_chave = ?, nfe_protocolo = if(nfe_protocolo is null or nfe_protocolo = \'\', ?, nfe_protocolo), nfe_protocolo_data_hora = if(nfe_protocolo_data_hora is null or nfe_protocolo_data_hora = \'\', ?, nfe_protocolo_data_hora) where id = ?', [chave, d.protocolo ?? d.numeroProtocolo ?? '', q, nfe.id]);
    nfe.nfe_chave = chave;
  }
  const arquivos = docId ? await sincronizaArquivos(nfe, cfg, docId) : undefined;
  return { achou: true, id: nfe.id, numero, statusLocal: nfe.status_e, atualizada: true, arquivos };
}

// ------------------------------------------------------------------ DANFE: orientação e logo da empresa
router.get('/api-schema-ibs', async (_req, res) => res.json(await api.schemaIbsCbs()));
router.get('/ncm', async (req, res) => res.json(await pesquisaNcm(req.query.q)));
router.get('/ncm/:codigo', async (req, res) => res.json(await consultaNcm(req.params.codigo)));
router.get('/danfe-config', async (_req, res) => {
  const c = await lerDanfeCfg();
  try { const cfg = await getCfg(); const r = await api.empresaPorCnpjStatus(String(cfg.cnpj ?? '').replace(/\D/g, '')); if (r.status === 200) { c.apiTemLogo = Boolean(r.body?.temLogo); if (c.apiTemLogo && !c.logoNome) c.logoNome = 'logo da API'; } } catch { /* sem API: só o estado local */ }
  res.json(c);
});
router.put('/danfe-config', async (req, res) => {
  const o = txt(req.body?.orientacao);
  if (!ORIENTACOES.includes(o)) throw invalid('Orientação inválida (retrato ou paisagem).');
  res.json(await gravarDanfeCfg({ orientacao: o }));
});
/** Diagnóstico do logo: o que o app guardou, o que a API tem e o que o swagger da API diz sobre o endpoint. */
router.get('/danfe-logo-diagnostico', async (_req, res) => {
  const out = { passos: [] }; const add = (nome, dados) => out.passos.push({ nome, ...dados });
  const c = await lerDanfeCfg(); const b = await lerLogo();
  add('Logo guardado no app', { arquivo: c.logoNome || '(nenhum)', bytes: b?.length ?? 0, tipo: c.logoTipo || '', enviadoEm: c.logoEnviadoEm });
  try {
    const cfg = await getCfg(); const empId = await api.empresaId(cfg.cnpj).catch((e) => { add('Id da empresa na API (falhou — o logo vai pelo CNPJ)', { erro: e.message }); return null; });
    add('Empresa na API', { empresaId: empId, cnpj: String(cfg.cnpj ?? '').replace(/\D/g, '') });
    const e = await api.empresaPorCnpjStatus(String(cfg.cnpj ?? '').replace(/\D/g, ''));
    add('GET /api/empresas/por-cnpj', { http: e.status, temLogo: e.body?.temLogo });
    const g = await api.chamar('GET', `/api/empresas/por-cnpj/${String(cfg.cnpj ?? '').replace(/\D/g, '')}/logo`, { binario: true });
    add('GET /api/empresas/por-cnpj/{cnpj}/logo', { http: g.status, bytes: g.buffer?.length ?? 0, tipo: g.tipo });
    try { add('Swagger da API (endpoints com "logo")', { operacoes: await api.descobreLogo(empId) }); } catch (er) { add('Swagger da API', { erro: er.message }); }
  } catch (er) { add('Falha', { erro: er.message }); }
  res.json(out);
});
/** Logo atual: pega da API (é o que sai no DANFE) e guarda uma cópia; sem API, usa a cópia local. */
router.get('/danfe-logo', async (_req, res) => {
  try {
    const cfg = await getCfg();
    const g = await api.chamar('GET', `/api/empresas/por-cnpj/${String(cfg.cnpj ?? '').replace(/\D/g, '')}/logo`, { binario: true });
    if (g.status === 200 && g.buffer?.length > 100) {
      const tipo = /jpe?g/i.test(g.tipo || '') ? 'image/jpeg' : 'image/png';
      const atual = await lerLogo();
      if (!atual || !atual.equals(g.buffer)) await gravarLogo(g.buffer, tipo === 'image/jpeg' ? 'logo.jpg' : 'logo.png', tipo);
      return res.type(tipo).send(g.buffer);
    }
  } catch { /* sem API: cópia local */ }
  const b = await lerLogo(); const c = await lerDanfeCfg();
  if (!b) throw notFound('Logo');
  res.type(c.logoTipo || 'image/png').send(b);
});
/** Guarda o logo (PNG/JPG até 1 MB) e o envia à API de NF-e; se a API recusar, o logo fica guardado e o erro é mostrado. */
router.post('/danfe-logo', express.json({ limit: '3mb' }), async (req, res) => {
  const nome = txt(req.body?.nomeArquivo) || 'logo.png';
  if (!/\.(png|jpe?g)$/i.test(nome)) throw invalid('Selecione uma imagem PNG ou JPG.');
  const arquivo = Buffer.from(String(req.body?.arquivoBase64 ?? ''), 'base64');
  if (arquivo.length < 100) throw invalid('Imagem vazia ou inválida.');
  if (arquivo.length > 1024 * 1024) throw invalid('Imagem muito grande (máx. 1 MB).');
  const tipo = /\.png$/i.test(nome) ? 'image/png' : 'image/jpeg';
  await gravarLogo(arquivo, nome, tipo);
  const cfg = await getCfg();
  const empId = await api.empresaId(cfg.cnpj).catch(() => null); // o logo vai pelo CNPJ; o Id é só plano B (a busca do Id pode falhar, ex.: sem A1 ativo)
  const r = await api.enviarLogo(empId, { arquivo, nomeArquivo: nome, tipo, cnpj: cfg.cnpj });
  if (![200, 201, 204].includes(r.status)) throw new AppError(422, `Logo guardado, mas a API de NF-e não o aceitou (${r.tentativa}: HTTP ${r.status}): ${motivo(r.body)}.`, { retorno: r.body });
  if (r.confirmado === false) throw new AppError(422, `A API respondeu HTTP ${r.status} ao envio do logo, mas ao conferir (GET do logo) não encontrou a imagem.`);
  res.json(await gravarDanfeCfg({ logoEnviadoEm: new Date().toISOString() }));
});
router.delete('/danfe-logo', async (_req, res) => {
  await removerLogo();
  let aviso = '';
  try { const cfg = await getCfg(); const r = await api.removerLogoApi(await api.empresaId(cfg.cnpj)); if (![200, 204, 404].includes(r.status)) aviso = `A API não removeu o logo (HTTP ${r.status}).`; } catch (e) { aviso = e.message; }
  res.json({ ...(await lerDanfeCfg()), aviso });
});

/** Consulta de protocolo pela chave de acesso. */
router.post('/consultar-chave', async (req, res) => {
  const chave = String(req.body?.chave ?? '').replace(/\D/g, '');
  if (chave.length !== 44) throw invalid('A chave de acesso precisa ter 44 dígitos.');
  const cfg = await getCfg(); const empId = await api.empresaId(cfg.cnpj);
  const r = await api.consultarProtocolo(empId, { chaveAcesso: chave, ambiente: ambienteCfg(cfg) });
  let ajuste;
  try { // a API conhece a nota: ajusta a nota do app (status, chave, protocolo) e traz XML e DANFE
    if (r.status === 200) ajuste = await ajustaLocalPelaApi(cfg, { chave, d: { ...(r.body?.documento ?? {}), ...r.body, id: r.body?.documento?.id, protocolo: r.body?.numeroProtocolo ?? r.body?.documento?.protocolo, motivoRetorno: r.body?.motivo }, xmlBase64: r.body?.xmlBase64 });
  } catch (e) { ajuste = { erro: e.message }; }
  if (r.body) r.body = { ...r.body, xmlBase64: r.body.xmlBase64 ? '(base64)' : undefined };
  res.json({ http: r.status, resposta: r.body, ajuste, arquivos: ajuste?.arquivos });
});

/** Situação por número (sem precisar de nota local). */
router.get('/consultar-numero', async (req, res) => {
  const numero = Number(req.query.numero); const serie = Number(req.query.serie) || 1;
  if (!Number.isInteger(numero) || numero <= 0) throw invalid('Informe o número da nota.');
  const cfg = await getCfg(); const empId = await api.empresaId(cfg.cnpj);
  const r = await api.porNumero(empId, numero, serie);
  let ajuste;
  try {
    const d = r.body?.documento;
    if (r.body?.existe && d?.id) ajuste = await ajustaLocalPelaApi(cfg, { numero, serie, d });
  } catch (e) { ajuste = { erro: e.message }; }
  res.json({ http: r.status, resposta: r.body, ajuste, arquivos: ajuste?.arquivos });
});

/** Numeração (séries) na API: listar e inicializar o próximo número. */
router.get('/series', async (_req, res) => {
  const cfg = await getCfg(); const empId = await api.empresaId(cfg.cnpj);
  const r = await api.listaSeries(empId);
  if (r.status !== 200) throw new AppError(502, `A API de NF-e não listou as séries (HTTP ${r.status}).`);
  res.json({ series: Array.isArray(r.body) ? r.body : r.body?.itens ?? r.body?.items ?? [], localNumero: Number(cfg.nfe_numero || 0), ambiente: ambienteCfg(cfg) });
});
router.put('/series', async (req, res) => {
  const b = req.body ?? {};
  const serie = Number(b.serie || 1); const proximo = Number(b.proximoNumero); const modelo = Number(b.modelo || 55);
  if (![serie, proximo, modelo].every((x) => Number.isInteger(x) && x > 0)) throw invalid('Informe série e próximo número válidos.');
  const cfg = await getCfg(); const empId = await api.empresaId(cfg.cnpj);
  const ambiente = ambienteCfg(cfg);
  const r = await api.gravaSerie(empId, { modelo, serie, ambiente, proximoNumero: proximo });
  if (![200, 201, 204].includes(r.status)) throw new AppError(422, `A API recusou a numeração (HTTP ${r.status}): ${motivo(r.body)}`, { retorno: r.body });
  if (b.sincronizaLocal !== false && serie === 1) await pool.query('update tb_nfe_config set nfe_numero = ? where id = ?', [proximo - 1, cfg.id]); // o local guarda "último emitido"
  res.json({ ok: true, proximoNumero: proximo });
});

// ------------------------------------------------------------------ detalhe
// lookup do filtro "Destinatário" (tbCli: select * from tb_clientes where ativo='ATIVO')
router.get('/clientes', async (_req, res) => {
  const [r] = await pool.query("select id, razao_social, nome_fantasia from tb_clientes where ativo = 'ATIVO' order by razao_social");
  res.json(r);
});

// ------------------------------------------------------------------ envio por e-mail (cliente destinatário / contabilidade)
const DESTINOS_EMAIL = ['cliente', 'contabilidade'];
function pedidoEmail(b) {
  const ids = [...new Set((Array.isArray(b?.ids) ? b.ids : []).map((x) => idValido(x)))];
  if (!ids.length) throw invalid('Selecione ao menos uma nota.');
  if (ids.length > 200) throw invalid('Selecione no máximo 200 notas por envio.');
  const destino = b?.destino ?? 'cliente';
  if (!DESTINOS_EMAIL.includes(destino)) throw invalid('Destino inválido (cliente ou contabilidade).');
  return { ids, destino };
}
/** Monta, para uma nota, o que seria enviado (destinatários, assunto, texto) — usado na prévia e no envio. */
async function propostaEmail(nfe, cfg, destino) {
  const [[ext]] = await pool.query(
    'select (select email_nfe from tb_clientes where id = ?) as ec, (select email_nfe from tb_unidades where id = ?) as eu', [nfe.id_cliente ?? 0, nfe.id_unidade ?? 0]);
  const d = destinatarios(cfg, { emailCliente: [nfe.cliente_email, ext?.ec].filter(Boolean).join(';'), emailUnidade: ext?.eu }, destino);
  // endereços conhecidos que não entram por padrão (aparecem desmarcados): contabilidade quando "enviar DANFE à contabilidade" está desligado
  const opc = { cc: destino === 'cliente' ? listaEmails(cfg.nfe_email_contabilidade).ok.filter((e) => ![...d.para, ...d.cc, ...d.cco].some((x) => x.toLowerCase() === e.toLowerCase())) : [] };
  const avisos = [];
  if (nfe.status_e !== 'AUTORIZADA') avisos.push(`Nota ${nfe.status_e || ''}: só notas AUTORIZADAS podem ser enviadas.`.replace('Nota :', 'Nota:'));
  if (!d.para.length) avisos.push(destino === 'contabilidade' ? 'E-mail da contabilidade não configurado (Emitente › Envio de email).' : 'Cliente sem e-mail para NF-e.');
  if (d.invalidos.length) avisos.push(`E-mail(s) inválido(s) ignorado(s): ${d.invalidos.join(', ')}`);
  return { id: nfe.id, numero: nfe.nfe_numero, serie: nfe.nfe_serie, status: nfe.status_e, cliente: nfe.cliente_razao_social ?? '', valor: nfe.nf_valor_total,
    para: d.para, cc: d.cc, cco: d.cco, opcionais: opc, assunto: assuntoPadrao(cfg, nfe), mensagem: mensagemPadrao(cfg, nfe, destino), avisos, pode: nfe.status_e === 'AUTORIZADA' && d.para.length > 0 };
}
/** XML e DANFE da nota: do disco, ou baixados da API (e guardados em disco para o próximo envio). */
async function anexosDaNota(nfe, cfg) {
  const x = await buscaArquivo(nfe, cfg, 'nfe_xml_file', 'xml', (d) => api.xmlAutorizado(d));
  const p = await buscaArquivo(nfe, cfg, 'nfe_pdf_file', 'pdf', (d, o) => api.danfePdf(d, o)); // sem PDF, gera do XML
  return [{ filename: `${nfe.nfe_chave}-procNFe.xml`, content: x, contentType: 'application/xml' }, { filename: `${nfe.nfe_chave}.pdf`, content: p, contentType: 'application/pdf' }];
}
router.post('/email/previa', async (req, res) => {
  const { ids, destino } = pedidoEmail(req.body);
  const cfg = await getCfg();
  const notas = [];
  for (const id of ids) notas.push(await propostaEmail(await getNfe(id), cfg, destino));
  res.json({ destino, smtp: !!txt(cfg.email_servidor), notas });
});
router.post('/email', async (req, res) => {
  const { ids, destino } = pedidoEmail(req.body);
  const aj = ids.length === 1 && req.body.ajustes ? req.body.ajustes : null; // edição manual só no envio de uma nota
  const cfg = await getCfg();
  const transporte = criaTransporte(cfg); // falha cedo (422) se o SMTP não está configurado
  const resultados = [];
  for (const id of ids) {
    try {
      const nfe = await getNfe(id);
      const p = await propostaEmail(nfe, cfg, destino);
      if (nfe.status_e !== 'AUTORIZADA') throw invalid(p.avisos[0]);
      let { para, cc, cco, assunto, mensagem } = p;
      if (aj) {
        const l = (v, atual) => (v === undefined ? atual : listaEmails(v).ok);
        para = l(aj.para, para); cc = l(aj.cc, cc); cco = l(aj.cco, cco);
        assunto = txt(aj.assunto) || assunto; mensagem = txt(aj.mensagem) || mensagem;
      }
      const sel = !aj && req.body.selecao?.[id]; // várias notas: só os e-mails marcados na tela (subconjunto dos propostos)
      if (sel) {
        const f = (lst, pick) => { const ok = new Set(listaEmails([].concat(pick ?? []).join(';')).ok.map((e) => e.toLowerCase())); return lst.filter((e) => ok.has(e.toLowerCase())); };
        para = f(para, sel.para); cc = f([...cc, ...(p.opcionais?.cc ?? [])], sel.cc); cco = f(cco, sel.cco);
      }
      if (!para.length) throw invalid(p.avisos[0] || 'Nenhum e-mail de destino marcado.');
      const r = await enviaEmail(cfg, { para, cc, cco, assunto, mensagem, anexos: await anexosDaNota(nfe, cfg) }, transporte);
      if (destino === 'cliente') { try { await pool.query("update tb_nfe set nfe_email_enviado = 'True' where id = ?", [id]); } catch { await pool.query('update tb_nfe set nfe_email_enviado = 1 where id = ?', [id]).catch(() => {}); } }
      await evento(pool, id, 'EMAIL', { resposta: `${destino === 'contabilidade' ? 'Contabilidade' : 'Cliente'}: ${[...para, ...cc].join('; ')}`, obs: assunto, retorno: JSON.stringify({ destino, para, cc, cco, ...r }) }).catch(() => {});
      resultados.push({ id, numero: nfe.nfe_numero, ok: true, para, cc, log: `NFe ${nfe.nfe_numero}: enviada para ${para.join('; ')}${cc.length ? ` (cópia: ${cc.join('; ')})` : ''}.` });
    } catch (e) {
      resultados.push({ id, ok: false, log: `NFe ${id}: ${e.message}` });
    }
  }
  res.json({ ok: resultados.every((r) => r.ok), enviadas: resultados.filter((r) => r.ok).length, resultados });
});
/** Testa o SMTP gravado (verify) e, se informado, manda uma mensagem de teste. */
router.post('/config/email-teste', async (req, res) => {
  const cfg = await getCfg();
  const t = criaTransporte(cfg);
  try { await t.verify(); } catch (e) { throw new AppError(502, `SMTP recusou a conexão (${e.code || 'erro'}): ${e.response || e.message}`); }
  const para = listaEmails(req.body?.para).ok;
  if (para.length) await enviaEmail(cfg, { para, assunto: 'Teste de envio - NF-e', mensagem: 'Mensagem de teste do envio de NF-e por e-mail.' }, t);
  res.json({ ok: true, enviado: para.length > 0 });
});

router.get('/:id', async (req, res) => res.json(await getNfe(idValido(req.params.id))));
/**
 * Tudo da nota em foco numa única chamada (antes eram 6–8 chamadas em sequência a cada clique na grade, cada uma
 * redesenhando a tela): nota completa, itens, eventos, duplicatas, referências, comandas, itens da 1ª comanda e o
 * tributo do 1º item. As consultas rodam em paralelo.
 */
router.get('/:id/detalhe', async (req, res) => {
  const id = idValido(req.params.id);
  const q = async (sql, par) => (await pool.query(sql, par))[0];
  const [nota, itens, eventos, duplicatas, referencias, comandas] = await Promise.all([
    getNfe(id),
    q('select * from tb_nfe_itens where id_nfe = ? order by id', [id]),
    eventosDaNota(id),
    q('select * from tb_receita where id_nfe = ? order by vencto, id', [id]),
    q('select * from tb_nfe_referencia where id_nfe = ? order by id', [id]),
    q(SQL_COMANDAS_DA_NOTA, [id]),
  ]);
  const [comandas_itens, tributo] = await Promise.all([
    comandas[0] ? q(SQL_ITENS_COMANDA, [comandas[0].id]) : [],
    itens[0]?.id_tributo ? q('select * from tb_tributos where id = ?', [itens[0].id_tributo]).then((r) => r[0] ?? null) : null,
  ]);
  res.json({ nota, itens, eventos, duplicatas, referencias, comandas, comandas_itens, tributo });
});
router.get('/:id/itens', async (req, res) => { const [r] = await pool.query('select * from tb_nfe_itens where id_nfe = ? order by id', [idValido(req.params.id)]); res.json(r); });
const SQL_EVENTOS = 'select id, id_nfe, nome_evento, data_evento, resposta, obs, evento_xml, retorno from tb_nfe_eventos where id_nfe = ? order by id';
const eventosDaNota = async (id) => { const [r] = await pool.query(SQL_EVENTOS, [id]); return r.map((e) => { const x = enriquece(e); return { ...x, arquivo: arquivoDoEvento(x) }; }); };
router.get('/:id/eventos', async (req, res) => res.json(await eventosDaNota(idValido(req.params.id))));
router.get('/:id/duplicatas', async (req, res) => { const [r] = await pool.query('select * from tb_receita where id_nfe = ? order by vencto, id', [idValido(req.params.id)]); res.json(r); });
// pgComanda: tbcmdCB (comandas da nota, por id_nota_fiscal) e tbcmdIT (itens da comanda em foco)
const SQL_COMANDAS_DA_NOTA = `select c.*,
            (select sum(truncate(truncate(i.qtde / if(i.preco_cada = 0, 1, i.preco_cada), 3) * truncate(i.preco, 3), 3)) from tb_comandas_itens i where i.id_comanda = c.id) as vr_comanda
       from tb_comandas c where c.id_nota_fiscal = ? order by c.id`;
const SQL_ITENS_COMANDA = `select i.*, truncate(truncate(i.preco, 3) * truncate(i.qtde / if(i.preco_cada = 0, 1, i.preco_cada), 3), 3) as vr_item,
            truncate(i.qtde / if(i.preco_cada = 0, 1, i.preco_cada), 3) as new_qtde from tb_comandas_itens i where i.id_comanda = ? order by i.id`;
router.get('/:id/comandas', async (req, res) => { const [r] = await pool.query(SQL_COMANDAS_DA_NOTA, [idValido(req.params.id)]); res.json(r); });
router.get('/comandas/:cid/itens', async (req, res) => { const [r] = await pool.query(SQL_ITENS_COMANDA, [idValido(req.params.cid, 'Comanda')]); res.json(r); });

const NFE_EDITAVEIS = ['cliente_uf_icms', 'substituicao_tributaria_ie', 'substituicao_tributaria_valor', 'substituicao_tributaria_valor_base', 'substituicao_tributaria_aliquota', 'substituicao_tributaria', 'servicos_valor', 'iss_aliquota', 'iss_valor', 'faturamento_id', 'valor_extenso', 'permite_reaproveitamento_icms', 'aliquota_reaproveitamento_icms', 'id_fatura', 'transportadora_cidade_ibge', 'transportadora_uf_ibge', 'condicao_pedido', 'data_emissao', 'data_saida', 'hora_saida', 'cfop_codigo', 'cfop_descricao', 'cliente_pessoa', 'cliente_razao_social', 'cliente_nome_fantasia', 'cliente_cnpj',
  'cliente_endereco', 'cliente_endereco_numero', 'cliente_bairro', 'cliente_cidade', 'cliente_cidade_ibge', 'cliente_uf', 'cliente_uf_ibge', 'cliente_cep', 'cliente_im', 'cliente_ie', 'cliente_ddd', 'cliente_fone',
  'cliente_pedido', 'forma_pagamento', 'frete_valor', 'seguro_valor', 'despesas_acessorias', 'valor_descontos', 'frete_tipo', 'venda_avista_aprazo', 'faturamento_descricao',
  'entrega_endereco', 'entrega_numero', 'entrega_complemento', 'entrega_bairro', 'entrega_cidade', 'entrega_cidade_ibge', 'entrega_uf', 'entrega_uf_ibge', 'entrega_cep', 'entrega_cnpj', 'entrega_ie', 'entrega_ddd', 'entrega_fone',
  'transportadora_nome', 'transportadora_endereco', 'transportadora_cidade', 'transportadora_uf', 'transportadora_ie', 'transportadora_cnpj', 'transportadora_veiculo_placa', 'transportadora_veiculo_uf', 'transportadora_rntc',
  'volume_qtde', 'volume_numero', 'volume_especie', 'volume_marca', 'peso_bruto', 'peso_liquido', 'texto_corpo', 'csosn', 'nfe_modelo', 'nfe_serie', 'movimento_es'];
router.put('/:id', async (req, res) => {
  const id = idValido(req.params.id);
  const n = await getNfe(id);
  if (n.status_e !== 'PENDENTE') throw invalid('Só é possível editar notas PENDENTES.');
  const b = pick(req.body, NFE_EDITAVEIS);
  for (const k of ['data_emissao', 'data_saida']) if (b[k] !== undefined && !isIsoDate(String(b[k]).slice(0, 10))) throw invalid(`Data inválida (${k}).`);
  if (!Object.keys(b).length) throw invalid('Nada para gravar.');
  await pool.query('update tb_nfe set ? where id = ?', [b, id]);
  res.json(await getNfe(id));
});

const ITEM_EDITAVEIS = ['produto_descricao', 'produto_ncm', 'produto_ean', 'un', 'especificacoes', 'ordem_compra', 'item', 'cfop_codigo', 'csosn', 'cfop_cst_icms', 'situacao_tributaria', 'cst_ipi', 'cfop_cst_pis', 'cfop_cst_cofins',
  'qtde', 'preco', 'id_tributo', 'icms_red_base_calculo', 'icms_base_calculo', 'icms_aliquota', 'icms_valor', 'pis_aliquota', 'pis_valor', 'cofins_aliquota', 'cofins_valor', 'valor_trib_prod'];
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const dec = (v) => (v === '' || v == null ? null : v);
/**
 * Porta de tbnfiBeforePost + tbnfiAfterPost/CalculaProduto: ao gravar um item, os tributos são recalculados
 * a partir de tb_tributos (id_tributo) e o total da nota é a soma de preco*qtde dos itens.
 */
export async function gravaItem(c, itemId, campos) {
  const [[it]] = await c.query('select i.*, n.status_e, n.valor_descontos, n.csosn as nfe_csosn from tb_nfe_itens i join tb_nfe n on n.id = i.id_nfe where i.id = ? for update', [itemId]);
  if (!it) throw notFound('Item');
  if (it.status_e !== 'PENDENTE') throw invalid('Só é possível editar itens de notas PENDENTES.');
  const b = { ...campos };
  for (const k of ['qtde', 'preco']) if (b[k] !== undefined && (b[k] === '' || !Number.isFinite(Number(b[k])) || Number(b[k]) < 0)) throw invalid(`Valor inválido (${k}).`);
  for (const k of Object.keys(b)) if (b[k] === '') b[k] = null;
  const m = { ...it, ...b };
  // dsnfiDataChange: ao mudar a qtde, preco_total = round(preco*qtde, 2)
  if (b.qtde !== undefined || b.preco !== undefined) b.preco_total = r2(Number(m.preco) * Number(m.qtde));
  const total = b.preco_total ?? it.preco_total;
  const [[trib]] = m.id_tributo ? await c.query('select * from tb_tributos where id = ?', [m.id_tributo]) : [[null]];
  if (trib) {
    const base = Number(total || 0) - Number(it.valor_descontos || 0);
    const t = impostos(base, trib);
    Object.assign(b, {
      icms_base_calculo: r2(t.bIcms), valor_bc_pis_cofins: r2(t.bc), icms_red_base_calculo: r2(t.red),
      icms_aliquota: trib.aliq_icms, icms_valor: r2(t.icms), pis_aliquota: trib.aliq_pis, pis_valor: r2(t.pis), cofins_aliquota: trib.aliq_cofins, cofins_valor: r2(t.cofins),
      valor_trib_prod: r2(t.pis + t.cofins + t.icms), cfop_cst_pis: trib.cst_pis, cfop_cst_cofins: trib.cst_cofins, cst_ipi: trib.cst_ipi, cfop_cst_ipi: trib.cst_ipi, csosn: it.nfe_csosn,
    });
  }
  // o que o usuário digitou na ficha prevalece sobre o recálculo pelo código de tributação (antes o CFOP e os impostos voltavam ao valor do cadastro)
  if (trib) for (const k of ['cfop_codigo', 'csosn', 'icms_base_calculo', 'icms_aliquota', 'icms_valor', 'pis_aliquota', 'pis_valor', 'cofins_aliquota', 'cofins_valor', 'cfop_cst_pis', 'cfop_cst_cofins', 'cst_ipi']) if (campos[k] !== undefined) b[k] = campos[k] === '' ? null : campos[k];
  if (!Object.keys(b).length) throw invalid('Nada para gravar.');
  await c.query('update tb_nfe_itens set ? where id = ?', [b, itemId]);
  // CalculaProduto
  await c.query('update tb_nfe_itens set preco_total = cast(preco * qtde as decimal(15,2)) where id = ?', [itemId]);
  const [[s]] = await c.query('select sum(cast(preco * qtde as decimal(15,2))) as v from tb_nfe_itens where id_nfe = ?', [it.id_nfe]);
  await c.query('update tb_nfe set valor_produtos = ?, nf_valor_total = ? where id = ?', [s.v ?? 0, s.v ?? 0, it.id_nfe]);
  const [[novo]] = await c.query('select * from tb_nfe_itens where id = ?', [itemId]);
  return novo;
}
router.put('/itens/:itemId', async (req, res) => {
  const itemId = idValido(req.params.itemId, 'Item');
  const b = pick(req.body, ITEM_EDITAVEIS);
  if (!Object.keys(b).length) throw invalid('Nada para gravar.');
  const novo = await tx((c) => gravaItem(c, itemId, b));
  const [[nota]] = await pool.query('select valor_produtos, nf_valor_total from tb_nfe where id = ?', [novo.id_nfe]);
  res.json({ ...novo, _nota: nota });
});

// Append do navegador de itens: informa o código do produto (dsnfiDataChange preenche descrição, NCM, UN, preço e tributo)
const trunc3 = (n) => Math.trunc(Number(n) * 1000 + 1e-9) / 1000;
router.post('/:id/itens', async (req, res) => {
  const id = idValido(req.params.id);
  const codigo = txt(req.body?.produto_codigo);
  const qtde = req.body?.qtde === undefined || req.body?.qtde === '' ? 1 : Number(req.body.qtde);
  if (!codigo) throw invalid('Informe o código do produto.');
  if (!Number.isFinite(qtde) || qtde <= 0) throw invalid('Quantidade inválida.');
  const novo = await tx(async (c) => {
    const n = await getNfe(id, c);
    if (n.status_e !== 'PENDENTE') throw invalid('Só é possível incluir itens em notas PENDENTES.');
    const [[p]] = await c.query('select * from tb_produtos where codigo = ?', [codigo]);
    if (!p) throw notFound('Produto');
    const [r] = await c.query('insert into tb_nfe_itens set ?', [{
      id_nfe: id, id_produto: p.id, produto_codigo: codigo, preco: trunc3(p.preco), produto_descricao: p.descricao, produto_ncm: p.ncm || '19059090', un: p.un, id_tributo: p.id_tributos, qtde, produto_origem: 'NACIONAL',
    }]);
    return gravaItem(c, r.insertId, {});
  });
  res.status(201).json(novo);
});
router.delete('/itens/:itemId', async (req, res) => {
  const itemId = idValido(req.params.itemId, 'Item');
  await tx(async (c) => {
    const [[it]] = await c.query('select i.id, i.id_nfe, n.status_e from tb_nfe_itens i join tb_nfe n on n.id = i.id_nfe where i.id = ? for update', [itemId]);
    if (!it) throw notFound('Item');
    if (it.status_e !== 'PENDENTE') throw invalid('Só é possível excluir itens de notas PENDENTES.');
    await c.query('delete from tb_nfe_itens where id = ?', [itemId]);
    const [[s]] = await c.query('select sum(cast(preco * qtde as decimal(15,2))) as v from tb_nfe_itens where id_nfe = ?', [it.id_nfe]);
    await c.query('update tb_nfe set valor_produtos = ?, nf_valor_total = ? where id = ?', [s.v ?? 0, s.v ?? 0, it.id_nfe]);
  });
  res.status(204).end();
});

// ------------------------------------------------------------------ tributo do item (qryTrib / dsTrib = tb_tributos, aba IBSCBS)
const TRIB_CAMPOS = ['cst', 'cClassTrib', 'pIBS', 'pCBS', 'red_aliq', 'cBenef'];
router.get('/tributos/:tribId', async (req, res) => {
  const [[t]] = await pool.query('select * from tb_tributos where id = ?', [idValido(req.params.tribId, 'Tributo')]);
  if (!t) throw notFound('Tributo');
  res.json(t);
});
router.put('/tributos/:tribId', async (req, res) => {
  const tribId = idValido(req.params.tribId, 'Tributo');
  const b = pick(req.body, TRIB_CAMPOS);
  for (const k of ['pIBS', 'pCBS', 'red_aliq']) if (b[k] !== undefined && b[k] !== '' && !Number.isFinite(Number(b[k]))) throw invalid(`Valor inválido (${k}).`);
  for (const k of Object.keys(b)) if (b[k] === '') b[k] = null;
  if (!Object.keys(b).length) throw invalid('Nada para gravar.');
  const [r] = await pool.query('update tb_tributos set ? where id = ?', [b, tribId]);
  if (!r.affectedRows) throw notFound('Tributo');
  const [[t]] = await pool.query('select * from tb_tributos where id = ?', [tribId]);
  res.json(t);
});

// ------------------------------------------------------------------ NFe referenciada (tb_nfe_referencia / tbNRef)
const REF_CAMPOS = ['refNFE', 'tipo', 'cUF', 'AAMM', 'cnpj', 'fld_mod', 'serie', 'nNF', 'cnpjcpf', 'IE', 'refCTe', 'modECF', 'nECF', 'nCOO'];
router.get('/:id/referencias', async (req, res) => { const [r] = await pool.query('select * from tb_nfe_referencia where id_nfe = ? order by id', [idValido(req.params.id)]); res.json(r); });
router.post('/:id/referencias', async (req, res) => {
  const id = idValido(req.params.id);
  const n = await getNfe(id);
  if (n.status_e !== 'PENDENTE') throw invalid('Só é possível alterar notas PENDENTES.');
  const [r] = await pool.query('insert into tb_nfe_referencia set ?', [{ id_nfe: id, ...pick(req.body, REF_CAMPOS) }]);
  const [[novo]] = await pool.query('select * from tb_nfe_referencia where id = ?', [r.insertId]);
  res.status(201).json(novo);
});
router.delete('/referencias/:refId', async (req, res) => {
  const refId = idValido(req.params.refId, 'Referência');
  const [[r]] = await pool.query('select r.id, n.status_e from tb_nfe_referencia r join tb_nfe n on n.id = r.id_nfe where r.id = ?', [refId]);
  if (!r) throw notFound('Referência');
  if (r.status_e !== 'PENDENTE') throw invalid('Só é possível excluir referência de nota PENDENTE.');
  await pool.query('delete from tb_nfe_referencia where id = ?', [refId]);
  res.json({ ok: true });
});
router.put('/referencias/:refId', async (req, res) => {
  const refId = idValido(req.params.refId, 'Referência');
  const [[ref]] = await pool.query('select r.id, n.status_e from tb_nfe_referencia r join tb_nfe n on n.id = r.id_nfe where r.id = ?', [refId]);
  if (!ref) throw notFound('Referência');
  if (ref.status_e !== 'PENDENTE') throw invalid('Só é possível alterar notas PENDENTES.');
  const b = pick(req.body, REF_CAMPOS);
  if (!Object.keys(b).length) throw invalid('Nada para gravar.');
  await pool.query('update tb_nfe_referencia set ? where id = ?', [b, refId]);
  const [[novo]] = await pool.query('select * from tb_nfe_referencia where id = ?', [refId]);
  res.json(novo);
});

// ------------------------------------------------------------------ duplicata (tbDup = tb_receita da nota)
router.put('/duplicatas/:dupId', async (req, res) => {
  const dupId = idValido(req.params.dupId, 'Duplicata');
  const [[d]] = await pool.query('select r.id, n.status_e from tb_receita r join tb_nfe n on n.id = r.id_nfe where r.id = ?', [dupId]);
  if (!d) throw notFound('Duplicata');
  if (d.status_e !== 'PENDENTE') throw invalid('Só é possível alterar duplicatas de notas PENDENTES.');
  const b = pick(req.body, ['documento', 'vencto', 'valor']);
  if (b.vencto !== undefined && !isIsoDate(String(b.vencto).slice(0, 10))) throw invalid('Vencimento inválido.');
  if (b.valor !== undefined && (!Number.isFinite(Number(b.valor)) || Number(b.valor) < 0)) throw invalid('Valor inválido.');
  if (!Object.keys(b).length) throw invalid('Nada para gravar.');
  await pool.query('update tb_receita set ? where id = ?', [b, dupId]);
  const [[novo]] = await pool.query('select * from tb_receita where id = ?', [dupId]);
  res.json(novo);
});

// ------------------------------------------------------------------ btnDestinatarioClick: copia os dados do último destinatário cuja razão social contém o texto
const DEST_COPIA = ['cliente_razao_social', 'cliente_nome_fantasia', 'cliente_endereco', 'cliente_endereco_numero', 'cliente_bairro', 'cliente_cidade', 'cliente_cidade_ibge', 'cliente_cep', 'cliente_uf', 'cliente_cnpj', 'cliente_ie', 'cliente_fone',
  'transportadora_veiculo_placa', 'transportadora_veiculo_uf', 'frete_tipo', 'frete_numero', 'volume_qtde', 'volume_marca', 'volume_numero', 'texto_corpo', 'entrega_endereco', 'entrega_numero', 'entrega_complemento', 'entrega_bairro',
  'entrega_cidade', 'entrega_cidade_ibge', 'entrega_cep', 'entrega_uf', 'entrega_ie', 'entrega_cnpj', 'entrega_fone', 'nfe_modelo', 'nfe_serie', 'condicao_pedido', 'venda_avista_aprazo', 'csosn', 'forma_pagamento'];
router.post('/:id/destinatario', async (req, res) => {
  const id = idValido(req.params.id);
  const texto = txt(req.body?.razao_social);
  if (!texto) throw invalid('Informe a razão social do destinatário.');
  const n = await getNfe(id);
  if (n.status_e !== 'PENDENTE') throw invalid('Só é possível alterar notas PENDENTES.');
  const [[o]] = await pool.query('select * from tb_nfe where cliente_razao_social like ? order by id desc limit 1', [`%${texto.replace(/[\\%_]/g, '\\$&')}%`]);
  if (!o) throw notFound('Cliente');
  const b = Object.fromEntries(DEST_COPIA.map((k) => [k, o[k] ?? null]));
  b.cliente_pedido = o.cliente_razao_social;
  b.status_e = 'PENDENTE';
  const p = (x) => String(x).padStart(2, '0');
  const d = new Date();
  b.data_geracao = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  await pool.query('update tb_nfe set ? where id = ?', [b, id]);
  res.json(await getNfe(id));
});

// ------------------------------------------------------------------ eventos
const evento = (c, id, nome, { resposta, retorno, obs, xml }) => c.query(
  'insert into tb_nfe_eventos set id_nfe = ?, nome_evento = ?, evento = ?, data_evento = now(), resposta = ?, retorno = ?, obs = ?, evento_xml = ?',
  [id, nome, nome, resposta ?? '', retorno ?? '', obs ?? '', xml ?? '']);
const motivo = (b) => b?.motivoRetorno || b?.motivo || b?.ultimoErro || b?.erro || b?.mensagem || JSON.stringify(b ?? {}).slice(0, 300);

// ------------------------------------------------------------------ autorizar (btnCriarEnviarClick / AutorizarNFe)
/** Grava a autorização devolvida pela API (emissão ou reenvio): arquivos, tb_nfe e, na emissão, o contador de numeração. */
async function gravaAutorizada(id, cfg, doc, { ambiente, numero, usuario, incrementa }) {
  const log = [];
  let xmlFile = ''; let pdfFile = '';
  try {
    if (doc.xmlBase64) xmlFile = await gravaArquivo(cfg.cnpj, ambiente, `${doc.chaveAcesso}-procNFe.xml`, Buffer.from(doc.xmlBase64, 'base64'));
    if (doc.danfePdfBase64) pdfFile = await gravaArquivo(cfg.cnpj, ambiente, `${doc.chaveAcesso}.pdf`, Buffer.from(doc.danfePdfBase64, 'base64'));
  } catch (e) { log.push(`ATENÇÃO: não consegui gravar o XML/PDF em disco (${e.message}). A nota está autorizada; baixe o XML pela tela.`); }
  const quando = dataHoraBr(doc.dataAutorizacao);
  await tx(async (c) => {
    await c.query('update tb_nfe set ? where id = ?', [{
      nfe_xml_file: xmlFile, nfe_pdf_file: pdfFile, nfe: txt(doc.motivoRetorno) || 'Autorizado o uso da NF-e', nfe_chave: doc.chaveAcesso, status_e: 'AUTORIZADA',
      nfe_numero: Number(String(doc.chaveAcesso).slice(25, 34)) || numero, usuario_autorizacao_nfe: await usuarioNfe(pool, usuario), nfe_recibo_datahora: quando, nfe_protocolo: txt(doc.protocolo), nfe_protocolo_data_hora: quando,
    }, id]);
    if (incrementa) await c.query('update tb_nfe_config set nfe_numero = ? where id = ?', [numero, cfg.id]); // incrementa o número da nota fiscal
    await evento(c, id, 'AUTORIZACAO', { resposta: txt(doc.motivoRetorno) || 'Autorizado o uso da NF-e', retorno: JSON.stringify({ ...doc, xmlBase64: undefined, danfePdfBase64: undefined }), obs: `NFe ${numero}`, xml: xmlFile });
  });
  if ((!xmlFile || !pdfFile) && doc.id) { // a resposta veio sem XML ou DANFE: busca na API para o sistema antigo achar os dois arquivos nos campos da nota
    try { const r = await sincronizaArquivos(await getNfe(id), cfg, doc.id); if (r.xml === 'ok') xmlFile ||= '(baixado da API)'; if (r.pdf !== 'ok' || r.xml !== 'ok') log.push(`Arquivos pós-autorização: XML ${r.xml ?? '-'}, DANFE ${r.pdf ?? '-'}.`); } catch (e) { log.push(`Não consegui baixar XML/DANFE da API: ${e.message}`); }
  }
  log.push(`Número da NFE: ${numero}`, `Resultado: ${txt(doc.motivoRetorno) || 'Autorizado'}`, `Chave: ${doc.chaveAcesso}`, `Arquivo: ${xmlFile || '(não gravado)'}`, 'A U T O R I Z A D A !');
  return log;
}

/** Devolução sem chave referenciada (nota gerada antes da chave existir, ou chave apagada): acha a NF-e original pelo número citado no texto
 *  ("... devolução total da NFe 69848 ...") e grava a referência. Só usa nota AUTORIZADA/DEVOLVIDA com chave de 44 dígitos. */
async function completaReferenciaDevolucao(id, nfe, referencias) {
  if (!ehDevolucao(nfe) || referencias.some((r) => String(r.refNFe ?? '').replace(/\D/g, '').length === 44)) return referencias;
  const m = /NFe\s+(\d{1,9})\b/i.exec(String(nfe.texto_corpo ?? ''));
  if (!m) return referencias;
  const [[orig]] = await pool.query("select nfe_chave from tb_nfe where nfe_numero = ? and id <> ? and nfe_chave is not null and length(replace(nfe_chave, ' ', '')) >= 44 order by id desc limit 1", [m[1], id]);
  const chave = String(orig?.nfe_chave ?? '').replace(/\D/g, '');
  if (chave.length !== 44) return referencias;
  await pool.query('insert into tb_nfe_referencia set id_nfe = ?, refNFe = ?', [id, chave]);
  return [...referencias, { refNFe: chave }];
}

async function autorizaUma(id, usuario, ibsCbs) {
  const log = [];
  const nfe = await getNfe(id);
  if (nfe.status_e !== 'PENDENTE') return { id, ok: false, log: [`Nota ${id} não está PENDENTE (${nfe.status_e}).`] };
  const cfg = await getCfg();
  // IBS/CBS e cBenef vêm de tb_tributos (aba IBSCBS do item = dsTrib)
  const [itens] = await pool.query(
    `select i.*, t.cBenef, t.cst, t.cClassTrib, t.pIBS, t.pCBS, t.red_aliq
       from tb_nfe_itens i left join tb_tributos t on t.id = i.id_tributo where i.id_nfe = ? order by i.id`, [id]);
  const [dup] = await pool.query('select vencto from tb_receita where id_nfe = ?', [id]);
  let [referencias] = await pool.query('select refNFe from tb_nfe_referencia where id_nfe = ? order by id', [id]);
  referencias = await completaReferenciaDevolucao(id, nfe, referencias);
  const erros = validaParaAutorizar(nfe, itens, cfg, { vencimentos: dup.map((d) => d.vencto), referencias });
  if (erros.length) return { id, ok: false, log: erros };

  const empId = await api.empresaId(cfg.cnpj);
  // A3: se já sabemos que o agente está offline, nem tenta (a API responderia 503 antes de gravar qualquer coisa)
  const a3 = await estadoA3();
  if (a3.certificadoId && a3.online === false) {
    return { id, ok: false, temporario: true, log: ['Agente do certificado A3 OFFLINE. Ligue a máquina do token (token plugado e NFeAgenteA3 rodando) e tente de novo.', 'Nenhum número foi consumido; a nota continua PENDENTE.'], resumo: { status: 503, resposta: { tipo: 'AgenteCertificadoException', origem: 'verificação prévia' } } };
  }
  const numero = Number(cfg.nfe_numero || 0) + 1;
  const serie = Number(nfe.nfe_serie) || 1;
  // a numeração é nossa: confere se a API já tem esse número antes de usar
  const pn = await api.porNumero(empId, numero, serie);
  if (pn.body?.existe && ['Autorizado', 'Cancelado'].includes(pn.body.status)) {
    return { id, ok: false, log: [`O número ${numero} (série ${serie}) já existe na API como ${pn.body.status}. Ajuste "Número da última NFe emitida" em Configurações e tente de novo.`] };
  }
  const ncmsRuins = [];
  for (const n of [...new Set(itens.map((i) => String(i.produto_ncm ?? '').replace(/\D/g, '')))]) {
    const r = await consultaNcm(n);
    if (r.ok === false) ncmsRuins.push(`${r.motivo} Itens: ${itens.filter((i) => String(i.produto_ncm ?? '').replace(/\D/g, '') === n).map((i) => i.produto_codigo).join(', ')}. Corrija o NCM do produto (cadastro) e do item.`);
  }
  if (ncmsRuins.length) return { id, ok: false, log: ncmsRuins };
  await pool.query('update tb_nfe set nfe_numero = ? where id = ?', [numero, id]); // como no Delphi: grava o número antes, para busca posterior
  const json = montaJsonNfe(nfe, itens, cfg, { numero, ibsCbs, referencias, orientacao: (await lerDanfeCfg()).orientacao });
  if (ibsCbs && json.itens.some((i) => i.ibsCbs && ['200', '210'].includes(i.ibsCbs.cst))) {
    aplicaReducaoIbs(json, []); // nomes documentados pela API (reducaoAliquotaIbsUf, aliquotaEfetivaIbsUf, reducaoAliquotaCbs, aliquotaEfetivaCbs)
  }
  const r = await api.emitir(empId, json, `nfe-${id}-${numero}`);
  const doc = r.body ?? {};
  if (r.status === 503 && /AgenteCertificado/i.test(String(doc.tipo ?? ''))) {
    // certificado A3: o agente da máquina do token está offline. Nada foi gravado na API (nenhum número consumido): falha temporária.
    await pool.query('update tb_nfe set nfe_numero = ? where id = ?', [Number(nfe.nfe_numero || 0), id]);
    return { id, ok: false, temporario: true, log: ['Agente do certificado A3 OFFLINE. Ligue a máquina do token (token plugado e NFeAgenteA3 rodando) e tente de novo.', 'Nenhum número foi consumido; a nota continua PENDENTE.'], resumo: { status: 503, resposta: doc } };
  }
  const resumo = { requisicao: json, status: r.status, resposta: { ...doc, xmlBase64: doc.xmlBase64 ? '(base64)' : undefined, danfePdfBase64: doc.danfePdfBase64 ? '(base64)' : undefined } };

  if (r.status === 200 && doc.autorizado !== false && doc.chaveAcesso) {
    const ambiente = Number(json.configuracao.ambiente);
    const sucesso = await gravaAutorizada(id, cfg, doc, { ambiente, numero, usuario, incrementa: true });
    log.push(...sucesso);
    return { id, ok: true, log, resumo };
  }
  const m = r.status === 422 ? `${doc.status === 300 ? 'Denegada' : 'Rejeitada'} pela SEFAZ: ${doc.codigoStatusRetorno ?? ''} ${motivo(doc)}`.trim() : `Erro da API de NF-e (HTTP ${r.status}): ${motivo(doc)}`;
  log.push(m);
  // a trilha da nota guarda também o que NÃO deu certo (antes só aparecia no log da tela e se perdia)
  try { await evento(pool, id, doc.status === 300 ? 'DENEGACAO' : r.status === 422 && doc.status !== 900 ? 'REJEICAO' : 'ERRO TRANSMISSAO', { resposta: m, retorno: JSON.stringify({ ...doc, xmlBase64: undefined, danfePdfBase64: undefined, httpStatus: r.status }), obs: `NFe ${numero}`, xml: '' }); } catch (e) { console.warn(`[nfe] evento de rejeição: ${e.message}`); }
  if (doc.status === 900) log.push('Falha de transmissão: confira o resultado antes de repetir (a API guarda o XML e permite reenviar).');
  return { id, ok: false, log, resumo };
}

router.post('/autorizar', async (req, res) => {
  const ids = [...new Set((req.body?.ids ?? []).map((i) => idValido(i)))];
  if (!ids.length) throw invalid('Selecione a NFE.');
  if (ids.length > 100) throw invalid('Autorize no máximo 100 notas por vez.');
  let usuario = '';
  if (req.userId) { const [[u]] = await pool.query('select nome from tb_usuarios where id = ?', [req.userId]); usuario = u?.nome ?? ''; }
  const resultados = await emFila(async () => {
    const out = [];
    for (const id of ids) {
      try { out.push(await autorizaUma(id, usuario, true)); } catch (e) { out.push({ id, ok: false, log: [e.message] }); if (!(e instanceof AppError)) console.error(e); }
      if (!out.at(-1).ok && ids.length > 1) break; // como no Delphi: uma falha interrompe o lote
    }
    return out;
  });
  res.json({ resultados });
});

// ------------------------------------------------------------------ cancelar / carta de correção / inutilizar
async function docDaNota(nfe, cfg) {
  if (nfe.status_e !== 'AUTORIZADA' && nfe.status_e !== 'CANCELADA') throw invalid('A nota precisa estar AUTORIZADA.');
  if (!txt(nfe.nfe_chave) || !nfe.nfe_numero) throw invalid('É necessário selecionar a NFe desejada (sem chave/número).');
  const empId = await api.empresaId(cfg.cnpj);
  return { empId, docId: await api.documentoId(empId, Number(nfe.nfe_numero), Number(nfe.nfe_serie) || undefined) };
}

router.post('/:id/cancelar', async (req, res) => {
  const id = idValido(req.params.id);
  const just = txt(req.body?.justificativa);
  if (just.length < 15 || just.length > 255) throw invalid('A justificativa precisa ter de 15 a 255 caracteres.');
  const nfe = await getNfe(id); const cfg = await getCfg();
  if (nfe.status_e !== 'AUTORIZADA') throw invalid('Só é possível cancelar nota AUTORIZADA.');
  const { docId } = await docDaNota(nfe, cfg);
  const r = await api.cancelar(docId, just);
  const b = r.body ?? {};
  if (r.status !== 200 || b.homologado === false) throw new AppError(422, `Cancelamento não registrado: ${b.codigoStatus ?? ''} ${motivo(b)}`.trim(), { retorno: b });
  let xml = '';
  try { const x = await api.chamar('GET', `/api/nfe/${docId}/cancelamento.xml`, { binario: true }); if (x.status === 200) xml = await gravaArquivo(cfg.cnpj, Number(cfg.nfe_configuracoes_webservice_ambiente) === 1 ? 1 : 2, `${nfe.nfe_chave}-cancelamento.xml`, x.buffer); } catch { /* guarda do XML é melhor esforço */ }
  await tx(async (c) => {
    await evento(c, id, 'CANCELAMENTO', { resposta: motivo(b), retorno: JSON.stringify(b), obs: just, xml });
    await c.query("update tb_nfe set status_e = 'CANCELADA', nfe_cancelamento_justificativa = ? where id = ?", [just, id]);
    await c.query("update tb_comandas set status = 'PROCESSADO', id_nfe = 0, id_nota_fiscal = 0 where id_nfe = ?", [id]);
    await c.query('delete from tb_receita where id_nfe = ?', [id]);
  });
  res.json({ ok: true, mensagem: 'NFe C A N C E L A D A com sucesso!', protocolo: b.protocoloEvento });
});

router.post('/:id/carta-correcao', async (req, res) => {
  const id = idValido(req.params.id);
  const texto = txt(req.body?.correcao);
  if (texto.length < 15 || texto.length > 1000) throw invalid('O texto da correção precisa ter de 15 a 1000 caracteres.');
  const nfe = await getNfe(id); const cfg = await getCfg();
  if (nfe.status_e !== 'AUTORIZADA') throw invalid('Só é possível corrigir nota AUTORIZADA.');
  const { docId } = await docDaNota(nfe, cfg);
  const r = await api.cartaCorrecao(docId, texto);
  const b = r.body ?? {};
  if (r.status !== 200 || b.homologado === false) throw new AppError(422, `Erro!!! ${b.codigoStatus ?? ''} ${motivo(b)}`.trim(), { retorno: b });
  let xml = '';
  try { const x = await api.chamar('GET', `/api/nfe/${docId}/carta-correcao.xml`, { binario: true, query: { seq: b.sequenciaEvento } }); if (x.status === 200) xml = await gravaArquivo(cfg.cnpj, Number(cfg.nfe_configuracoes_webservice_ambiente) === 1 ? 1 : 2, `${nfe.nfe_chave}-cce-${b.sequenciaEvento ?? 'x'}.xml`, x.buffer); } catch { /* idem */ }
  await tx(async (c) => {
    await evento(c, id, 'CARTA DE CORRECAO', { resposta: motivo(b), retorno: JSON.stringify(b), obs: texto, xml });
    if (b.sequenciaEvento) await c.query('update tb_nfe_config set nfe_carta_correcao_seq = ? where id = ?', [b.sequenciaEvento, cfg.id]);
  });
  res.json({ ok: true, mensagem: `Sucesso! ${motivo(b)}`, sequencia: b.sequenciaEvento });
});

router.post('/inutilizar', async (req, res) => {
  const b = req.body ?? {};
  const ano = Number(b.ano); const modelo = Number(b.modelo || 55); const serie = Number(b.serie || 1);
  const ini = Number(b.numero_inicial ?? b.numero); const fim = Number(b.numero_final ?? b.numero ?? ini);
  const just = txt(b.justificativa);
  if (![ano, modelo, serie, ini, fim].every((x) => Number.isInteger(x) && x > 0) || fim < ini) throw invalid('Dados inconsistentes para o procedimento!');
  if (fim - ini > 49) throw invalid('Inutilize no máximo 50 números por vez.');
  if (just.length < 15 || just.length > 255) throw invalid('A justificativa precisa ter de 15 a 255 caracteres.');
  const cfg = await getCfg(); const empId = await api.empresaId(cfg.cnpj);
  const ambiente = Number(cfg.nfe_configuracoes_webservice_ambiente) === 1 ? 1 : 2;
  const r = await api.inutilizar(empId, { uf: txt(cfg.uf).toUpperCase(), cnpj: String(cfg.cnpj).replace(/\D/g, ''), modelo, serie, ambiente, ano, numeroInicial: ini, numeroFinal: fim, justificativa: just });
  const d = r.body ?? {};
  if (r.status !== 200 || d.homologado === false) throw new AppError(422, `Erro!!! ${d.codigoStatus ?? ''} ${motivo(d)}`.trim(), { retorno: d });
  await tx(async (c) => {
    for (let n = ini; n <= fim; n++) {
      const [ins] = await c.query("insert into tb_nfe set data_emissao = curdate(), status_e = 'INUTILIZADA', nfe_numero = ?, nfe_modelo = ?, nfe_serie = ?, nfe_protocolo = ?, nfe_protocolo_data_hora = ?, nfe = ?", [n, String(modelo), String(serie), txt(d.protocolo), dataHoraBr(d.dataRegistro) || null, motivo(d)]);
      await evento(c, ins.insertId, 'INUTILIZACAO', { resposta: motivo(d), retorno: JSON.stringify(d), obs: just, xml: '' });
    }
  });
  res.json({ ok: true, mensagem: 'Inutilizada com sucesso!', protocolo: d.protocolo });
});

// ------------------------------------------------------------------ DANFE, XML e status do serviço
/** Arquivo da nota (XML/PDF): tenta a API primeiro (traz o atual e guarda no app); sem API, usa a cópia do disco. */
/** Procura o arquivo na pasta onde a API guarda os XML/PDF (NFE_ARQUIVOS_DIR/<cnpj>/NFe/<data>/NFe). */
const consultaPastaApi = (nfe, cfg, tipo) => lerArquivoNota({ chave: nfe.nfe_chave, cnpj: cfg.cnpj, tipo, datas: [nfe.nfe_protocolo_data_hora, nfe.data_emissao] });
/** O que o botão "Consulta de protocolo pela chave" faz, só que em silêncio: consulta a API pela chave, ajusta a nota local e devolve o XML da resposta. */
const consultaChaveCache = new Map();
async function consultaChaveSilenciosa(nfe, cfg) {
  const chave = String(nfe.nfe_chave ?? '').replace(/\D/g, '');
  if (chave.length !== 44) return null;
  const c = consultaChaveCache.get(chave);
  if (c && Date.now() - c.t < 60000) return c.v;
  let v = null;
  try {
    const empId = await api.empresaId(cfg.cnpj);
    const r = await api.consultarProtocolo(empId, { chaveAcesso: chave, ambiente: ambienteCfg(cfg) });
    if (r.status === 200 && r.body) {
      const xml64 = r.body.xmlBase64 ?? r.body.documento?.xmlBase64;
      v = { xml: xml64 ? Buffer.from(String(xml64), 'base64') : null };
      try { await ajustaLocalPelaApi(cfg, { chave, d: { ...(r.body.documento ?? {}), ...r.body, id: r.body.documento?.id, protocolo: r.body.numeroProtocolo ?? r.body.documento?.protocolo, motivoRetorno: r.body.motivo }, xmlBase64: xml64 }); } catch { /* o XML da resposta já basta */ }
      const [[atual]] = await pool.query('select nfe_xml_file, nfe_pdf_file from tb_nfe where id = ?', [nfe.id]);
      if (atual) { nfe.nfe_xml_file = atual.nfe_xml_file; nfe.nfe_pdf_file = atual.nfe_pdf_file; }
    } else console.warn(`[nfe] consulta pela chave ${chave}: HTTP ${r.status}`);
  } catch (e) { console.warn(`[nfe] consulta pela chave ${chave} falhou: ${e.message}`); }
  consultaChaveCache.set(chave, { t: Date.now(), v });
  return v;
}
async function buscaArquivo(nfe, cfg, campo, nomeExt, baixa, orientacao) {
  const f = txt(nfe[campo]);
  const doDisco = f && existsSync(paraLocal(f));
  const ambiente = Number(cfg.nfe_configuracoes_webservice_ambiente) === 1 ? 1 : 2;
  const guarda = async (buf) => {
    try {
      const p = await gravaArquivo(cfg.cnpj, ambiente, `${nfe.nfe_chave}${nomeExt === 'xml' ? '-procNFe.xml' : '.pdf'}`, buf);
      if (p !== f && !(campo === 'nfe_xml_file' && ehCaminhoLegado(f))) await pool.query(`update tb_nfe set ${campo} = ? where id = ?`, [p, nfe.id]); // não desfaz o caminho N:/ do sistema antigo
    } catch { /* guardar é melhor esforço */ }
  };
  let erro = null;
  try {
    const { docId } = await docDaNota(nfe, cfg);
    const r = await baixa(docId, orientacao || (await lerDanfeCfg()).orientacao);
    if (r.status === 200 && r.buffer?.length) { await guarda(r.buffer); return r.buffer; }
    erro = new AppError(r.status === 404 ? 404 : 502, `A API de NF-e não devolveu o arquivo (HTTP ${r.status}).`);
  } catch (e) { erro = e; }
  if (doDisco) return readFile(paraLocal(f));
  // a API não entregou: usa a cópia que ela mesma guarda em disco
  const l = await consultaPastaApi(nfe, cfg, nomeExt === 'xml' ? 'xml' : 'pdf');
  if (l.buffer?.length) { await guarda(l.buffer); return l.buffer; }
  // plano B: a API conhece a nota pela chave (como na consulta manual): traz XML/PDF dela, em silêncio
  const viaChave = await consultaChaveSilenciosa(nfe, cfg);
  const depois = txt(nfe[campo]);
  if (depois && existsSync(paraLocal(depois))) return readFile(paraLocal(depois));
  if (nomeExt === 'xml' && viaChave?.xml?.length) { await guarda(viaChave.xml); return viaChave.xml; }
  if (nomeExt === 'xml') { // última tentativa: procura o XML pela chave nas pastas locais
    const x = await achaXmlLocal({ chave: nfe.nfe_chave, arquivoBanco: f, bases: [baseGravacao(), baseArquivos()] }).catch(() => null);
    if (x?.length) { await guarda(x); return x; }
  }
  // plano B silencioso: sem o PDF, busca o XML e gera o DANFE localmente
  if (nomeExt === 'pdf') {
    try {
      const xml = viaChave?.xml?.length ? viaChave.xml : await buscaArquivo(nfe, cfg, 'nfe_xml_file', 'xml', (d) => api.xmlAutorizado(d));
      const pdf = await danfeDoXml(xml, { logo: await lerLogo(), cancelada: nfe.status_e === 'CANCELADA' });
      await guarda(pdf);
      return pdf;
    } catch (e2) { erro = erro ?? e2; }
  }
  console.warn(`[nfe] ${nomeExt.toUpperCase()} da nota ${nfe.nfe_numero}/${nfe.nfe_serie} indisponível: ${erro?.message ?? ''}`);
  throw new AppError(erro?.status === 404 ? 404 : 502, `${erro?.message ?? 'Arquivo indisponível.'} Também não achei na pasta da API: ${l.motivo ?? ''}`.trim());
}
async function arquivoOuApi(req, res, campo, tipo, nomeExt, baixa) {
  const id = idValido(req.params.id);
  const nfe = await getNfe(id);
  const buf = await buscaArquivo(nfe, await getCfg(), campo, nomeExt, baixa, req.query.orientacao);
  res.type(tipo).set('Content-Disposition', `inline; filename="${nfe.nfe_chave || id}.${nomeExt}"`).send(buf);
}
/** Vários DANFEs num único PDF (notas marcadas). Ignora as que não estão AUTORIZADAS e informa quais em X-Danfe-Ignoradas. */
/** Marca (ou desmarca) notas como impressas — o app chama depois de enviar o DANFE à impressora do agente. */
router.post('/impresso', async (req, res) => {
  const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map((x) => idValido(x)))].slice(0, 500);
  if (!ids.length) throw invalid('Selecione ao menos uma nota.');
  const v = req.body?.impresso === false ? 'False' : 'True';
  try { await pool.query('update tb_nfe set nfe_impresso = ? where id in (?)', [v, ids]); }
  catch { await pool.query('update tb_nfe set nfe_impresso = ? where id in (?)', [v === 'True' ? 1 : 0, ids]); }
  res.json({ ok: true, ids, impresso: v === 'True' });
});
/**
 * Compatibilidade com o sistema antigo: a gravação do XML em N:/EDSMonitorPLUS/Arqs/… é feita na MÁQUINA DO CLIENTE (agente de impressão).
 * GET  /:id/xml-legado          → { destino, xml_b64 } (destino = caminho no padrão antigo; xml_b64 = XML autorizado)
 * POST /:id/xml-legado/confirma → depois que o agente gravou, aponta tb_nfe.nfe_xml_file para o destino.
 */
router.get('/:id/xml-legado', async (req, res) => {
  const nfe = await getNfe(idValido(req.params.id)); const cfg = await getCfg();
  if (!['AUTORIZADA', 'CANCELADA'].includes(nfe.status_e) || !txt(nfe.nfe_chave)) throw invalid('Só notas autorizadas têm XML.');
  const xml = await buscaArquivo(nfe, cfg, 'nfe_xml_file', 'xml', (d) => api.xmlAutorizado(d));
  res.json({ destino: caminhoXmlLegado({ cnpj: cfg.cnpj, dataEmissao: nfe.data_emissao, chave: nfe.nfe_chave }).banco, xml_b64: xml.toString('base64') });
});
router.post('/:id/xml-legado/confirma', async (req, res) => {
  const nfe = await getNfe(idValido(req.params.id)); const cfg = await getCfg();
  const { banco } = caminhoXmlLegado({ cnpj: cfg.cnpj, dataEmissao: nfe.data_emissao, chave: nfe.nfe_chave });
  await pool.query('update tb_nfe set nfe_xml_file = ? where id = ?', [banco, nfe.id]);
  res.json({ ok: true, nfe_xml_file: banco });
});
router.post('/danfe-lote', async (req, res) => {
  const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map((x) => idValido(x)))].slice(0, 200);
  if (!ids.length) throw invalid('Selecione ao menos uma nota.');
  const cfg = await getCfg();
  const { PDFDocument } = await import('pdf-lib');
  const saida = await PDFDocument.create();
  const ignoradas = []; let n = 0;
  for (const id of ids) {
    const nfe = await getNfe(id);
    if (nfe.status_e !== 'AUTORIZADA' || !nfe.nfe_numero) { ignoradas.push(`${nfe.nfe_numero || id} (${nfe.status_e})`); continue; }
    try {
      const buf = await buscaArquivo(nfe, cfg, 'nfe_pdf_file', 'pdf', (d, o) => api.danfePdf(d, o));
      const doc = await PDFDocument.load(buf);
      (await saida.copyPages(doc, doc.getPageIndices())).forEach((p) => saida.addPage(p));
      n += 1;
    } catch (e) { ignoradas.push(`${nfe.nfe_numero} (${e.message})`); }
  }
  if (!n) throw invalid(`Nenhuma DANFE disponível. ${ignoradas.join('; ')}`);
  res.type('application/pdf').set('X-Danfe-Ignoradas', encodeURIComponent(ignoradas.join('; '))).set('Content-Disposition', 'inline; filename="danfes.pdf"').send(Buffer.from(await saida.save()));
});
/** Diagnóstico: onde o app procura o XML/DANFE da nota na pasta da API e o que achou. */
router.get('/:id/arquivos-diagnostico', async (req, res) => {
  const nfe = await getNfe(idValido(req.params.id)); const cfg = await getCfg();
  const q = { chave: nfe.nfe_chave, cnpj: cfg.cnpj, datas: [nfe.nfe_protocolo_data_hora, nfe.data_emissao] };
  res.json({ base: baseArquivos(), chave: nfe.nfe_chave, datas: q.datas, xml: await acharArquivoNota({ ...q, tipo: 'xml' }), pdf: await acharArquivoNota({ ...q, tipo: 'pdf' }) });
});
router.get('/:id/danfe', (req, res) => arquivoOuApi(req, res, 'nfe_pdf_file', 'application/pdf', 'pdf', (d, o) => api.danfePdf(d, o)));
router.get('/:id/xml', (req, res) => arquivoOuApi(req, res, 'nfe_xml_file', 'application/xml', 'xml', (d) => api.xmlAutorizado(d)));

router.post('/status-servico', async (_req, res) => {
  const cfg = await getCfg(); const empId = await api.empresaId(cfg.cnpj);
  const r = await api.statusServico(empId, { uf: txt(cfg.uf).toUpperCase(), ambiente: Number(cfg.nfe_configuracoes_webservice_ambiente) === 1 ? 1 : 2, contingencia: false });
  res.json({ http: r.status, resposta: r.body });
});

export { regimeDoCrt };
export default router;
