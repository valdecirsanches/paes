// Filtros da tela "Roteiro de cargas" (u_cargas). Tudo é montado com parâmetros (?) e listas fechadas:
// nada vindo do cliente entra no SQL como texto. O Delphi concatenava as strings na mão.
import { invalid } from '../errors.js';
import { isIsoDate } from '../rules.js';

export const ACOMODACOES = ['SACARIA', 'CAIXA BRANCA', 'CAIXA QUADRADA', 'CAIXA AMARELINHA'];
/** rgRegiao (ordem do DFM) */
export const REGIOES = ['OSASCO', 'RAPOSO TAVARES', 'PINHEIROS', 'JAGUARE', 'LAPA', 'ANHANGUERA', 'PIRITUBA', 'BARUERI', 'ALPHAVILLE', 'TAMBORE', 'ITAPEVI', 'JANDIRA'];
const EXTRAS = ['cortado', 'margarina', 'coco', 'acucar', 'plastico', 'papel', 'pacote'];

const ind = (v, max, padrao, rotulo) => {
  if (v === undefined || v === '') return padrao;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > max) throw invalid(`Filtro "${rotulo}" inválido.`);
  return n;
};
const ehTrue = (col) => `${col} = 'True'`;
const naoTrue = (col) => `coalesce(${col}, '') <> 'True'`;

/** Carga efetiva: a gravada (1–3) ou, se ainda 0, a derivada da hora (até 07:59 → 1ª, até 10:59 → 2ª, depois → 3ª). */
export const cargaEfetiva = (alias) => `if(coalesce(${alias}.carga + 0, 0) > 0, ${alias}.carga + 0,
  case when ${alias}.hora < '08:00:00' then 1 when ${alias}.hora < '11:00:00' then 2 else 3 end)`;

/** Aba "Carga diária": índices dos radio groups como no Delphi (último item = "Tudo"). */
export function filtroDiaria(q = {}) {
  if (!isIsoDate(q.data)) throw invalid('Informe a data no formato AAAA-MM-DD.');
  const where = ["p.data = ?", 'ps.status in (1, 2)', "u.ativo = 'True'"];
  const params = [q.data];
  const tipo = ind(q.tipo, 3, 3, 'Tipo');
  if (tipo === 0) where.push(`${ehTrue('r.produto_especial')} and ${ehTrue('pr.produto_producao')}`);
  if (tipo === 1) where.push(`${naoTrue('r.produto_especial')} and ${ehTrue('pr.produto_producao')}`);
  if (tipo === 2) where.push(naoTrue('pr.produto_producao'));
  const emb = ind(q.embalagem, 2, 2, 'Embalagem');
  if (emb === 0) where.push("p.acomodacao_carga = 'SACARIA'");
  if (emb === 1) where.push("coalesce(p.acomodacao_carga, '') <> 'SACARIA'");
  const modal = ind(q.modal, 3, 3, 'Programação');
  if (modal === 0) where.push(`coalesce(p.qtde_alterada, 0) = 0 and ${naoTrue('p.cancelado')}`);
  if (modal === 1) where.push(`coalesce(p.qtde_alterada, 0) <> 0 and ${naoTrue('p.cancelado')}`);
  if (modal === 2) where.push(ehTrue('p.cancelado'));
  const carga = ind(q.carga, 3, 3, 'Carga');
  if (carga < 3) { where.push(`${cargaEfetiva('p')} = ?`); params.push(carga + 1); }
  const extra = ind(q.extra, 7, 7, 'Extra');
  if (extra < 7) where.push(ehTrue(`p.extra_${EXTRAS[extra]}`));
  const reg = ind(q.regiao, 12, 12, 'Região');
  if (reg < 12) { where.push('u.regiao = ?'); params.push(REGIOES[reg]); }
  const exp = ind(q.expedicao, 2, 2, 'Expedição');
  if (exp === 0) where.push(naoTrue('p.separado'));
  if (exp === 1) where.push(ehTrue('p.separado'));
  const alt = ind(q.alterados, 2, 2, 'Alterados');
  if (alt === 0) where.push('p.registro_alterado = 1');
  if (alt === 1) where.push('coalesce(p.registro_alterado, 0) <> 1');
  return { where: where.join(' and '), params };
}

/** Chaves aceitas em `desmarcados` da aba "Carga fixa" (cada uma = caixa desmarcada = exclui aquele grupo). */
export const CHAVES_FIXA = ['especiais', 'salgados', 'sacaria', 'demais', 'h1', 'h2', 'h3', ...EXTRAS, 'carga1', 'carga2', 'carga3',
  'osasco', 'raposo', 'pinheiros', 'jaguare', 'lapa', 'anhanguera', 'pirituba', 'barueri', 'alphaville', 'tambore', 'itapevi', 'jandira', 'outras'];
