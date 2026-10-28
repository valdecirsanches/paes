import test from 'node:test';
import assert from 'node:assert/strict';
import { montaJsonNfe, validaParaAutorizar, regimeDoCrt, modalidadeFrete, dataHoraBr, normalizaCst, ieLimpa } from '../src/services/nfeJson.js';

const cfg = { cnpj: '67.570.036/0001-81', razao: 'LEVPAO LTDA', ie: '123456789', nfe_crt: 'REGIME NORMAL', endereco: 'Rua A', endereco_numero: '10', bairro: 'Centro', cidade: 'SÃO PAULO', uf: 'SP', cep: '01001-000', cst_pis_cofins: '01', nfe_configuracoes_webservice_ambiente: '2' };
const nfe = { cfop_codigo: '5102', cfop_descricao: 'VENDA NO ESTADO', nfe_serie: '001', nfe_modelo: '55', movimento_es: '1', cliente_cnpj: '11.222.333/0001-81', cliente_razao_social: 'PADARIA ESTRELA', cliente_ie: '111222333', cliente_uf: 'SP',
  entrega_endereco: 'Rua B', entrega_numero: '5', entrega_bairro: 'Vila', entrega_cidade: 'São Paulo', entrega_uf: 'SP', entrega_cep: '01001000', forma_pagamento: '01', frete_tipo: '3 = Próprio', data_saida: '2026-10-26', hora_saida: '10:00:00',
  volume_qtde: 1, volume_especie: 'CAIXA', volume_marca: 'LEVPAO', volume_numero: '1', peso_liquido: 9, peso_bruto: 9.9, texto_corpo: 'Entrega: X' };
const itens = [{ produto_codigo: '10.001', produto_descricao: 'PAO FRANCES KG', produto_ncm: '1905.90.90', un: 'PC', qtde: 10, preco: 14.9, preco_total: 149, situacao_tributaria: '00', icms_aliquota: 18, icms_base_calculo: 149, icms_valor: 26.82, cst: '000', cClassTrib: '1', pIBS: 0.1, pCBS: 0.9 }];

test('regime, frete e data/hora', () => {
  assert.equal(regimeDoCrt('SIMPLES NACIONAL'), 1); assert.equal(regimeDoCrt('SIMPLES EXCESSO RECEITA'), 2); assert.equal(regimeDoCrt('REGIME NORMAL'), 3); assert.equal(regimeDoCrt(''), 0);
  assert.equal(modalidadeFrete('3 = Transporte Próprio'), 3); assert.equal(modalidadeFrete(''), 9);
  assert.equal(dataHoraBr('2026-07-30T18:22:10Z'), '30/07/2026 15:22:10');
});

test('JSON da API: emitente, destinatário, itens, pagamento e totais', () => {
  const j = montaJsonNfe(nfe, itens, cfg, { numero: 273 });
  assert.deepEqual(j.configuracao, { ambiente: 2, contingencia: false, orientacaoDanfe: 'retrato' });
  assert.match(j.dataEmissao, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d-03:00$/); assert.equal(j.tipoEmissao, 1); assert.equal(j.finalidade, 1);
  assert.equal(j.emitente.codigoPais, '1058'); assert.equal(j.emitente.nomePais, 'BRASIL'); assert.equal(j.consumidorFinal, true);
  assert.equal(j.emitente.cnpj, '67570036000181'); assert.equal(j.emitente.regimeTributario, 3); assert.equal(j.emitente.codigoMunicipio, '3550308');
  assert.equal(j.numero, 273); assert.equal(j.serie, 1); assert.equal(j.destinatario.documento, '11222333000181'); assert.equal(j.destinatario.indicadorIe, 1);
  assert.equal(j.destinatario.codigoMunicipio, '3550308'); assert.equal(j.destinoOperacao, 1); assert.equal(j.modalidadeFrete, 3);
  assert.equal(j.itens[0].ncm, '19059090'); assert.equal(j.itens[0].cstIcms, '00'); assert.equal(j.itens[0].aliquotaIcms, 18); assert.equal(j.itens[0].cstPis, '01');
  assert.deepEqual(j.pagamentos, [{ meio: '01', valor: 149 }]);
  assert.equal(j.pesoBruto, 9.9); assert.equal(j.quantidadeVolumes, 1);
  assert.ok(!('transportadora' in j)); assert.ok(!JSON.stringify(j).includes('undefined'));
});

