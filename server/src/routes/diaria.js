import { Router } from 'express';
import { pool, tx } from '../db.js';
import { AppError, invalid, notFound, pick } from '../errors.js';
import {
  EXTRAS_COLS, acomodacaoPadrao, addDays, bool, cargaPorHora, dbBool, hhmmss, isIsoDate,
  money, turnoPorHora, unitario,
} from '../rules.js';
import { atualizaStatus, getStatus } from '../services/status.js';
import { produtoPorCodigo } from '../services/produtos.js';
import { ajustaCobranca, diffDiaria } from '../services/diaria.js';
import { logDiaria } from '../services/log.js';

const router = Router();

// OBS: o legado formatava producao_data com '%X' (ano da semana). Perto de 31/12 mostrava o ano errado; aqui é '%Y'.
const SQL_LISTA = `
select p.*, left(p.hora, 5) as xhora,
       (p.qtde_original + p.qtde_alterada) as xqtde_total,
       ((p.qtde_original + p.qtde_alterada) - p.qtde_cobrado) as qtde_pendente,
       ((p.qtde_original + p.qtde_alterada) * (p.produto_preco / if(p.produto_preco_cada > 0, p.produto_preco_cada, 1))) as xproduto_preco_total,
       ps.status,
       concat(rt.horario, '/', f.nome) as roteiro_info,
       left(rt.horario, 5) as roteiro_horario,
       left(sec_to_time(time_to_sec(p.hora) - time_to_sec(rt.horario)), 5) as tempo,
       f.nome as roteiro_motorista,
       concat(f.apelido, ' ', left(rt.horario, 5), ' *** ', p.acomodacao_carga, ' ', p.carga) as inform,
       un.nome, pr.converter, pr.produto_producao, pr.ingredientes, pr.validade,
       if(pr.produto_producao = 'True',
          concat(date_format(p.producao_data, '%d/%m/%Y'), ' - ', p.producao_turno, 'º'),
          'MERCADORIA') as producao_esquema
  from tb_diaria p
  left join tb_status ps on ps.id = p.id_status
  left join tb_produtos pr on pr.id = p.id_produto
  left join tb_roteiro rt on rt.id = p.id_roteiro
  left join tb_funcionarios f on f.id = rt.id_funcionario
  left join tb_unidades un on un.id = p.id_unidade
 where p.id_status = ?
 order by p.id`;

const CAMPOS_EDITAVEIS = [
  'hora', 'data', 'produto_descricao_expedicao', 'qtde_alterada', 'obs', 'obs_producao', 'id_roteiro',
  'carga', 'acomodacao_carga', 'producao_data', 'producao_turno', 'produto_preco', 'produto_preco_cada',
  'produto_descricao', // "Descrição da comanda/nota fiscal" (editável)
  // barra "Cobrar como:" (conversão do produto cobrado)
  'conversao_id_produto', 'conversao_produto_codigo', 'conversao_produto_descricao', 'conversao_produto_preco',
  'conversao_produto_preco_cada', 'conversao_produto_qtde', 'conversao_produto_valor',
  ...EXTRAS_COLS,
];

/** Campos de tb_diaria que vêm do cadastro do produto (o item guarda uma cópia). */
function camposDoProduto(p, data) {
  const especial = bool(p.produto_especial);
  const campos = {
    id_produto: p.id,
    produto_codigo: p.codigo,
    produto_descricao: p.descricao,
    produto_descricao_original: p.descricao,
    produto_descricao_expedicao: p.descricao_expedicao,
    referencia_descricao: p.referencia_descricao,
    produto_especial: dbBool(especial),
    produto_producao: dbBool(p.produto_producao),
    produto_preco: p.preco,
    produto_preco_cada: p.divisor_basico,
    producao_data: especial ? addDays(data, -1) : data, // especial é produzido na véspera
    acomodacao_carga: acomodacaoPadrao(especial),
  };
  for (const col of EXTRAS_COLS) campos[col] = dbBool(p[col]);
  return campos;
}

async function statusDoDia(c, idUnidade, data) {
  const [[st]] = await c.query('select * from tb_status where data = ? and id_unidade = ?', [data, idUnidade]);
  if (!st) throw invalid('Desculpe, mas não existe movimento neste dia para que a programação seja transportada!');
  return st;
}

function validarItem(item) {
  const qtde = (Number(item.qtde_original) || 0) + (Number(item.qtde_alterada) || 0);
  if (!item.produto_codigo || !item.produto_descricao || qtde === 0) {
    throw invalid('Registro inconsistente para gravação. Verifique o código do produto, as quantidades e a descrição do item!');
  }
}

