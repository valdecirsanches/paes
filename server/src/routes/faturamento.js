import { Router } from 'express';
import { pool, tx } from '../db.js';
import { invalid, notFound, pick } from '../errors.js';
import { dbBool, isIsoDate } from '../rules.js';
import { produtoPorCodigo } from '../services/produtos.js';
import { logDiaria } from '../services/log.js';
import { geraFatura } from '../services/geraFatura.js';

// Tela "Faturamento" (u_faturamento): cobrança da programação, comandas e baixa das quantidades cobradas.
const router = Router();

const idValido = (v, rotulo = 'Registro') => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > 2147483647) throw invalid(`${rotulo} inválido(a).`);
  return n;
};
const MAX_IDS = 5000;
const idsValidos = (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) throw invalid('Nenhum item informado.');
  if (ids.length > MAX_IDS) throw invalid(`Informe no máximo ${MAX_IDS} itens por vez.`);
  return [...new Set(ids.map((i) => idValido(i, 'Item')))];
};
const pedaco = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const trunc3 = (x) => Math.trunc(Number((Number(x) * 1000).toFixed(6))) / 1000; // TRUNCATE(x,3) do MySQL
const arred = (x, d) => Math.round(Number(x) * 10 ** d) / 10 ** d;
const dividir = (cada) => (Number(cada) || 1);

// ------------------------------------------------------------------ consulta principal (bAtualizarClick)
// Mesmo SELECT do Delphi (colunas calculadas incluídas). Só o WHERE muda e entra por parâmetros.
const SQL_ITENS = `
  select p.*, u.nome, u.emite_comanda_diaria, substring(p.hora,1,5) as xHora,
    (p.qtde_original + p.qtde_alterada) as qtde,
    if(p.cobranca_cancelada = 'True', 0,
      if(pr.converter = 'True' and p.qtde_cobrado > 0, 0,
        truncate((p.qtde_original + p.qtde_alterada) - p.qtde_cobrado, 3))) as qtde_pendente,
    if(p.cobranca_cancelada = 'True', 0, p.qtde_quitado) as xqtde_quitado,
    if(p.cobranca_cancelada = 'True', 0,
      if(p.conversao_id_produto > 0,
        (truncate(((p.qtde_original + p.qtde_alterada) / p.produto_preco_cada), 3) * truncate(p.produto_preco, 3))
          - (truncate((p.conversao_produto_qtde / p.conversao_produto_preco_cada), 3) * truncate(p.conversao_produto_preco, 3)),
        (truncate(((p.qtde_original + p.qtde_alterada) - p.qtde_cobrado) / p.produto_preco_cada, 3) * truncate(p.produto_preco, 3)))) as valor_pendente,
    round(p.produto_preco / p.produto_preco_cada, 3) as xpreco,
    (truncate((p.qtde_original + p.qtde_alterada) / p.produto_preco_cada, 3) * truncate(p.produto_preco, 3)) as xpreco_total,
    concat(u.nome, ' ', p.id_cliente, '/', p.id_unidade) as unidade_nome,
    r.produto_especial, r.descricao as produto_descritivo,
    pr.produto_producao, pr.converter,
    if(pr.converter = 'True', p.conversao_produto_descricao, pr.descricao) as produto_descricao_geral,
    if(pr.converter = 'True',
      truncate(p.conversao_produto_qtde / p.conversao_produto_preco_cada, 3) * truncate(p.conversao_produto_preco, 3),
      truncate((p.qtde_original + p.qtde_alterada) / p.produto_preco_cada, 3) * truncate(p.produto_preco, 3)) as produto_valor,
    if(pr.converter = 'True',
      concat(p.conversao_produto_preco, '/', p.conversao_produto_preco_cada, '=', round(p.conversao_produto_preco / p.conversao_produto_preco_cada, 3)),
      concat(p.produto_preco, '/', p.produto_preco_cada, '=', round(p.produto_preco / p.produto_preco_cada, 3))) as zpreco,
    if(p.qtde_alterada <> 0, 2, 1) as tipo_prog,
    if(((p.qtde_original + p.qtde_alterada) <> p.qtde_cobrado) and (p.cobrado = 1), 1,
      if(((p.qtde_original + p.qtde_alterada) = p.qtde_cobrado) and (p.cobrado = 1), 3, p.cobrado)) as status,
    ps.status as ps_status
  from tb_diaria p
  left join tb_status ps on ps.id_unidade = p.id_unidade and ps.data = p.data
  left join tb_produtos pr on pr.id = p.id_produto
  left join tb_referencias r on pr.id_referencia = r.id
  left join tb_unidades u on p.id_unidade = u.id`;