test('Simples usa CSOSN e não envia ICMS; fora de SP → interestadual', () => {
  const j = montaJsonNfe({ ...nfe, cliente_uf: 'RJ', entrega_uf: 'RJ', entrega_cidade: 'Niterói', csosn: '102' }, itens, { ...cfg, nfe_crt: 'SIMPLES NACIONAL' }, { numero: 1 });
  assert.equal(j.destinoOperacao, 2); assert.equal(j.itens[0].cstIcms, '102'); assert.equal(j.itens[0].aliquotaIcms, 0); assert.ok(!('valorIcms' in j.itens[0]));
  assert.equal(j.destinatario.codigoMunicipio, '3303302');
});

test('validação antes de autorizar (as mesmas do Delphi + exigências da API)', () => {
  assert.deepEqual(validaParaAutorizar(nfe, itens, cfg), []);
  const e = validaParaAutorizar({ ...nfe, forma_pagamento: '', volume_marca: '', entrega_cidade: 'Lugar Nenhum' }, [{ ...itens[0], produto_ncm: '' }], { ...cfg, nfe_crt: '' }, { vencimentos: ['2020-01-01'], hoje: new Date(2026, 9, 26) });
  assert.ok(e.some((x) => x.startsWith('Código IBGE')));
  assert.ok(e.includes('Forma de pagamento não informada.'));
  assert.ok(e.some((x) => x.includes('rodapé')));
  assert.ok(e.some((x) => x.includes('Data de vencto')));
  assert.ok(e.some((x) => x.includes('NCM inválido')));
  assert.ok(e.some((x) => x.includes('CRT')));
});

test('onboarding: multipart com os campos do COMECE_AQUI e Bearer', async () => {
  const http = await import('node:http');
  let capturado;
  const srv = http.createServer((req, res) => {
    const partes = [];
    req.on('data', (c) => partes.push(c));
    req.on('end', () => { capturado = { url: req.url, auth: req.headers.authorization, tipo: req.headers['content-type'], corpo: Buffer.concat(partes).toString('latin1') }; res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ atualizado: false, camposAlterados: [], empresa: {} })); });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const antes = { u: process.env.NFE_API_URL, t: process.env.NFE_API_TOKEN };
  process.env.NFE_API_URL = `http://127.0.0.1:${srv.address().port}`; process.env.NFE_API_TOKEN = ' "tok+en/1" ';
  try {
    const api = await import('../src/services/nfeApi.js');
    const r = await api.onboarding({ cnpj: '67570036000181', razaoSocial: 'X LTDA', uf: 'SP', regimeTributario: 3, ambientePadrao: 2, senha: 's3nha', arquivo: Buffer.from('PFXDATA'.repeat(30)), nomeArquivo: 'c.pfx' });
    assert.equal(r.status, 201);
    assert.equal(capturado.url, '/api/empresas/onboarding');
    assert.equal(capturado.auth, 'Bearer tok+en/1');
    assert.match(capturado.tipo, /^multipart\/form-data; boundary=/);
    for (const k of ['cnpj', 'razaoSocial', 'uf', 'regimeTributario', 'ambientePadrao', 'senha', 'arquivo']) assert.ok(capturado.corpo.includes(`name="${k}"`), k);
    assert.ok(capturado.corpo.includes('filename="c.pfx"') && capturado.corpo.includes('PFXDATA'));
  } finally { srv.close(); process.env.NFE_API_URL = antes.u; process.env.NFE_API_TOKEN = antes.t; if (antes.u === undefined) delete process.env.NFE_API_URL; if (antes.t === undefined) delete process.env.NFE_API_TOKEN; }
});

