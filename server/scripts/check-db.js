// Uso: npm run check-db
// Testa a conexão e confere se todas as tabelas/colunas usadas pela API existem no banco.
import mysql from 'mysql2/promise';
import { dbConfig, explicaErroDb } from '../src/db.js';

const extras = ['cortado', 'margarina', 'coco', 'acucar', 'plastico', 'papel', 'pacote'].map((e) => `extra_${e}`);
const ESPERADO = {
  tb_status: ['id', 'data', 'id_cliente', 'id_unidade', 'status', 'status_fixa', 'id_comanda'],
  tb_unidades: ['id', 'id_cliente', 'nome', 'ativo', 'telefone', 'contato', 'endereco', 'bairro', 'cep', 'cidade', 'uf', 'verificar_pasta', 'imprimir_toda_programacao', 'tipo_faturamento', 'emite_comanda_diaria', 'quitar_automaticamente', 'id_cliente_comandas', 'id_unidade_comandas', 'codigo'],
  tb_clientes: ['id', 'razao_social', 'programacao_ativo'],
  tb_diaria: ['id', 'conversao_observacoes', 'quitado_manualmente', 'id_produto_conversao', 'etiqueta_adesiva', 'id_status', 'id_programacao_status', 'id_cliente', 'id_unidade', 'id_roteiro', 'data', 'hora',
    'qtde_original', 'qtde_alterada', 'qtde_cobrado', 'qtde_quitado', 'programacao_fixa', 'cancelado',
    'registro_alterado', 'id_produto', 'produto_codigo', 'produto_descricao', 'produto_descricao_original',
    'produto_descricao_reduzida', 'produto_descricao_expedicao', 'referencia_descricao', 'produto_especial',
    'produto_producao', 'producao_data', 'producao_turno', 'produto_preco', 'produto_preco_cada',
    'produto_preco_unitario', 'preco_total', 'cobrado', 'carga', 'acomodacao_carga', 'comandas', 'obs',
    'obs_producao', 'cobrado_obs', 'conversao_id_produto', 'conversao_produto_codigo', 'conversao_produto_descricao', 'conversao_produto_preco', 'conversao_produto_preco_cada', 'conversao_produto_qtde', 'conversao_produto_valor', 'id_comanda', 'notificado_sn', 'quitado_manualmente', 'cobranca_cancelada', 'id_produto_conversao', ...extras],
  tb_fixa: ['id', 'id_cliente', 'id_unidade', 'id_produto', 'id_roteiro', 'semana_dia', 'hora', 'produto_codigo',
    'produto_qtde', 'produto_descricao_expedicao', 'producao_dias', 'producao_turno', 'carga', 'acomodacao_carga',
    'obs', ...extras],
  tb_produtos: ['id', 'codigo', 'descricao', 'descricao_expedicao', 'descricao_reduzida', 'preco', 'divisor_basico',
    'id_referencia', 'produto_producao', 'converter', 'ingredientes', 'validade', ...extras],
  tb_referencias: ['id', 'descricao', 'codigo_referencia', 'produto_especial'],
  tb_roteiro: ['id', 'horario', 'id_funcionario'],
  tb_funcionarios: ['id', 'nome', 'apelido', 'celular'],
  tb_roteiro_distribuicao: ['id_roteiro', 'id_unidade'],
  tb_diaria_log: ['id', 'id_diaria', 'id_usuario', 'data', 'hora', 'log'],
  tb_fixa_log: ['id', 'id_fixa', 'id_usuario', 'data', 'hora', 'log'],
  tb_usuarios: ['id', 'usuario', 'nome'],
  tb_produtos_precos: ['id_cliente', 'id_produto', 'descricao_complementar'],
  tb_reclamacoes: ['id', 'id_cliente', 'id_unidade', 'data', 'hora', 'reclamante', 'telefone', 'reclamacao', 'explicacao', 'usuario_id'],
  tb_comandas: ['id', 'data_emissao', 'id_cliente', 'id_unidade', 'id_usuario', 'usuario', 'data_hora', 'status', 'valor_total', 'id_fechamento', 'id_nota_fiscal'],
  tb_comandas_itens: ['id', 'id_comanda', 'id_produto', 'produto_codigo', 'descricao_generica', 'preco', 'preco_cada', 'qtde', 'preco_total'],
  tb_comandas_detalhes: ['id', 'id_comanda', 'id_comanda_item', 'id_diaria', 'data', 'hora', 'id_usuario', 'id_produto', 'produto_codigo', 'descricao_generica', 'preco', 'preco_cada', 'qtde'],
  tb_nfe: ['id', 'data_geracao', 'status_e', 'nfe_serie', 'nfe_modelo', 'cfop_codigo', 'id_cliente', 'id_unidade', 'cliente_razao_social', 'cliente_cnpj', 'cliente_cidade_ibge', 'cliente_uf_ibge', 'data_emissao', 'data_saida', 'hora_saida', 'texto_corpo', 'usuario_autorizacao_nfe', 'peso_liquido', 'peso_bruto', 'valor_produtos', 'comandas_faturadas', 'nf_valor_total', 'icms_valor_base', 'valor_bc_pis_cofins', 'icms_valor', 'ipi_valor', 'pis_valor', 'cofins_valor', 'valor_trib'],
  tb_nfe_detalhes: ['id', 'id_nfe', 'id_comanda', 'id_produto', 'produto_codigo', 'descricao', 'id_pedido', 'preco', 'preco_total', 'qtde', 'peso', 'peso_total', 'un'],
  tb_nfe_itens: ['id', 'id_nfe', 'produto_codigo', 'id_tributo', 'id_produto', 'produto_descricao', 'situacao_tributaria', 'cfop_cst_icms', 'preco', 'preco_total', 'qtde', 'produto_ncm', 'icms_base_calculo', 'icms_red_base_calculo', 'icms_aliquota', 'icms_valor', 'pis_aliquota', 'pis_valor', 'cofins_aliquota', 'cofins_valor', 'valor_trib_prod'],
  tb_nfe_config: ['veiculo_placa', 'veiculo_uf'],
  tb_tributos: ['id', 'sit_trib', 'red_b_c_icms', 'aliq_icms', 'aliq_ipi', 'aliq_pis', 'aliq_cofins'],
  tb_receita: ['id', 'id_nfe', 'documento', 'id_cliente', 'id_unidade', 'valor', 'emissao', 'vencto'],
  tb_comandas_mercadorias: ['id', 'id_comanda', 'id_comanda_item', 'id_diaria', 'data', 'hora', 'descricao', 'qtde'],
  tb_diaria_comandas: ['id_comanda'],
  tb_etiquetas_log: ['id_diaria', 'data_hora', 'id_usuario', 'origem'],
  tb_comandas_detalhes: ['id_diaria', 'id_comanda', 'qtde'],
};

