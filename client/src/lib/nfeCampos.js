// Definições puras da tela de NFe (u_nfe_faturamento): linhas do cxDBVerticalGrid1, cores da grade e conversões.

/** Cores da grade (GridNFCustomDrawCell): status → [fundo, fonte, fundo selecionado, fonte selecionada]. $00BBGGRR → #RRGGBB */
export const COR_STATUS = {
  PENDENTE: ['#ffff00', '#ff0000', '#ffd700', '#000000'],
  AUTORIZADA: ['#008000', '#ffffff', '#00a000', '#000000'],
  CANCELADA: ['#a9a9a9', '#000000', '#878787', '#ffffff'],
  DEVOLVIDO: ['#3e3e3e', '#ffffff', '#696969', '#ffffff'],
  REJEITADA: ['#ff0000', '#000000', '#ff0000', '#000000'],
};
export const corLinha = (status, selecionada) => {
  const c = COR_STATUS[status];
  if (!c) return null;
  return selecionada ? { background: c[2], color: c[3] } : { background: c[0], color: c[1] };
};

/**
 * "Impresso"/"e-mail enviado" gravados pelo sistema antigo podem vir em formatos variados (True, 1, S, SIM, IMPRESSO, uma data/hora, bit…).
 * Vale como marcado tudo que não for vazio nem uma negação explícita.
 */
export const foiMarcado = (v) => {
  if (v == null) return false;
  if (typeof v === 'object') { if (Array.isArray(v.data)) return v.data.some(Boolean); return v instanceof Date; }
  const t = String(v).trim().toLowerCase();
  if (t === '' || ['false', '0', 'n', 'nao', 'não', 'falso', 'null', 'nenhum', '0000-00-00', '0000-00-00 00:00:00', '30/12/1899'].includes(t)) return false;
  return true;
};

/** Campos booleanos do legado vêm como texto ('True'/'False'), 1/0 ou S/N. */
export const temMarca = (v) => ['true', '1', 'sim', 's', 'verdadeiro', 'x'].includes(String(v ?? '').trim().toLowerCase());

/** "1.234,56" → 1234.56 ; vazio → null ; inválido → NaN */
export const parseBr = (t) => {
  const s = String(t ?? '').trim();
  if (s === '') return null;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : NaN;
};
export const fmtBr = (n, min = 2, max = min) => (n === null || n === undefined || n === '' || Number.isNaN(Number(n)) ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max }));

/** BitBtn3: alterna entre "hoje" e "mês corrente". */
export function alternaPeriodo(d1, d2, hoje) {
  const [a, m] = hoje.split('-').map(Number);
  if (d1 === hoje && d2 === hoje) {
    const ultimo = new Date(a, m, 0).getDate();
    const p = (n) => String(n).padStart(2, '0');
    return [`${a}-${p(m)}-01`, `${a}-${p(m)}-${p(ultimo)}`];
  }
  return [hoje, hoje];
}

/**
 * Linhas do cxDBVerticalGrid1 ("Dados do corpo da NFE"), na ordem do DFM.
 * [campo, rótulo, tipo]  — tipo: txt (padrão) | num | rom (valor calculado, só leitura) | ro | date | time | chk | memo | memo-ro | mov
 * ['#', 'Título']  = categoria (cxCategoryRow)
 */
