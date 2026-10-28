import { invalid, notFound } from '../errors.js';
import { codigoMunicipio } from './municipios.js';

/**
 * Port de geraFatura (unit u_nfe_fatura): gera a NF-e PENDENTE (tb_nfe, tb_nfe_detalhes, tb_nfe_itens)
 * e a receita (tb_receita) a partir de uma ou mais comandas, e marca as comandas como FATURADO.
 * Roda dentro da transação do chamador (tudo ou nada; o Delphi gravava passo a passo sem transação).
 */

const UF_IBGE = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17', MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26',
  AL: '27', SE: '28', BA: '29', MG: '31', ES: '32', RJ: '33', SP: '35', PR: '41', SC: '42', RS: '43', MS: '50', MT: '51', GO: '52', DF: '53',
};
export const ufIbge = (uf) => UF_IBGE[String(uf ?? '').trim().toUpperCase()] ?? '0';

/** truncate(x, 3) do MySQL (para zero). */
export const trunc3 = (n) => Math.trunc(Number(n) * 1000 + (Number(n) < 0 ? -1e-9 : 1e-9)) / 1000;
const r6 = (n) => Math.round(Number(n) * 1e6) / 1e6;
/** Z() do Delphi, sem o bug de apagar o primeiro ".0" ("10.05" virava "105"). */
export const num = (s) => { const n = Number(String(s ?? '').trim().replace(',', '.')); return Number.isFinite(n) ? n : 0; };
export const limpaMask = (t) => { const s = String(t ?? '').replace(/[./-]/g, ''); return s === '' ? '0' : s; };
export const fone = (t) => String(t ?? '').replace(/0XX|[()\- ]/g, '');

export function cfopDoCliente(uf) {
  return String(uf ?? '').trim() === 'SP'
    ? { codigo: '5102', descricao: 'VENDA NO ESTADO' }
    : { codigo: '6102', descricao: 'VENDA FORA DO ESTADO' };
}

/** Impostos de um item (mesma fórmula do Delphi). base = valor do item. */
export function impostos(base, trib) {
  const red = num(trib?.red_b_c_icms);
  const bIcms = red > 0 ? base - base * (red / 100) : base;
  const aliq = (k) => { const a = num(trib?.[k]); return a > 0 ? a / 100 : 0; };
  return {
    red, bIcms, bc: base,
    icms: bIcms * aliq('aliq_icms'), ipi: base * aliq('aliq_ipi'), pis: base * aliq('aliq_pis'), cofins: base * aliq('aliq_cofins'),
  };
}

/**
 * @param {object} c conexão (dentro de transação)
 * @param {{comandas:number[], idCliente:number, idUnidade:number, saida:string, usuario?:string, agora?:Date}} p saida = 'YYYY-MM-DD'
 * @returns {Promise<{id:number}>}
 */
