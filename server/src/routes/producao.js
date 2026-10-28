import { Router } from 'express';
import { pool, tx } from '../db.js';
import { invalid } from '../errors.js';
import { isIsoDate } from '../rules.js';
import { logDiaria } from '../services/log.js';

// Tela "Produção" (u_producao). Consultas do Delphi: ps/psa/ents (salgados) e pe/pea/ente (especiais).
const router = Router();

const TIPOS = ['salgados', 'especiais'];
const tipoValido = (t) => {
  if (!TIPOS.includes(t)) throw invalid('Tipo de produção inválido (use salgados ou especiais).');
  return t;
};
const dataValida = (d) => {
  if (!isIsoDate(d)) throw invalid('Informe a data no formato AAAA-MM-DD.');
  return d;
};
const inteiro = (v, rotulo, min, max) => {
  const n = Number(v);
  if (v === '' || v === null || v === undefined || !Number.isInteger(n) || n < min || n > max) throw invalid(`${rotulo} inválido(a).`);
  return n;
};

// Filtro de "especial" por tipo (lista fechada → nunca vem do cliente). O legado usava
// `='False'` na lista de salgados e `<>'True'` nos detalhes; aqui os dois usam a mesma regra.
const FILTRO_TIPO = {
  salgados: "coalesce(r.produto_especial, 'False') <> 'True'",
  especiais: "r.produto_especial = 'True'",
};

// Mesmas condições das 6 consultas do Delphi. O legado filtrava `p.cancelado <> 'True'` só na lista de
// especiais: cancelado NULL sumia do resumo mas aparecia no detalhe/impressão. Agora todas aceitam NULL.
const DESDE = `
  from tb_diaria p
  left join tb_produtos pr on pr.id = p.id_produto
  left join tb_referencias r on r.id = pr.id_referencia
  left join tb_status ps on ps.id_unidade = p.id_unidade and ps.data = p.data
  left join tb_unidades u on u.id = p.id_unidade`;
const ONDE = (tipo) => `
  where p.producao_data = ?
    and u.ativo <> 'False'
    and pr.produto_producao = 'True'
    and ${FILTRO_TIPO[tipo]}
    and (p.cancelado = 'False' or p.cancelado is null)
    and ps.status in (1, 2)`;

const QTDE = '(sum(p.qtde_original) + sum(p.qtde_alterada))';

/** Lista principal (ps/pe): quantidade a produzir por horário × referência. */
export async function resumo(tipo, data) {
  const [rows] = await pool.query(
    `select p.producao_turno, p.producao_data, pr.id_referencia, r.codigo_referencia, r.descricao,
            ${QTDE} as producao_qtde,
            concat(p.producao_turno, pr.id_referencia) as chave
       ${DESDE} ${ONDE(tipo)}
      group by p.producao_turno, p.producao_data, pr.id_referencia, r.codigo_referencia, r.descricao
      order by p.producao_turno, pr.id_referencia`, [data]);
  return rows;
}

router.get('/resumo', async (req, res) => {
  res.json(await resumo(tipoValido(req.query.tipo), dataValida(req.query.data)));
});

// Detalhamento de destino (psa/pea): quem recebe a referência selecionada, a que horas e quanto.
// O legado agrupava sem `data`: entregas de dias diferentes que caíssem na mesma produção viravam uma linha só.
// Salgados mostra só o nome da unidade; especiais mostra "nome  id", como no Delphi.
router.get('/destinos', async (req, res) => {
  const tipo = tipoValido(req.query.tipo);
  const data = dataValida(req.query.data);
  const turno = inteiro(req.query.turno, 'Horário', 0, 9);
  const ref = inteiro(req.query.referencia, 'Referência', 1, 2147483647);
  const nome = tipo === 'especiais' ? "concat(u.nome, '  ', p.id_unidade)" : 'u.nome';
  const [rows] = await pool.query(
    `select p.data, p.hora, p.producao_turno, p.producao_data, p.id_unidade, pr.id_referencia, r.codigo_referencia,
            min(p.id_produto) as id_produto,
            ${QTDE} as qtde_producao, ${nome} as cliente_nome
       ${DESDE} ${ONDE(tipo)} and p.producao_turno = ? and pr.id_referencia = ?
      group by p.producao_turno, p.id_unidade, pr.id_referencia, p.data, p.hora, p.producao_data, r.codigo_referencia, u.nome
      order by p.hora, cliente_nome`, [data, turno, ref]);
  res.json(rows);
});