const itens = async (c, onde, params) => (await c.query(`${SQL_ITENS} ${onde}`, params))[0];

const MAX_DIAS = 93;
router.get('/itens', async (req, res) => {
  const { inicio, fim } = req.query;
  if (!isIsoDate(inicio) || !isIsoDate(fim)) throw invalid('Informe o período no formato AAAA-MM-DD.');
  const dias = (Date.parse(fim) - Date.parse(inicio)) / 86400000;
  if (dias < 0) throw invalid('A data final é anterior à inicial.');
  if (dias > MAX_DIAS) throw invalid(`Período muito grande (máximo ${MAX_DIAS} dias).`);
  const params = [inicio, fim];
  let onde = 'where p.data between ? and ?';
  if (req.query.unidade !== undefined && req.query.unidade !== '') { onde += ' and p.id_unidade = ?'; params.push(idValido(req.query.unidade, 'Unidade')); }
  onde += ' and ps.status in (1, 2) order by u.nome, p.data, p.hora, p.id';
  res.json(await itens(pool, onde, params));
});

// Lista de unidades (consulta `uni`); `tipo` é o parâmetro :tf do Delphi (nulo/TODOS = todas).
const TIPOS_FATUR = ['DIARIO', 'SEMANAL', 'QUINZENAL', 'MENSAL', 'SEGUNDAS E QUINTAS'];
router.get('/unidades', async (req, res) => {
  const tipo = req.query.tipo;
  if (tipo && tipo !== 'TODOS' && !TIPOS_FATUR.includes(tipo)) throw invalid('Tipo de faturamento inválido.');
  const filtro = tipo && tipo !== 'TODOS' ? 'u.tipo_faturamento = ?' : '1 = 1';
  const [rows] = await pool.query(
    `select u.*, c.razao_social as cliente_razao_social, c.endereco as cliente_endereco, c.endereco_numero as cliente_endereco_numero,
            c.bairro as cliente_bairro, c.cidade as cliente_cidade, c.cep as cliente_cep, c.uf as cliente_uf, c.cnpj as cliente_cnpj,
            c.ie as cliente_ie, c.fone as cliente_fone, c.contato as cliente_contato, c.informacoes_nf1, c.informacoes_nf2,
            concat(u.nome, ' ', u.id_cliente, '/', u.codigo) as unidade_nome
       from tb_unidades u left join tb_clientes c on c.id = u.id_cliente
      where ${filtro} and c.programacao_ativo = 'True' and u.ativo = 'True'
      order by u.nome`, filtro === '1 = 1' ? [] : [tipo]);
  res.json(rows);
});

// Painel "Informações do cliente": o navegador (✔) grava estes três campos da unidade.
router.put('/unidades/:id', async (req, res) => {
  const id = idValido(req.params.id, 'Unidade');
  const b = pick(req.body, ['tipo_faturamento', 'emite_comanda_diaria', 'quitar_automaticamente']);
  if (b.tipo_faturamento !== undefined && !TIPOS_FATUR.includes(b.tipo_faturamento)) throw invalid('Tipo de faturamento inválido.');
  for (const k of ['emite_comanda_diaria', 'quitar_automaticamente']) if (b[k] !== undefined) b[k] = dbBool(b[k]);
  if (!Object.keys(b).length) throw invalid('Nada para gravar.');
  const [r] = await pool.query('update tb_unidades set ? where id = ?', [b, id]);
  if (!r.affectedRows) throw notFound('Unidade');
  res.json({ ok: true });
});

