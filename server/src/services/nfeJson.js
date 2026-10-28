import { codigoMunicipio } from './municipios.js';
import { limpaMask } from './geraFatura.js';

/**
 * Monta o JSON da API de NF-e a partir de tb_nfe (+ itens) e tb_nfe_config (emitente).
 * Substitui ModeloIniNFe (INI do ACBrMonitor). Função pura: devolve { json, erros } e não toca em banco/rede.
 */
const dig = (s) => String(s ?? '').replace(/\D/g, '');
const txt = (s) => String(s ?? '').trim();
const n = (v) => { const x = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
/** Inscrição estadual para o XSD: só dígitos (sem máscara); "ISENTO" é mantido. */
export const ieLimpa = (v) => { const t = txt(v); return /isento/i.test(t) ? 'ISENTO' : dig(t); };
const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

/** CST/CSOSN no formato que a SEFAZ espera: "20.0" / "20,00" / 20 → "20"; "0" → "00"; CSOSN de 3 dígitos ("102") fica como está. */
export const normalizaCst = (v) => {
  const t = txt(v).replace(/\s/g, '');
  const m = /^(\d+)(?:[.,]0*)?$/.exec(t);
  return m ? (m[1].length <= 2 ? m[1].padStart(2, '0') : m[1]) : t;
};
// Devolução: o CFOP indica a finalidade 4 (devolução de mercadoria), que exige a chave da NF-e original em documentosReferenciados.
const CFOP_DEVOLUCAO = /^(1201|1202|1208|1209|1410|1411|1503|1504|1553|1555|1660|1661|1662|1918|1919|2201|2202|2208|2209|2410|2411|2503|2504|2553|2555|2660|2661|2662|2918|2919|5201|5202|5208|5209|5410|5411|5503|5504|5553|5555|5660|5661|5662|5918|5919|6201|6202|6208|6209|6410|6411|6503|6504|6553|6555|6660|6661|6662|6918|6919)$/;
export const ehDevolucao = (nfe) => CFOP_DEVOLUCAO.test(txt(nfe?.cfop_codigo));
const chavesDe = (refs) => [...new Set((refs ?? []).map((r) => dig(r.refNFe)).filter((c) => c.length === 44))];
// CST de PIS/COFINS: 01/02 = tributado por alíquota (PISAliq); 03 = por quantidade (sem suporte na API); 04–09 = não tributado (PISNT); demais = outras operações (PISOutr)
const grupoPisCofins = (cst) => (['01', '02'].includes(cst) ? 'aliq' : cst === '03' ? 'qtde' : ['04', '05', '06', '07', '08', '09'].includes(cst) ? 'nt' : 'outr');

export const regimeDoCrt = (crt) => {
  const t = txt(crt).toUpperCase();
  if (/^[1-4]$/.test(t)) return Number(t);
  if (t.startsWith('SIMPLES EXCESSO')) return 2;
  if (t.startsWith('SIMPLES')) return 1;
  if (t.startsWith('MEI')) return 4;
  if (t.startsWith('REGIME NORMAL')) return 3;
  return 0;
};
export const modalidadeFrete = (v) => { const m = txt(v).match(/^[0-9]/); return m ? Number(m[0]) : 9; };

/** Validações do btnCriarEnviar/AutorizarNFe do Delphi (+ as que a API exige) – devolve lista de mensagens. */
export function validaParaAutorizar(nfe, itens, cfg, { vencimentos = [], hoje = new Date(), referencias = [] } = {}) {
  const e = [];
  const simplesNota = [1, 2].includes(regimeDoCrt(cfg?.nfe_crt));
  if (ehDevolucao(nfe) && !chavesDe(referencias).length) e.push('Devolução (CFOP ' + txt(nfe.cfop_codigo) + ') exige a chave (44 dígitos) da NF-e original na seção "NFe referenciada" da nota (o sistema tenta achá-la sozinho pelo número citado no texto da devolução).');
  if (!itens.length) e.push('A nota não tem itens.');
  if (!codigoMunicipio(nfe.entrega_uf, nfe.entrega_cidade)) e.push(`Código IBGE ??? (${nfe.entrega_cidade}/${nfe.entrega_uf})`);
  if (!txt(nfe.forma_pagamento)) e.push('Forma de pagamento não informada.');
  if (!txt(nfe.volume_especie) || !txt(nfe.volume_numero) || !txt(nfe.volume_marca) || !n(nfe.volume_qtde) || !n(nfe.peso_liquido) || !n(nfe.peso_bruto)) {
    e.push('Existem campos no rodapé da nota fiscal que não foram preenchidos!');
  }
  const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  if (txt(nfe.cfop_codigo) === '5102' && vencimentos.some((v) => String(v) < hojeIso)) e.push('Data de vencto da duplicata é menor que a data de emissão!');
  if (dig(cfg?.cnpj).length !== 14) e.push('CNPJ do emitente (tb_nfe_config) inválido.');
  if (!regimeDoCrt(cfg?.nfe_crt)) e.push('Regime tributário (CRT) do emitente não informado em tb_nfe_config.');
  if (!txt(cfg?.razao)) e.push('Razão social do emitente não informada em tb_nfe_config.');
  const doc = dig(nfe.cliente_cnpj);
  if (doc.length !== 14 && doc.length !== 11) e.push('CNPJ/CPF do destinatário inválido.');
  if (!txt(nfe.cliente_razao_social)) e.push('Razão social do destinatário não informada.');
  for (const [i, it] of itens.entries()) {
    if (dig(it.produto_ncm).length !== 8) e.push(`Item ${i + 1} (${it.produto_codigo}): NCM inválido.`);
    if (!n(it.qtde) || !n(it.preco)) e.push(`Item ${i + 1} (${it.produto_codigo}): quantidade/preço zerado.`);
    const rot = `Item ${i + 1} (${it.produto_codigo})`;
    if (dig(it.cClassTrib).length > 6) e.push(`${rot}: cClassTrib "${dig(it.cClassTrib)}" tem ${dig(it.cClassTrib).length} dígitos, mas o correto tem 6 (ex.: 200003). Corrija no Código de tributação do produto.`);
    else if (CST_IBS_REDUZIDO.has(dig(it.cst)) && reducaoIbs(dig(it.cst), dig(it.cClassTrib).padStart(6, '0')) === undefined) e.push(`${rot}: IBS/CBS CST ${dig(it.cst)} (alíquota reduzida) com classificação ${dig(it.cClassTrib).padStart(6, '0')}: o percentual de redução dessa classificação ainda não está cadastrado no sistema (SEFAZ exige o grupo de redução, erro 1033).`);
    if (!txt(it.cst) || !txt(it.cClassTrib)) e.push(`${rot}: IBS/CBS — informe CST e cClassTrib no código de tributação do produto (a SEFAZ rejeita a nota sem o grupo IBSCBS, erro 1115).`);
    const cstP = normalizaCst(it.cfop_cst_pis) || normalizaCst(cfg?.cst_pis_cofins) || '07';
    const cstC = normalizaCst(it.cfop_cst_cofins) || normalizaCst(cfg?.cst_pis_cofins) || '07';
    if (cstP === '03' || cstC === '03') e.push(`${rot}: CST 03 de PIS/COFINS (por quantidade) não é suportado pela API de NF-e.`);
    if (!simplesNota) {
      const cstI = normalizaCst(it.cfop_cst_icms) || normalizaCst(it.situacao_tributaria) || '00';
      const total = n(it.preco_total) || n(it.qtde) * n(it.preco);
      const [al, base, val] = [n(it.icms_aliquota), n(it.icms_base_calculo), n(it.icms_valor)];
      if (cstI === '20') {
        // base reduzida: tem de ser MENOR que o valor do item (a API deriva o percentual); com pRedBC no cadastro do tributo, base/valor são recalculados
        if (!(n(it.red_aliq) > 0) && !(base > 0 && base < total)) e.push(`${rot}: CST 20 (redução de base) — informe o percentual de redução no código de tributação do produto ou uma base de ICMS menor que o valor do item (${total.toFixed(2)}); base atual ${base.toFixed(2)}.`);
      } else
      if (al > 0 && base > 0) {
        if (base > total + 0.02) e.push(`${rot}: base de ICMS (${base.toFixed(2)}) maior que o valor do item (${total.toFixed(2)}). Confira base e valor do ICMS.`);
        if (Math.abs(r2(base * al / 100) - val) > 0.02) e.push(`${rot}: ICMS ${val.toFixed(2)} difere de base × alíquota (${base.toFixed(2)} × ${al}% = ${r2(base * al / 100).toFixed(2)}).`);
      }
    }
  }
  return e;
}

/**
 * @param {object} nfe linha de tb_nfe  @param {object[]} itens linhas de tb_nfe_itens
 * @param {object} cfg linha de tb_nfe_config  @param {{numero:number, ibsCbs?:boolean}} o
 */
/** Data/hora atual em Brasília no formato ISO com offset (ex.: 2026-10-22T14:09:33-03:00). */
export function agoraBrasilia(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}-03:00`;
}
const gtinValido = (v) => { const d = String(v ?? '').replace(/\D/g, ''); return [8, 12, 13, 14].includes(d.length) ? d : 'SEM GTIN'; };

/** Percentual de redução de alíquota do IBS/CBS por classificação tributária (LC 214/2025). */
const RED_IBS = { '200003': 100 };
const CST_IBS_REDUZIDO = new Set(['200', '210']);
export const reducaoIbs = (cst, cClass) => (CST_IBS_REDUZIDO.has(String(cst)) ? RED_IBS[String(cClass)] : undefined);

/** Preenche o grupo de redução de alíquota (SEFAZ 1033) usando os nomes de campo do schema da API (`folhas`). Devolve o que não achou. */
export function aplicaReducaoIbs(json, folhas) {
  const faltou = [];
  if (!folhas?.length) { // sem swagger: nomes documentados pela API (ReducaoAliquotaIbsUf, AliquotaEfetivaIbsUf, ReducaoAliquotaCbs, AliquotaEfetivaCbs)
    for (const it of json.itens ?? []) {
      const g = it.ibsCbs; const red = g ? reducaoIbs(g.cst, g.classificacaoTributaria) : undefined; if (red === undefined) continue;
      const ef = (nominal) => Math.round(nominal * (100 - red)) / 100;
      Object.assign(g, { reducaoAliquotaIbsUf: red, aliquotaEfetivaIbsUf: ef(g.aliquotaIbsUf), reducaoAliquotaCbs: red, aliquotaEfetivaCbs: ef(g.aliquotaCbs) });
    }
    return faltou;
  }
  const ach = (...res) => folhas.find((f) => { const n = f.caminho.join('.'); return res.every((r) => r.test(n)); });
  const poe = (o, caminho, v) => { let a = o; caminho.slice(0, -1).forEach((k) => { a = a[k] ??= {}; }); a[caminho.at(-1)] = v; };
  for (const it of json.itens ?? []) {
    const g = it.ibsCbs; if (!g) continue;
    const red = reducaoIbs(g.cst, g.classificacaoTributaria); if (red === undefined) continue;
    const alvos = [['Uf', /(uf|estad)/i, g.aliquotaIbsUf], ['Cbs', /cbs/i, g.aliquotaCbs]];
    for (const [rot, re, nominal] of alvos) {
      const pRed = ach(re, /red/i, /(perc|aliq|^p)/i) ?? ach(re, /red/i);
      const pEf = ach(re, /efet/i);
      if (pRed) poe(g, pRed.caminho, red); else faltou.push(`redução ${rot}`);
      if (pEf) poe(g, pEf.caminho, Math.round(nominal * (100 - red)) / 100); else faltou.push(`alíquota efetiva ${rot}`);
    }
  }
  return [...new Set(faltou)];
}

/** CFOP do item: o do item, se houver; senão o da nota. */
export function cfopDoItem(it, nfe) {
  const ok = (x) => { const d = dig(x); return d.length === 4 && d !== '0000' ? d : ''; };
  return ok(it?.cfop_codigo) || ok(nfe?.cfop_codigo);
}

/** Telefone para o XML: só dígitos, 6 a 14 (schema da SEFAZ). Fora disso (ex.: dois números juntos no cadastro) é omitido para não dar "Falha no Schema XML". */
export const fone = (v) => { const d = String(v ?? '').replace(/\D/g, '').replace(/^0+/, ''); return d.length >= 6 && d.length <= 14 ? d : undefined; };
export function montaJsonNfe(nfe, itens, cfg, { numero, ibsCbs = true, agora = new Date(), referencias = [], orientacao = 'retrato' } = {}) {
  const regime = regimeDoCrt(cfg.nfe_crt);
  const simples = regime === 1 || regime === 2;
  const ambiente = Number(cfg.nfe_configuracoes_webservice_ambiente) === 1 ? 1 : 2; // 1 produção / 2 homologação
  const ufDest = txt(nfe.cliente_uf).toUpperCase();
  const emitUf = txt(cfg.uf).toUpperCase();
  const doc = dig(nfe.cliente_cnpj);

  const emitente = {
    cnpj: dig(cfg.cnpj), razaoSocial: txt(cfg.razao), nomeFantasia: txt(cfg.fantasia) || undefined,
    inscricaoEstadual: ieLimpa(cfg.ie) || 'ISENTO', inscricaoMunicipal: txt(cfg.im) || undefined, cnaeFiscal: dig(cfg.cnae) || undefined,
    regimeTributario: regime, codigoPais: '1058', nomePais: 'BRASIL', logradouro: txt(cfg.endereco), numero: txt(cfg.endereco_numero) || 'S/N', complemento: txt(cfg.endereco_complemento) || undefined,
    bairro: txt(cfg.bairro), codigoMunicipio: codigoMunicipio(emitUf, cfg.cidade) ?? '', nomeMunicipio: txt(cfg.cidade), uf: emitUf, cep: dig(cfg.cep),
    telefone: fone(`${cfg.ddd ?? ''}${cfg.fones ?? ''}`),
  };

  const destinatario = {
    documento: doc, nome: txt(nfe.cliente_razao_social),
    email: txt(nfe.cliente_email) || undefined, indicadorIe: dig(nfe.cliente_ie) ? 1 : 9, inscricaoEstadual: dig(nfe.cliente_ie) ? dig(nfe.cliente_ie) : undefined,
    logradouro: txt(nfe.entrega_endereco || nfe.cliente_endereco), numero: txt(nfe.entrega_numero || nfe.cliente_endereco_numero) || 'S/N',
    complemento: txt(nfe.entrega_complemento) || undefined, bairro: txt(nfe.entrega_bairro || nfe.cliente_bairro),
    codigoMunicipio: codigoMunicipio(nfe.entrega_uf || ufDest, nfe.entrega_cidade || nfe.cliente_cidade) ?? '',
    nomeMunicipio: txt(nfe.entrega_cidade || nfe.cliente_cidade), uf: txt(nfe.entrega_uf || ufDest).toUpperCase(), cep: dig(nfe.entrega_cep || nfe.cliente_cep),
    telefone: fone(`${nfe.cliente_ddd ?? ''}${nfe.cliente_fone ?? ''}`),
  };

  const cstIcmsNota = txt(nfe.csosn) || txt(cfg.csosn);
  const itensJson = itens.map((it) => {
    const qtd = Math.round(n(it.qtde) * 1000) / 1000;
    const vun = Math.round(n(it.preco) * 1000) / 1000;
    const cst = simples ? (normalizaCst(cstIcmsNota) || '102') : (normalizaCst(it.cfop_cst_icms) || normalizaCst(it.situacao_tributaria) || '00');
    const o = {
      codigo: txt(it.produto_codigo), descricao: txt(it.produto_descricao), gtin: gtinValido(it.produto_ean), ncm: dig(it.produto_ncm),
      cBenef: txt(it.cBenef) || undefined, cfop: cfopDoItem(it, nfe),
      unidadeComercial: txt(it.un) || 'UN', quantidade: qtd, valorUnitario: vun, valorBruto: r2(n(it.preco_total) || qtd * vun),
      origemMercadoria: 0, cstIcms: cst, ...(simples ? { aliquotaIcms: 0 } : {}),
      cstPis: normalizaCst(it.cfop_cst_pis) || normalizaCst(cfg.cst_pis_cofins) || '07', cstCofins: normalizaCst(it.cfop_cst_cofins) || normalizaCst(cfg.cst_pis_cofins) || '07',
    };
    // PIS/COFINS: a API gera PISAliq (CST 01/02) ou PISOutr (49, 50–56, 60–67, 70–75, 98, 99) a partir destes campos; os não enviados saem 0
    for (const [tri, cstT, pre] of [['Pis', o.cstPis, 'pis'], ['Cofins', o.cstCofins, 'cofins']]) {
      if (['aliq', 'outr'].includes(grupoPisCofins(cstT))) {
        const al = n(it[`${pre}_aliquota`]); const base = al > 0 ? r2(n(it.valor_bc_pis_cofins) || o.valorBruto) : 0;
        o[`baseCalculo${tri}`] = base; o[`aliquota${tri}`] = al; o[`valor${tri}`] = al > 0 ? r2(n(it[`${pre}_valor`]) || (base * al) / 100) : 0;
      }
    }
    if (!simples && n(it.icms_aliquota) > 0) { o.aliquotaIcms = n(it.icms_aliquota); o.baseCalculoIcms = r2(n(it.icms_base_calculo)); o.valorIcms = r2(n(it.icms_valor)); }
    if (!simples && cst === '20') {
      // ICMS20 (redução de base): a API pede o percentual (percentualReducaoBcIcms). Base e valor são recalculados a partir dele, para não depender de base/valor gravados com erro no item.
      const red = n(it.red_aliq) > 0 ? n(it.red_aliq) : (n(it.icms_base_calculo) > 0 && n(it.icms_base_calculo) < o.valorBruto ? r2((1 - n(it.icms_base_calculo) / o.valorBruto) * 100) : 0);
      if (red > 0) { const al = n(it.icms_aliquota); o.percentualReducaoBcIcms = Math.min(red, 99.99); o.baseCalculoIcms = r2(o.valorBruto * (1 - o.percentualReducaoBcIcms / 100)); o.valorIcms = r2(o.baseCalculoIcms * al / 100); }
    }
    if (ibsCbs && txt(it.cst) && txt(it.cClassTrib)) { // a SEFAZ rejeita (1115) nota sem o grupo IBSCBS; classificação tem 6 dígitos ("1" → "000001")
      o.ibsCbs = { cst: dig(it.cst).padStart(3, '0'), classificacaoTributaria: dig(it.cClassTrib).padStart(6, '0'), aliquotaIbsUf: n(it.pIBS), aliquotaCbs: n(it.pCBS) };
    }
    return o;
  });

  const total = r2(itensJson.reduce((s, i) => s + i.valorBruto, 0));
  const json = {
    configuracao: { ambiente, contingencia: false, orientacaoDanfe: orientacao === 'paisagem' ? 'paisagem' : 'retrato' },
    emitente,
    serie: Number(nfe.nfe_serie) || 1,
    numero,
    dataEmissao: agoraBrasilia(agora),
    dataSaidaEntrada: nfe.data_saida ? `${String(nfe.data_saida).slice(0, 10)}T${String(nfe.hora_saida || '00:00:00').slice(0, 8)}-03:00` : undefined,
    tipoEmissao: 1,
    finalidade: ehDevolucao(nfe) ? 4 : 1,
    modelo: Number(nfe.nfe_modelo) || 55,
    tipoOperacao: String(nfe.movimento_es) === '0' ? 0 : 1,
    destinoOperacao: ufDest && ufDest !== emitUf ? 2 : 1,
    naturezaOperacao: txt(nfe.cfop_descricao) || 'VENDA DE MERCADORIA',
    consumidorFinal: String(process.env.NFE_CONSUMIDOR_FINAL ?? 'true').toLowerCase() !== 'false', // igual ao JSON da outra aplicação; NFE_CONSUMIDOR_FINAL=false para revenda
    indicadorPresenca: Number(process.env.NFE_IND_PRES || 1),
    destinatario,
    itens: itensJson,
    modalidadeFrete: modalidadeFrete(nfe.frete_tipo),
    quantidadeVolumes: n(nfe.volume_qtde) > 0 ? Math.round(n(nfe.volume_qtde)) : undefined,
    especie: txt(nfe.volume_especie) || undefined, marca: txt(nfe.volume_marca) || undefined,
    pesoLiquido: n(nfe.peso_liquido) > 0 ? Math.round(n(nfe.peso_liquido) * 1000) / 1000 : undefined,
    pesoBruto: n(nfe.peso_bruto) > 0 ? Math.round(n(nfe.peso_bruto) * 1000) / 1000 : undefined,
    pagamentos: [{ meio: txt(nfe.forma_pagamento).padStart(2, '0'), valor: txt(nfe.forma_pagamento).padStart(2, '0') === '90' ? 0 : total }], // 90 = sem pagamento: valor 0,00
    informacoesComplementares: txt(nfe.texto_corpo) || undefined,
  };
  const chaves = chavesDe(referencias);
  if (chaves.length) json.documentosReferenciados = chaves.map((chaveNfe) => ({ chaveNfe })); // chave da NF-e original (devolução)
  if (n(nfe.frete_valor) > 0 && json.modalidadeFrete !== 9) json.valorFrete = n(nfe.frete_valor);
  if (n(nfe.despesas_acessorias) > 0) json.outrasDespesas = n(nfe.despesas_acessorias);
  if (txt(nfe.transportadora_nome)) {
    const tdoc = dig(nfe.transportadora_cnpj);
    json.transportadora = {
      ...(tdoc.length === 14 ? { cnpj: tdoc } : tdoc.length === 11 ? { cpf: tdoc } : {}), nome: txt(nfe.transportadora_nome),
      inscricaoEstadual: ieLimpa(nfe.transportadora_ie) || undefined, endereco: txt(nfe.transportadora_endereco) || undefined,
      municipio: txt(nfe.transportadora_cidade) || undefined, uf: txt(nfe.transportadora_uf) || undefined,
    };
  }
  if (txt(nfe.transportadora_veiculo_placa)) {
    json.veiculo = { placa: txt(nfe.transportadora_veiculo_placa).replace(/-/g, ''), uf: txt(nfe.transportadora_veiculo_uf) || undefined, rntc: txt(nfe.transportadora_rntc) || undefined };
  }
  return JSON.parse(JSON.stringify(json)); // remove undefined
}

/** Data/hora no formato que o sistema antigo gravava em nfe_protocolo_data_hora (dd/mm/YYYY HH:MM:SS), em horário de Brasília. */
export function dataHoraBr(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}
export { limpaMask };
