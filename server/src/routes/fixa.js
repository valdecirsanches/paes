import { Router } from 'express';
import { pool, tx } from '../db.js';
import { AppError, invalid, notFound, pick } from '../errors.js';
import {
  EXTRAS_COLS, acomodacaoPadrao, bool, cargaPorHora, hhmmss, semanaDia, turnoPorHora,
} from '../rules.js';
import { atualizaStatus, getStatus } from '../services/status.js';
import { produtoPorCodigo } from '../services/produtos.js';
import { ativarFixaDaUnidade } from '../services/diaria.js';
import { replicarFixa } from '../services/fixa.js';
import { logFixa } from '../services/log.js';

const router = Router();

const SQL_LISTA = `
select p.*, left(p.hora, 5) as xhora,
       if(pr.produto_producao <> 'True', 'MERCADORIA',
          concat(if(p.producao_dias = 0, 'MESMO DIA', if(p.producao_dias = 1, '1 DIA ANTES',
                 if(p.producao_dias = 2, '2 DIAS ANTES', 'SEM ESQUEMA'))), ' ', p.producao_turno, 'º')) as producao_esquema,
       pr.descricao as produto_descricao, pr.produto_producao, pr.divisor_basico, pr.preco as xproduto_preco,
       r.produto_especial, r.codigo_referencia, r.descricao as referencia_descricao,
       concat(rt.horario, '/', f.nome) as roteiro_info,
       left(rt.horario, 5) as roteiro_horario,
       f.nome as roteiro_motorista,
       left(sec_to_time(time_to_sec(p.hora) - time_to_sec(rt.horario)), 5) as tempo
  from tb_fixa p
  left join tb_produtos pr on pr.id = p.id_produto
  left join tb_referencias r on r.id = pr.id_referencia
  left join tb_roteiro rt on rt.id = p.id_roteiro
  left join tb_funcionarios f on f.id = rt.id_funcionario
 where p.id_unidade = ? and p.semana_dia = ?
 order by p.hora, pr.descricao`;

const CAMPOS = [
  'semana_dia', 'hora', 'produto_qtde', 'produto_descricao_expedicao', 'producao_dias',
  'producao_turno', 'id_roteiro', 'carga', 'acomodacao_carga', 'obs', ...EXTRAS_COLS,
];

function camposDoProduto(p) {
  const especial = bool(p.produto_especial);
  const campos = {
    id_produto: p.id,
    produto_codigo: p.codigo,
    produto_descricao_expedicao: p.descricao_expedicao || p.descricao,
    producao_dias: bool(p.produto_producao) && especial ? 1 : 0,
    acomodacao_carga: acomodacaoPadrao(especial),
  };
  for (const col of EXTRAS_COLS) campos[col] = p[col];
  return campos;
}

const ROTULOS = [
  ['semana_dia', 'Dia Semana'], ['hora', 'Hora entrega'], ['producao_turno', 'Producao'],
  ['id_roteiro', 'Etinerario'], ['id_produto', 'Produto'],
  ['produto_descricao_expedicao', 'Descricao p/ expedicao'], ['produto_qtde', 'Qtde'],
];

// Programação fixa de um dia da semana (padrão: o dia da data do movimento)
router.get('/status/:id/fixa', async (req, res) => {
  const st = await getStatus(pool, req.params.id);
  const dataSemana = semanaDia(st.data);
  const dia = Number(req.query.dia) || dataSemana;
  const [itens] = await pool.query(SQL_LISTA, [st.id_unidade, dia]);

  // "Ativar" só vale quando o dia da semana exibido é o da data do movimento.
  const ativavel = dia === dataSemana && itens.length > 0;
  let ativada = false;
  if (ativavel) {
    const [[{ q }]] = await pool.query(
      `select count(*) as q from tb_diaria
        where data = ? and id_unidade = ? and programacao_fixa = 'True' and qtde_alterada = 0
          and (comandas is null or trim(comandas) = '')`, [st.data, st.id_unidade]);
    ativada = q >= itens.length;
  }
  res.json({ dia, itens, ativavel, ativada });
});