// O valor total só aparecia para SANCHES e EDUARDO. Sem login ainda (TODO(auth)), mostra para todos.
router.get('/config', async (req, res) => {
  let mostrarValor = true;
  if (req.userId) {
    const [[u]] = await pool.query('select usuario from tb_usuarios where id = ?', [req.userId]);
    mostrarValor = ['SANCHES', 'EDUARDO'].includes(String(u?.usuario ?? '').toUpperCase());
  }
  res.json({ mostrarValor });
});

// ------------------------------------------------------------------ baixa (bBaixaClick / Auditoria)
// Recalcula qtde_cobrado, qtde_quitado e a lista de comandas a partir dos detalhes das comandas.
// Uma instrução por lote (o Delphi fazia 3 consultas por item).
export async function baixa(c, ids) {
  await c.query('set session group_concat_max_len = 1000000');
  for (const lote of pedaco(ids, 500)) {
    await c.query(
      `update tb_diaria d
         left join (select id_diaria, sum(qtde) as q,
                           group_concat(concat(id_comanda, '.', qtde + 0) order by id separator ' # ') as s
                      from tb_comandas_detalhes where id_diaria in (?) group by id_diaria) x on x.id_diaria = d.id
          set d.qtde_cobrado = coalesce(x.q, 0), d.qtde_quitado = coalesce(x.q, 0), d.comandas = coalesce(x.s, '')
        where d.id in (?)`, [lote, lote]);
  }
}
router.post('/baixa', async (req, res) => {
  const ids = idsValidos(req.body?.ids);
  await tx((c) => baixa(c, ids));
  res.json({ ok: true, itens: ids.length });
});

// ------------------------------------------------------------------ edição do item (aba Edição)
const NUMEROS = {
  qtde_original: [-999999, 999999], qtde_alterada: [-999999, 999999], produto_preco: [0, 99999999], produto_preco_cada: [0, 99999],
  conversao_produto_qtde: [-999999, 999999], conversao_produto_preco: [0, 99999999], conversao_produto_preco_cada: [0, 99999],
};
const TEXTOS = {
  produto_codigo: 30, produto_descricao_expedicao: 255, conversao_produto_codigo: 30, conversao_produto_descricao: 255, obs: 1000, cobrado_obs: 1000,
};
const BOOLS = ['quitado_manualmente', 'cobranca_cancelada'];

router.get('/diaria/:id', async (req, res) => {
  const [row] = await itens(pool, 'where p.id = ?', [idValido(req.params.id, 'Item')]);
  if (!row) throw notFound('Item');
  res.json(row);
});

// Comandas em que o item aparece (cmdID).
router.get('/diaria/:id/comandas', async (req, res) => {
  const [rows] = await pool.query(
    `select d.*, c.data_emissao, c.status, u.usuario
       from tb_comandas_detalhes d
       left join tb_comandas c on c.id = d.id_comanda
       left join tb_usuarios u on u.id = d.id_usuario
      where d.id_diaria = ? order by d.id`, [idValido(req.params.id, 'Item')]);
  res.json(rows);
});

