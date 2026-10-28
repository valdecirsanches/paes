import { Router } from 'express';
import { pool, tx } from '../db.js';
import { AppError, invalid, notFound } from '../errors.js';

// Controle do etinerário (u_etinerario): horários de roteiros (tb_roteiro) e empresas de cada roteiro (tb_roteiro_distribuicao).
const router = Router();

const idUm = (v, rotulo = 'Item') => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw invalid(`${rotulo} inválido(a).`); return n; };
const horario = (v) => {
  const s = String(v ?? '').trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59 || Number(m[3] ?? 0) > 59) throw invalid('Horário inválido (use HH:MM).');
  return `${m[1].padStart(2, '0')}:${m[2]}:${m[3] ?? '00'}`;
};
const NOME_EXIBE = "concat(if(u.nome is null, '???', u.nome), ' ', u.id_cliente, '/', u.codigo)";

// Motoristas (função MOTORISTA, exceto o id 99) — combo da grade de horários
router.get('/motoristas', async (_req, res) => {
  const [rows] = await pool.query(
    `select f.id, f.nome, f.apelido, f.celular from tb_funcionarios f
       left join tb_funcoes fc on fc.id = f.id_funcao
      where fc.descricao = 'MOTORISTA' and f.id <> 99 order by f.nome`);
  res.json(rows);
});

// Horários de roteiros, por motorista. Roteiro sem motorista também aparece (o Delphi o escondia depois de criado).
router.get('/roteiros', async (_req, res) => {
  const [rows] = await pool.query(
    `select r.id, left(r.horario, 5) as horario, r.descricao, r.id_funcionario, f.nome, f.apelido,
            (select count(*) from tb_roteiro_distribuicao rd where rd.id_roteiro = r.id) as empresas
       from tb_roteiro r left join tb_funcionarios f on f.id = r.id_funcionario
      where f.id is null or f.ativo = 'True'
      order by f.nome, r.horario`);
  res.json(rows);
});

async function dadosRoteiro(b, parcial) {
  const out = {};
  if (!parcial || b.horario !== undefined) out.horario = horario(b.horario);
  if (!parcial || b.descricao !== undefined) out.descricao = String(b.descricao ?? '').trim().slice(0, 100);
  if (!parcial || b.id_funcionario !== undefined) {
    const f = idUm(b.id_funcionario, 'Motorista');
    const [[m]] = await pool.query('select id from tb_funcionarios where id = ?', [f]);
    if (!m) throw invalid('Motorista não encontrado.');
    out.id_funcionario = f;
  }
  return out;
}
router.post('/roteiros', async (req, res) => {
  const d = await dadosRoteiro(req.body ?? {}, false);
  const [r] = await pool.query('insert into tb_roteiro set ?', [d]);
  res.status(201).json({ id: r.insertId });
});
router.put('/roteiros/:id', async (req, res) => {
  const d = await dadosRoteiro(req.body ?? {}, true);
  if (!Object.keys(d).length) throw invalid('Nada para gravar.');
  const [r] = await pool.query('update tb_roteiro set ? where id = ?', [d, idUm(req.params.id)]);
  if (!r.affectedRows) throw notFound('Roteiro');
  res.json({ ok: true });
});
router.delete('/roteiros/:id', async (req, res) => {
  const id = idUm(req.params.id);
  const [[n]] = await pool.query(
    `select (select count(*) from tb_roteiro_distribuicao where id_roteiro = ?) as emp,
            (select count(*) from tb_diaria where id_roteiro = ?) as dia,
            (select count(*) from tb_fixa where id_roteiro = ?) as fix`, [id, id, id]);
  if (n.emp) throw new AppError(409, 'Remova as empresas deste roteiro antes de excluí-lo.');
  if (n.dia || n.fix) throw new AppError(409, 'Este roteiro é usado em programações (diária/fixa) e não pode ser excluído.');
  const [r] = await pool.query('delete from tb_roteiro where id = ?', [id]);
  if (!r.affectedRows) throw notFound('Roteiro');
  res.json({ ok: true });
});

// Empresas dentro do roteiro, na ordem da entrega
router.get('/roteiros/:id/empresas', async (req, res) => {
  const [rows] = await pool.query(
    `select rd.id, rd.id_roteiro, rd.id_unidade, rd.roteiro_ordem, u.nome, ${NOME_EXIBE} as nome_exibe, u.telefone, u.contato
       from tb_roteiro_distribuicao rd
       left join tb_unidades u on u.id = rd.id_unidade
      where rd.id_roteiro = ? order by rd.roteiro_ordem, rd.id`, [idUm(req.params.id)]);
  res.json(rows);
});

