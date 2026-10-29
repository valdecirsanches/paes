// Modo preview: simula a API em memória, só para visualizar as telas sem banco.
// Ativado por VITE_MOCK=1 (veja main.jsx). Não entra no build normal.
const hoje = new Date();
const pad = (n) => String(n).padStart(2, '0');
const ISO = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;

const unidades = [
  [1, 'Padaria Estrela', 1, 'True'], [2, 'Mercado São Jorge', 2, 'False'], [3, 'Lanchonete do Zé', 1, 'False'],
  [4, 'Hotel Bela Vista', 3, 'False'], [5, 'Escola Pequeno Príncipe', 0, 'False'], [6, 'Restaurante Sabor & Cia', 2, 'False'],
];
let status = unidades.map(([id, nome, st, pasta]) => ({
  id, data: ISO, id_cliente: id, id_unidade: id, status: st, nome, verificar_pasta: pasta,
  unidade_nome: `${nome} ${id}/${id}    ***     (11) 4000-${1000 + id}`,
}));

const roteiros = [
  { id_roteiro: 1, horario: '05:30', nome: 'Carlos', celular: '' },
  { id_roteiro: 2, horario: '08:00', nome: 'Marcos', celular: '' },
];
const produtos = {
  '101': { id: 1, codigo: '101', descricao: 'PAO FRANCES 50G', descricao_expedicao: 'PAO FRANCES', preco: 0.6, divisor_basico: 1, produto_producao: 'True', produto_especial: 'False', referencia_descricao: 'PAO FRANCES' },
  '205': { id: 2, codigo: '205', descricao: 'PAO DE FORMA 500G', descricao_expedicao: 'PAO DE FORMA', preco: 9.5, divisor_basico: 1, produto_producao: 'True', produto_especial: 'True', referencia_descricao: 'PAO DE FORMA' },
  '310': { id: 3, codigo: '310', descricao: 'REFRIGERANTE 2L', descricao_expedicao: 'REFRIGERANTE 2L', preco: 8, divisor_basico: 1, produto_producao: 'False', produto_especial: 'False', referencia_descricao: '' },
};
const ex = { extra_cortado: 'False', extra_margarina: 'False', extra_coco: 'False', extra_acucar: 'False', extra_plastico: 'False', extra_papel: 'False', extra_pacote: 'False' };
let seq = 100;
const mk = (id_status, p, hora, q, extra, fixa, rt, o = {}) => ({
  id: ++seq, id_status, hora: `${hora}:00`, produto_codigo: p.codigo, produto_descricao: p.descricao,
  produto_descricao_expedicao: p.descricao_expedicao, referencia_descricao: p.referencia_descricao,
  qtde_original: q, qtde_alterada: extra, xqtde_total: q + extra, programacao_fixa: fixa ? 'True' : 'False',
  cancelado: 'False', registro_alterado: extra ? 1 : 0, produto_producao: p.produto_producao,
  produto_especial: p.produto_especial, producao_esquema: p.produto_producao === 'True' ? `${ISO.split('-').reverse().join('/')} - 1º` : 'MERCADORIA',
  comandas: '', obs: '', obs_producao: '', id_roteiro: rt, produto_preco: p.preco, produto_preco_cada: 1,
  acomodacao_carga: 'SACARIA', carga: 1, producao_turno: 1, producao_data: ISO, data: ISO,
  roteiro_info: rt ? `${roteiros[rt - 1].horario}/${roteiros[rt - 1].nome}` : '', ...ex, ...o,
});
let diaria = [
  mk(1, produtos['101'], '06:00', 300, 0, true, 1), mk(1, produtos['205'], '06:30', 40, 10, true, 1),
  mk(1, produtos['310'], '07:00', 12, 0, false, 1, { qtde_original: 0, qtde_alterada: 12 }),
  mk(1, produtos['101'], '09:00', 150, 0, true, 2, { cancelado: 'True' }),
  mk(2, produtos['101'], '06:00', 500, 0, true, 1), mk(2, produtos['310'], '10:00', 24, 6, false, 2),
  mk(3, produtos['205'], '07:30', 20, 0, true, 2), mk(4, produtos['101'], '06:15', 200, 0, true, 1),
  mk(6, produtos['101'], '06:00', 120, 30, true, 1),
];
const mkf = (id_unidade, p, hora, q, rt, dia) => ({
  id: ++seq, id_unidade, semana_dia: dia, hora: `${hora}:00`, produto_qtde: q, produto_codigo: p.codigo,
  produto_descricao_expedicao: p.descricao_expedicao, produto_descricao: p.descricao, produto_producao: p.produto_producao,
  produto_especial: p.produto_especial, id_roteiro: rt, roteiro_info: `${roteiros[rt - 1].horario}/${roteiros[rt - 1].nome}`,
  producao_esquema: p.produto_producao === 'True' ? (p.produto_especial === 'True' ? '1 DIA ANTES 1º' : 'MESMO DIA 1º') : 'MERCADORIA', ...ex,
});
const dow = hoje.getDay() + 1;
let fixa = [];
[1, 2, 3, 4, 6].forEach((u) => { for (let d = 1; d <= 7; d++) { fixa.push(mkf(u, produtos['101'], '06:00', 100 + u * 50, 1, d)); if (u < 4) fixa.push(mkf(u, produtos['205'], '06:30', 20 * u, 1, d)); } });

const mercs = [
  [1, 'Padaria Estrela', '310', 'REFRIGERANTE 2L', 12, '07:00'], [2, 'Mercado São Jorge', '310', 'REFRIGERANTE 2L', 24, '10:00'],
  [4, 'Hotel Bela Vista', '310', 'REFRIGERANTE 2L', 6, '08:30'],
].map(([u, nome, c, d, q, h], i) => ({ id: 900 + i, id_unidade: u, nome, data: ISO, hora: h + ':00', produto_codigo: c, produto_descricao: d,
  produto_descricao_expedicao: d, obs: i === 1 ? 'ENTREGAR NA DOCA 2' : '', obs_producao: '', registro_alterado: 0, etiqueta_adesiva: i === 0 ? 1 : 0, qtde: q, produto_valor: q * 8 }));

if (typeof window !== 'undefined' && window.__MERC_MASSA) for (let i = 0; i < window.__MERC_MASSA; i++) mercs.push({ ...mercs[i % 3], id: 5000 + i, nome: `Unidade ${i}`, produto_descricao: `PRODUTO ${i}`, produto_descricao_expedicao: `PRODUTO ${i}` });

// Produção: linhas de entrega (uma por unidade × referência × hora), agrupadas pelas rotas como no SQL real.
const refs = {
  1: { codigo: '001.001', descricao: 'PAO FRANCES 50G', tipo: 'salgados' },
  2: { codigo: '001.002', descricao: 'PAO DE LEITE', tipo: 'salgados' },
  3: { codigo: '001.003', descricao: 'PAO DOCE SORTIDO', tipo: 'salgados' },
  4: { codigo: '002.001', descricao: 'BOLO DE CHOCOLATE 1KG', tipo: 'especiais' },
  5: { codigo: '002.002', descricao: 'TORTA SALGADA FAMILIA', tipo: 'especiais' },
};
const nomesU = ['Padaria Estrela', 'Mercado São Jorge', 'Lanchonete do Zé', 'Hotel Bela Vista', 'Escola Pequeno Príncipe', 'Restaurante Sabor & Cia'];
let prodRows = [];
[[1, 1, 3, 4800], [1, 2, 3, 2100], [1, 3, 1, 1530], [2, 1, 2, 3200], [2, 2, 2, 900], [3, 1, 3, 1300], [4, 1, 1, 12], [4, 2, 2, 8], [5, 1, 2, 20], [5, 1, 3, 6]]
  .forEach(([ref, turnoBase, n, total], k) => {
    for (let i = 0; i < n; i += 1) {
      const hora = ['05:00:00', '06:30:00', '09:00:00'][(i + k) % 3];
      const u = (i + k) % 6;
      prodRows.push({
        data: ISO, hora, producao_data: ISO, producao_turno: turnoBase, id_unidade: u + 1, id_referencia: ref, id_produto: ref * 10 + i,
        nome: nomesU[u], qtde: Math.round(total / n), produto_descricao_expedicao: refs[ref].descricao,
        obs_producao: i === 0 && ref === 4 ? 'Escrever "Parabéns" no bolo' : null,
      });
    }
  });
const tipoDe = (ref) => refs[ref].tipo;
const agrupa = (tipo, chaveFn, montar) => {
  const g = new Map();
  prodRows.filter((x) => tipoDe(x.id_referencia) === tipo).forEach((x) => { const k = chaveFn(x); g.set(k, [...(g.get(k) ?? []), x]); });
  return [...g.values()].map(montar);
};
const soma = (ls) => ls.reduce((s, l) => s + l.qtde, 0);

// Faturamento: itens cobráveis com as colunas calculadas que o SELECT real devolve.
const fatUnis = unidades.map(([id, nome], i) => ({ id, id_cliente: id, nome, unidade_nome: `${nome} ${id}/${id}`, tipo_faturamento: ['DIARIO', 'MENSAL', 'SEMANAL'][i % 3],
  emite_comanda_diaria: i % 2 ? 'True' : 'False', quitar_automaticamente: 'False', id_cliente_comandas: 0, id_unidade_comandas: 0 }));
const calc = (x) => {
  const qtde = x.qtde_original + x.qtde_alterada;
  const conv = x.converter === 'True';
  const pend = x.cobranca_cancelada === 'True' ? 0 : (conv && x.qtde_cobrado > 0 ? 0 : Math.trunc((qtde - x.qtde_cobrado) * 1000) / 1000);
  const unit = x.produto_preco / x.produto_preco_cada;
  return { ...x, qtde, qtde_pendente: pend, xqtde_quitado: x.qtde_quitado, xpreco: Math.round(unit * 1000) / 1000, tipo_prog: x.qtde_alterada !== 0 ? 2 : 1,
    produto_valor: conv ? x.conversao_produto_qtde * (x.conversao_produto_preco / (x.conversao_produto_preco_cada || 1)) : Math.trunc(qtde * unit * 1000) / 1000,
    valor_pendente: x.cobranca_cancelada === 'True' ? 0 : Math.trunc((qtde - x.qtde_cobrado) * unit * 1000) / 1000, preco_total: Math.round(qtde * unit * 1000) / 1000, ps_status: 1,
    unidade_nome: `${x.nome} ${x.id_unidade}/${x.id_unidade}` };
};
const baseFat = { converter: 'False', cancelado: 'False', quitado_manualmente: 'False', cobranca_cancelada: 'False', comandas: '', obs: '', cobrado_obs: '', conversao_id_produto: 0,
  conversao_produto_codigo: '', conversao_produto_descricao: '', conversao_produto_qtde: 0, conversao_produto_preco: 0, conversao_produto_preco_cada: 0, conversao_produto_valor: 0, qtde_cobrado: 0, qtde_quitado: 0, qtde_alterada: 0, data: ISO };
let fatSeq = 7000;
const mkF = (uid, hora, cod, desc, preco, cada, orig, o = {}) => calc({ ...baseFat, id: ++fatSeq, id_unidade: uid, id_cliente: uid, nome: nomesU[uid - 1], hora: `${hora}:00`, produto_codigo: cod, produto_descricao: desc,
  produto_descricao_expedicao: desc, produto_preco: preco, produto_preco_cada: cada, qtde_original: orig, ...o });
