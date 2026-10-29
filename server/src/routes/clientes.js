import { Router } from 'express';
import { pool } from '../db.js';
import { invalid, notFound } from '../errors.js';
import { emUso, idValido, limpaCampos } from '../services/campos.js';

// Cadastro de clientes (u_clientes): clientes (tb_clientes), unidades (tb_unidades) e a lista de produtos do cliente.
const router = Router();
const TIPOS_FATUR = ['DIARIO', 'SEMANAL', 'QUINZENAL', 'MENSAL', 'SEGUNDAS E QUINTAS'];

const CLI = {
  codigo: 'txt', razao_social: 'txt', endereco: 'txt', endereco_numero: 'txt', bairro: 'txt', cidade: 'txt', cep: 'txt', uf: 'txt', cnpj: 'txt', ie: 'txt', fone: 'txt', contato: 'txt',
  informacoes_nf1: 'txt', informacoes_nf2: 'txt', pessoa: 'enum:FISICA,JURIDICA,F,J', email_nfe: 'txt', dias_vencto: 'int', ativo: 'enum:ATIVO,INATIVO',
  programacao_ativo: 'bool', comanda_nf: 'enum:0,1',
};

// tb_clientes.pessoa pode ser char(1) ('F'/'J'), enum ou texto longo: lê-se sempre como FISICA/JURIDICA (pela 1ª letra) e grava-se no formato da coluna.
let formatoPessoa;
async function formaPessoa() {
  if (formatoPessoa) return formatoPessoa;
  let f = { F: 'FISICA', J: 'JURIDICA' };
  try {
    const [[c]] = await pool.query("show columns from tb_clientes like 'pessoa'");
    const t = String(c?.Type ?? '');
    const en = t.match(/^enum\((.*)\)$/i);
    if (en) {
      const ops = [...en[1].matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replaceAll("''", "'"));
      const acha = (l) => ops.find((o) => o.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().startsWith(l));
      f = { F: acha('F') ?? 'FISICA', J: acha('J') ?? 'JURIDICA' };
    } else {
      const n = Number(t.match(/\((\d+)\)/)?.[1] ?? 0);
      if (n === 1) f = { F: 'F', J: 'J' };
    }
  } catch { /* mantém o padrão */ }
  return (formatoPessoa = f);
}
const letraPessoa = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().slice(0, 1);
const lePessoa = (r) => { if (r) { const l = letraPessoa(r.pessoa); if (l === 'F' || l === 'J') r.pessoa = l === 'F' ? 'FISICA' : 'JURIDICA'; } return r; };
async function gravaPessoa(b) { if (b.pessoa !== undefined) { const f = await formaPessoa(); b.pessoa = f[letraPessoa(b.pessoa)] ?? f.J; } return b; }
const CLI_ROT = { razao_social: 'Nome do cliente', dias_vencto: 'Dias para vencimento', comanda_nf: 'Faturamento' };
const UNI = {
  nome: 'txt', codigo: 'txt', endereco: 'txt', numero: 'txt', complemento: 'txt', bairro: 'txt', cidade: 'txt', uf: 'txt', cep: 'txt', telefone: 'txt', contato: 'txt', cnpj: 'txt', ie: 'txt',
  veiculo_placa: 'txt', veiculo_uf: 'txt', email_nfe: 'txt', tipo_faturamento: `enum:${TIPOS_FATUR.join(',')}`, nutricionista_nome: 'txt', regiao: 'txt',
  emite_comanda_diaria: 'bool', quitar_automaticamente: 'bool', ativo: 'bool', id_cliente_comandas: 'int', id_unidade_comandas: 'int',
};
const UNI_ROT = { nome: 'Nome da unidade', tipo_faturamento: 'Tipo de faturamento' };

router.get('/', async (_req, res) => { const [r] = await pool.query('select * from tb_clientes order by razao_social'); res.json(r.map(lePessoa)); });

// chkConectar / chkEsconder: ?cliente=ID restringe ao cliente; ?esconder=1 só ativas (unidade ativa e cliente ATIVO)
router.get('/unidades', async (req, res) => {
  const cliente = req.query.cliente ? idValido(req.query.cliente, 'Cliente') : null;
  const esconder = req.query.esconder === '1';
  const onde = [];
  const args = [];
  if (cliente) { onde.push('u.id_cliente = ?'); args.push(cliente); }
  if (esconder) onde.push("u.ativo = 'True' and c.ativo = 'ATIVO'");
  const [r] = await pool.query(
    `select u.* from tb_unidades u left join tb_clientes c on c.id = u.id_cliente ${onde.length ? `where ${onde.join(' and ')}` : ''} order by u.nome`, args);
  res.json(r);
});
// Aba "Listagem": unidades com nome/contato/telefone do cliente ativo (impressão)
router.get('/nutricionistas', async (_req, res) => {
  const [r] = await pool.query('select u.*, c.razao_social as cliente_nome from tb_unidades u left join tb_clientes c on c.id = u.id_cliente where u.nutricionista_nome is not null order by u.nome');
  res.json(r.filter((x) => String(x.nutricionista_nome).trim() !== ''));
});