const REGIAO_CHAVE = { osasco: 'OSASCO', raposo: 'RAPOSO TAVARES', pinheiros: 'PINHEIROS', jaguare: 'JAGUARE', lapa: 'LAPA', anhanguera: 'ANHANGUERA', pirituba: 'PIRITUBA', barueri: 'BARUERI', alphaville: 'ALPHAVILLE', tambore: 'TAMBORE', itapevi: 'ITAPEVI', jandira: 'JANDIRA', outras: 'OUTRAS' };

export function filtroFixa(q = {}) {
  const dia = Number(q.dia);
  if (!Number.isInteger(dia) || dia < 1 || dia > 7) throw invalid('Escolha o dia da semana.');
  const lista = String(q.desmarcados ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const des = new Set(lista);
  for (const k of des) if (!CHAVES_FIXA.includes(k)) throw invalid(`Filtro "${k}" inválido.`);
  const where = ['f.semana_dia = ?', "u.ativo = 'True'"];
  const params = [dia];
  if (des.has('especiais')) where.push(naoTrue('r.produto_especial'));
  if (des.has('salgados')) where.push(ehTrue('r.produto_especial'));
  if (des.has('sacaria')) where.push("coalesce(f.acomodacao_carga, '') <> 'SACARIA'");
  if (des.has('demais')) where.push("f.acomodacao_carga = 'SACARIA'");
  for (const n of ['1', '2', '3']) if (des.has(`h${n}`)) { where.push("coalesce(f.producao_turno, '') <> ?"); params.push(n); }
  for (const e of EXTRAS) if (des.has(e)) where.push(naoTrue(`f.extra_${e}`));
  for (const [k, nome] of Object.entries(REGIAO_CHAVE)) if (des.has(k)) { where.push("coalesce(u.regiao, '') <> ?"); params.push(nome); }
  for (const n of [1, 2, 3]) if (des.has(`carga${n}`)) { where.push(`${cargaEfetiva('f')} <> ?`); params.push(n); }
  return { where: where.join(' and '), params };
}

export const SQL_DIARIA = (where) => `
  select p.id, p.registro_alterado, p.etiqueta_adesiva, p.programacao_fixa, p.data, p.hora, left(p.hora, 5) as xhora,
         p.qtde_original, p.qtde_alterada, (p.qtde_original + p.qtde_alterada) as display_total,
         p.produto_descricao_expedicao, p.acomodacao_carga, p.id_roteiro, p.cancelado, p.separado,
         ${cargaEfetiva('p')} as carga,
         u.nome as unidade_nome, u.telefone as unidade_telefone, u.regiao,
         left(rt.horario, 5) as xhorario, fo.apelido as motorista_apelido,
         r.produto_especial, pr.produto_producao
    from tb_diaria p
    left join tb_roteiro rt on rt.id = p.id_roteiro
    left join tb_funcionarios fo on fo.id = rt.id_funcionario
    left join tb_status ps on ps.id_unidade = p.id_unidade and ps.data = p.data
    left join tb_unidades u on u.id = p.id_unidade
    left join tb_produtos pr on pr.id = p.id_produto
    left join tb_referencias r on r.id = pr.id_referencia
   where ${where}
   order by p.id
   limit 5000`;

export const SQL_FIXA = (where) => `
  select f.id, f.semana_dia, f.hora, f.produto_qtde as qtde_total, f.produto_descricao_expedicao, f.acomodacao_carga,
         f.id_roteiro, f.producao_turno, ${cargaEfetiva('f')} as carga,
         u.nome as unidade_nome, u.telefone as unidade_telefone, u.regiao,
         rt.horario, fo.nome as motorista_nome
    from tb_fixa f
    left join tb_unidades u on u.id = f.id_unidade
    left join tb_produtos pr on pr.id = f.id_produto
    left join tb_referencias r on r.id = pr.id_referencia
    left join tb_roteiro rt on rt.id = if(coalesce(f.id_roteiro, 0) > 0, f.id_roteiro,
         (select min(rd.id_roteiro) from tb_roteiro_distribuicao rd where rd.id_unidade = f.id_unidade))
    left join tb_funcionarios fo on fo.id = rt.id_funcionario
   where ${where}
   order by fo.nome, rt.horario
   limit 5000`;