// Salvar do item (prrAfterPost → baixa → refresh). Os valores derivados são recalculados aqui, do mesmo jeito que o
// dsprrDataChange fazia na tela; o que vem do cliente é validado e passa por lista de campos permitidos.
router.put('/diaria/:id', async (req, res) => {
  const id = idValido(req.params.id, 'Item');
  const b = pick(req.body, [...Object.keys(NUMEROS), ...Object.keys(TEXTOS), ...BOOLS]);
  if (!Object.keys(b).length) throw invalid('Nada para gravar.');
  for (const [k, [min, max]] of Object.entries(NUMEROS)) {
    if (b[k] === undefined) continue;
    const n = Number(b[k]);
    if (b[k] === '' || b[k] === null || !Number.isFinite(n) || n < min || n > max) throw invalid(`Valor inválido em ${k.replaceAll('_', ' ')}.`);
    b[k] = n;
  }
  for (const [k, max] of Object.entries(TEXTOS)) if (b[k] !== undefined) b[k] = String(b[k] ?? '').trim().slice(0, max);
  for (const k of BOOLS) if (b[k] !== undefined) b[k] = dbBool(b[k]);

  const novo = await tx(async (c) => {
    const [[atual]] = await c.query('select * from tb_diaria where id = ? for update', [id]);
    if (!atual) throw notFound('Item');
    const n = { ...b };
    const mudancas = [];

    // produto programado: código → cadastro
    if (b.produto_codigo !== undefined && b.produto_codigo !== (atual.produto_codigo ?? '')) {
      if (!b.produto_codigo || b.produto_codigo === '0') throw invalid('Informe o código do produto.');
      const p = await produtoPorCodigo(c, b.produto_codigo);
      if (!p) throw invalid('Produto não encontrado!');
      Object.assign(n, { id_produto: p.id, produto_descricao: p.descricao });
      if (n.produto_descricao_expedicao === undefined) n.produto_descricao_expedicao = p.descricao_expedicao ?? p.descricao;
      if (n.produto_preco === undefined) n.produto_preco = p.preco;
      if (n.produto_preco_cada === undefined) n.produto_preco_cada = p.divisor_basico;
      mudancas.push(`Alterou produto para ${p.codigo}`);
    }
    const f = { ...atual, ...n };
    n.produto_preco_unitario = arred(Number(f.produto_preco) / dividir(f.produto_preco_cada), 3);
    // total do item = (fixa + extra) × (preço ÷ cada)
    n.preco_total = arred((Number(f.qtde_original) + Number(f.qtde_alterada)) * (Number(f.produto_preco) / dividir(f.produto_preco_cada)), 3);

    // "cobrar como": código → cadastro (preço, cada e a quantidade equivalente ao total do item)
    if (b.conversao_produto_codigo !== undefined && b.conversao_produto_codigo !== (atual.conversao_produto_codigo ?? '')) {
      if (b.conversao_produto_codigo && b.conversao_produto_codigo !== '0') {
        const p = await produtoPorCodigo(c, b.conversao_produto_codigo);
        if (!p) throw invalid('Produto não encontrado!');
        n.conversao_id_produto = p.id; n.id_produto_conversao = p.id;
        if (n.conversao_produto_descricao === undefined) n.conversao_produto_descricao = p.descricao;
        if (n.conversao_produto_preco === undefined) n.conversao_produto_preco = Number(p.preco) || 0;
        if (n.conversao_produto_preco_cada === undefined) n.conversao_produto_preco_cada = p.divisor_basico;
        if (n.conversao_produto_qtde === undefined) {
          n.conversao_produto_qtde = arred(n.preco_total / ((Number(p.preco) || 0) / dividir(p.divisor_basico) || 1), 0);
        }
        if (!Number(f.produto_preco) && n.produto_preco === undefined) n.produto_preco = Number(p.preco) || 0;
        mudancas.push(`Alterou produto cobrado para ${p.codigo}`);
      } else { n.conversao_id_produto = 0; n.id_produto_conversao = 0; mudancas.push('Removeu o produto cobrado'); }
    }
    const g = { ...atual, ...n };
    n.conversao_produto_valor = arred((Number(g.conversao_produto_qtde) || 0) * ((Number(g.conversao_produto_preco) || 0) / dividir(g.conversao_produto_preco_cada)), 3);

    for (const [k, rot] of [['qtde_original', 'fixa'], ['qtde_alterada', 'extra'], ['produto_preco', 'preço'], ['conversao_produto_qtde', 'qtde cobrada'], ['conversao_produto_preco', 'preço cobrado']]) {
      if (b[k] !== undefined && Number(b[k]) !== Number(atual[k])) mudancas.push(`Alterou ${rot} de ${atual[k]} para ${b[k]}`);
    }
    for (const k of BOOLS) if (b[k] !== undefined && b[k] !== atual[k]) mudancas.push(`${k === 'quitado_manualmente' ? 'Quitado manualmente' : 'Cobrança cancelada'}: ${b[k]}`);
    if (b.obs !== undefined && b.obs !== (atual.obs ?? '')) mudancas.push('Alterou observações');
    await c.query('update tb_diaria set ? where id = ?', [n, id]);
    await baixa(c, [id]);
    if (mudancas.length) await logDiaria(c, id, req.userId, `Faturamento ${String(atual.hora).slice(0, 5)}/${String(atual.data).slice(0, 10)}\n${mudancas.join('\n')}`);
    return (await itens(c, 'where p.id = ?', [id]))[0];
  });
  res.json(novo);
});