router.post('/unidades', async (req, res) => {
  const b = limpaCampos(req.body, { id_cliente: 'int', ...UNI }, { rotulos: UNI_ROT });
  if (!b.id_cliente) throw invalid('Informe o cliente da unidade.');
  const [[c]] = await pool.query('select id from tb_clientes where id = ?', [b.id_cliente]);
  if (!c) throw notFound('Cliente');
  if (!b.nome) throw invalid('Informe o nome da unidade.');
  if (b.ativo === undefined) b.ativo = 'True'; // TBUNINewRecord
  const [r] = await pool.query('insert into tb_unidades set ?', [b]);
  const [[novo]] = await pool.query('select * from tb_unidades where id = ?', [r.insertId]);
  res.status(201).json(novo);
});
router.put('/unidades/:id', async (req, res) => {
  const id = idValido(req.params.id, 'Unidade');
  const b = limpaCampos(req.body, UNI, { rotulos: UNI_ROT });
  if ('nome' in b && !b.nome) throw invalid('O nome da unidade não pode ficar vazio.');
  if (!Object.keys(b).length) throw invalid('Nada para gravar.');
  const [r] = await pool.query('update tb_unidades set ? where id = ?', [b, id]);
  if (!r.affectedRows) throw notFound('Unidade');
  const [[u]] = await pool.query('select * from tb_unidades where id = ?', [id]);
  res.json(u);
});
router.delete('/unidades/:id', async (req, res) => {
  const id = idValido(req.params.id, 'Unidade');
  for (const [tab, rot] of [['tb_fixa', 'programação fixa'], ['tb_diaria', 'programação diária'], ['tb_comandas', 'comandas'], ['tb_status', 'status da programação']]) {
    const [[u]] = await pool.query(`select 1 as n from ${tab} where id_unidade = ? limit 1`, [id]);
    if (u) throw invalid(`Unidade tem ${rot}. Inative-a em vez de excluir.`);
  }
  try {
    const [r] = await pool.query('delete from tb_unidades where id = ?', [id]);
    if (!r.affectedRows) throw notFound('Unidade');
  } catch (e) { throw emUso(e, 'Unidade'); }
  res.json({ ok: true });
});

router.get('/:id/produtos', async (req, res) => {
  const [r] = await pool.query(
    `select p.*, (p.preco / if(p.divisor_basico = 0, 1, p.divisor_basico)) as preco_unitario from tb_produtos p where p.id_cliente = ? order by p.descricao`, [idValido(req.params.id, 'Cliente')]);
  res.json(r);
});

router.post('/', async (req, res) => {
  const b = limpaCampos(req.body, CLI, { rotulos: CLI_ROT });
  if (!b.razao_social) throw invalid('Informe o nome do cliente.');
  if (b.ativo === undefined) b.ativo = 'ATIVO';
  if (b.programacao_ativo === undefined) b.programacao_ativo = 'True';
  if (b.pessoa === undefined) b.pessoa = 'JURIDICA';
  await gravaPessoa(b);
  if (b.comanda_nf === undefined) b.comanda_nf = '1'; // DefaultValue do DBRadioGroup
  const [r] = await pool.query('insert into tb_clientes set ?', [b]);
  const [[novo]] = await pool.query('select * from tb_clientes where id = ?', [r.insertId]);
  res.status(201).json(lePessoa(novo));
});
router.put('/:id', async (req, res) => {
  const id = idValido(req.params.id, 'Cliente');
  const b = limpaCampos(req.body, CLI, { rotulos: CLI_ROT });
  if ('razao_social' in b && !b.razao_social) throw invalid('O nome do cliente não pode ficar vazio.');
  if (!Object.keys(b).length) throw invalid('Nada para gravar.');
  await gravaPessoa(b);
  const [r] = await pool.query('update tb_clientes set ? where id = ?', [b, id]);
  if (!r.affectedRows) throw notFound('Cliente');
  const [[c]] = await pool.query('select * from tb_clientes where id = ?', [id]);
  res.json(lePessoa(c));
});
router.delete('/:id', async (req, res) => {
  const id = idValido(req.params.id, 'Cliente');
  for (const [tab, rot] of [['tb_unidades', 'unidades'], ['tb_produtos', 'produtos'], ['tb_comandas', 'comandas'], ['tb_nfe', 'notas fiscais']]) {
    const [[u]] = await pool.query(`select 1 as n from ${tab} where id_cliente = ? limit 1`, [id]);
    if (u) throw invalid(`Cliente tem ${rot}. Inative-o em vez de excluir.`);
  }
  try {
    const [r] = await pool.query('delete from tb_clientes where id = ?', [id]);
    if (!r.affectedRows) throw notFound('Cliente');
  } catch (e) { throw emUso(e, 'Cliente'); }
  res.json({ ok: true });
});

export default router;