let fatItens = [
  mkF(1, '05:00', '10.108', 'PAO DE LEITE 50GR CORTADO EMBALADO', 0.9, 1, 80), mkF(1, '06:30', '10.001', 'PAO FRANCES KG', 14.9, 1, 12.5),
  mkF(1, '06:30', '10.205', 'PAO DE FORMA 500G', 9.5, 1, 30, { qtde_alterada: 5 }), mkF(1, '09:00', '10.310', 'BOLO DE CENOURA 1KG', 28, 1, 6, { qtde_cobrado: 6, comandas: '600512.6' }),
  mkF(1, '09:00', '10.311', 'TORTA DE LIMAO', 32, 1, 4, { quitado_manualmente: 'True', cobrado_obs: 'Cortesia da casa' }),
  mkF(1, '10:00', '10.012', 'SONHO DE CREME', 3.2, 1, 40, { qtde_alterada: -8 }), mkF(1, '10:30', '10.150', 'PAO DOCE KG', 18, 1, 5, { cobranca_cancelada: 'True', cobrado_obs: 'Erro de lançamento' }),
  mkF(1, '11:00', '10.401', 'FARINHA DE TRIGO 5KG', 26, 1, 10, { converter: 'True', conversao_id_produto: 901, conversao_produto_codigo: '999.999', conversao_produto_descricao: 'FARINHA DE TRIGO KG', conversao_produto_qtde: 50, conversao_produto_preco: 4.8, conversao_produto_preco_cada: 1, conversao_produto_valor: 240 }),
  mkF(1, '12:00', '10.500', 'ITEM CANCELADO TESTE', 5, 1, 3, { cancelado: 'True' }),
  mkF(2, '05:00', '10.108', 'PAO DE LEITE 50GR CORTADO EMBALADO', 0.9, 1, 120), mkF(2, '06:00', '10.001', 'PAO FRANCES KG', 14.9, 1, 20),
];
const fatComandas = {}; let cmdSeq = 600673;

// Controle de comandas (preview): comandas já existentes da primeira unidade.
const mkItem = (id, idc, cod, desc, q, preco, cada = 1) => ({ id, id_comanda: idc, id_produto: id, produto_codigo: cod, descricao_generica: desc, qtde: q, preco, preco_cada: cada,
  new_qtde: Math.trunc((q / cada) * 1000) / 1000, new_preco: preco, vr_item: Math.trunc(preco * (q / cada) * 1000) / 1000,
  ds: [{ id: id * 10 + 1, id_comanda: idc, id_comanda_item: id, data: ISO, hora: '05:30:00', descricao_generica: desc, qtde: q, preco, preco_cada: cada }] });
[[600670, 'FATURADO', [mkItem(8001, 600670, '100', 'PAO FRANCES', 400, 0.9)]], [600671, 'PROCESSADO', [mkItem(8002, 600671, '100', 'PAO FRANCES', 300, 0.9), mkItem(8003, 600671, '210', 'BOLO CENOURA', 12, 54, 12)]],
  [600672, 'PROCESSADO', [mkItem(8004, 600672, '305', 'PAO DE FORMA', 20, 7.5)]]].forEach(([id, status, itens]) => {
  fatComandas[id] = { comanda: { id, status, data_emissao: ISO, usuario: 'SANCHES', id_unidade: fatUnis[0].id, id_cliente: fatUnis[0].id_cliente, id_nota_fiscal: status === 'FATURADO' ? 6490 : 0,
    vr_comanda: 0 }, itens, mercadorias: id === 600671 ? [{ id: 9001, id_comanda: id, data: ISO, hora: '05:30:00', descricao: 'PAO DOCE', qtde: 6 }] : [], detalhes: [] };
});
const somaCmd = (c) => c.itens.reduce((s, i) => s + i.vr_item, 0);
const comandaDe = (id) => ({ ...fatComandas[id], comanda: { ...fatComandas[id].comanda, vr_comanda: somaCmd(fatComandas[id]) } });
let logEtiq = [{ id: 1, id_diaria: 900, data_hora: ISO + ' 05:41:10', usuario: 'Maria', origem: 'MERCADORIAS' }];
let reclamacoes = [{ id: 1, data: ISO, hora: '08:15:00', reclamante: 'Dona Maria', telefone: '4000-1001', reclamacao: 'Pão chegou frio.', explicacao: 'Rota atrasou por causa da chuva.' }];
const unidadeCfg = { id: 1, nome: 'Padaria Estrela', verificar_pasta: 'True', imprimir_toda_programacao: 'False', endereco: 'Rua das Flores, 100', bairro: 'Centro', cep: '01000-000', cidade: 'São Paulo', uf: 'SP', telefone: '(11) 4000-1001', contato: 'Sr. José' };
const DIAS_MOCK = ['DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'];
const json = (body, st = 200) => new Response(JSON.stringify(body), { status: st, headers: { 'Content-Type': 'application/json' } });


// Tributos (preview)
let trbSeq = 4;
const trbBase = { cst_icms: '', cest: '', legislacao: '', cst_ipi: '53', cst_pis: '06', cst_cofins: '06', natureza: '', aliq_pis: '0', aliq_cofins: '0', base_legal_icms: '', base_legal_pis_cofins: '', cBenef: '', tipo_trib: '', red_b_c_icms: '' };
let trbs = [
  { ...trbBase, id: 1, descricao: 'PAES - ISENTO ICMS / IPI NT', aliq_ipi: '0', sit_trib: '040', aliq_icms: '0', ncm: '19059010', cfop: '5102', cClassTrib: '000001', pIBS: '0.1', pCBS: '0.9', red_aliq: '60', cst: '000' },
  { ...trbBase, id: 2, descricao: 'BOLOS - TRIBUTADO 18%', aliq_ipi: '0', sit_trib: '000', aliq_icms: '18', ncm: '19059090', cfop: '5102', cClassTrib: '000001', pIBS: '0.1', pCBS: '0.9', red_aliq: '0', cst: '000' },
  { ...trbBase, id: 3, descricao: 'MASSAS FRESCAS - ISENTO', aliq_ipi: '0', sit_trib: '040', aliq_icms: '0', ncm: '19021100', cfop: '5102', cClassTrib: '200003', pIBS: '0', pCBS: '0', red_aliq: '100', cst: '200' },
  { ...trbBase, id: 4, descricao: 'REVENDA - ST', aliq_ipi: '0', sit_trib: '060', aliq_icms: '0', ncm: '22021000', cfop: '5405', cClassTrib: '000001', pIBS: '0.1', pCBS: '0.9', red_aliq: '0', cst: '000' },
];
if (typeof window !== 'undefined' && window.__TRB_MASSA) globalThis.__trbMassa = window.__TRB_MASSA;
let trbProds = [['100', 'PAO FRANCES', 1], ['101', 'PAO FRANCES OREGANO', null], ['210', 'BOLO CENOURA', 2], ['211', 'BOLO FUBA', null], ['305', 'PAO DE FORMA', 1], ['410', 'MACARRAO FRESCO', 3], ['500', 'REFRIGERANTE 2L', null]]
  .map(([codigo, descricao, id_tributos], i) => ({ id: 700 + i, codigo, descricao, id_tributos }));
for (let i = 0; i < (globalThis.__trbMassa || 0); i++) trbProds.push({ id: 2000 + i, codigo: String(1000 + i), descricao: `PRODUTO TESTE ${String(i).padStart(4, '0')}`, id_tributos: i % 3 ? null : 1 });

// ---- NFe (preview)
const nfeBase = { nfe_impresso: 'False', nfe_email_enviado: 'False', condicao_pedido: '', numero_nf: 0, nfe_modelo: '55', nfe_serie: '001', cfop_codigo: '5102', cfop_descricao: 'VENDA NO ESTADO', movimento_es: '1', icms_valor: 0, ipi_valor: 0, usuario_autorizacao_nfe: '', csosn: '', comandas_faturadas: '',
  cliente_pessoa: 'J', cliente_cnpj: '11222333000181', cliente_uf: 'SP', cliente_cidade: 'SÃO PAULO', entrega_uf: 'SP', entrega_cidade: 'SÃO PAULO', forma_pagamento: '01', frete_tipo: '3', volume_qtde: 1, volume_especie: 'CAIXA', volume_marca: 'LEVPAO', volume_numero: '1', peso_liquido: 9, peso_bruto: 9.9, data_saida: ISO, hora_saida: '10:00:00', data_emissao: ISO };
let nfes = [
  { ...nfeBase, id: 6490, status_e: 'AUTORIZADA', nfe_numero: 273, nfe_chave: '35261067570036000181550010000002731000002731', nfe_protocolo: '135260000123456', nfe_protocolo_data_hora: '26/10/2026 09:12:44', cliente_razao_social: 'PADARIA ESTRELA LTDA', cliente_pedido: 'Padaria Estrela', nf_valor_total: 1023.15, valor_produtos: 1023.15, icms_valor: 184.17, usuario_autorizacao_nfe: 'SANCHES', comandas_faturadas: '600670' },
  { ...nfeBase, id: 6491, status_e: 'CANCELADA', nfe_numero: 272, nfe_chave: '35261067570036000181550010000002721000002721', nfe_cancelamento_justificativa: 'Erro nos dados do destinatário', cliente_razao_social: 'MERCADO SÃO JORGE', cliente_pedido: 'Mercado São Jorge', nf_valor_total: 480, valor_produtos: 480 },
  { ...nfeBase, id: 6492, status_e: 'PENDENTE', nfe_numero: 0, cliente_razao_social: 'LANCHONETE DO ZÉ', cliente_pedido: 'Lanchonete do Zé', nf_valor_total: 90, valor_produtos: 90, comandas_faturadas: '600678', texto_corpo: 'Entrega: Lanchonete do Zé;Rua A, 10 - Centro;SÃO PAULO/SP CEP:01001000' },
];
if (typeof window !== 'undefined' && window.__NFE_MASSA) for (let i = 0; i < window.__NFE_MASSA; i++) nfes.push({ ...nfeBase, id: 7000 + i, status_e: 'PENDENTE', nfe_numero: 0, cliente_razao_social: `CLIENTE ${i}`, cliente_pedido: `Pedido ${i}`, nf_valor_total: i, valor_produtos: i });
const nfeItens = { 6492: [
  { id: 1, id_nfe: 6492, produto_codigo: '10.150', produto_descricao: 'PAO DOCE KG', produto_ncm: '19059090', produto_ean: '', un: 'PC', qtde: 5, preco: 14, preco_total: 70, situacao_tributaria: '00', cfop_cst_icms: '00', cfop_codigo: '5102', csosn: '', icms_red_base_calculo: 0, icms_base_calculo: 70, icms_aliquota: 18, icms_valor: 12.6, cst_ipi: '99', cfop_cst_pis: '01', cfop_cst_cofins: '01', pis_aliquota: 1.65, pis_valor: 1.16, cofins_aliquota: 7.6, cofins_valor: 5.32, valor_trib_prod: 19.08, ordem_compra: '', item: '', id_tributo: 7 },
  { id: 2, id_nfe: 6492, produto_codigo: '10.151', produto_descricao: 'BISNAGA 50G', produto_ncm: '19059090', produto_ean: '', un: 'PC', qtde: 10, preco: 2, preco_total: 20, situacao_tributaria: '00', cfop_cst_icms: '00', cfop_codigo: '5102', csosn: '', icms_red_base_calculo: 0, icms_base_calculo: 20, icms_aliquota: 18, icms_valor: 3.6, cst_ipi: '99', cfop_cst_pis: '01', cfop_cst_cofins: '01', pis_aliquota: 1.65, pis_valor: 0.33, cofins_aliquota: 7.6, cofins_valor: 1.52, valor_trib_prod: 5.45, ordem_compra: '', item: '', id_tributo: 7 }] };