test('A3: cadastro multipart (.cer, descricao, nomeAgente), status do agente e revogação', async () => {
  const http = await import('node:http');
  const vistos = [];
  const srv = http.createServer((req, res) => {
    const partes = []; req.on('data', (c) => partes.push(c));
    req.on('end', () => { vistos.push({ m: req.method, url: req.url, auth: req.headers.authorization, corpo: Buffer.concat(partes).toString('latin1') }); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ online: true })); });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const antes = { u: process.env.NFE_API_URL, t: process.env.NFE_API_TOKEN };
  process.env.NFE_API_URL = `http://127.0.0.1:${srv.address().port}`; process.env.NFE_API_TOKEN = 'tok';
  try {
    const api = await import('../src/services/nfeApi.js');
    await api.cadastrarA3('emp-1', { arquivo: Buffer.from('CER'.repeat(60)), nomeArquivo: 'a3.cer', descricao: 'A3 token', nomeAgente: 'PC-CAIXA' });
    await api.agenteA3('cert-1');
    await api.revogarAgenteA3('cert-1', 'ag-1');
    assert.deepEqual(vistos.map((v) => `${v.m} ${v.url}`), ['POST /api/certificados/empresa/emp-1/a3', 'GET /api/certificados/cert-1/agente', 'DELETE /api/certificados/cert-1/agente/ag-1']);
    assert.ok(vistos.every((v) => v.auth === 'Bearer tok'));
    for (const k of ['descricao', 'nomeAgente', 'arquivo']) assert.ok(vistos[0].corpo.includes(`name="${k}"`), k);
    assert.ok(vistos[0].corpo.includes('filename="a3.cer"'));
  } finally { srv.close(); if (antes.u === undefined) delete process.env.NFE_API_URL; else process.env.NFE_API_URL = antes.u; if (antes.t === undefined) delete process.env.NFE_API_TOKEN; else process.env.NFE_API_TOKEN = antes.t; }
});

test('GTIN inválido/vazio vira SEM GTIN; Simples envia aliquotaIcms 0; data de emissão em Brasília', () => {
  const j = montaJsonNfe(nfe, [{ ...itens[0], produto_ean: '123' }, { ...itens[0], produto_ean: '7891000100103' }], { ...cfg, nfe_crt: 'SIMPLES NACIONAL' }, { numero: 1, agora: new Date('2026-10-22T17:09:33Z') });
  assert.equal(j.itens[0].gtin, 'SEM GTIN'); assert.equal(j.itens[1].gtin, '7891000100103'); assert.equal(j.itens[0].aliquotaIcms, 0);
  assert.equal(j.dataEmissao, '2026-10-22T14:09:33-03:00');
});

test('rota de ambiente existe e passagem para produção exige confirmação', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/routes/nfe.js', import.meta.url), 'utf8');
  assert.match(src, /router\.get\('\/ambiente'/);
  assert.match(src, /confirmacao !== 'PRODUCAO'/);
});

test('CST normalizado (20.0 → 20), PIS/COFINS por grupo, pagamento 90 zerado', () => {
  assert.equal(normalizaCst('20.0'), '20'); assert.equal(normalizaCst('0'), '00'); assert.equal(normalizaCst('40'), '40'); assert.equal(normalizaCst('102'), '102'); assert.equal(normalizaCst(' 60,00 '), '60');
  const it = (extra) => ({ ...itens[0], ...extra });
  const j = montaJsonNfe({ ...nfe, forma_pagamento: '90' }, [
    it({ cfop_cst_icms: '20.0', red_aliq: 33.33, icms_aliquota: 12, icms_base_calculo: 99.34, icms_valor: 11.92, cfop_cst_pis: '01', cfop_cst_cofins: '01', pis_aliquota: 0.65, cofins_aliquota: 3 }),
    it({ cfop_cst_pis: '98', cfop_cst_cofins: '98' }), it({ cfop_cst_pis: '07', cfop_cst_cofins: '07' })], cfg, { numero: 1 });
  assert.equal(j.itens[0].cstIcms, '20'); assert.equal(j.itens[0].percentualReducaoBcIcms, 33.33); assert.deepEqual([j.itens[0].baseCalculoIcms, j.itens[0].valorIcms], [99.34, 11.92]);
  assert.deepEqual([j.itens[0].baseCalculoPis, j.itens[0].aliquotaPis, j.itens[0].valorPis], [149, 0.65, 0.97]);
  assert.deepEqual([j.itens[0].baseCalculoCofins, j.itens[0].aliquotaCofins, j.itens[0].valorCofins], [149, 3, 4.47]);
  assert.deepEqual([j.itens[1].baseCalculoPis, j.itens[1].aliquotaPis, j.itens[1].valorPis, j.itens[1].valorCofins], [0, 0, 0, 0]); // PISOutr sem valores = zeros
  assert.ok(!('aliquotaPis' in j.itens[2])); // PISNT não leva valores
  assert.deepEqual(j.pagamentos, [{ meio: '90', valor: 0 }]);
});