// Exclui uma linha da lista de comandas do item (cmdID.Delete): tira a quantidade do item e refaz a baixa.
router.delete('/detalhes/:id', async (req, res) => {
  const id = idValido(req.params.id, 'Detalhe');
  const diaria = await tx(async (c) => {
    const [[d]] = await c.query('select * from tb_comandas_detalhes where id = ? for update', [id]);
    if (!d) throw notFound('Detalhe da comanda');
    await c.query('delete from tb_comandas_detalhes where id = ?', [id]);
    await baixa(c, [d.id_diaria]);
    await logDiaria(c, d.id_diaria, req.userId, `Removeu da comanda ${d.id_comanda} a qtde ${d.qtde}`);
    return d.id_diaria;
  });
  res.json({ ok: true, id_diaria: diaria });
});

// ------------------------------------------------------------------ comandas
const SQL_COMANDA = `
  select c.*,
    sum(truncate(truncate(i.preco, 3) * truncate(i.qtde / if(i.preco_cada = 0, 1, i.preco_cada), 3), 3)) as vr_comanda,
    sum(truncate(truncate(i.preco, 3) * truncate(i.qtde, 3), 3)) as vr_comandax,
    i.id_comanda
  from tb_comandas c left join tb_comandas_itens i on i.id_comanda = c.id
  where c.id = ? group by c.id`;

router.get('/comandas/:id', async (req, res) => {
  const id = idValido(req.params.id, 'Comanda');
  const [[comanda]] = await pool.query(SQL_COMANDA, [id]);
  if (!comanda) throw notFound('Comanda');
  const [its] = await pool.query(
    `select i.*, truncate(truncate(i.preco, 3) * truncate(i.qtde / if(i.preco_cada = 0, 1, i.preco_cada), 3), 3) as vr_item,
            truncate(i.qtde / if(i.preco_cada = 0, 1, i.preco_cada), 3) as new_qtde, truncate(i.preco, 3) as new_preco
       from tb_comandas_itens i where i.id_comanda = ? order by i.id`, [id]);
  const [mercadorias] = await pool.query('select * from tb_comandas_mercadorias where id_comanda = ? order by id', [id]);
  res.json({ comanda, itens: its, mercadorias });
});

// Detalhes de cada item da comanda (cmdDT, ligado ao item selecionado)
router.get('/comandas/itens/:id/detalhes', async (req, res) => {
  const [rows] = await pool.query(
    `select d.*, truncate(truncate(d.qtde / if(d.preco_cada = 0, 1, d.preco_cada), 3) * truncate(d.preco, 3), 3) as vr_item,
            truncate(d.qtde / if(d.preco_cada = 0, 1, d.preco_cada), 3) as xqtde
       from tb_comandas_detalhes d where d.id_comanda_item = ? order by d.data, d.hora, d.id`, [idValido(req.params.id, 'Item da comanda')]);
  res.json(rows);
});