// Impressão "Entrega para" (ents/ente): todas as entregas do dia, por horário e referência.
router.get('/entrega', async (req, res) => {
  const tipo = tipoValido(req.query.tipo);
  const data = dataValida(req.query.data);
  const [rows] = await pool.query(
    `select p.data, p.hora, p.producao_turno, p.producao_data, p.id_unidade, pr.id_referencia, r.codigo_referencia,
            r.descricao as referencia_descricao, u.nome, concat(u.nome, '  ', p.id_unidade) as cliente_nome,
            p.produto_descricao_expedicao, p.obs_producao,
            ${QTDE} as qtde_producao
       ${DESDE} ${ONDE(tipo)}
      group by p.producao_turno, p.id_unidade, pr.id_referencia, p.produto_descricao_expedicao, p.data, p.hora,
               p.obs_producao, p.producao_data, r.codigo_referencia, r.descricao, u.nome
      order by p.producao_turno, pr.id_referencia, u.nome, p.hora`, [data]);
  res.json(rows);
});

// Menu de contexto do detalhamento ("1º/2º/3º horário"): troca o horário de produção das linhas selecionadas.
// O legado atualizava só o `id_produto` mostrado na linha; como a linha agrupa todos os produtos da mesma referência,
// os demais ficavam no horário antigo. Aqui move todos os produtos da referência e deixa um registro no log de cada item.
const MAX_LINHAS = 500;
router.put('/turno', async (req, res) => {
  const { itens, turno } = req.body ?? {};
  const data = dataValida(req.body?.data);
  const novo = inteiro(turno, 'Horário', 1, 3);
  if (!Array.isArray(itens) || itens.length === 0) throw invalid('Selecione ao menos uma linha.');
  if (itens.length > MAX_LINHAS) throw invalid(`Selecione no máximo ${MAX_LINHAS} linhas por vez.`);
  const linhas = itens.map((l) => ({
    unidade: inteiro(l?.id_unidade, 'Unidade', 1, 2147483647),
    data: dataValida(l?.data),
    hora: /^\d{2}:\d{2}(:\d{2})?$/.test(String(l?.hora)) ? String(l.hora).padEnd(8, ':00').slice(0, 8) : (() => { throw invalid('Hora inválida.'); })(),
    ref: inteiro(l?.id_referencia, 'Referência', 1, 2147483647),
    de: inteiro(l?.producao_turno, 'Horário atual', 0, 9),
  })).filter((l) => l.de !== novo); // já está no horário pedido: não mexe (como o `<>` do Delphi)

  const alteradas = await tx(async (c) => {
    let total = 0;
    for (const l of linhas) {
      const [ids] = await c.query(
        `select d.id from tb_diaria d join tb_produtos pr on pr.id = d.id_produto
          where d.id_unidade = ? and d.data = ? and d.hora = ? and pr.id_referencia = ?
            and d.producao_turno = ? and d.producao_data = ?`,
        [l.unidade, l.data, l.hora, l.ref, l.de, data]);
      if (!ids.length) continue;
      await c.query('update tb_diaria set producao_turno = ? where id in (?)', [novo, ids.map((x) => x.id)]);
      for (const { id } of ids) await logDiaria(c, id, req.userId, `Produção: horário de produção alterado de ${l.de}º para ${novo}º.`);
      total += ids.length;
    }
    return total;
  });
  res.json({ alteradas });
});

export default router;