// btnPasta / ppPasta (tbSm): toda a programação fixa da unidade, por dia da semana, para a pasta de papel.
router.get('/status/:id/pasta', async (req, res) => {
  const st = await getStatus(pool, req.params.id);
  const [rows] = await pool.query(
    `select elt(p.semana_dia, 'DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO') as dia, p.semana_dia,
            left(p.hora, 5) as hora, p.id_produto, p.produto_qtde, p.produto_descricao_expedicao,
            concat(pr.descricao, ' ', coalesce(pp.descricao_complementar, ' * ')) as produto_descricao_completa
       from tb_fixa p
       left join tb_produtos pr on pr.id = p.id_produto
       left join tb_produtos_precos pp on pp.id_cliente = p.id_cliente and pp.id_produto = pr.id
      where p.id_unidade = ? order by p.semana_dia, p.hora, pr.descricao`, [st.id_unidade]);
  res.json(rows);
});

router.post('/status/:id/fixa', async (req, res) => {
  const id = await tx(async (c) => {
    const st = await getStatus(c, req.params.id);
    const p = await produtoPorCodigo(c, req.body.produto_codigo);
    if (!p) throw invalid('Produto não encontrado!!!');
    const b = pick(req.body, CAMPOS);
    if (!b.hora) throw invalid('Informe a hora da entrega.');
    b.hora = hhmmss(b.hora);

    const item = {
      ...camposDoProduto(p),
      producao_turno: turnoPorHora(b.hora),
      carga: cargaPorHora(b.hora),
      id_roteiro: 0,
      ...b,
      semana_dia: b.semana_dia || semanaDia(st.data),
      id_cliente: st.id_cliente,
      id_unidade: st.id_unidade,
    };
    if (!(Number(item.produto_qtde) > 0)) throw invalid('Informe a quantidade.');
    const [r] = await c.query('insert into tb_fixa set ?', [item]);
    await logFixa(c, r.insertId, req.userId,
      `Inclusao de programacao fixa ${item.hora}/${item.semana_dia}\n` +
      `Dia semana: ${item.semana_dia}\nHora: ${item.hora}\nProducao: ${item.producao_turno}\n` +
      `Produto: ${item.id_produto}\nDescricao: ${item.produto_descricao_expedicao}\nQtde: ${item.produto_qtde}`);
    return r.insertId;
  });
  res.status(201).json({ id });
});

router.put('/fixa/:id', async (req, res) => {
  await tx(async (c) => {
    const [[atual]] = await c.query('select * from tb_fixa where id = ? for update', [req.params.id]);
    if (!atual) throw notFound('Item da programação fixa');
    let novo = pick(req.body, CAMPOS);
    if (novo.hora) novo.hora = hhmmss(novo.hora);
    if (req.body.produto_codigo && req.body.produto_codigo !== atual.produto_codigo) {
      const p = await produtoPorCodigo(c, req.body.produto_codigo);
      if (!p) throw invalid('Produto não encontrado!!!');
      novo = { ...camposDoProduto(p), ...novo };
    }
    const depois = { ...atual, ...novo };
    if (!depois.produto_descricao_expedicao) throw invalid('Informe a descrição para expedição.');

    const mudancas = ROTULOS
      .filter(([k]) => String(atual[k] ?? '') !== String(depois[k] ?? ''))
      .map(([k, rotulo]) => `alterou ${rotulo} para ${depois[k]}`).join('\n');
    await c.query('update tb_fixa set ? where id = ?', [novo, atual.id]);
    if (mudancas) {
      await logFixa(c, atual.id, req.userId,
        `Alteracao de programacao fixa ${depois.hora}/${depois.semana_dia}\n${mudancas}`);
    }
  });
  res.json({ ok: true });
});

router.delete('/fixa/:id', async (req, res) => {
  await tx(async (c) => {
    const [[item]] = await c.query('select * from tb_fixa where id = ? for update', [req.params.id]);
    if (!item) throw notFound('Item da programação fixa');
    await logFixa(c, item.id, req.userId,
      `Exclusao de programacao fixa ${item.hora}/${item.semana_dia}\nDia semana: ${item.semana_dia}\n` +
      `Hora: ${item.hora}\nProducao: ${item.producao_turno}\nProduto: ${item.produto_codigo}\n` +
      `Descricao: ${item.produto_descricao_expedicao}\nQtde: ${item.produto_qtde}`);
    await c.query('delete from tb_fixa where id = ?', [item.id]);
  });
  res.json({ ok: true });
});