function calcularPreco(item) {
  const unit = unitario(item.produto_preco, item.produto_preco_cada);
  const qtde = (Number(item.qtde_original) || 0) + (Number(item.qtde_alterada) || 0);
  const out = { produto_preco_unitario: money(unit), preco_total: money(qtde * unit) };
  if (item.conversao_produto_preco !== undefined && item.conversao_produto_preco !== null) {
    out.conversao_produto_preco_unitario = money(unitario(item.conversao_produto_preco, item.conversao_produto_preco_cada));
  }
  return out;
}

router.get('/status/:id/diaria', async (req, res) => {
  const [rows] = await pool.query(SQL_LISTA, [req.params.id]);
  res.json(rows);
});

// Incluir item avulso (programação extra)
router.post('/status/:id/diaria', async (req, res) => {
  const id = await tx(async (c) => {
    let st = await getStatus(c, req.params.id);
    const b = pick(req.body, CAMPOS_EDITAVEIS);
    const data = b.data || st.data;
    if (!isIsoDate(data)) throw invalid('Data inválida.');
    if (data !== st.data) st = await statusDoDia(c, st.id_unidade, data);
    if (!b.hora) throw invalid('Informe a hora da entrega.');
    const hora = hhmmss(b.hora);

    const p = await produtoPorCodigo(c, req.body.produto_codigo);
    if (!p) throw invalid('Produto não encontrado!!!');

    const item = {
      ...camposDoProduto(p, data),
      producao_turno: turnoPorHora(hora),
      carga: cargaPorHora(hora),
      id_roteiro: 0,
      ...b,
      hora,
      data,
      qtde_original: 0, // avulso: a quantidade vai em "Extra" (qtde_alterada)
      qtde_alterada: Number(b.qtde_alterada) || 0,
    };
    validarItem(item);

    const [r] = await c.query('insert into tb_diaria set ?', [{
      ...item,
      ...calcularPreco(item),
      id_status: st.id, id_cliente: st.id_cliente, id_unidade: st.id_unidade,
      programacao_fixa: 'False', cancelado: 'False',
      qtde_cobrado: 0, qtde_quitado: 0, comandas: '', registro_alterado: 0, cobrado: '1',
      notificado_sn: 'False', quitado_manualmente: 'False', cobranca_cancelada: 'False',
      id_produto_conversao: 0,
    }]);
    await logDiaria(c, r.insertId, req.userId,
      `Inclusao de programacao extra ${item.hora}/${data}\n` +
      `Produto: ${item.id_produto}\nDescricao: ${item.produto_descricao_expedicao}\nQtde extra: ${item.qtde_alterada}`);
    await ajustaCobranca(c, r.insertId);
    await atualizaStatus(c, st.id);
    return r.insertId;
  });
  res.status(201).json({ id });
});

// Alterar item
router.put('/diaria/:id', async (req, res) => {
  await tx(async (c) => {
    const [[atual]] = await c.query('select * from tb_diaria where id = ? for update', [req.params.id]);
    if (!atual) throw notFound('Item');

    const b = pick(req.body, CAMPOS_EDITAVEIS);
    // A quantidade "fixa" só é editável em item vindo da programação fixa.
    if (bool(atual.programacao_fixa) && req.body.qtde_original !== undefined) {
      b.qtde_original = Number(req.body.qtde_original) || 0;
    }
    if (b.hora) b.hora = hhmmss(b.hora);

    let novo = { ...b };
    let statusAnterior = null;
    if (b.data && b.data !== String(atual.data).slice(0, 10)) {
      const st = await statusDoDia(c, atual.id_unidade, b.data);
      statusAnterior = atual.id_status;
      novo.id_status = st.id;
    }
    if (req.body.produto_codigo && req.body.produto_codigo !== atual.produto_codigo) {
      const p = await produtoPorCodigo(c, req.body.produto_codigo);
      if (!p) throw invalid('Produto não encontrado!!!');
      novo = { ...camposDoProduto(p, b.data || String(atual.data).slice(0, 10)), ...novo };
    }

    const depois = { ...atual, ...novo };
    validarItem(depois);
    Object.assign(novo, calcularPreco(depois));

    const alterouRegistro = ['qtde_alterada', 'id_produto', 'produto_descricao_expedicao', 'hora', 'data']
      .some((k) => String(atual[k] ?? '') !== String(depois[k] ?? ''));
    if (alterouRegistro) novo.registro_alterado = 1;

    const mudancas = diffDiaria(atual, depois);
    await c.query('update tb_diaria set ? where id = ?', [novo, atual.id]);
    if (mudancas) {
      await logDiaria(c, atual.id, req.userId,
        `Alteracao de programacao ${depois.hora}/${String(depois.data).slice(0, 10)}\n${mudancas}`);
    }
    await ajustaCobranca(c, atual.id);
    await atualizaStatus(c, depois.id_status);
    if (statusAnterior) await atualizaStatus(c, statusAnterior);
  });
  res.json({ ok: true });
});