// Empresas fora do roteiro: unidades ativas de clientes com programação ativa que não estão neste roteiro.
// Por padrão só as que não estão em NENHUM roteiro (`todas=1` inclui as que estão em outros).
router.get('/roteiros/:id/fora', async (req, res) => {
  const id = idUm(req.params.id);
  const soLivres = req.query.todas === '1' ? '' : 'and not exists (select 1 from tb_roteiro_distribuicao x where x.id_unidade = u.id)';
  const [rows] = await pool.query(
    `select u.id as id_unidade, u.id_cliente, c.razao_social, ${NOME_EXIBE} as chave
       from tb_unidades u
       join tb_clientes c on c.id = u.id_cliente
      where u.ativo = 'True' and c.programacao_ativo = 'True'
        and not exists (select 1 from tb_roteiro_distribuicao d where d.id_unidade = u.id and d.id_roteiro = ?)
        ${soLivres}
      order by u.nome`, [id]);
  res.json(rows);
});

// Coloca empresas no roteiro (no fim da ordem)
router.post('/roteiros/:id/empresas', async (req, res) => {
  const id = idUm(req.params.id);
  const lista = req.body?.unidades;
  if (!Array.isArray(lista) || !lista.length || lista.length > 500 || !lista.every((n) => Number.isInteger(n) && n > 0)) throw invalid('Selecione as empresas.');
  const un = [...new Set(lista)];
  const inseridas = await tx(async (c) => {
    const [[rot]] = await c.query('select id from tb_roteiro where id = ? for update', [id]);
    if (!rot) throw notFound('Roteiro');
    const [[{ ult }]] = await c.query('select coalesce(max(roteiro_ordem), 0) as ult from tb_roteiro_distribuicao where id_roteiro = ?', [id]);
    const [us] = await c.query(
      `select u.id, u.id_cliente, ${NOME_EXIBE} as chave from tb_unidades u
        where u.id in (?) and not exists (select 1 from tb_roteiro_distribuicao d where d.id_roteiro = ? and d.id_unidade = u.id)`, [un, id]);
    let ordem = ult;
    for (const u of us) {
      ordem += 1;
      await c.query('insert into tb_roteiro_distribuicao set ?', [{ id_roteiro: id, id_cliente: u.id_cliente, id_unidade: u.id, cliente_unidade: u.chave, roteiro_ordem: ordem }]);
    }
    return us.length;
  });
  res.json({ ok: true, inseridas });
});

// Tira empresas do roteiro
router.post('/roteiros/:id/empresas/remover', async (req, res) => {
  const lista = req.body?.ids;
  if (!Array.isArray(lista) || !lista.length || !lista.every((n) => Number.isInteger(n) && n > 0)) throw invalid('Selecione as empresas.');
  const [r] = await pool.query('delete from tb_roteiro_distribuicao where id_roteiro = ? and id in (?)', [idUm(req.params.id), lista]);
  res.json({ ok: true, removidas: r.affectedRows });
});

// Nova ordem de entrega: lista completa dos ids de distribuição, na ordem desejada
router.put('/roteiros/:id/ordem', async (req, res) => {
  const id = idUm(req.params.id);
  const lista = req.body?.ids;
  if (!Array.isArray(lista) || !lista.every((n) => Number.isInteger(n) && n > 0)) throw invalid('Ordem inválida.');
  await tx(async (c) => {
    const [atuais] = await c.query('select id from tb_roteiro_distribuicao where id_roteiro = ? for update', [id]);
    const a = new Set(atuais.map((x) => x.id));
    if (lista.length !== a.size || !lista.every((n) => a.has(n))) throw new AppError(409, 'A lista de empresas mudou. Atualize a tela e tente de novo.');
    for (let i = 0; i < lista.length; i++) await c.query('update tb_roteiro_distribuicao set roteiro_ordem = ? where id = ?', [i + 1, lista[i]]);
  });
  res.json({ ok: true });
});

// Dados do relatório "Etinerário de entregas" (ppEtinerario/ppReport1): uma página por motorista, grupos por horário
router.get('/impressao', async (_req, res) => {
  const [rows] = await pool.query(
    `select f.id as id_motorista, f.nome, f.celular, r.id as id_roteiro, left(r.horario, 5) as horario,
            ${NOME_EXIBE} as nome_exibe, u.telefone, u.contato, rd.roteiro_ordem
       from tb_roteiro r
       join tb_funcionarios f on f.id = r.id_funcionario and f.ativo = 'True'
       left join tb_roteiro_distribuicao rd on rd.id_roteiro = r.id
       left join tb_unidades u on u.id = rd.id_unidade
      order by f.nome, r.horario, rd.roteiro_ordem, rd.id`);
  res.json(rows);
});

export default router;