// Gerar comanda (btnComandaClick). O cliente manda os ids que estão visíveis na grade; as quantidades e preços são
// lidos de novo do banco aqui. Tudo na mesma transação: se algo falha, não sobra comanda pela metade.
// O Delphi usava a unidade selecionada na lista para a comanda mesmo com itens de outras unidades na grade;
// aqui todos os itens precisam ser da unidade informada.
router.post('/comandas', async (req, res) => {
  const ids = idsValidos(req.body?.ids);
  const unidadeId = idValido(req.body?.unidade, 'Unidade');
  if (!isIsoDate(req.body?.data_emissao)) throw invalid('Informe a data de saída (emissão) no formato AAAA-MM-DD.');
  const emissao = req.body.data_emissao;

  const idComanda = await tx(async (c) => {
    const [[uni]] = await c.query('select id, id_cliente, id_cliente_comandas, id_unidade_comandas from tb_unidades where id = ?', [unidadeId]);
    if (!uni) throw notFound('Unidade');
    const linhas = await itens(c, 'where p.id in (?) order by p.data, p.hora, p.id', [ids]);
    if (!linhas.some((l) => Number(l.qtde_pendente) > 0)) throw invalid('Não há itens pendentes para emissão de comanda.');
    if (linhas.some((l) => Number(l.id_unidade) !== uni.id)) throw invalid('Há itens de mais de uma unidade. Marque "Conectar cliente" para gerar a comanda de uma unidade por vez.');

    const usarComandas = Number(uni.id_cliente_comandas) > 0 && Number(uni.id_unidade_comandas) > 0;
    const [[usr]] = req.userId ? await c.query('select usuario from tb_usuarios where id = ?', [req.userId]) : [[null]];
    const [ins] = await c.query(
      `insert into tb_comandas set data_emissao = ?, id_cliente = ?, id_unidade = ?, id_usuario = ?, usuario = ?, data_hora = now(), status = 'PROCESSADO'`,
      [emissao, usarComandas ? uni.id_cliente_comandas : uni.id_cliente, usarComandas ? uni.id_unidade_comandas : uni.id, req.userId, usr?.usuario ?? null]);
    const idc = ins.insertId;

    const detalhes = []; // {diaria, id_produto, produto_codigo, descricao, preco, cada, qtde}
    for (const l of linhas) {
      const pend = Number(l.qtde_pendente);
      const cancelada = l.cobranca_cancelada === 'True';
      const convId = l.conversao_id_produto === null || l.conversao_id_produto === undefined ? '' : String(l.conversao_id_produto);
      if (convId > '' && pend !== 0 && Number(l.conversao_produto_preco) > 0 && !cancelada) {
        // mercadoria convertida: registra o que saiu e cobra o produto de conversão
        await c.query('insert into tb_comandas_mercadorias set ?', [{
          id_comanda: idc, id_diaria: l.id, data: l.data, hora: l.hora, descricao: l.produto_descricao_expedicao, qtde: pend }]);
        detalhes.push({ diaria: l.id, data: l.data, hora: l.hora, id_produto: l.id_produto_conversao, produto_codigo: l.conversao_produto_codigo,
          descricao_generica: l.conversao_produto_descricao, preco: l.conversao_produto_preco, preco_cada: l.conversao_produto_preco_cada, qtde: l.conversao_produto_qtde });
      } else if (l.id_produto && pend !== 0 && Number(l.produto_preco) > 0 && l.converter !== 'True' && !cancelada) {
        detalhes.push({ diaria: l.id, data: l.data, hora: l.hora, id_produto: l.id_produto, produto_codigo: l.produto_codigo,
          descricao_generica: l.produto_descricao, preco: l.produto_preco, preco_cada: l.produto_preco_cada, qtde: pend });
      }
    }
    if (!detalhes.length) throw invalid('Nenhum item cobrável (sem preço, já cobrado ou com cobrança cancelada).');

    for (const d of detalhes) {
      const [r] = await c.query('insert into tb_comandas_detalhes set ?', [{
        id_comanda: idc, id_diaria: d.diaria, data: d.data, hora: d.hora, id_usuario: req.userId, id_produto: d.id_produto,
        produto_codigo: d.produto_codigo, descricao_generica: d.descricao_generica, preco: d.preco, preco_cada: d.preco_cada, qtde: d.qtde }]);
      d.id = r.insertId;
    }
    const [[tot]] = await c.query(
      `select sum(truncate(preco, 3) * truncate(qtde / if(preco_cada = 0, 1, preco_cada), 3)) as v from tb_comandas_detalhes where id_comanda = ?`, [idc]);
    await c.query('update tb_comandas set valor_total = ? where id = ?', [tot.v ?? 0, idc]);

    // itens da comanda = detalhes agrupados por descrição + preço + "cada"
    const grupos = new Map();
    for (const d of detalhes) {
      const k = `${d.descricao_generica}\u0000${Number(d.preco)}\u0000${Number(d.preco_cada)}`;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(d);
    }
    for (const ds of grupos.values()) {
      const p = ds[0];
      const qtde = ds.reduce((s, d) => s + Number(d.qtde), 0);
      const [ri] = await c.query('insert into tb_comandas_itens set ?', [{
        id_comanda: idc, id_produto: p.id_produto, produto_codigo: p.produto_codigo, descricao_generica: p.descricao_generica,
        preco: p.preco, preco_cada: p.preco_cada, qtde, preco_total: arred((Number(p.preco) / dividir(p.preco_cada)) * qtde, 3) }]);
      await c.query('update tb_comandas_detalhes set id_comanda_item = ? where id in (?)', [ri.insertId, ds.map((d) => d.id)]);
      await c.query('update tb_comandas_mercadorias set id_comanda_item = ? where id_comanda = ? and id_diaria in (?)', [ri.insertId, idc, ds.map((d) => d.diaria)]);
    }

    await baixa(c, linhas.map((l) => l.id));
    for (const d of detalhes) await logDiaria(c, d.diaria, req.userId, `Comanda ${idc}: cobrou ${d.qtde} de ${d.descricao_generica}`);
    return idc;
  });
  res.status(201).json({ id: idComanda });
});