console.log(`Conectando em ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database} ...`);
let c;
try {
  c = await mysql.createConnection(dbConfig);
} catch (err) {
  console.error(`\n✗ Falha na conexão [${err.code ?? 'sem código'}]\n  ${explicaErroDb(err)}`);
  process.exit(1);
}
const [[v]] = await c.query('select version() as v, @@sql_mode as modo');
console.log(`✓ Conectado. MySQL ${v.v}`);
if (/STRICT_/.test(v.modo)) console.log('  Aviso: sql_mode estrito. INSERTs que omitam colunas NOT NULL sem padrão vão falhar.');

const [cols] = await c.query(
  'select table_name t, column_name c from information_schema.columns where table_schema = ?', [dbConfig.database]);
const tem = new Map();
for (const { t, c: col } of cols) {
  const k = t.toLowerCase();
  if (!tem.has(k)) tem.set(k, new Set());
  tem.get(k).add(col.toLowerCase());
}

let problemas = 0;
for (const [tabela, colunas] of Object.entries(ESPERADO)) {
  const reais = tem.get(tabela);
  if (!reais) { console.log(`✗ Tabela ausente: ${tabela}`); problemas += 1; continue; }
  const faltam = colunas.filter((x) => !reais.has(x));
  if (faltam.length) { console.log(`✗ ${tabela}: faltam colunas → ${faltam.join(', ')}`); problemas += 1; }
  else console.log(`✓ ${tabela}`);
}

// Os valores guardados como texto: confirma que 'True'/'False' é mesmo o padrão do banco.
try {
  const [r] = await c.query('select programacao_fixa as v, count(*) as q from tb_diaria group by programacao_fixa limit 5');
  console.log('  Valores de tb_diaria.programacao_fixa:', r.map((x) => `${JSON.stringify(x.v)}×${x.q}`).join(', ') || '(vazia)');
} catch { /* tabela/coluna já reportada acima */ }

await c.end();
console.log(problemas ? `\n${problemas} problema(s). Envie esta saída para ajustarmos a API.` : '\nTudo certo: esquema compatível.');
process.exit(problemas ? 2 : 0);