let tamUsuario;
/** Cabe o nome do usuário na coluna (o tamanho é lido do banco uma vez; sem leitura, assume 10). */
export async function usuarioNfe(c, nome) {
  if (tamUsuario === undefined) {
    try { const [[r]] = await c.query("select character_maximum_length n from information_schema.columns where table_schema = database() and table_name = 'tb_nfe' and column_name = 'usuario_autorizacao_nfe'"); tamUsuario = Number(r?.n) || 10; } catch { tamUsuario = 10; }
  }
  return String(nome ?? '').trim().toUpperCase().slice(0, tamUsuario);
}
export async function geraFatura(c, { comandas, idCliente, idUnidade, saida, usuario = '', agora = new Date() }) {
  if (!comandas?.length) throw invalid('Nenhuma comanda informada.');
  const [[cli]] = await c.query('select * from tb_clientes where id = ?', [idCliente]);
  if (!cli) throw notFound('Cliente');
  const [[uni]] = await c.query('select * from tb_unidades where id = ?', [idUnidade]);
  if (!uni) throw notFound('Unidade');
  const [[cfg]] = await c.query('select * from tb_nfe_config limit 1');

  const [itens] = await c.query(
    `select *, truncate(truncate(preco,3)*truncate(qtde/preco_cada,3),3) as vritem, truncate(preco,3) as new_preco, truncate(qtde/preco_cada,3) as new_qtde
       from tb_comandas_itens where id_comanda in (?)`, [comandas]);
  if (!itens.length) throw invalid('Não há itens para emissão da NF.');

  const pad = (n) => String(n).padStart(2, '0');
  const dt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const [ins] = await c.query('insert into tb_nfe set data_geracao = ?', [`${dt(agora)} ${pad(agora.getHours())}:${pad(agora.getMinutes())}:${pad(agora.getSeconds())}`]);
  const idNfe = ins.insertId;

  for (const i of itens) {
    await c.query('insert into tb_nfe_detalhes set ?', [{
      id_nfe: idNfe, id_comanda: i.id_comanda, id_produto: i.id_produto, produto_codigo: i.produto_codigo, descricao: i.descricao_generica,
      id_pedido: 0, preco: i.new_preco, preco_total: i.vritem, qtde: i.new_qtde, peso: i.qtde, peso_total: 0, un: 'PC',
    }]);
  }
  await c.query('update tb_comandas set id_nfe = ?, id_nota_fiscal = ? where id in (?)', [idNfe, idNfe, comandas]);

  // itens da nota: agrupados por descrição + preço (group by d.descricao, d.preco)
  const [det] = await c.query(
    `select d.*, p.ncm from tb_nfe_detalhes d left join tb_produtos p on p.id = d.id_produto where d.id_nfe = ? order by d.id`, [idNfe]);
  const grupos = new Map();
  for (const d of det) {
    const k = `${d.descricao}\u0000${trunc3(d.preco)}`;
    const g = grupos.get(k) ?? { base: d, vr: 0, qt: 0 };
    g.vr += trunc3(d.qtde) * trunc3(d.preco); g.qt += trunc3(d.qtde);
    grupos.set(k, g);
  }
  const tot = { bIcms: 0, bc: 0, icms: 0, ipi: 0, pis: 0, cofins: 0 };
  let v = 0;
  for (const g of grupos.values()) {
    const d = g.base; const vr = trunc3(g.vr); const qt = trunc3(g.qt);
    const [[pro]] = await c.query('select id, ncm, descricao, id_tributos from tb_produtos where codigo = ? limit 1', [d.produto_codigo]);
    const [[trib]] = pro ? await c.query('select * from tb_tributos where id = ?', [pro.id_tributos]) : [[null]];
    const t = impostos(vr, trib);
    for (const k of Object.keys(tot)) tot[k] += t[k];
    await c.query('insert into tb_nfe_itens set ?', [{
      id_nfe: idNfe, produto_codigo: d.produto_codigo, id_tributo: pro?.id_tributos ?? 0, id_produto: pro?.id ?? 0,
      produto_descricao: d.descricao || ' ', situacao_tributaria: trib?.sit_trib ?? '', cfop_cst_icms: trib?.sit_trib ?? '', id_pedido: 0,
      preco: trunc3(d.preco), preco_total: vr, qtde: qt, peso: qt, peso_total: 0, produto_ncm: limpaMask(pro?.ncm), un: 'PC',
      icms_base_calculo: r6(t.bIcms), valor_bc_pis_cofins: r6(t.bc), icms_red_base_calculo: t.red, icms_aliquota: num(trib?.aliq_icms),
      icms_valor: r6(t.icms), pis_aliquota: num(trib?.aliq_pis), pis_valor: r6(t.pis), cofins_aliquota: num(trib?.aliq_cofins),
      cofins_valor: r6(t.cofins), valor_trib_prod: r6(t.pis + t.cofins + t.icms),
    }]);
    v += vr;
  }

  const cfop = cfopDoCliente(cli.uf);
  const par = (a, b) => (a ? a : b);
  const infAdFisco = [cli.informacoes_nf1, cli.informacoes_nf2].map((x) => (x ? `${x};` : '')).join('')
    + `Entrega: ${uni.nome};${uni.endereco}, ${uni.numero} - ${uni.bairro};${uni.cidade}/${uni.uf} CEP:${uni.cep}`;
  // sem o código do município a SEFAZ rejeita a NF-e: melhor recusar agora do que gravar "0" (o Delphi gravava 0)
  const cidIbge = codigoMunicipio(cli.uf, cli.cidade);
  if (!cidIbge) throw invalid(`Município "${cli.cidade}/${cli.uf}" não encontrado na tabela do IBGE. Corrija a cidade/UF no cadastro do cliente.`);
  const saidaHora = new Date(agora.getTime() + 3 * 3600 * 1000); // IncHour(time, 3) do Delphi
  const hora = `${pad(saidaHora.getHours())}:${pad(saidaHora.getMinutes())}:${pad(saidaHora.getSeconds())}`;

  await c.query('update tb_nfe set ? where id = ?', [{
    nfe_serie: '001', nfe_modelo: '55', status: '0', status_e: 'PENDENTE', forma_pagamento: '01', movimento_es: '1', id_faturamento: 1,
    volume_marca: 'LEVPAO', volume_qtde: 1, volume_numero: '1', volume_especie: 'CAIXA', faturamento_descricao: 'A VISTA',
    cfop_codigo: cfop.codigo, cfop_descricao: cfop.descricao, csosn: '',
    transportadora_veiculo_placa: par(uni.veiculo_placa, cfg?.veiculo_placa ?? ''), transportadora_veiculo_uf: par(uni.veiculo_uf, cfg?.veiculo_uf ?? ''),
    id_cliente: idCliente, id_unidade: idUnidade, cliente_pessoa: String(cli.pessoa ?? '').slice(0, 1), cliente_razao_social: cli.razao_social,
    cliente_pedido: String(uni.nome ?? '').slice(0, 15), frete_tipo: '3',
    cliente_endereco: cli.endereco, cliente_endereco_numero: cli.endereco_numero, cliente_bairro: cli.bairro, cliente_cidade: cli.cidade,
    cliente_cidade_ibge: cidIbge, cliente_uf: cli.uf, cliente_uf_ibge: ufIbge(cli.uf), cliente_cep: cli.cep, cliente_fone: fone(cli.fone),
    cliente_cnpj: limpaMask(cli.cnpj), cliente_ie: cli.ie,
    entrega_endereco: cli.endereco, entrega_numero: cli.endereco_numero, entrega_complemento: uni.complemento, entrega_bairro: cli.bairro,
    entrega_cidade: cli.cidade, entrega_cidade_ibge: cidIbge, entrega_uf: cli.uf, entrega_uf_ibge: ufIbge(cli.uf), entrega_cep: cli.cep,
    entrega_cnpj: cli.cnpj, entrega_ie: cli.ie, entrega_fone: fone(cli.fone),
    data_emissao: dt(agora), hora_saida: hora, data_saida: saida, texto_corpo: infAdFisco,
    usuario_autorizacao_nfe: await usuarioNfe(c, usuario),
    peso_liquido: r6(v / 10), peso_bruto: r6(v / 10 + v / 100), valor_produtos: r6(v), comandas_faturadas: comandas.join(','), nf_valor_total: r6(v),
    icms_valor_base: r6(tot.bIcms), valor_bc_pis_cofins: r6(tot.bc), icms_valor: r6(tot.icms), ipi_valor: r6(tot.ipi), pis_valor: r6(tot.pis),
    cofins_valor: r6(tot.cofins), valor_trib: r6(tot.icms + tot.ipi + tot.pis + tot.cofins),
  }, idNfe]);

  const venc = new Date(`${saida}T12:00:00`); venc.setDate(venc.getDate() + Number(cli.dias_vencto || 0));
  await c.query('insert into tb_receita set id_nfe = ?, documento = ?, id_cliente = ?, id_unidade = ?, valor = ?, emissao = now(), vencto = ?',
    [idNfe, `${idNfe}/1`, idCliente, idUnidade, r6(v), dt(venc)]);
  await c.query("update tb_comandas set status = 'FATURADO' where id in (?)", [comandas]);
  return { id: idNfe };
}