test('devolução: finalidade 4 + chave referenciada; sem chave não autoriza; ICMS inconsistente é barrado', () => {
  const chave = '35261067570036000181550010000000011234567890';
  const dev = { ...nfe, cfop_codigo: '1202' };
  const j = montaJsonNfe(dev, itens, cfg, { numero: 2, referencias: [{ refNFe: chave }, { refNFe: 'x' }] });
  assert.equal(j.finalidade, 4); assert.deepEqual(j.documentosReferenciados, [{ chaveNfe: chave }]);
  assert.equal(montaJsonNfe(nfe, itens, cfg, { numero: 2 }).finalidade, 1);
  assert.ok(validaParaAutorizar(dev, itens, cfg).some((x) => x.startsWith('Devolução')));
  assert.deepEqual(validaParaAutorizar(dev, itens, cfg, { referencias: [{ refNFe: chave }] }), []);
  const ruim = { ...itens[0], preco_total: 68.8, icms_base_calculo: 141.19, icms_valor: 16.94 };
  assert.ok(validaParaAutorizar(nfe, [ruim], cfg).some((x) => x.includes('base de ICMS')));
  assert.ok(validaParaAutorizar(nfe, [{ ...itens[0], cfop_cst_pis: '03' }], cfg).some((x) => x.includes('CST 03')));
  assert.ok(validaParaAutorizar(nfe, [{ ...itens[0], cfop_cst_icms: '20.0', icms_base_calculo: 200 }], cfg).some((x) => x.includes('CST 20')));
  // caso real: base/valor do 2º item copiados do 1º → com o percentual do cadastro, a base é recalculada e a nota passa
  const it2 = { ...itens[0], cfop_cst_icms: '20.0', red_aliq: 45.67, preco_total: 68.8, qtde: 80, preco: 0.86, icms_aliquota: 12, icms_base_calculo: 141.19, icms_valor: 16.94 };
  assert.deepEqual(validaParaAutorizar(nfe, [it2], cfg), []);
  const j2 = montaJsonNfe(nfe, [it2], cfg, { numero: 3 }).itens[0];
  assert.deepEqual([j2.cstIcms, j2.percentualReducaoBcIcms, j2.baseCalculoIcms, j2.valorIcms], ['20', 45.67, 37.38, 4.49]);
  // sem percentual: deriva da base gravada (menor que o item)
  assert.equal(montaJsonNfe(nfe, [{ ...it2, red_aliq: 0, icms_base_calculo: 94.13, preco_total: 173.25, qtde: 11.25, preco: 15.4, icms_aliquota: 18 }], cfg, { numero: 3 }).itens[0].percentualReducaoBcIcms, 45.67);
});

test('inscrição estadual sem máscara (XSD)', () => {
  assert.equal(ieLimpa('111.222.333.444'), '111222333444'); assert.equal(ieLimpa('isento'), 'ISENTO'); assert.equal(ieLimpa(''), '');
  const j = montaJsonNfe({ ...nfe, cliente_ie: '111.222.333.444', transportadora_nome: 'TRANSP', transportadora_ie: '12.345.678-9' }, itens, { ...cfg, ie: '123.456.789.000' }, { numero: 1 });
  assert.equal(j.destinatario.inscricaoEstadual, '111222333444'); assert.equal(j.emitente.inscricaoEstadual, '123456789000'); assert.equal(j.transportadora.inscricaoEstadual, '123456789');
});

test('IBS/CBS sempre enviado (SEFAZ 1115); sem CST/cClassTrib no tributo a nota é barrada', () => {
  const j = montaJsonNfe(nfe, itens, cfg, { numero: 1 });
  assert.deepEqual(j.itens[0].ibsCbs, { cst: '000', classificacaoTributaria: '000001', aliquotaIbsUf: 0.1, aliquotaCbs: 0.9 });
  assert.ok(validaParaAutorizar(nfe, [{ ...itens[0], cst: '', cClassTrib: null }], cfg).some((x) => x.includes('IBSCBS')));
});

