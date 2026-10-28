import { Router, raw } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db.js';
import { invalid, notFound } from '../errors.js';
import { emUso, idValido, limpaCampos } from '../services/campos.js';

// Cadastro de funcionários (u_funcionarios). A foto fica numa pasta do servidor; a coluna `foto` guarda só o nome do arquivo.
const router = Router();
const DIR = () => path.resolve(process.env.FUNC_IMG_DIR || path.join(process.cwd(), 'imagens'));

const SCHEMA = {
  nome: 'txt', apelido: 'txt', endereco: 'txt', bairro: 'txt', cidade: 'txt', estado: 'txt', cep: 'txt', id_funcao: 'int', nascimento: 'data', admissao: 'data',
  telefone: 'txt', celular: 'txt', nacionalidade: 'txt', rg: 'txt', cpf: 'txt', veiculo: 'txt', estado_civil: 'txt', ativo: 'bool', foto: 'txt',
};
const ROTULOS = { nome: 'Nome do funcionário', nascimento: 'Data de nascimento', admissao: 'Data de admissão', id_funcao: 'Função' };
/** ExtractFileName do Delphi (aceita caminho do Windows gravado pelo sistema antigo). */
export const nomeArquivo = (v) => path.win32.basename(String(v ?? '')).replace(/[^\w.\- ()]/g, '_');

// Botão "Mostrar/Esconder Inativos": por padrão só os ativos.
router.get('/', async (req, res) => {
  const todos = req.query.inativos === '1';
  const [rows] = await pool.query(`select * from tb_funcionarios ${todos ? '' : "where ativo = 'True'"} order by nome`);
  res.json(rows);
});
router.get('/funcoes', async (_req, res) => { const [r] = await pool.query('select * from tb_funcoes order by descricao'); res.json(r); });

router.post('/', async (req, res) => {
  const b = limpaCampos(req.body, { ativo: 'bool', ...SCHEMA }, { rotulos: ROTULOS });
  if (!b.nome) throw invalid('Informe o nome do funcionário.');
  if (b.ativo === undefined) b.ativo = 'True';
  const [r] = await pool.query('insert into tb_funcionarios set ?', [b]);
  const [[novo]] = await pool.query('select * from tb_funcionarios where id = ?', [r.insertId]);
  res.status(201).json(novo);
});
router.put('/:id', async (req, res) => {
  const id = idValido(req.params.id, 'Funcionário');
  const b = limpaCampos(req.body, SCHEMA, { rotulos: ROTULOS });
  if ('nome' in b && !b.nome) throw invalid('O nome não pode ficar vazio.');
  if (!Object.keys(b).length) throw invalid('Nada para gravar.');
  const [r] = await pool.query('update tb_funcionarios set ? where id = ?', [b, id]);
  if (!r.affectedRows) throw notFound('Funcionário');
  const [[f]] = await pool.query('select * from tb_funcionarios where id = ?', [id]);
  res.json(f);
});
router.delete('/:id', async (req, res) => {
  const id = idValido(req.params.id, 'Funcionário');
  const [[uso]] = await pool.query('select count(*) as n from tb_roteiro where id_funcionario = ?', [id]);
  if (uso.n) throw invalid(`Funcionário está em ${uso.n} roteiro(s). Inative-o em vez de excluir.`);
  try {
    const [r] = await pool.query('delete from tb_funcionarios where id = ?', [id]);
    if (!r.affectedRows) throw notFound('Funcionário');
  } catch (e) { throw emUso(e, 'Funcionário'); }
  res.json({ ok: true });
});

// Botão "Imagem": recebe o arquivo (corpo binário, nome em ?nome=). Não sobrescreve arquivo existente (CopyFile com FailIfExists).
const TIPOS = { jpg: [0xff, 0xd8, 0xff], jpeg: [0xff, 0xd8, 0xff], png: [0x89, 0x50, 0x4e, 0x47], gif: [0x47, 0x49, 0x46], bmp: [0x42, 0x4d] };
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp' };
router.post('/:id/foto', raw({ type: () => true, limit: '5mb' }), async (req, res) => {
  const id = idValido(req.params.id, 'Funcionário');
  const nome = nomeArquivo(req.query.nome);
  const ext = path.extname(nome).slice(1).toLowerCase();
  if (!TIPOS[ext]) throw invalid('Envie uma imagem JPG, PNG, GIF ou BMP.');
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length === 0) throw invalid('Arquivo vazio.');
  if (!TIPOS[ext].every((b, i) => buf[i] === b)) throw invalid('O conteúdo do arquivo não corresponde a uma imagem do tipo informado.');
  const [[f]] = await pool.query('select id from tb_funcionarios where id = ?', [id]);
  if (!f) throw notFound('Funcionário');
  fs.mkdirSync(DIR(), { recursive: true });
  const destino = path.join(DIR(), nome);
  try { fs.writeFileSync(destino, buf, { flag: 'wx' }); } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    throw invalid(`Já existe uma imagem chamada "${nome}". Renomeie o arquivo e envie de novo.`);
  }
  await pool.query('update tb_funcionarios set foto = ? where id = ?', [nome, id]);
  res.status(201).json({ foto: nome });
});
router.get('/:id/foto', async (req, res) => {
  const id = idValido(req.params.id, 'Funcionário');
  const [[f]] = await pool.query('select foto from tb_funcionarios where id = ?', [id]);
  const nome = nomeArquivo(f?.foto);
  const arq = path.join(DIR(), nome);
  if (!f || !nome || !fs.existsSync(arq)) throw notFound('Foto');
  res.type(MIME[path.extname(nome).slice(1).toLowerCase()] ?? 'application/octet-stream').sendFile(arq);
});

export default router;
