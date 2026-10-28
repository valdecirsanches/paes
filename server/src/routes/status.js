import { Router } from 'express';
import { pool, tx } from '../db.js';
import { AppError, invalid } from '../errors.js';
import { STATUS, isIsoDate } from '../rules.js';
import { atualizaStatus, getStatus } from '../services/status.js';
import { ativarFixaDaUnidade } from '../services/diaria.js';
import { logDiaria } from '../services/log.js';

const router = Router();

// Filtro "Apresentação" da tela. Lista fechada: nunca concatenar texto do cliente no SQL.
const FILTROS = {
  normal: 'ps.status = 1',
  alt_canc: 'ps.status in (2, 3)',
  normal_alt: 'ps.status in (1, 2)',
  canc: 'ps.status = 3',
  nada: 'ps.status = 0',
  todas: '1 = 1',
};
const exigeData = (data) => {
  if (!isIsoDate(data)) throw invalid('Informe a data no formato AAAA-MM-DD.');
};

// Lista de clientes/unidades do dia (tbprs)
router.get('/', async (req, res) => {
  const { data, filtro = 'todas' } = req.query;
  exigeData(data);
  if (!FILTROS[filtro]) throw invalid('Filtro inválido.');
  const [rows] = await pool.query(
    `select distinct ps.id, ps.data, ps.id_cliente, ps.id_unidade, ps.status, ps.id_comanda,
            u.nome, u.verificar_pasta, u.imprimir_toda_programacao,
            c.razao_social as cliente_nome,
            concat(u.nome, ' ', c.id, '/', u.id,
                   if(u.telefone is null, '', concat('    ***     ', u.telefone)),
                   if(u.contato is null, '', concat('  ** ', u.contato))) as unidade_nome
       from tb_status ps
       left join tb_unidades u on u.id = ps.id_unidade
       left join tb_clientes c on c.id = ps.id_cliente
      where ps.data = ? and u.ativo = 'True' and ${FILTROS[filtro]}
      order by u.nome`, [data]);
  res.json(rows.map((r) => ({ ...r, status_descricao: STATUS[r.status] ?? 'NADA' })));
});

// "Ativar movimento do dia": cria o tb_status de quem ainda não tem, em uma única consulta.
router.post('/movimento-dia', async (req, res) => {
  const { data } = req.body;
  exigeData(data);
  const [r] = await pool.query(
    `insert into tb_status (id_cliente, id_unidade, data, status, status_fixa)
     select u.id_cliente, u.id, ?, 0, 'NADA'
       from tb_unidades u left join tb_clientes c on c.id = u.id_cliente
      where c.razao_social is not null and u.ativo = 'True' and c.programacao_ativo = 'True'
        and not exists (select 1 from tb_status s where s.data = ? and s.id_unidade = u.id)`,
    [data, data]);
  res.json({ criados: r.affectedRows });
});

// "Ativar programação FIXA para todas as empresas"
router.post('/fixa-todas', async (req, res) => {
  const { data } = req.body;
  exigeData(data);
  const [[{ hoje }]] = await pool.query("select date_format(curdate(), '%Y-%m-%d') as hoje");
  if (data < hoje) throw new AppError(422, 'Não é permitido gerar programação com data retroativa!');

  const [lista] = await pool.query('select * from tb_status where data = ? and status <> 3', [data]);
  let criados = 0;
  const falhas = [];
  for (const st of lista) {
    try {
      const r = await tx(async (c) => {
        const out = await ativarFixaDaUnidade(c, st, { userId: req.userId, manual: false });
        await atualizaStatus(c, st.id);
        return out;
      });
      criados += r.criados;
    } catch (e) {
      falhas.push({ id_unidade: st.id_unidade, erro: e.message }); // uma empresa com erro não trava as demais
    }
  }
  res.json({ unidades: lista.length, criados, falhas });
});

// "Verificar integridade de Status"
router.post('/recalcular', async (req, res) => {
  const { data } = req.body;
  exigeData(data);
  const [lista] = await pool.query('select id from tb_status where data = ?', [data]);
  await tx(async (c) => { for (const s of lista) await atualizaStatus(c, s.id); });
  res.json({ verificados: lista.length });
});

router.get('/:id', async (req, res) => {
  const [[row]] = await pool.query(
    `select ps.id, ps.data, ps.status, ps.id_cliente, ps.id_unidade,
            u.nome, u.telefone, u.contato, u.verificar_pasta, u.imprimir_toda_programacao
       from tb_status ps left join tb_unidades u on u.id = ps.id_unidade where ps.id = ?`, [req.params.id]);
  if (!row) throw new AppError(404, 'Movimento do dia não encontrado.');
  res.json({ ...row, status_descricao: STATUS[row.status] ?? 'NADA' });
});

// Botões Nada / Normal / Alterado / Cancelado
router.patch('/:id', async (req, res) => {
  const status = Number(req.body.status);
  if (![0, 1, 2, 3].includes(status)) throw invalid('Status inválido.');
  await tx(async (c) => {
    const st = await getStatus(c, req.params.id);
    await c.query('update tb_status set status = ? where id = ?', [status, st.id]);
    const [[item]] = await c.query('select min(id) as id from tb_diaria where id_status = ?', [st.id]);
    if (item.id) {
      await logDiaria(c, item.id, req.userId,
        `Mudou o status de toda a programação diária para "${STATUS[status]}"`);
    }
  });
  res.json({ ok: true });
});

router.post('/:id/recalcular', async (req, res) => {
  const status = await tx((c) => atualizaStatus(c, req.params.id));
  res.json({ status });
});

export default router;