let certOk = false;
let a3Mock = {};
const nfeTrib = { 7: { id: 7, cst: '000', cClassTrib: '000001', pIBS: 0.1, pCBS: 0.9, red_aliq: 0, cBenef: '' } };
let nfeRefs = { 6492: [{ id: 1, id_nfe: 6492, refNFE: '', tipo: '', cUF: '', AAMM: '', cnpj: '', fld_mod: '', serie: '', nNF: '' }] };
const nfeEventos = {
  6490: [{ id: 3, data_evento: ISO + ' 08:40:02', nome_evento: 'AUTORIZACAO', resposta: 'Autorizado o uso da NF-e', obs: 'NFe 273', evento_xml: '', homologado: null, codigo_status: '100', protocolo: '135260000123456', sequencia: null, arquivo: null },
    { id: 4, data_evento: ISO + ' 09:15:30', nome_evento: 'CARTA DE CORRECAO', resposta: 'Evento registrado e vinculado a NF-e', obs: 'No campo Informações Complementares, leia-se: pagamento a prazo em 30 dias.', evento_xml: '', homologado: true, codigo_status: 135, protocolo: '135260000777001', sequencia: 1, arquivo: { nome: 'carta-correcao.xml', seq: 1 } }],
  6491: [{ id: 1, data_evento: ISO + ' 10:30:00', nome_evento: 'AUTORIZACAO', resposta: 'Autorizado o uso da NF-e', obs: 'NFe 272', evento_xml: '', homologado: null, codigo_status: '100', protocolo: '135260000123400', sequencia: null, arquivo: null },
    { id: 2, data_evento: ISO + ' 11:02:10', nome_evento: 'CANCELAMENTO', resposta: 'Cancelamento registrado', obs: 'Erro nos dados do destinatário', evento_xml: '', homologado: true, codigo_status: 135, protocolo: '135260000555002', sequencia: null, arquivo: { nome: 'cancelamento.xml' } }],
  6492: [{ id: 5, data_evento: ISO + ' 07:55:11', nome_evento: 'REJEICAO', resposta: 'Rejeitada pela SEFAZ: 539 Duplicidade de NF-e', obs: 'NFe 274', evento_xml: '', homologado: null, codigo_status: '539', protocolo: null, sequencia: null, arquivo: null }],
};
const nfeCfg = { id: 1, razao: 'LEVPAO INDÚSTRIA DE PÃES LTDA', fantasia: 'LEVPAO', cnpj: '67570036000181', ie: '123456789', im: '', cnae: '1091102', nfe_crt: 'REGIME NORMAL', csosn: '', cst_pis_cofins: '01', endereco: 'Rua Exemplo', endereco_numero: '100', bairro: 'Centro', cidade: 'SÃO PAULO', cep: '01001000', uf: 'SP', nfe_configuracoes_webservice_ambiente: '2', nfe_numero: 273, nfe_carta_correcao_seq: 1, veiculo_placa: 'ABC1D23', veiculo_uf: 'SP', tem_senha_email: false, api: { url: 'http://127.0.0.1:5240', configurada: true } };

// ---- Cadastros (preview)
let cadCli = [
  { id: 1, codigo: '10', razao_social: 'PADARIA ESTRELA LTDA', endereco: 'Rua das Flores', endereco_numero: '100', bairro: 'Centro', cidade: 'São Paulo', cep: '01000-000', uf: 'SP', cnpj: '11.222.333/0001-81', ie: '111222333', fone: '(11) 4000-1001', contato: 'Maria', informacoes_nf1: 'Pagamento em 7 dias', informacoes_nf2: '', pessoa: 'JURIDICA', email_nfe: 'nfe@estrela.com', dias_vencto: 7, ativo: 'ATIVO', programacao_ativo: 'True', comanda_nf: '1' },
  { id: 2, codigo: '20', razao_social: 'MERCADO BOM PREÇO', endereco: 'Av. Brasil', endereco_numero: '2500', bairro: 'Jardins', cidade: 'Osasco', cep: '06000-000', uf: 'SP', cnpj: '22.333.444/0001-55', ie: '', fone: '(11) 4000-2002', contato: 'João', pessoa: 'JURIDICA', ativo: 'ATIVO', programacao_ativo: 'True', comanda_nf: '0' },
  { id: 3, codigo: '30', razao_social: 'LANCHONETE DO ZÉ', cidade: 'Barueri', uf: 'SP', pessoa: 'FISICA', ativo: 'INATIVO', programacao_ativo: 'False', comanda_nf: '1' },
];
let cadUni = [
  { id: 1, id_cliente: 1, nome: 'Padaria Estrela', codigo: '1', endereco: 'Rua das Flores', numero: '100', bairro: 'Centro', cidade: 'São Paulo', uf: 'SP', cep: '01000-000', telefone: '4000-1001', contato: 'Maria', tipo_faturamento: 'DIARIO', nutricionista_nome: 'Ana Paula', regiao: 'OSASCO', ativo: 'True', emite_comanda_diaria: 'True', quitar_automaticamente: 'False' },
  { id: 2, id_cliente: 1, nome: 'Padaria Estrela - Filial', codigo: '2', cidade: 'Osasco', uf: 'SP', tipo_faturamento: 'SEMANAL', nutricionista_nome: '', regiao: 'LAPA', ativo: 'True', emite_comanda_diaria: 'False', quitar_automaticamente: 'False' },
  { id: 3, id_cliente: 2, nome: 'Mercado Bom Preço - Loja 1', codigo: '3', cidade: 'Osasco', uf: 'SP', tipo_faturamento: 'MENSAL', nutricionista_nome: 'Carla Souza', regiao: 'BARUERI', ativo: 'False', emite_comanda_diaria: 'False', quitar_automaticamente: 'True' },
];
const cadRefs = [{ id: 1, codigo_referencia: '100', descricao: 'PAO FRANCES', produto_especial: 'False', produto_producao: 'True' }, { id: 2, codigo_referencia: '210', descricao: 'BOLO CENOURA', produto_especial: 'True', produto_producao: 'True' }];
let cadProd = [
  { id: 1, codigo: '10.1', descricao: 'PAO FRANCES KG', descricao_expedicao: 'PAO FRANCES', un: 'KG', preco: 14, divisor_basico: 1, peso: 0.05, peso_bruto: 0.05, aliq_ipi: 0, aliq_icms: 0, id_cliente: 1, id_referencia: 1, produto_producao: 'True', converter: 'False', ncm: '19059010', id_tributos: 1, extra_cortado: 'False', pm: 'PRODUTO' },
  { id: 2, codigo: '10.2', descricao: 'BOLO CENOURA 500G', descricao_expedicao: 'BOLO CENOURA', un: 'UN', preco: 12, divisor_basico: 2, peso: 0.5, peso_bruto: 0.55, aliq_ipi: 0, aliq_icms: 18, id_cliente: 1, id_referencia: 2, produto_producao: 'True', converter: 'False', ncm: '19059090', id_tributos: 2, pm: 'PRODUTO' },
  { id: 3, codigo: '20.1', descricao: 'PAO DE FORMA', descricao_expedicao: 'PAO DE FORMA', un: 'UN', preco: 9, divisor_basico: 1, peso: 0.4, peso_bruto: 0.4, aliq_ipi: 0, aliq_icms: 0, id_cliente: 2, id_referencia: null, produto_producao: 'False', converter: 'False', ncm: '19059010', id_tributos: null, pm: 'PRODUTO' },
];
let cadFun = [
  { id: 1, nome: 'Carlos Pereira', apelido: 'Carlão', endereco: 'Rua A, 10', bairro: 'Centro', cidade: 'Osasco', estado: 'SP', cep: '06000-000', id_funcao: 1, nascimento: '1985-03-12', admissao: '2015-06-01', telefone: '4000-0001', celular: '99999-0001', nacionalidade: 'Brasileira', rg: '11.222.333-4', cpf: '111.222.333-44', veiculo: 'Fiorino ABC-1234', estado_civil: 'Casado', ativo: 'True', foto: '' },
  { id: 2, nome: 'Ana Lima', apelido: '', cidade: 'Barueri', estado: 'SP', id_funcao: 2, ativo: 'True', foto: '' },
  { id: 3, nome: 'Pedro Souza (desligado)', id_funcao: 1, ativo: 'False', foto: '' },
];
const cadFuncoes = [{ id: 1, descricao: 'MOTORISTA' }, { id: 2, descricao: 'AJUDANTE' }, { id: 3, descricao: 'PADEIRO' }];
const cadSeq = { cli: 3, uni: 3, prod: 3, fun: 3 };
// CRUD genérico: devolve Response ou null se a rota não é de cadastros
function cadastros(m, p, u, b) {
  const crud = (base, lista, set, seq, extra = {}) => {
    const mm = p.match(new RegExp(`^${base}(?:/(\\d+))?$`));
    if (!mm) return null;
    const id = mm[1] ? Number(mm[1]) : null;
    if (m === 'POST' && !id) { const n = { ...extra, ...b, id: ++cadSeq[seq] }; set([...lista(), n]); return json(n, 201); }
    if (m === 'PUT' && id) { const x = lista().find((y) => y.id === id); if (!x) return json({ message: 'Registro não encontrado.' }, 404); Object.assign(x, b); return json(x); }
    if (m === 'DELETE' && id) { set(lista().filter((y) => y.id !== id)); return json({ ok: true }); }
    return null;
  };
  if (m === 'GET' && p === '/cadastros/clientes') return json([...cadCli].sort((a, b2) => a.razao_social.localeCompare(b2.razao_social)));
  if (m === 'GET' && p === '/cadastros/clientes/unidades') {
    const c = Number(u.searchParams.get('cliente')); const esc = u.searchParams.get('esconder') === '1';
    return json(cadUni.filter((x) => (!c || x.id_cliente === c) && (!esc || (x.ativo === 'True' && cadCli.find((y) => y.id === x.id_cliente)?.ativo === 'ATIVO'))));
  }
  if (m === 'GET' && p === '/cadastros/clientes/nutricionistas') return json(cadUni.filter((x) => (x.nutricionista_nome || '').trim()));
  let mm = p.match(/^\/cadastros\/clientes\/(\d+)\/produtos$/);
  if (m === 'GET' && mm) return json(cadProd.filter((x) => x.id_cliente === Number(mm[1])).map((x) => ({ ...x, preco_unitario: x.preco / (x.divisor_basico || 1) })));
  let r = crud('/cadastros/clientes/unidades', () => cadUni, (v) => { cadUni = v; }, 'uni', { ativo: 'True' });
  if (r) return r;
  r = crud('/cadastros/clientes', () => cadCli, (v) => { cadCli = v; }, 'cli');
  if (r) return r;
  if (m === 'GET' && p === '/cadastros/produtos') {
    const c = Number(u.searchParams.get('cliente')); const ws = (u.searchParams.get('q') || '').toUpperCase().split(/\s+/).filter(Boolean);
    return json({ produtos: cadProd.filter((x) => (!c || x.id_cliente === c) && ws.every((w) => x.descricao.includes(w) || x.codigo.includes(w))).map((x) => ({ ...x, preco_unitario: x.preco / (x.divisor_basico || 1) })), truncado: false });
  }
  if (m === 'GET' && p === '/cadastros/produtos/referencias') return json(cadRefs);
  if (m === 'GET' && p === '/cadastros/produtos/proximo-codigo') { const c = u.searchParams.get('cliente'); const n = Math.max(0, ...cadProd.filter((x) => String(x.id_cliente) === c).map((x) => Number(x.codigo.split('.')[1]))) + 1; return json({ codigo: `${c}.${n}` }); }
  r = crud('/cadastros/produtos', () => cadProd, (v) => { cadProd = v; }, 'prod');
  if (r) {
    if (m === 'POST' && !b.descricao) { cadProd = cadProd.filter((x) => x.id !== cadSeq.prod); cadSeq.prod -= 1; return json({ message: 'Informe a descrição do produto.' }, 422); }
    return r;
  }
  if (m === 'GET' && p === '/cadastros/funcionarios/funcoes') return json(cadFuncoes);
  if (m === 'GET' && p === '/cadastros/funcionarios') return json(cadFun.filter((x) => u.searchParams.get('inativos') === '1' || x.ativo === 'True').sort((a, b2) => a.nome.localeCompare(b2.nome)));
  return crud('/cadastros/funcionarios', () => cadFun, (v) => { cadFun = v; }, 'fun', { ativo: 'True' });
}