export const CORPO_LINHAS = [
  ['id', 'ID (Automático)', 'ro'], ['condicao_pedido', 'Condição do pedido'], ['data_emissao', 'Data de Emissão', 'date'],
  ['cfop_codigo', 'CFOP'], ['cfop_descricao', 'Descrição do CFOP'],
  ['#', 'Dados do Destinatário'],
  ['cliente_pessoa', 'Pessoa'], ['cliente_razao_social', 'Razão Social'], ['cliente_nome_fantasia', 'Nome Fantasia'], ['cliente_cnpj', 'CNPJ'], ['cliente_endereco', 'Endereço'], ['cliente_endereco_numero', 'Número'],
  ['cliente_bairro', 'Bairro'], ['cliente_cidade', 'Município'], ['cliente_cidade_ibge', 'IBGE do município'], ['cliente_uf', 'UF'], ['cliente_uf_ibge', 'IBGE da UF'], ['cliente_cep', 'Cep'],
  ['cliente_im', 'Inscrição Municipal'], ['cliente_ie', 'Inscrição Estadual'], ['cliente_ddd', 'DDD'], ['cliente_fone', 'Telefone'], ['substituicao_tributaria_ie', 'I.E da Substituição Tributaria'],
  ['cliente_uf_icms', 'ICMS', 'num'], ['cliente_pedido', 'Referência'],
  ['#', 'Valores/Pagamento'],
  ['forma_pagamento', 'Forma de Pagamento'], ['frete_valor', 'Valor do Frete', 'num'], ['seguro_valor', 'Valor do Seguro', 'num'],
  ['#', 'Tributos'],
  ['icms_valor_base', 'BC de ICMS', 'rom'], ['icms_valor', 'Valor ICMS', 'rom'], ['ipi_valor', 'Valor do IPI', 'rom'], ['valor_bc_pis_cofins', 'BC PIS E COFINS', 'rom'], ['pis_valor', 'Valor PIS', 'rom'], ['cofins_valor', 'Valor COFINS', 'rom'],
  ['#', 'Tributos Substituição'],
  ['substituicao_tributaria_valor', 'Valor de Subst. Tribut.', 'num'], ['substituicao_tributaria_valor_base', 'Valor Base de Subst. Tribut.', 'num'], ['substituicao_tributaria_aliquota', 'Aliquota de Subst. Tribut.', 'num'],
  ['valor_trib', 'Valor total dos tributos', 'rom'], ['faturamento_id', 'Faturamento ID'], ['venda_avista_aprazo', 'Tipo da venda'], ['valor_produtos', 'Valor do(s) Produto(s)', 'rom'],
  ['valor_descontos', 'Valor do Desconto', 'num'], ['nf_valor_total', 'Valor total da NF', 'rom'], ['despesas_acessorias', 'Despesas acessoriais', 'num'], ['valor_extenso', 'Valor por extenso'],
  ['substituicao_tributaria', 'Subst. Tribut.', 'chk'], ['servicos_valor', 'Valor do Serviço', 'num'], ['iss_aliquota', 'Aliquota de ISS', 'num'], ['iss_valor', 'Valor de ISS', 'num'],
  ['#', 'Frete/Transportadora'],
  ['frete_tipo', 'Tipo do frete'], ['transportadora_nome', 'Nome'], ['transportadora_endereco', 'Endereço'], ['transportadora_cidade', 'Município'], ['transportadora_cidade_ibge', 'IBGE'], ['transportadora_uf', 'UF'],
  ['transportadora_uf_ibge', 'IBGE'], ['transportadora_ie', 'Inscrição Estadual'], ['transportadora_cnpj', 'CNPJ'], ['transportadora_rntc', 'RNTC'],
  ['#', 'Informações fiscais'],
  ['permite_reaproveitamento_icms', 'Permite Reaprov. de ICMS?', 'chk'], ['aliquota_reaproveitamento_icms', 'Aliquota de Reaprov. de ICMS', 'num'],
  ['#', 'Dados complementares'],
  ['faturamento_descricao', 'Descrição do Faturamento'], ['id_fatura', 'Fatura (ID)'],
  ['#', 'Endereço de entrega'],
  ['entrega_endereco', 'Endereço'], ['entrega_numero', 'Número'], ['entrega_complemento', 'Complemento'], ['entrega_bairro', 'Bairro'], ['entrega_cidade', 'Municipio'], ['entrega_cidade_ibge', 'IBGE'], ['entrega_uf', 'UF'],
  ['entrega_uf_ibge', 'IBGE'], ['entrega_cep', 'Cep'], ['entrega_cnpj', 'CNPJ'], ['entrega_ie', 'Inscrição Estadual'], ['entrega_ddd', 'DDD'], ['entrega_fone', 'Telefone'],
  ['#', 'NF-e'],
  ['nfe_numero', 'Número', 'ro'], ['nfe_modelo', 'Modelo'], ['nfe_serie', 'Série'], ['nfe_chave', 'Chave NF-e', 'ro'], ['nfe_xml_file', 'Arquivo XML', 'ro'], ['nfe_pdf_file', 'Arquivo PDF (Danfe)', 'ro'],
  ['nfe_protocolo', 'Protocolo', 'ro'], ['nfe_recibo', 'Recibo', 'ro'], ['nfe_cancelamento_justificativa', 'Justificativa de Cancelamento', 'memo-ro'], ['csosn', 'CSOSN (Cód Sit Op S.Nac)'],
  ['#', 'Final'],
  ['volume_qtde', 'Qtde do Volume', 'num'], ['volume_numero', 'Número do volume'], ['volume_especie', 'Espécie'], ['volume_marca', 'Marca do Volume'], ['texto_corpo', 'Informações adicionais', 'memo'],
  ['peso_bruto', 'Peso Bruto', 'num'], ['peso_liquido', 'Peso Liquído', 'num'], ['status_e', 'Status', 'ro'], ['movimento_es', 'Entrada/Saída', 'mov'],
];

/** Linhas do cxDBVerticalGrid2 (NFe Referência, tb_nfe_referencia) */
export const REF_LINHAS = [
  ['refNFE', 'refNFE (Chave)'], ['tipo', 'tipo'], ['cUF', 'cUF'], ['AAMM', 'AAMM'], ['cnpj', 'cnpj'], ['fld_mod', 'mod'], ['serie', 'serie'], ['nNF', 'nNF'],
  ['cnpjcpf', 'cnpjcpf'], ['IE', 'IE'], ['refCTe', 'refCTe'], ['modECF', 'modECF'], ['nECF', 'nECF'], ['nCOO', 'nCOO'],
];

/** Colunas visíveis da GridNFe: [campo, título, tipo, largura] */
export const GRADE_COLS = [
  ['cfop_codigo', 'CFOP', '', 48], ['status_e', 'Status', '', 82], ['nfe_impresso', 'Imp', 'chk', 40], ['nfe_email_enviado', 'Email', 'chk', 44], ['nfe_numero', 'Nº NFe', '', 58],
  ['data_emissao', 'Emissão', 'd', 78], ['data_saida', 'Saída', 'd', 78], ['nfe_protocolo_data_hora', 'Autorização', '', 140], ['cliente_pedido', 'Referência', '', 190],
  ['nf_valor_total', 'Valor da NF', 'm', 92], ['usuario_autorizacao_nfe', 'Usuário', '', 70], ['comandas_faturadas', 'Comanda', '', 90],
];
/** Colunas da grade de itens (GriITENS) */
export const ITEM_COLS = [
  ['produto_codigo', 'Código do item', '', 90], ['produto_descricao', 'Descrição do item', '', 230], ['un', 'Un.', '', 34], ['preco', 'Preço unitário', 'p', 90],
  ['qtde', 'Qtde.', 'q', 80], ['preco_total', 'Valor do item', 'v', 90], ['produto_ncm', 'NCM', '', 80], ['ordem_compra', 'Ord. Compra', '', 90], ['item', 'Item', '', 50], ['id_tributo', 'Tributos', '', 60],
];