// Excluir item avulso
router.delete('/diaria/:id', async (req, res) => {
  await tx(async (c) => {
    const [[item]] = await c.query('select * from tb_diaria where id = ? for update', [req.params.id]);
    if (!item) throw notFound('Item');
    if (bool(item.programacao_fixa)) {
      throw new AppError(409, 'Não é permitido eliminar ítem fixo. Para cancelar, use "Cancelar item".');
    }
    await logDiaria(c, item.id, req.userId,
      `Exclusao de programacao diária ${item.hora}/${String(item.data).slice(0, 10)}\n` +
      `Produto: ${item.id_produto}\nDescricao: ${item.produto_descricao_expedicao}\n` +
      `Qtde fixa: ${item.qtde_original}\nQtde extra: ${item.qtde_alterada}`);
    await c.query('delete from tb_diaria where id = ?', [item.id]);
    await atualizaStatus(c, item.id_status);
  });
  res.json({ ok: true });
});

// Cancelar / desfazer cancelamento (item fixo não pode ser excluído, só cancelado)
router.post('/diaria/:id/cancelar', async (req, res) => {
  const cancelar = req.body.cancelado !== false;
  await tx(async (c) => {
    const [[item]] = await c.query('select * from tb_diaria where id = ? for update', [req.params.id]);
    if (!item) throw notFound('Item');
    await c.query('update tb_diaria set cancelado = ?, registro_alterado = 1 where id = ?',
      [dbBool(cancelar), item.id]);
    await logDiaria(c, item.id, req.userId,
      `${cancelar ? 'Cancelamento' : 'Desfez cancelamento'} do item\nProduto: ${item.id_produto}\n` +
      `Descricao: ${item.produto_descricao_expedicao}`);
    await atualizaStatus(c, item.id_status);
  });
  res.json({ ok: true });
});

router.post('/diaria/:id/ajusta-cobranca', async (req, res) => {
  await tx((c) => ajustaCobranca(c, req.params.id));
  res.json({ ok: true });
});

// Traz o preço atual do cadastro do produto para o item (e recalcula o total).
// O botão "Ajusta preço" do Delphi tinha um SELECT com nomes de coluna errados e dava erro.
const SQL_AJUSTA_PRECO = `
update tb_diaria d join tb_produtos p on p.id = d.id_produto
   set d.produto_preco = p.preco,
       d.produto_preco_cada = p.divisor_basico,
       d.produto_preco_unitario = p.preco / if(p.divisor_basico > 0, p.divisor_basico, 1),
       d.preco_total = (d.qtde_original + d.qtde_alterada) * (p.preco / if(p.divisor_basico > 0, p.divisor_basico, 1))`;

// "Ajusta tudo": todos os itens de uma data (rota fixa antes de /:id para não ser capturada)
router.post('/diaria/ajusta-preco-lote', async (req, res) => {
  if (!isIsoDate(req.body.data)) throw invalid('Informe a data no formato AAAA-MM-DD.');
  const [r] = await pool.query(`${SQL_AJUSTA_PRECO} where d.data = ?`, [req.body.data]);
  res.json({ atualizados: r.affectedRows });
});

router.post('/diaria/:id/ajusta-preco', async (req, res) => {
  const [r] = await pool.query(`${SQL_AJUSTA_PRECO} where d.id = ?`, [req.params.id]);
  res.json({ atualizados: r.affectedRows });
});

// "Etiqueta adesiva do item (expedição)": o cliente imprime; aqui só conta e registra (como o Delphi).
router.post('/diaria/:id/etiqueta', async (req, res) => {
  await tx(async (c) => {
    const [[item]] = await c.query('select id from tb_diaria where id = ? for update', [req.params.id]);
    if (!item) throw notFound('Item');
    await c.query('update tb_diaria set etiqueta_adesiva = coalesce(etiqueta_adesiva, 0) + 1, registro_alterado = 0 where id = ?', [item.id]);
    await c.query("insert into tb_etiquetas_log (id_diaria, data_hora, id_usuario, origem) values (?, now(), ?, 'DIARIA')", [item.id, req.userId]);
  });
  res.json({ ok: true });
});

// Botão do usuário na barra (cxButton2 → u_diaria_log): log de todos os itens da empresa no dia.
router.get('/status/:id/diaria-log', async (req, res) => {
  const [rows] = await pool.query(
    `select l.*, us.usuario, p.produto_descricao_expedicao
       from tb_diaria p
       join tb_diaria_log l on l.id_diaria = p.id
       left join tb_usuarios us on us.id = l.id_usuario
      where p.id_status = ? order by l.data, l.hora, l.id`, [req.params.id]);
  res.json(rows);
});

router.get('/diaria/:id/log', async (req, res) => {
  const [rows] = await pool.query(
    `select l.*, us.usuario from tb_diaria_log l left join tb_usuarios us on us.id = l.id_usuario
      where l.id_diaria = ? order by l.data, l.hora, l.id`, [req.params.id]);
  res.json(rows);
});

export default router;