let mockUser = null;
const delay = (v) => new Promise((r) => setTimeout(() => r(v), 120));


// ---- Cargas e Itinerário (preview)
const cgMot = [{ id: 1, nome: 'Carlos Pereira', apelido: 'Carlão', celular: '(11) 99999-0001' }, { id: 2, nome: 'Marcos Silva', apelido: 'Marcos', celular: '(11) 99999-0002' }];
let itRot = [{ id: 1, horario: '05:30:00', descricao: 'Zona Oeste', id_funcionario: 1 }, { id: 2, horario: '08:00:00', descricao: 'Osasco', id_funcionario: 1 }, { id: 3, horario: '06:00:00', descricao: 'Barueri', id_funcionario: 2 }];
let itDis = [{ id: 1, id_roteiro: 1, id_unidade: 1, roteiro_ordem: 1 }, { id: 2, id_roteiro: 1, id_unidade: 3, roteiro_ordem: 2 }, { id: 3, id_roteiro: 2, id_unidade: 2, roteiro_ordem: 1 }];
let itSeq = { rot: 3, dis: 3 };
const uniNome = (id) => { const x = unidades.find((y) => y[0] === id); return x ? `${x[1]} ${id}/${id}` : '???'; };
const mot = (id) => cgMot.find((x) => x.id === id);
const itLista = () => itRot.map((r) => ({ ...r, horario: r.horario.slice(0, 5), nome: mot(r.id_funcionario)?.nome, apelido: mot(r.id_funcionario)?.apelido, empresas: itDis.filter((d) => d.id_roteiro === r.id).length })).sort((a, b2) => (a.nome + a.horario).localeCompare(b2.nome + b2.horario));
const cgBase = { registro_alterado: 0, etiqueta_adesiva: 0, programacao_fixa: 'False', cancelado: 'False', separado: 'False', produto_especial: 'False', acomodacao_carga: 'SACARIA' };
let cgDia = []; let cgFixa = []; let cgLog = {};
function cgInicia() {
  if (cgDia.length) return;
  const prods = [['PAO FRANCES', 'False'], ['PAO DE FORMA', 'True'], ['BOLO CENOURA', 'False'], ['SONHO', 'True']];
  let id = 900;
  unidades.forEach(([uid, , st]) => { if (![1, 2].includes(st)) return; prods.forEach(([pd, esp], k) => {
    const h = ['05:30', '06:30', '09:00', '11:30'][k];
    cgDia.push({ ...cgBase, id: ++id, id_unidade: uid, unidade_nome: uniNome(uid), data: ISO, hora: `${h}:00`, xhora: h, qtde_original: 20 + k * 10, qtde_alterada: k === 1 ? 5 : k === 3 ? -4 : 0, produto_descricao_expedicao: pd, produto_especial: esp,
      acomodacao_carga: k === 2 ? 'CAIXA BRANCA' : 'SACARIA', id_roteiro: uid % 2 ? 1 : 3, programacao_fixa: k < 2 ? 'True' : 'False', regiao: ['OSASCO', 'LAPA', 'BARUERI'][uid % 3], unidade_telefone: `(11) 4000-${1000 + uid}`,
      cancelado: uid === 4 && k === 0 ? 'True' : 'False', separado: uid === 3 && k === 1 ? 'True' : 'False', registro_alterado: k === 1 ? 1 : 0 });
  }); });
  cgDia.forEach((r) => { r.carga = r.hora < '08:00:00' ? 1 : r.hora < '11:00:00' ? 2 : 3; });
  let fid = 500;
  unidades.forEach(([uid]) => ['06:00', '09:30'].forEach((h, k) => cgFixa.push({ id: ++fid, semana_dia: 2, hora: `${h}:00`, qtde_total: 12 + k * 6, produto_descricao_expedicao: k ? 'BISNAGA 50G' : 'PAO FRANCES', acomodacao_carga: 'SACARIA', id_roteiro: uid % 2 ? 1 : 3, regiao: ['OSASCO', 'LAPA', 'BARUERI'][uid % 3], unidade_nome: uniNome(uid), unidade_telefone: `(11) 4000-${1000 + uid}`, carga: k + 1 })));
}
function cargasItin(m, p, u, b) {
  cgInicia();
  const rt = (id) => itRot.find((x) => x.id === id);
  const dec = (r) => ({ ...r, motorista_apelido: mot(rt(r.id_roteiro)?.id_funcionario)?.apelido ?? '', xhorario: rt(r.id_roteiro)?.horario.slice(0, 5) ?? '', display_total: r.qtde_original + r.qtde_alterada, motorista_nome: mot(rt(r.id_roteiro)?.id_funcionario)?.nome ?? '', horario: rt(r.id_roteiro)?.horario ?? '' });
  if (m === 'GET' && p === '/cargas/roteiros') return json(itRot.map((r) => ({ roteiro_id: r.id, chave: `${r.horario.slice(0, 5)} ${mot(r.id_funcionario)?.nome}` })));
  if (m === 'GET' && p === '/cargas/diaria') {
    const q = (k) => Number(u.searchParams.get(k) ?? 99);
    return json(cgDia.filter((r) => (q('tipo') === 0 ? r.produto_especial === 'True' : q('tipo') === 1 ? r.produto_especial !== 'True' : true) && (q('modal') === 2 ? r.cancelado === 'True' : q('modal') === 0 ? r.cancelado !== 'True' : true)
      && (q('carga') < 3 ? r.carga === q('carga') + 1 : true) && (q('expedicao') === 0 ? r.separado !== 'True' : q('expedicao') === 1 ? r.separado === 'True' : true)).map(dec));
  }
  if (m === 'GET' && p === '/cargas/fixa') return json(cgFixa.filter((r) => r.semana_dia === Number(u.searchParams.get('dia'))).map(dec));
  let mm = p.match(/^\/cargas\/(diaria|fixa)\/(\d+)$/);
  if (m === 'PUT' && mm) { const x = (mm[1] === 'diaria' ? cgDia : cgFixa).find((y) => y.id === Number(mm[2])); Object.assign(x, b); return json({ ok: true }); }
  mm = p.match(/^\/cargas\/(diaria|fixa)\/acomodacao$/);
  if (m === 'POST' && mm) { (mm[1] === 'diaria' ? cgDia : cgFixa).forEach((x) => { if (b.ids.includes(x.id)) x.acomodacao_carga = b.valor; }); return json({ ok: true, atualizados: b.ids.length }); }
  if (m === 'POST' && p === '/cargas/diaria/separar') { cgDia.forEach((x) => { if (b.ids.includes(x.id)) x.separado = 'True'; }); return json({ ok: true, atualizados: b.ids.length }); }
  mm = p.match(/^\/cargas\/diaria\/(\d+)\/etiquetas$/);
  if (m === 'GET' && mm) return json(cgLog[mm[1]] ?? []);
  if (m === 'POST' && p === '/cargas/etiquetas/dados') return json(cgDia.filter((x) => b.ids.includes(x.id)).map((x) => ({ ...x, nome: x.unidade_nome, inform: `${dec(x).motorista_apelido} ${dec(x).xhorario} *** ${x.acomodacao_carga} ${x.carga}` })));
  if (m === 'POST' && p === '/cargas/etiquetas') { b.ids.forEach((i) => { const x = cgDia.find((y) => y.id === i); x.etiqueta_adesiva += 1; x.registro_alterado = 0; (cgLog[i] ||= []).push({ id: Date.now() + i, data_hora: `${ISO} 18:30:00`, usuario: 'VALDECIR SANCHES', origem: 'CARGA' }); }); return json({ ok: true, etiquetas: b.ids.length }); }
  // ----- itinerário
  if (m === 'GET' && p === '/itinerario/motoristas') return json(cgMot);
  if (m === 'GET' && p === '/itinerario/roteiros') return json(itLista());
  if (m === 'POST' && p === '/itinerario/roteiros') { const n = { id: ++itSeq.rot, horario: `${b.horario}:00`.replace(/^(\d\d:\d\d):\d\d:00$/, '$1:00'), descricao: b.descricao, id_funcionario: b.id_funcionario }; itRot.push(n); return json({ id: n.id }, 201); }
  mm = p.match(/^\/itinerario\/roteiros\/(\d+)$/);
  if (m === 'PUT' && mm) { Object.assign(rt(Number(mm[1])), { ...b, horario: `${String(b.horario).slice(0, 5)}:00` }); return json({ ok: true }); }
  if (m === 'DELETE' && mm) { const id = Number(mm[1]); if (itDis.some((d) => d.id_roteiro === id)) return json({ message: 'Remova as empresas deste roteiro antes de excluí-lo.' }, 409); itRot = itRot.filter((x) => x.id !== id); return json({ ok: true }); }
  mm = p.match(/^\/itinerario\/roteiros\/(\d+)\/empresas$/);
  if (m === 'GET' && mm) return json(itDis.filter((d) => d.id_roteiro === Number(mm[1])).sort((a, b2) => a.roteiro_ordem - b2.roteiro_ordem).map((d) => ({ ...d, nome: uniNome(d.id_unidade), nome_exibe: uniNome(d.id_unidade), telefone: `(11) 4000-${1000 + d.id_unidade}`, contato: 'Maria' })));
  if (m === 'POST' && mm) { const id = Number(mm[1]); b.unidades.forEach((un) => { if (!itDis.some((d) => d.id_roteiro === id && d.id_unidade === un)) itDis.push({ id: ++itSeq.dis, id_roteiro: id, id_unidade: un, roteiro_ordem: itDis.filter((d) => d.id_roteiro === id).length + 1 }); }); return json({ ok: true, inseridas: b.unidades.length }); }
  mm = p.match(/^\/itinerario\/roteiros\/(\d+)\/empresas\/remover$/);
  if (m === 'POST' && mm) { itDis = itDis.filter((d) => !(d.id_roteiro === Number(mm[1]) && b.ids.includes(d.id))); return json({ ok: true, removidas: b.ids.length }); }
  mm = p.match(/^\/itinerario\/roteiros\/(\d+)\/ordem$/);
  if (m === 'PUT' && mm) { b.ids.forEach((id, i) => { itDis.find((d) => d.id === id).roteiro_ordem = i + 1; }); return json({ ok: true }); }
  mm = p.match(/^\/itinerario\/roteiros\/(\d+)\/fora$/);
  if (m === 'GET' && mm) { const todas = u.searchParams.get('todas') === '1'; return json(unidades.filter(([uid]) => !itDis.some((d) => d.id_unidade === uid && (d.id_roteiro === Number(mm[1]) || !todas))).map(([uid]) => ({ id_unidade: uid, id_cliente: uid, razao_social: '', chave: uniNome(uid) }))); }
  if (m === 'GET' && p === '/itinerario/impressao') return json(itRot.flatMap((r) => { const ds = itDis.filter((d) => d.id_roteiro === r.id); const base = { id_motorista: r.id_funcionario, nome: mot(r.id_funcionario).nome, celular: mot(r.id_funcionario).celular, id_roteiro: r.id, horario: r.horario.slice(0, 5) }; return ds.length ? ds.map((d) => ({ ...base, nome_exibe: uniNome(d.id_unidade), telefone: '(11) 4000-0000', contato: 'Maria', roteiro_ordem: d.roteiro_ordem })) : [base]; }));
  return null;
}