test('orientação do DANFE vai na configuração do JSON', () => {
  assert.equal(montaJsonNfe(nfe, itens, cfg, { numero: 1, orientacao: 'paisagem' }).configuracao.orientacaoDanfe, 'paisagem');
  assert.equal(montaJsonNfe(nfe, itens, cfg, { numero: 1, orientacao: 'x' }).configuracao.orientacaoDanfe, 'retrato');
});

test('CST 20 com redução de 100% segue CST 20 com 99,99% (a API não aceita 100) e mantém o cBenef', () => {
  const j = montaJsonNfe(nfe, [{ ...itens[0], cfop_cst_icms: '20', red_aliq: 100, icms_aliquota: 18, icms_base_calculo: 0, icms_valor: 0, cBenef: 'SP020030' }], { ...cfg, nfe_crt: 'REGIME NORMAL' }, { numero: 1 });
  const it = j.itens[0];
  assert.equal(it.cstIcms, '20'); assert.equal(it.percentualReducaoBcIcms, 99.99); assert.equal(it.cBenef, 'SP020030');
});

test('IBS/CBS reduzido (CST 200 / 200003) preenche redução e alíquota efetiva pelos nomes do schema', async () => {
  const { aplicaReducaoIbs } = await import('../src/services/nfeJson.js');
  const j = { itens: [{ ibsCbs: { cst: '200', classificacaoTributaria: '200003', aliquotaIbsUf: 0.1, aliquotaCbs: 0.9 } }] };
  const f = (c) => ({ caminho: c.split('.'), tipo: 'number' });
  const faltou = aplicaReducaoIbs(j, [f('aliquotaIbsUf'), f('aliquotaCbs'), f('gRed.percentualReducaoIbsUf'), f('gRed.aliquotaEfetivaIbsUf'), f('gRedCbs.percentualReducaoCbs'), f('gRedCbs.aliquotaEfetivaCbs')]);
  assert.deepEqual(faltou, []);
  assert.equal(j.itens[0].ibsCbs.gRed.percentualReducaoIbsUf, 100); assert.equal(j.itens[0].ibsCbs.gRed.aliquotaEfetivaIbsUf, 0);
  assert.equal(j.itens[0].ibsCbs.gRedCbs.percentualReducaoCbs, 100);
  const k = { itens: [{ ibsCbs: { cst: '200', classificacaoTributaria: '200003', aliquotaIbsUf: 0.1, aliquotaCbs: 0.9 } }] };
  aplicaReducaoIbs(k, []);
  assert.deepEqual(k.itens[0].ibsCbs, { cst: '200', classificacaoTributaria: '200003', aliquotaIbsUf: 0.1, aliquotaCbs: 0.9, reducaoAliquotaIbsUf: 100, aliquotaEfetivaIbsUf: 0, reducaoAliquotaCbs: 100, aliquotaEfetivaCbs: 0 });
});

test('CFOP do item: o do item, se houver; senão o da nota', async () => {
  const { cfopDoItem } = await import('../src/services/nfeJson.js');
  assert.equal(cfopDoItem({ cfop_codigo: '5405' }, { cfop_codigo: '5102' }), '5405');
  assert.equal(cfopDoItem({ cfop_codigo: '' }, { cfop_codigo: '5102' }), '5102');
  assert.equal(cfopDoItem({ cfop_codigo: '0000' }, { cfop_codigo: '6102' }), '6102');
});

test('NCM: lê a tabela do Siscomex e confere código e vigência', async () => {
  const { parseTabela } = await import('../src/services/ncm.js');
  const m = parseTabela({ Nomenclaturas: [{ Codigo: '0901.21.00', Descricao: '- - Não descafeinado', Data_Inicio: '01/01/2022', Data_Fim: '31/12/9999' }, { Codigo: '09.01', Descricao: 'Café' }] });
  assert.equal(m.size, 1); assert.equal(m.get('09012100').fim, '9999-12-31'); assert.equal(m.has('10112110'), false);
});