// Excluir comanda (bExcluirClick): devolve as quantidades aos itens da programação e apaga tudo da comanda.
/** Botão "Gerar NFe" (bNotaFiscalClick): exige itens e delega a geração da fatura/NF. */
router.post('/comandas/:id/nfe', async (req, res) => {
  const id = idValido(req.params.id, 'Comanda');
  const [[cmd]] = await pool.query('select id, id_cliente, id_unidade, id_nota_fiscal from tb_comandas where id = ?', [id]);
  if (!cmd) throw notFound('Comanda');
  const [[{ n }]] = await pool.query('select count(*) as n from tb_comandas_itens where id_comanda = ?', [id]);
  if (!n) throw invalid('Não há itens para emissão da NF.');
  if (Number(cmd.id_nota_fiscal) > 0) throw invalid('Esta comanda já possui nota fiscal.');
  const saida = req.body?.data_saida ?? req.body?.data_emissao;
  if (!isIsoDate(saida)) throw invalid('Data de saída inválida.');
  const r = await tx(async (c) => {
    const [[trava]] = await c.query('select id_nota_fiscal from tb_comandas where id = ? for update', [id]);
    if (Number(trava?.id_nota_fiscal) > 0) throw invalid('Esta comanda já possui nota fiscal.');
    const [[usr]] = req.userId ? await c.query('select usuario from tb_usuarios where id = ?', [req.userId]) : [[null]];
    return geraFatura(c, { comandas: [id], idCliente: cmd.id_cliente, idUnidade: cmd.id_unidade, saida, usuario: usr?.usuario ?? '' });
  });
  res.status(201).json(r);
});

router.delete('/comandas/:id', async (req, res) => {
  const id = idValido(req.params.id, 'Comanda');
  await tx(async (c) => {
    const [[cmd]] = await c.query('select * from tb_comandas where id = ? for update', [id]);
    if (!cmd) throw notFound('Comanda');
    if (Number(cmd.id_nota_fiscal) > 0 || Number(cmd.id_fechamento) > 0) throw invalid('Esta comanda já foi usada em fechamento/nota fiscal e não pode ser eliminada.');
    const [det] = await c.query('select id_diaria, qtde from tb_comandas_detalhes where id_comanda = ?', [id]);
    const diarias = [...new Set(det.map((d) => d.id_diaria))];
    await c.query('delete from tb_diaria_comandas where id_comanda = ?', [id]);
    await c.query('update tb_diaria set id_comanda = 0 where id_comanda = ?', [id]);
    await c.query('delete from tb_comandas_itens where id_comanda = ?', [id]);
    await c.query('delete from tb_comandas_detalhes where id_comanda = ?', [id]);
    await c.query('delete from tb_comandas_mercadorias where id_comanda = ?', [id]);
    await c.query('delete from tb_comandas where id = ?', [id]);
    if (diarias.length) await baixa(c, diarias);
    if (det.length) { // um único INSERT para todos os detalhes (antes: um por linha); data/hora pelo relógio do MySQL
      await c.query(`insert into tb_diaria_log (id_diaria, id_usuario, data, hora, log) values ${det.map(() => '(?, ?, curdate(), curtime(), ?)').join(', ')}`,
        det.flatMap((d) => [d.id_diaria, req.userId, `Comanda ${id} eliminada (qtde ${d.qtde})`]));
    }
  });
  res.json({ ok: true });
});

export default router;
