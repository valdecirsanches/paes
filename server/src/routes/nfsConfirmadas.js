import { Router, raw } from 'express';
import * as XLSX from 'xlsx';
import { pool } from '../db.js';
import { invalid } from '../errors.js';
import { isIsoDate } from '../rules.js';
import { PERC_DESCONTO_PADRAO, enriquece, grava, lerArquivo } from '../services/nfsConfirmadas.js';

const router = Router();
const arred = (n) => Math.round(n * 100) / 100;

router.get('/clientes', async (_req, res) => {
  const [r] = await pool.query('select id, codigo, razao_social, percentual_desc from tb_clientes order by razao_social');
  res.json(r);
});

// Relatório de NFEs (u_relatorio_nfes): NFe autorizadas (sem referência) do cliente no período + o que já foi confirmado/recebido.
async function relatorio(req) {
  const { cliente, de, ate } = req.query;
  const todos = String(cliente ?? '') === 'todos';
  if (!todos && !/^\d+$/.test(String(cliente ?? ''))) throw invalid('Selecione o cliente ou "Todos".');
  if (!isIsoDate(de) || !isIsoDate(ate)) throw invalid('Informe o período (AAAA-MM-DD).');
  let cli = { id: null, razao_social: 'TODOS OS CLIENTES' };
  if (!todos) {
    const [[c]] = await pool.query('select id, razao_social, percentual_desc from tb_clientes where id = ?', [cliente]);
    if (!c) throw invalid('Cliente não encontrado.');
    cli = c;
  }
  // a_receber usa o percentual de desconto de cada cliente (no relatório "todos" cada nota usa o do seu cliente)
  const [rows] = await pool.query(
    `select n.id, n.id_cliente, k.razao_social as cliente_nome, n.nfe_numero, n.data_emissao, n.cliente_pedido, n.nf_valor_total,
            (select min(r.vencto) from tb_receita r where r.id_nfe = n.id) as vencto,
            c.valor_bruto, c.valor_desconto, c.valor_liquido,
            round(((n.nf_valor_total - ifnull(c.valor_liquido, 0)) / nullif(n.nf_valor_total, 0)) * 100, 2) as percentual,
            if(ifnull(c.valor_liquido, 0) > 0, 'SIM', 'NÃO') as confirmada,
            greatest(round(n.nf_valor_total * (100 - ifnull(k.percentual_desc, 0)) / 100, 2) - ifnull(c.valor_liquido, 0), 0) as vr_a_receber
       from tb_nfe n
       left join tb_clientes k on k.id = n.id_cliente
       left join tb_nfs_confirmadas c on c.nf = n.nfe_numero
      where (? or n.id_cliente = ?) and n.status_e = 'AUTORIZADA' and n.nfe_referencia is null
        and n.data_emissao between ? and ?
      order by n.data_emissao, n.nfe_numero`, [todos ? 1 : 0, cli.id, de, ate]);
  return { cliente: cli, linhas: rows };
}
router.get('/relatorio', async (req, res) => { res.json(await relatorio(req)); });

// "Gerar planilha excel" do relatório: o mesmo conteúdo em .xlsx.
router.get('/relatorio/xlsx', async (req, res) => {
  const { cliente, linhas } = await relatorio(req);
  const d = (v) => (v ? new Date(v).toISOString().slice(0, 10).split('-').reverse().join('/') : '');
  const aoa = [['Emissão', 'Vencto', 'NFe', 'Cliente', 'Pedido', 'VR original', 'VR digitado', 'Desconto', 'VR líquido', '%', 'Confirmada', 'A receber'],
    ...linhas.map((l) => [d(l.data_emissao), d(l.vencto), l.nfe_numero, l.cliente_nome, l.cliente_pedido, Number(l.nf_valor_total), l.valor_bruto == null ? '' : Number(l.valor_bruto), l.valor_desconto == null ? '' : Number(l.valor_desconto), l.valor_liquido == null ? '' : Number(l.valor_liquido), l.percentual == null ? '' : Number(l.percentual), l.confirmada, Number(l.vr_a_receber)])];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'NFEs');
  const nome = `${String(cliente.razao_social).replace(/[^\w-]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  res.send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
});

// Leitura do arquivo enviado: só devolve a pré-visualização (nada é gravado).
router.post('/confirmadas/ler', raw({ type: () => true, limit: '15mb' }), async (req, res) => {
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) throw invalid('Arquivo vazio.');
  let linhas;
  try { linhas = lerArquivo(buf, String(req.query.formato ?? 'planilha')); } catch (e) { throw invalid(e.status === 400 ? e.message : 'Não foi possível ler o arquivo neste formato.'); }
  if (!linhas.length) throw invalid('Nenhuma nota encontrada no arquivo para o formato escolhido.');
  if (linhas.length > 20000) throw invalid('Arquivo grande demais (máximo 20.000 linhas).');
  res.json({ linhas: await enriquece(pool, linhas) });
});

// Grava as notas confirmadas (substitui a confirmação anterior da mesma NF).
router.post('/confirmadas', async (req, res) => {
  const ls = Array.isArray(req.body?.linhas) ? req.body.linhas : [];
  if (!ls.length) throw invalid('Nada para gravar.');
  const limpas = ls.map((l) => {
    const nf = String(l.nf ?? '').trim();
    const [bruto, liquido] = [Number(l.bruto), Number(l.liquido)];
    if (!/^\d{1,10}$/.test(nf)) throw invalid(`Nº de NF inválido: "${nf}".`);
    if (!Number.isFinite(bruto) || !Number.isFinite(liquido) || bruto < 0 || liquido < 0) throw invalid(`Valores inválidos na NF ${nf}.`);
    const desconto = l.desconto == null || l.desconto === '' || !Number.isFinite(Number(l.desconto)) ? arred(bruto - liquido) : Number(l.desconto);
    return { nf, bruto, liquido, desconto };
  });
  res.json({ gravadas: await grava(pool, limpas) });
});

// Inclusão manual (cxButton5): sugere bruto = valor da nota, desconto 12% e líquido = bruto - desconto.
router.get('/confirmadas/consulta', async (req, res) => {
  const nf = String(req.query.nf ?? '').trim();
  if (!/^\d{1,10}$/.test(nf)) throw invalid('Informe o nº da NF.');
  const [l] = await enriquece(pool, [{ nf, bruto: 0, liquido: 0, desconto: null }]);
  if (l.valorNota == null) throw invalid('Nota fiscal ainda não emitida ou não encontrada!');
  const desconto = arred(l.valorNota * PERC_DESCONTO_PADRAO);
  res.json({ nf, bruto: l.valorNota, desconto, liquido: arred(l.valorNota - desconto), existente: l.existente });
});

// Desfaz a confirmação de uma NF (ícone ✖ na grade do relatório).
router.delete('/confirmadas/:nf', async (req, res) => {
  const nf = String(req.params.nf ?? '').trim();
  if (!/^\d{1,10}$/.test(nf)) throw invalid('Nº de NF inválido.');
  const [r] = await pool.query('delete from tb_nfs_confirmadas where nf = ?', [nf]);
  res.json({ removidas: r.affectedRows });
});

export default router;