// "Ajustar de segunda a sexta" / "Ajustar todos os dias"
router.post('/fixa/:id/replicar', async (req, res) => {
  const dias = { 'seg-sex': [2, 3, 4, 5, 6], todos: [1, 2, 3, 4, 5, 6, 7] }[req.body.dias];
  if (!dias) throw invalid("Use dias = 'seg-sex' ou 'todos'.");
  await tx(async (c) => {
    const [[item]] = await c.query(
      `select f.*, pr.descricao as produto_descricao from tb_fixa f
         left join tb_produtos pr on pr.id = f.id_produto where f.id = ?`, [req.params.id]);
    if (!item) throw notFound('Item da programação fixa');
    await replicarFixa(c, item, dias, req.userId,
      req.body.dias === 'todos'
        ? 'Ajustou o produto para todos os dias na programacao fixa'
        : 'Ajustou a qtde do produto de segunda a sexta na programacao fixa');
  });
  res.json({ ok: true });
});

// "Incluir no dia seguinte": copia o dia da semana inteiro para o próximo dia
router.post('/status/:id/fixa/copiar-dia-seguinte', async (req, res) => {
  const de = Number(req.body.semana_dia);
  if (!(de >= 1 && de <= 7)) throw invalid('semana_dia inválido.');
  const para = (de % 7) + 1;
  const copiados = await tx(async (c) => {
    const st = await getStatus(c, req.params.id);
    const [[{ q }]] = await c.query(
      'select count(*) as q from tb_fixa where id_unidade = ? and semana_dia = ?', [st.id_unidade, para]);
    if (q > 0) {
      if (!req.body.confirmar) {
        throw new AppError(409, 'Há registros neste dia da semana. Continuar descartando?', { codigo: 'CONFIRMAR' });
      }
      await c.query('delete from tb_fixa where id_unidade = ? and semana_dia = ?', [st.id_unidade, para]);
    }
    const cols = ['id_cliente', 'id_unidade', 'id_produto', 'produto_codigo', 'produto_qtde', 'hora',
      'producao_dias', 'producao_turno', 'id_roteiro', 'carga', 'acomodacao_carga',
      'produto_descricao_expedicao', ...EXTRAS_COLS].join(', ');
    const [r] = await c.query(
      `insert into tb_fixa (semana_dia, ${cols}) select ?, ${cols} from tb_fixa
        where id_unidade = ? and semana_dia = ?`, [para, st.id_unidade, de]);
    return r.affectedRows;
  });
  res.json({ copiados, semana_dia: para });
});

// Botão "Ativar": copia a fixa do dia para a diária
router.post('/status/:id/fixa/ativar', async (req, res) => {
  const out = await tx(async (c) => {
    const st = await getStatus(c, req.params.id);
    const r = await ativarFixaDaUnidade(c, st, { userId: req.userId, manual: true });
    return { ...r, status: await atualizaStatus(c, st.id) };
  });
  res.json(out);
});

// Botão "Desativar": remove da diária os itens fixos intactos e ainda sem comanda.
// (No Delphi a condição de "sem comanda" estava com o parêntese errado e apagava itens já cobrados.)
router.post('/status/:id/fixa/desativar', async (req, res) => {
  const out = await tx(async (c) => {
    const st = await getStatus(c, req.params.id);
    const [r] = await c.query(
      `delete from tb_diaria
        where id_unidade = ? and data = ? and programacao_fixa = 'True' and qtde_alterada = 0
          and (comandas is null or trim(comandas) = '')`, [st.id_unidade, st.data]);
    return { removidos: r.affectedRows, status: await atualizaStatus(c, st.id) };
  });
  res.json(out);
});

router.get('/fixa/:id/log', async (req, res) => {
  const [rows] = await pool.query(
    `select l.*, us.usuario from tb_fixa_log l left join tb_usuarios us on us.id = l.id_usuario
      where l.id_fixa = ? order by l.data, l.hora, l.id`, [req.params.id]);
  res.json(rows);
});

export default router;