export function instalarMock() {
window.fetch = async (url, opts = {}) => {
  const m = (opts.method || 'GET').toUpperCase();
  const u = new URL(url, location.origin);
  const p = u.pathname.replace(/^\/api/, '');
  const b = typeof opts.body === 'string' ? JSON.parse(opts.body) : {};
  let r;
  if (m === 'GET' && p === '/health') r = json({ ok: true, host: '192.168.15.10', banco: 'levpao_new', mysql: 'preview' });
  else if (p === '/dispositivo') r = json(window.__BLOQ ? { codigo: '7F3A-91C2-0B4E', habilitado: false, exigido: true, message: 'Dispositivo não habilitado para uso do aplicativo.' } : { codigo: '7F3A-91C2-0B4E', habilitado: true, exigido: true, areas: window.__FAB ? ['fabrica'] : ['faturamento'], fabrica: Boolean(window.__FAB), message: '' });
  else if (m === 'GET' && p === '/dispositivos') r = json({ meu: '7F3A-91C2-0B4E', itens: [
    { id: 1, codigo: '7F3A-91C2-0B4E', descricao: 'Faturamento — Ingrid', ativo: true, areas: ['faturamento'], ultimo_usuario: 'sanches', ultimo_acesso: new Date().toISOString(), ultimo_ip: '192.168.15.31', navegador: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36' },
    { id: 2, codigo: 'B81D-44AA-92F0', descricao: 'Fábrica — forno', areas: ['fabrica'], ativo: true, ultimo_usuario: null, ultimo_acesso: new Date().toISOString(), ultimo_ip: '177.12.45.9', navegador: 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36' }] });
  else if (/^\/(fabrica\/)?producao\/resumo/.test(p)) r = json([
    { producao_turno: 1, producao_data: ISO, id_referencia: 1, codigo_referencia: '101', descricao: 'PAO FRANCES', producao_qtde: 1200, chave: '11' },
    { producao_turno: 2, producao_data: ISO, id_referencia: 2, codigo_referencia: '205', descricao: 'PAO DE FORMA', producao_qtde: 300, chave: '22' },
    { producao_turno: 2, producao_data: ISO, id_referencia: 3, codigo_referencia: '206', descricao: 'PAO DE LEITE 50GR', producao_qtde: 180, chave: '23' },
    { producao_turno: 3, producao_data: ISO, id_referencia: 4, codigo_referencia: '207', descricao: 'PAO DE BANHA 50 GR', producao_qtde: 199, chave: '34' }]);
  else if (/^\/(fabrica\/)?producao\/destinos/.test(p)) r = json([
    { data: ISO, hora: '06:00:00', producao_turno: 1, producao_data: ISO, id_unidade: 1, id_referencia: 1, codigo_referencia: '101', id_produto: 1, qtde_producao: 700, cliente_nome: 'MERCADO CENTRAL' },
    { data: ISO, hora: '07:30:00', producao_turno: 1, producao_data: ISO, id_unidade: 2, id_referencia: 1, codigo_referencia: '101', id_produto: 1, qtde_producao: 500, cliente_nome: 'PADARIA SOL' }]);
  else if (m === 'GET' && p === '/reclamacoes') r = json([
    { id: 1, data: ISO, hora: '07:10:00', nome: 'MERCADO CENTRAL', reclamante: 'Marta', telefone: '(11) 4000-1000', reclamacao: 'Pão de forma chegou amassado na entrega das 6h.', explicacao: '' },
    { id: 2, data: ISO, hora: '09:40:00', nome: 'PADARIA SOL', reclamante: 'João', telefone: '', reclamacao: 'Elogio: entrega pontual e pães quentinhos.', explicacao: 'Repassado à equipe.' }]);
  else if (m === 'PUT' && p.startsWith('/reclamacoes/')) r = json({ ok: true });
  else if (m === 'GET' && p === '/extras') r = json([{ id: 1, data: ISO, hora: '10:30:00', empresa: 'MERCADO CENTRAL', contato: 'Marta', descricao: '200 PAO DE HAMBURGUER 50G', funcionario: 'ANA', fone: '', digitado: 'False' }]);
  else if (m === 'GET' && p === '/extras/opcoes') r = json({ empresas: ['MERCADO CENTRAL', 'PADARIA SOL'], contatos: ['Marta', 'João'], descricoes: ['200 PAO DE HAMBURGUER 50G'], funcionarios: ['ANA', 'CARLOS'] });
  else if (p === '/auth/me') r = window.__FAB ? json({ id: 9, usuario: 'fabrica', nome: 'FABRICA', admin: false, fabrica: true }) : mockUser ? json(mockUser) : json({ message: 'Sem sessão.', login: true }, 401);
  else if (m === 'POST' && p === '/auth/login') {
    if (b.usuario?.toLowerCase() === 'sanches' && b.senha === '123') { mockUser = { id: 1, usuario: 'sanches', nome: 'VALDECIR SANCHES', admin: true }; r = json(mockUser); } else r = json({ message: 'Usuário ou senha inválido.' }, 401);
  } else if (m === 'POST' && p === '/auth/logout') { mockUser = null; r = json({ ok: true }); }
  else if (m === 'POST' && p === '/auth/senha') r = b.nova !== b.confirma ? json({ message: 'A confirmação não confere com a nova senha.' }, 422) : json({ ok: true });
  else if (p.startsWith('/cadastros/') && (r = cadastros(m, p, u, b))) { /* resposta definida */ }
  else if ((p.startsWith('/cargas') || p.startsWith('/itinerario')) && (r = cargasItin(m, p, u, b))) { /* resposta definida */ }
  else if (m === 'GET' && p === '/tributos') {
    const ws = (u.searchParams.get('q') || '').toUpperCase().split(/\s+/).filter(Boolean);
    r = json(trbs.filter((x) => ws.every((w) => x.descricao.includes(w))));
  } else if (m === 'GET' && p === '/tributos/produtos') {
    const ws = (u.searchParams.get('q') || '').toUpperCase().split(/\s+/).filter(Boolean); const esc = u.searchParams.get('esconder') === '1';
    r = json({ produtos: trbProds.filter((x) => ws.every((w) => x.descricao.includes(w) || x.codigo.includes(w)) && (!esc || x.id_tributos === null)), truncado: false });
  } else if (m === 'POST' && p === '/tributos/atribuir') {
    trbProds.forEach((x) => { if (b.produtos.includes(x.id)) x.id_tributos = b.tributo_id; }); r = json({ ok: true, produtos: b.produtos.length });
  } else if (m === 'POST' && p === '/tributos') {
    if (!b.descricao) r = json({ message: 'Informe a descrição do tributo.' }, 422);
    else { const novo = { ...trbBase, ...b, id: ++trbSeq }; trbs.push(novo); r = json(novo, 201); }
  } else if (m === 'PUT' && /^\/tributos\/\d+$/.test(p)) {
    const x = trbs.find((y) => y.id === Number(p.split('/')[2])); Object.assign(x, b); r = json(x);
  } else if (m === 'DELETE' && /^\/tributos\/\d+$/.test(p)) {
    const id = Number(p.split('/')[2]);
    if (trbProds.some((x) => x.id_tributos === id)) r = json({ message: 'Tributo em uso por produto(s). Indique outro tributo a eles antes de excluir.' }, 422);
    else { trbs = trbs.filter((x) => x.id !== id); r = json({ ok: true }); }
  }
  else if (m === 'GET' && p === '/comandas') {
    const uni = Number(u.searchParams.get('unidade')); const modo = u.searchParams.get('modo');
    r = json(Object.values(fatComandas).filter((c) => (c.comanda.id_unidade ?? uni) === uni && (modo === 'todas' || (modo === 'faturadas') === (c.comanda.status === 'FATURADO')))
      .map((c) => ({ ...c.comanda, usuario_resp: c.comanda.usuario, vr_comanda: somaCmd(c) })).sort((a, b) => a.id - b.id));
  } else if (m === 'GET' && /^\/comandas\/produto\//.test(p)) {
    const cod = decodeURIComponent(p.split('/')[3]);
    r = cod === '100' ? json({ id: 100, codigo: '100', descricao: 'PAO FRANCES', preco: 0.9, divisor_basico: 1 }) : json({ message: 'Produto não encontrado.' }, 404);
  } else if (m === 'POST' && /^\/comandas\/\d+\/itens$/.test(p)) {
    const c = fatComandas[Number(p.split('/')[2])]; const q = b.qtde * (b.cada || 1);
    c.itens.push(mkItem(++seq, c.comanda.id, b.produto_codigo, b.descricao, q, b.preco)); r = json({ id: seq }, 201);
  } else if (m === 'PUT' && /^\/comandas\/itens\/\d+$/.test(p)) {
    const id = Number(p.split('/')[3]); const c = Object.values(fatComandas).find((x) => x.itens.some((i) => i.id === id)); const i = c.itens.findIndex((x) => x.id === id);
    c.itens[i] = { ...mkItem(id, c.comanda.id, c.itens[i].produto_codigo, c.itens[i].descricao_generica, b.qtde * (b.cada || 1), b.preco, c.itens[i].preco_cada), ds: c.itens[i].ds }; r = json({ ok: true });
  } else if (m === 'DELETE' && /^\/comandas\/itens\/\d+$/.test(p)) {
    const id = Number(p.split('/')[3]); Object.values(fatComandas).forEach((c) => { c.itens = c.itens.filter((x) => x.id !== id); }); r = json({ ok: true });
  } else if (m === 'POST' && p === '/comandas/nfe') {
    b.ids.forEach((id) => { fatComandas[id].comanda.status = 'FATURADO'; fatComandas[id].comanda.id_nota_fiscal = 4321; }); r = json({ id: 4321 }, 201);
  }
  else if (m === 'GET' && /\/diaria\/\d+\/log$|\/diaria-log$/.test(p)) r = json([{ id: 1, data: ISO, hora: '05:10:00', usuario: 'Maria', produto_descricao_expedicao: 'PAO FRANCES', log: 'Alteracao de programacao 06:00:00/' + ISO + '\nAlterou qtde extra para 10' }]);
  else if (m === 'GET' && /\/status\/\d+\/reclamacoes$/.test(p)) r = json(reclamacoes);
  else if (m === 'POST' && /\/status\/\d+\/reclamacoes$/.test(p)) { reclamacoes.unshift({ id: ++seq, data: ISO, hora: '10:40:00', telefone: '', ...b }); r = json({ id: seq }, 201); }
  else if (m === 'PUT' && /^\/reclamacoes\/\d+$/.test(p)) { Object.assign(reclamacoes.find((x) => x.id === Number(p.split('/')[2])) || {}, b); r = json({ ok: true }); }
  else if (m === 'DELETE' && /^\/reclamacoes\/\d+$/.test(p)) { reclamacoes = reclamacoes.filter((x) => x.id !== Number(p.split('/')[2])); r = json({ ok: true }); }
  else if (m === 'GET' && /\/status\/\d+\/unidade$/.test(p)) r = json(unidadeCfg);
  else if (m === 'PUT' && /\/status\/\d+\/unidade$/.test(p)) { Object.assign(unidadeCfg, b); r = json({ ok: true }); }
  else if (m === 'GET' && /\/status\/\d+\/pasta$/.test(p)) r = json(fixa.filter((f) => f.id_unidade === Number(p.split('/')[2])).map((f) => ({ ...f, dia: DIAS_MOCK[f.semana_dia - 1], hora: f.hora.slice(0, 5), produto_descricao_completa: f.produto_descricao })));
  else if (m === 'GET' && /\/fixa\/\d+\/log$/.test(p)) r = json([]);
  else if (m === 'GET' && p === '/alteracoes') r = json([]);
  else if (m === 'POST' && /\/diaria\/\d+\/etiqueta$/.test(p)) r = json({ ok: true });
  else if (m === 'PUT' && /^\/diaria\/\d+$/.test(p)) { const d = diaria.find((x) => x.id === Number(p.split('/')[2])); if (d) Object.assign(d, b, { xqtde_total: d.qtde_original + (b.qtde_alterada ?? d.qtde_alterada) }); r = json({ ok: true }); }
  else if (m === 'GET' && p === '/nfe/certificado') r = json({ cnpj: nfeCfg.cnpj, tokenConfigurado: true, url: 'https://nfe-api.x-star.com.br', vencimento: null, health: { ok: true }, a3: a3Mock, empresa: certOk ? { id: 'a19c9920', cnpj: nfeCfg.cnpj, razaoSocial: nfeCfg.razao, ambientePadrao: 2, temCertificadoAtivo: true } : undefined, situacao: certOk ? 'ok' : 'sem_empresa', mensagem: certOk ? 'Empresa e certificado A1 ativos: pronto para emitir.' : 'Empresa ainda não cadastrada na API. Envie o certificado A1 para cadastrar.' });
  else if (m === 'POST' && p === '/nfe/certificado/a3') { a3Mock = { certificadoId: 'c0ffee00-1111-2222-3333-444455556666', online: false, agenteId: 'ag000001-aaaa-bbbb-cccc-ddddeeeeffff', nomeAgente: b.nomeAgente }; r = json({ ok: true, certificadoId: a3Mock.certificadoId, tokenAgente: 'AGT-' + 'x7Kq9'.repeat(8), mensagem: 'Certificado A3 cadastrado. Anote o token do agente agora: ele não será mostrado de novo. Agentes anteriores foram revogados.' }, 201); setTimeout(() => { a3Mock.online = true; }, 4000); }
  else if (m === 'DELETE' && /^\/nfe\/certificado\/a3\/agente\//.test(p)) { a3Mock = {}; r = json({ ok: true, mensagem: 'Agente revogado.' }); }
  else if (m === 'POST' && p === '/nfe/certificado') { certOk = true; r = json({ ok: true, atualizado: false, camposAlterados: [], mensagem: 'Empresa cadastrada e certificado A1 ativo.' }, 201); }
  else if (m === 'GET' && p === '/nfe/ambiente') r = json({ ambiente: Number(nfeCfg.nfe_configuracoes_webservice_ambiente) === 1 ? 1 : 2 });
  else if (m === 'GET' && p === '/nfe/config') r = json(nfeCfg);
  else if (m === 'PUT' && p === '/nfe/config') { Object.assign(nfeCfg, b); r = json({ ok: true }); }
  else if (m === 'GET' && p === '/nfe') { const sts = (u.searchParams.get('status') || '').split(','); r = json(nfes.filter((x) => sts.includes(x.status_e))); }
  else if (m === 'GET' && /^\/nfe\/\d+$/.test(p)) { const n = nfes.find((x) => x.id === Number(p.split('/')[2])); r = n ? json(n) : json({ message: 'Nota não encontrada.' }, 404); }
  else if (m === 'POST' && p === '/nfe') { const n = { ...nfeBase, id: Math.max(...nfes.map((x) => x.id)) + 1, status_e: 'PENDENTE', nfe_numero: 0, nf_valor_total: 0 }; nfes.push(n); r = json(n, 201); }
  else if (m === 'POST' && p === '/nfe/autorizar') {
    const res = b.ids.map((id) => { const n = nfes.find((x) => x.id === id); if (!n || n.status_e !== 'PENDENTE') return { id, ok: false, log: ['Nota não está PENDENTE.'] };
      nfeCfg.nfe_numero += 1; Object.assign(n, { status_e: 'AUTORIZADA', nfe_numero: nfeCfg.nfe_numero, nfe_chave: `3526106757003600018155001${String(nfeCfg.nfe_numero).padStart(9, '0')}1000000001`, nfe_protocolo: '135260000999999', nfe_protocolo_data_hora: '26/10/2026 12:20:00', usuario_autorizacao_nfe: 'SANCHES' });
      return { id, ok: true, log: [`Número da NFE: ${n.nfe_numero}`, 'Resultado: Autorizado o uso da NF-e', `Chave: ${n.nfe_chave}`, 'A U T O R I Z A D A !'], resumo: { requisicao: { configuracao: { ambiente: 2 }, numero: n.nfe_numero }, status: 200 } }; });
    r = json({ resultados: res });
  }
  else if (m === 'POST' && /^\/nfe\/\d+\/cancelar$/.test(p)) { const n = nfes.find((x) => x.id === Number(p.split('/')[2])); n.status_e = 'CANCELADA'; n.nfe_cancelamento_justificativa = b.justificativa; r = json({ ok: true, mensagem: 'NFe C A N C E L A D A com sucesso!' }); }
  else if (m === 'POST' && /^\/nfe\/\d+\/carta-correcao$/.test(p)) r = json({ ok: true, mensagem: 'Sucesso! Evento registrado e vinculado a NF-e', sequencia: 2 });
  else if (m === 'POST' && p === '/nfe/inutilizar') r = json({ ok: true, mensagem: 'Inutilizada com sucesso!' });
  else if (m === 'GET' && p === '/nfe/inutilizacoes') r = json([{ id: 'i1', serie: 1, numeroInicial: 270, numeroFinal: 271, protocolo: '135260000999', criadoEm: ISO + 'T09:12:00', homologado: true, motivoRetorno: 'Inutilização de número homologado' }]);
  else if (m === 'GET' && p === '/nfe/series') r = json({ series: [{ modelo: 55, serie: 1, ambiente: 2, proximoNumero: Number(nfeCfg.nfe_numero) + 1 }], localNumero: Number(nfeCfg.nfe_numero), ambiente: 2 });
  else if (m === 'PUT' && p === '/nfe/series') { nfeCfg.nfe_numero = b.proximoNumero - 1; r = json({ ok: true, proximoNumero: b.proximoNumero }); }
  else if (m === 'GET' && p === '/nfe/consultar-numero') r = json({ http: 200, resposta: { existe: true, status: 'Autorizado', podeEmitir: false, id: 'doc-1' } });
  else if (m === 'POST' && p === '/nfe/consultar-chave') r = json({ http: 200, resposta: { cStat: 100, xMotivo: 'Autorizado o uso da NF-e', protocolo: '135260000123456' } });
  else if (m === 'POST' && /^\/nfe\/\d+\/devolucao$/.test(p)) { const o = nfes.find((x) => x.id === Number(p.split('/')[2])); const n = { ...o, id: Math.max(...nfes.map((x) => x.id)) + 1, status_e: 'PENDENTE', nfe_numero: 0, nfe_chave: '', cfop_codigo: '1202', csosn: '900', texto_corpo: `Entrada por devolução total da NFe ${o.nfe_numero}.` }; o.status_e = 'DEVOLVIDO'; nfes.push(n); r = json({ ok: true, id: n.id, mensagem: 'Nota de devolução criada (PENDENTE). Confira e autorize.' }, 201); }
  else if (m === 'POST' && /^\/nfe\/\d+\/devolve-estoque$/.test(p)) r = json({ ok: true, comandas: 2 });
  else if (m === 'POST' && /^\/nfe\/\d+\/reenviar$/.test(p)) r = json({ ok: true, log: ['A U T O R I Z A D A !'] });
  else if (m === 'POST' && p === '/nfe/email/previa') r = json({ destino: b.destino, smtp: true, notas: b.ids.map((id) => { const n = nfes.find((x) => x.id === id); const ok = n.status_e === 'AUTORIZADA'; return { id, numero: n.nfe_numero, serie: n.nfe_serie, status: n.status_e, cliente: n.cliente_razao_social, valor: n.nf_valor_total, para: b.destino === 'contabilidade' ? ['contabilidade@exemplo.com.br'] : ['financeiro@cliente.com.br'], cc: b.destino === 'cliente' ? ['contabilidade@exemplo.com.br'] : [], cco: [], assunto: `Nota Fiscal Eletrônica - NFe ${n.nfe_numero}/1 - LEVPAO`, mensagem: `Prezado(a) ${n.cliente_razao_social},\n\nSegue em anexo a NF-e nº ${n.nfe_numero}.\n\nAtenciosamente,\nLEVPAO`, avisos: ok ? [] : ['Nota ' + n.status_e + ': só notas AUTORIZADAS podem ser enviadas.'], pode: ok }; }) });
  else if (m === 'POST' && p === '/nfe/email') r = json({ ok: true, enviadas: b.ids.length, resultados: b.ids.map((id) => ({ id, ok: true, log: `NFe ${nfes.find((x) => x.id === id).nfe_numero}: enviada para ${b.destino === 'contabilidade' ? 'contabilidade@exemplo.com.br' : 'financeiro@cliente.com.br'}.` })) });
  else if (m === 'POST' && p === '/nfe/status-servico') r = json({ http: 200, resposta: { cStat: 107, xMotivo: 'Servico em Operacao' } });
  else if (m === 'POST' && /^\/nfe\/\d+\/duplicar$/.test(p)) { const o = nfes.find((x) => x.id === Number(p.split('/')[2])); const n = { ...o, id: Math.max(...nfes.map((x) => x.id)) + 1, status_e: 'PENDENTE', nfe_numero: 0, nfe_chave: '' }; nfes.push(n); r = json({ id: n.id }, 201); }
  else if (m === 'DELETE' && /^\/nfe\/\d+$/.test(p)) { nfes = nfes.filter((x) => x.id !== Number(p.split('/')[2])); r = json({ ok: true }); }
  else if (m === 'PUT' && /^\/nfe\/\d+$/.test(p)) { const n = nfes.find((x) => x.id === Number(p.split('/')[2])); Object.assign(n, b); r = json(n); }
  else if (m === 'GET' && p === '/nfe/clientes') r = json([{ id: 3, razao_social: 'LANCHONETE DO ZÉ' }, { id: 4, razao_social: 'MERCADO SÃO JORGE' }, { id: 5, razao_social: 'PADARIA ESTRELA LTDA' }]);
  else if (m === 'GET' && /^\/nfe\/tributos\/\d+$/.test(p)) r = json(nfeTrib[Number(p.split('/')[3])] ?? {});
  else if (m === 'PUT' && /^\/nfe\/tributos\/\d+$/.test(p)) { const t = nfeTrib[Number(p.split('/')[3])]; Object.assign(t, b); r = json(t); }
  else if (m === 'PUT' && /^\/nfe\/itens\/\d+$/.test(p)) {
    const it = Object.values(nfeItens).flat().find((x) => x.id === Number(p.split('/')[3])); Object.assign(it, b);
    it.preco_total = Math.round(Number(it.preco) * Number(it.qtde) * 100) / 100;
    const n = nfes.find((x) => x.id === it.id_nfe); const tot = nfeItens[it.id_nfe].reduce((a, i) => a + i.preco_total, 0); n.valor_produtos = tot; n.nf_valor_total = tot;
    r = json({ ...it, _nota: { valor_produtos: tot, nf_valor_total: tot } });
  }
  else if (m === 'DELETE' && /^\/nfe\/itens\/\d+$/.test(p)) { const id = Number(p.split('/')[3]); for (const k of Object.keys(nfeItens)) nfeItens[k] = nfeItens[k].filter((x) => x.id !== id); r = json({}, 204); }
  else if (m === 'POST' && /^\/nfe\/\d+\/itens$/.test(p)) { const nid = Number(p.split('/')[2]); const it = { id: 100 + Math.floor(Math.random() * 900), id_nfe: nid, produto_codigo: b.produto_codigo, produto_descricao: 'PRODUTO ' + b.produto_codigo, produto_ncm: '19059090', un: 'PC', qtde: Number(b.qtde), preco: 5, preco_total: 5 * Number(b.qtde), id_tributo: 7 }; (nfeItens[nid] ??= []).push(it); r = json(it, 201); }
  else if (m === 'GET' && /^\/nfe\/\d+\/detalhe$/.test(p)) {
    const id = Number(p.split('/')[2]); const n = nfes.find((x) => x.id === id); const itens = nfeItens[id] ?? [];
    const cmds = id === 6492 ? [{ id: 600678, id_cliente: 3, id_unidade: 3, status: 'FATURADO', data_emissao: ISO, usuario: 'SANCHES', vr_comanda: 90 }] : [];
    r = n ? json({ nota: n, itens, eventos: nfeEventos[id] ?? [], duplicatas: id === 6492 ? [{ id: 1, documento: '6492/1', vencto: ISO, valor: 90 }] : [], referencias: nfeRefs[id] ?? [], comandas: cmds,
      comandas_itens: cmds.length ? [{ id: 1, descricao_generica: 'PAO DOCE KG', new_qtde: 5, preco: 14, vr_item: 70 }, { id: 2, descricao_generica: 'BISNAGA 50G', new_qtde: 10, preco: 2, vr_item: 20 }] : [], tributo: itens[0]?.id_tributo ? nfeTrib[itens[0].id_tributo] ?? null : null }) : json({ message: 'Nota não encontrada.' }, 404);
  }
  else if (m === 'DELETE' && /^\/nfe\/referencias\/\d+$/.test(p)) { const rid = Number(p.split('/')[3]); for (const k of Object.keys(nfeRefs)) nfeRefs[k] = nfeRefs[k].filter((y) => y.id !== rid); r = json({ ok: true }); }
  else if (m === 'GET' && /^\/nfe\/\d+\/referencias$/.test(p)) r = json(nfeRefs[Number(p.split('/')[2])] ?? []);
  else if (m === 'POST' && /^\/nfe\/\d+\/referencias$/.test(p)) { const nid = Number(p.split('/')[2]); const x = { id: 50 + (nfeRefs[nid]?.length ?? 0), id_nfe: nid }; (nfeRefs[nid] ??= []).push(x); r = json(x, 201); }
  else if (m === 'PUT' && /^\/nfe\/referencias\/\d+$/.test(p)) { const x = Object.values(nfeRefs).flat().find((y) => y.id === Number(p.split('/')[3])); Object.assign(x, b); r = json(x); }
  else if (m === 'PUT' && /^\/nfe\/duplicatas\/\d+$/.test(p)) r = json({ id: Number(p.split('/')[3]), documento: '6492/1', vencto: ISO, valor: 90, ...b });
  else if (m === 'POST' && /^\/nfe\/\d+\/destinatario$/.test(p)) { const n = nfes.find((x) => x.id === Number(p.split('/')[2])); Object.assign(n, { cliente_razao_social: String(b.razao_social).toUpperCase(), cliente_pedido: String(b.razao_social).toUpperCase() }); r = json(n); }
  else if (m === 'GET' && /^\/nfe\/comandas\/\d+\/itens$/.test(p)) r = json([{ id: 1, descricao_generica: 'PAO DOCE KG', new_qtde: 5, preco: 14, vr_item: 70 }, { id: 2, descricao_generica: 'BISNAGA 50G', new_qtde: 10, preco: 2, vr_item: 20 }]);
  else if (m === 'GET' && /^\/nfe\/\d+\/itens$/.test(p)) r = json(nfeItens[Number(p.split('/')[2])] ?? []);
  else if (m === 'GET' && /^\/nfe\/\d+\/eventos$/.test(p)) r = json(nfeEventos[Number(p.split('/')[2])] ?? []);
  else if (m === 'GET' && /^\/nfe\/\d+\/duplicatas$/.test(p)) r = json(Number(p.split('/')[2]) === 6492 ? [{ id: 1, documento: '6492/1', vencto: ISO, valor: 90 }] : []);
  else if (m === 'GET' && /^\/nfe\/\d+\/comandas$/.test(p)) r = json(Number(p.split('/')[2]) === 6492 ? [{ id: 600678, id_cliente: 3, id_unidade: 3, status: 'FATURADO', data_emissao: ISO, usuario: 'SANCHES', vr_comanda: 90 }] : []);
  else if (m === 'GET' && p === '/faturamento/unidades') r = json(fatUnis);
  else if (m === 'GET' && p === '/faturamento/config') r = json({ mostrarValor: true });
  else if (m === 'PUT' && /^\/faturamento\/unidades\/\d+$/.test(p)) { Object.assign(fatUnis.find((x) => x.id === Number(p.split('/')[3])), b); r = json({ ok: true }); }
  else if (m === 'GET' && p === '/faturamento/itens') {
    const un = u.searchParams.get('unidade');
    r = json(u.searchParams.get('inicio') > ISO || u.searchParams.get('fim') < ISO ? [] : fatItens.filter((x) => !un || x.id_unidade === Number(un)));
  } else if (m === 'GET' && /^\/faturamento\/diaria\/\d+$/.test(p)) r = json(fatItens.find((x) => x.id === Number(p.split('/')[3])));
  else if (m === 'GET' && /^\/faturamento\/diaria\/\d+\/comandas$/.test(p)) {
    const id = Number(p.split('/')[3]);
    r = json(Object.values(fatComandas).flatMap((c) => c.detalhes.filter((d) => d.id_diaria === id).map((d) => ({ ...d, data_emissao: ISO, status: 'PROCESSADO' }))));
    if (id === fatItens[3]?.id) r = json([{ id: 1, id_comanda: 600512, data_emissao: ISO, qtde: 6, status: 'PROCESSADO' }]);
  } else if (m === 'PUT' && /^\/faturamento\/diaria\/\d+$/.test(p)) {
    const i = fatItens.findIndex((x) => x.id === Number(p.split('/')[3]));
    const novo = { ...fatItens[i], ...b };
    const un = novo.produto_preco / (novo.produto_preco_cada || 1);
    novo.conversao_produto_valor = novo.conversao_produto_qtde * (novo.conversao_produto_preco / (novo.conversao_produto_preco_cada || 1));
    fatItens[i] = calc({ ...novo, produto_preco: novo.produto_preco, preco_total: (novo.qtde_original + novo.qtde_alterada) * un });
    r = json(fatItens[i]);
  } else if (m === 'POST' && p === '/faturamento/baixa') r = json({ ok: true, itens: b.ids.length });
  else if (m === 'POST' && /^\/faturamento\/comandas\/\d+\/nfe$/.test(p)) r = json({ id: 4321 }, 201);
  else if (m === 'POST' && p === '/faturamento/comandas') {
    const sel = fatItens.filter((x) => b.ids.includes(x.id));
    if (!sel.some((x) => x.qtde_pendente > 0)) r = json({ message: 'Não há itens pendentes para emissão de comanda.' }, 422);
    else if (sel.some((x) => x.id_unidade !== b.unidade)) r = json({ message: 'Há itens de mais de uma unidade. Marque "Conectar cliente" para gerar a comanda de uma unidade por vez.' }, 422);
    else {
      const id = ++cmdSeq; const detalhes = []; const merc = [];
      sel.forEach((x) => {
        if (x.qtde_pendente === 0 || x.cobranca_cancelada === 'True') return;
        const conv = x.conversao_produto_preco > 0;
        if (conv) merc.push({ id: ++seq, id_comanda: id, data: x.data, hora: x.hora, descricao: x.produto_descricao_expedicao, qtde: x.qtde_pendente });
        if (!conv && x.converter === 'True') return;
        detalhes.push({ id: ++seq, id_comanda: id, id_diaria: x.id, data: x.data, hora: x.hora, descricao_generica: conv ? x.conversao_produto_descricao : x.produto_descricao,
          preco: conv ? x.conversao_produto_preco : x.produto_preco, preco_cada: conv ? x.conversao_produto_preco_cada : x.produto_preco_cada, qtde: conv ? x.conversao_produto_qtde : x.qtde_pendente });
      });
      detalhes.forEach((d) => { const i = fatItens.findIndex((x) => x.id === d.id_diaria); fatItens[i] = calc({ ...fatItens[i], qtde_cobrado: fatItens[i].qtde_cobrado + d.qtde, qtde_quitado: fatItens[i].qtde_cobrado + d.qtde, comandas: `${id}.${d.qtde}` }); });
      const g = new Map(); detalhes.forEach((d) => { const k = `${d.descricao_generica}|${d.preco}|${d.preco_cada}`; g.set(k, [...(g.get(k) ?? []), d]); });
      const itens = [...g.values()].map((ds) => { const q = ds.reduce((a, d) => a + d.qtde, 0); const d0 = ds[0]; const nq = Math.trunc(q / (d0.preco_cada || 1) * 1000) / 1000; return { id: ++seq, id_comanda: id, descricao_generica: d0.descricao_generica, preco: d0.preco, preco_cada: d0.preco_cada, qtde: q, new_qtde: nq, vr_item: Math.trunc(d0.preco * nq * 1000) / 1000, ds }; });
      fatComandas[id] = { comanda: { id, status: 'PROCESSADO', data_emissao: b.data_emissao, usuario: 'SANCHES', vr_comanda: itens.reduce((a, i) => a + i.vr_item, 0) }, itens, mercadorias: merc, detalhes };
      r = json({ id }, 201);
    }
  } else if (m === 'GET' && /^\/faturamento\/comandas\/\d+$/.test(p)) { const c = comandaDe(Number(p.split('/')[3])); r = json({ comanda: c.comanda, itens: c.itens.map(({ ds, ...i }) => i), mercadorias: c.mercadorias }); }
  else if (m === 'GET' && /^\/faturamento\/comandas\/itens\/\d+\/detalhes$/.test(p)) {
    const id = Number(p.split('/')[4]);
    const it = Object.values(fatComandas).flatMap((c) => c.itens).find((i) => i.id === id);
    r = json((it?.ds ?? []).map((d) => ({ ...d, xqtde: Math.trunc(d.qtde / (d.preco_cada || 1) * 1000) / 1000, vr_item: Math.trunc(d.preco * (d.qtde / (d.preco_cada || 1)) * 1000) / 1000 })));
  } else if (m === 'DELETE' && /^\/faturamento\/comandas\/\d+$/.test(p)) {
    const id = Number(p.split('/')[3]);
    (fatComandas[id]?.detalhes ?? []).forEach((d) => { const i = fatItens.findIndex((x) => x.id === d.id_diaria); fatItens[i] = calc({ ...fatItens[i], qtde_cobrado: 0, qtde_quitado: 0, comandas: '' }); });
    delete fatComandas[id]; r = json({ ok: true });
  } else if (m === 'DELETE' && /^\/faturamento\/detalhes\/\d+$/.test(p)) r = json({ ok: true });
  else if (m === 'GET' && p === '/nfs/confirmadas/consulta') r = json({ nf: '167779', bruto: 830, desconto: 99.6, liquido: 730.4, existente: false });
  else if ((m === 'POST' && p === '/nfs/confirmadas') || (m === 'DELETE' && p.startsWith('/nfs/confirmadas/'))) r = json({ ok: true, gravadas: 1 });
  else if (m === 'GET' && p === '/nfs/clientes') r = json([{ id: 1, codigo: '001', razao_social: 'SUPERMERCADO ESTRELA LTDA', percentual_desc: 12 }, { id: 2, codigo: '002', razao_social: 'HOTEL BELA VISTA S/A', percentual_desc: 0 }, { id: 3, codigo: '003', razao_social: 'MERCADO SÃO JORGE', percentual_desc: 10 }]);
  else if (m === 'GET' && p === '/nfs/relatorio') r = json({ cliente: { id: 1, razao_social: 'SUPERMERCADO ESTRELA LTDA' }, linhas: [
    { id: 1, cliente_nome: 'SUPERMERCADO ESTRELA LTDA', nfe_numero: '167778', data_emissao: `${ISO}T00:00:00`, cliente_pedido: 'PED 1', nf_valor_total: 1250.5, vencto: `${ISO}T00:00:00`, valor_bruto: 1250.5, valor_desconto: 150.06, valor_liquido: 1100.44, percentual: 12, confirmada: 'SIM', vr_a_receber: 0 },
    { id: 2, cliente_nome: 'HOTEL BELA VISTA S/A', nfe_numero: '167779', data_emissao: `${ISO}T00:00:00`, cliente_pedido: 'PED 2', nf_valor_total: 830, vencto: null, valor_bruto: null, valor_desconto: null, valor_liquido: null, percentual: null, confirmada: 'NÃO', vr_a_receber: 730.4 }] });
  else if (m === 'POST' && p.startsWith('/nfs/confirmadas/ler')) r = json({ linhas: [{ nf: '167778', bruto: 1250.5, desconto: 150.06, liquido: 1100.44, valorNota: 1250.5, existente: true, avisos: [], ok: true }, { nf: '167779', bruto: 830, desconto: 99.6, liquido: 730.4, valorNota: 830, existente: false, avisos: [], ok: true }, { nf: '999999', bruto: 100, desconto: 12, liquido: 88, valorNota: null, existente: false, avisos: ['nota não localizada'], ok: true }] });
  else if (m === 'GET' && p === '/producao/resumo') {
    const t = u.searchParams.get('tipo');
    r = json(u.searchParams.get('data') !== ISO ? [] : agrupa(t, (x) => `${x.producao_turno}-${x.id_referencia}`, (ls) => ({
      producao_turno: ls[0].producao_turno, producao_data: ISO, id_referencia: ls[0].id_referencia,
      codigo_referencia: refs[ls[0].id_referencia].codigo, descricao: refs[ls[0].id_referencia].descricao, producao_qtde: soma(ls), chave: `${ls[0].producao_turno}${ls[0].id_referencia}`,
    })).sort((a, c) => a.producao_turno - c.producao_turno || a.id_referencia - c.id_referencia));
  } else if (m === 'GET' && p === '/producao/destinos') {
    const t = u.searchParams.get('tipo'); const tn = Number(u.searchParams.get('turno')); const rf = Number(u.searchParams.get('referencia'));
    r = json(prodRows.filter((x) => tipoDe(x.id_referencia) === t && x.producao_turno === tn && x.id_referencia === rf)
      .map((x) => ({ data: x.data, hora: x.hora, producao_turno: x.producao_turno, producao_data: ISO, id_unidade: x.id_unidade, id_referencia: rf,
        codigo_referencia: refs[rf].codigo, id_produto: x.id_produto, qtde_producao: x.qtde, cliente_nome: t === 'especiais' ? `${x.nome}  ${x.id_unidade}` : x.nome }))
      .sort((a, c) => a.hora.localeCompare(c.hora)));
  } else if (m === 'GET' && p === '/producao/entrega') {
    const t = u.searchParams.get('tipo');
    r = json(prodRows.filter((x) => tipoDe(x.id_referencia) === t).map((x) => ({ ...x, qtde_producao: x.qtde, referencia_descricao: refs[x.id_referencia].descricao,
      codigo_referencia: refs[x.id_referencia].codigo, cliente_nome: `${x.nome}  ${x.id_unidade}` }))
      .sort((a, c) => a.producao_turno - c.producao_turno || a.id_referencia - c.id_referencia || a.nome.localeCompare(c.nome) || a.hora.localeCompare(c.hora)));
  } else if (m === 'PUT' && p === '/producao/turno') {
    let n = 0;
    b.itens.forEach((l) => prodRows.forEach((x) => { if (x.id_unidade === l.id_unidade && x.hora === l.hora && x.id_referencia === l.id_referencia && x.producao_turno === l.producao_turno) { x.producao_turno = b.turno; n += 1; } }));
    r = json({ alteradas: n });
  }
  else if (m === 'GET' && /^\/mercadorias\/\d+$/.test(p)) { const x = mercs.find((y) => y.id === Number(p.split('/')[2])); r = json({ ...x, id_produto: 901, produto_codigo: '999.999', produto_descricao: 'FARINHA DE TRIGO KG', produto_preco: 13.67, preco_total: x.qtde * 13.67, produto_valor: x.qtde * 13.67, id_produto_conversao: 0, conversao_produto_codigo: '', conversao_produto_descricao: '', conversao_produto_qtde: 0, conversao_produto_preco: 0, conversao_produto_valor: 0, conversao_observacoes: '', quitado_manualmente: 'False' }); }
  else if (m === 'PUT' && /^\/mercadorias\/\d+$/.test(p)) r = json({ ok: true });
  else if (m === 'GET' && p === '/mercadorias') r = json(u.searchParams.get('data') === ISO ? mercs : []);
  else if (m === 'GET' && /^\/mercadorias\/\d+\/etiquetas$/.test(p)) r = json(logEtiq.filter((l) => l.id_diaria === Number(p.split('/')[2])));
  else if (m === 'POST' && p === '/mercadorias/etiquetas/dados') r = json(mercs.filter((x) => b.ids.includes(x.id)).map((x) => ({ ...x, qtde_pendente: x.qtde, unidade_nome: x.nome })));
  else if (m === 'GET' && p === '/impressao/config') r = json({ url: 'http://192.168.15.8:9101', tem_token: true, origem: 'arquivo' });
  else if (m === 'PUT' && p === '/impressao/config') r = json({ url: b.url ? (String(b.url).includes(':') ? b.url : b.url + ':9101') : '', tem_token: true, origem: 'arquivo' });
  else if (m === 'GET' && p === '/impressao/status') r = json({ ok: true, versao: '1.0.0', plataforma: 'win32', destinos: 2 });
  else if (m === 'GET' && p === '/layout-etiquetas') r = json({});
  else if (m === 'PUT' && p.startsWith('/layout-etiquetas/')) r = json({});
  else if (m === 'POST' && p === '/mercadorias/etiquetas') {
    b.ids.forEach((id) => { const x = mercs.find((y) => y.id === id); x.etiqueta_adesiva += 1; logEtiq.push({ id: ++seq, id_diaria: id, data_hora: ISO + ' 12:00:00', usuario: 'Você', origem: 'MERCADORIAS' }); });
    r = json({ ok: true, etiquetas: b.ids.length });
  } else if (m === 'GET' && p === '/status') {
    const f = u.searchParams.get('filtro');
    const ok = { todas: () => true, normal: (s) => s === 1, normal_alt: (s) => s === 1 || s === 2, alt_canc: (s) => s >= 2 && s <= 3, canc: (s) => s === 3, nada: (s) => s === 0 }[f];
    r = json(u.searchParams.get('data') === ISO ? status.filter((s) => ok(s.status)) : []);
  } else if (m === 'GET' && /\/status\/\d+\/roteiros/.test(p)) r = json(roteiros);
  else if (m === 'GET' && /\/status\/\d+\/diaria/.test(p)) {
    const id = Number(p.split('/')[2]); const st = status.find((s) => s.id === id).status;
    r = json(diaria.filter((d) => d.id_status === id).map((d) => ({ ...d, status: st, xqtde_total: d.qtde_original + d.qtde_alterada })));
  } else if (m === 'GET' && /\/status\/\d+\/fixa/.test(p)) {
    const id = Number(p.split('/')[2]); const dia = Number(u.searchParams.get('dia')) || dow;
    const itens = fixa.filter((f) => f.id_unidade === id && f.semana_dia === dia);
    const ativada = diaria.some((d) => d.id_status === id && d.programacao_fixa === 'True');
    r = json({ dia, itens, ativavel: dia === dow && itens.length > 0, ativada });
  } else if (m === 'GET' && p.startsWith('/produtos/codigo/')) {
    const x = produtos[decodeURIComponent(p.split('/').pop())]; r = x ? json(x) : json({ message: 'Produto não encontrado(a).' }, 404);
  } else if (m === 'GET' && p === '/produtos') {
    const q = (u.searchParams.get('q') || '').toLowerCase();
    r = json(Object.values(produtos).filter((x) => x.codigo.includes(q) || x.descricao.toLowerCase().includes(q)));
  } else if (m === 'PATCH' && /^\/status\/\d+$/.test(p)) { status.find((s) => s.id === Number(p.split('/')[2])).status = b.status; r = json({ ok: true }); }
  else if (m === 'POST' && /\/diaria\/\d+\/cancelar/.test(p)) { const d = diaria.find((x) => x.id === Number(p.split('/')[2])); d.cancelado = b.cancelado === false ? 'False' : 'True'; r = json({ ok: true }); }
  else if (m === 'DELETE' && /^\/diaria\/\d+$/.test(p)) { diaria = diaria.filter((x) => x.id !== Number(p.split('/')[2])); r = json({ ok: true }); }
  else if (m === 'POST' && /\/status\/\d+\/diaria$/.test(p)) {
    const id = Number(p.split('/')[2]); const pr = produtos[b.produto_codigo];
    if (!pr) r = json({ message: 'Produto não encontrado!!!' }, 422);
    else { diaria.push(mk(id, pr, b.hora, 0, b.qtde_alterada, false, b.id_roteiro, { produto_descricao_expedicao: b.produto_descricao_expedicao, obs: b.obs })); r = json({ id: seq }, 201); }
  } else r = json({ ok: true, criados: 0, atualizados: 0, removidos: 0, atualizadosCount: 0, falhas: [], verificados: status.length });
  return delay(r);
};
}
