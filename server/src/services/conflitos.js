import { pool } from '../db.js';
import { addDays, isIsoDate } from '../rules.js';

// "Verificar possíveis problemas de programação" (menu "Verificar conflitos de produção" do Delphi, u_prg_diaria/u_prg_conflitos).
// Regras ORIGINAIS do sistema antigo: fora_producao, fixa_fora_producao e fixa_ausente. As demais são conferências acrescentadas
// no sistema novo (erros comuns de digitação/esquecimento).
// Gravidade: erro (quase certo que está errado), aviso (vale conferir), info (pode ser intencional).
export const REGRAS = {
  // --- regras do sistema antigo ---
  fora_producao: ['erro', 'Fora da produção (programação diária)'],
  fixa_fora_producao: ['erro', 'Fora da produção (programação fixa)'],
  fixa_ausente: ['aviso', 'Item da programação fixa não consta na diária'],
  // --- conferências novas ---
  sem_hora: ['erro', 'Item sem hora de entrega'],
  qtde_zero: ['erro', 'Item com quantidade zero'],
  preco_zero: ['erro', 'Item sem preço'],
  produto_inativo: ['erro', 'Produto inativo ou excluído'],
  duplicado: ['erro', 'Item duplicado (mesmo produto e hora)'],
  status_incoerente: ['erro', 'Situação da empresa não bate com os itens'],
  cancelada_com_itens: ['erro', 'Empresa cancelada, mas ainda com itens'],
  sem_roteiro: ['aviso', 'Item sem roteiro/motorista (opcional)'],
  sem_turno: ['aviso', 'Produto de produção sem turno ou data de produção'],
  qtde_atipica: ['aviso', 'Quantidade muito diferente do costume'],
  sem_itens: ['aviso', 'Empresa ativa sem nenhum item'],
  fixa_nao_ativada: ['aviso', 'Tem programação fixa neste dia, mas ela não foi ativada'],
  preco_diferente: ['info', 'Preço do item diferente do cadastro'],
};
const MAX_DIAS = 31;
const LIMITE = 500; // por regra

const VALIDO = "coalesce(p.cancelado, 'False') <> 'True'";
const QTDE = '(p.qtde_original + p.qtde_alterada)';
const BASE = `from tb_diaria p
  join tb_status ps on ps.id = p.id_status
  left join tb_unidades un on un.id = p.id_unidade
  left join tb_produtos pr on pr.id = p.id_produto
  left join tb_referencias rf on rf.id = pr.id_referencia`;
const COLS = `p.id as id_item, p.id_status, p.id_unidade, p.data, left(p.hora, 5) as hora, un.nome as unidade,
  coalesce(nullif(p.produto_descricao_expedicao, ''), p.produto_descricao, pr.descricao) as produto,
  datediff(p.data, p.producao_data) as dias_prod, coalesce(rf.produto_especial, 'False') as especial`;

const n = (v) => Number(v) || 0;
const fmt = (v) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const plural = (d) => (d === 0 ? 'o mesmo dia da entrega' : d > 0 ? `${d} dia(s) antes da entrega` : `${-d} dia(s) DEPOIS da entrega`);
const regraProducao = (especial, d) => (especial ? 'Produto especial deve ser produzido 1 dia antes da entrega.' : `Produto comum deve ser produzido no mesmo dia da entrega${d < 0 ? ' (não pode ser depois)' : ''}.`);
const dataBr = (iso) => String(iso).slice(0, 10).split('-').reverse().join('/');

/** Valida e normaliza o período (no máximo 31 dias). */
export function periodo(de, ate) {
  if (!isIsoDate(de)) throw Object.assign(new Error('Informe a data inicial (AAAA-MM-DD).'), { status: 422 });
  const fim = ate && isIsoDate(ate) ? ate : de;
  if (fim < de) throw Object.assign(new Error('A data final não pode ser anterior à inicial.'), { status: 422 });
  let d = de; let dias = 1;
  while (d < fim) { d = addDays(d, 1); dias += 1; if (dias > MAX_DIAS) throw Object.assign(new Error(`Período máximo de ${MAX_DIAS} dias.`), { status: 422 }); }
  return { de, ate: fim, dias };
}

const reg = (tipo, linha, detalhe) => ({
  tipo, gravidade: REGRAS[tipo][0], titulo: REGRAS[tipo][1], detalhe,
  data: String(linha.data).slice(0, 10), id_status: linha.id_status ?? null, id_unidade: linha.id_unidade ?? null, unidade: linha.unidade ?? '—',
  // destino ao clicar em Abrir: item da diária; no problema da fixa, o item cadastrado na Programação fixa; "não consta na diária" abre só a empresa
  destino: tipo === 'fixa_fora_producao' ? 'fixa' : 'diaria', id_item: tipo === 'fixa_ausente' ? null : linha.id_item ?? null,
  produto: linha.produto ?? null, hora: linha.hora ?? null,
});

export async function verificaProgramacao(de, ate, db = pool, opcoes = {}) {
  const per = periodo(de, ate);
  const q = async (sql, args) => (await db.query(sql, args))[0];
  const itens = (extra) => q(`select ${COLS} ${BASE} where p.data between ? and ? and ${VALIDO} and ${extra} order by p.data, un.nome, p.hora limit ${LIMITE}`, [per.de, per.ate]);
  const out = [];
  const add = (tipo, linhas, detalhe) => { for (const l of linhas) out.push(reg(tipo, l, detalhe(l))); };

  // Regra do Delphi: produto de produção comum é feito no MESMO dia da entrega; produto especial, 1 DIA ANTES.
  const foraDiaria = await itens(`pr.produto_producao = 'True' and p.producao_data is not null
    and ((coalesce(rf.produto_especial, 'False') <> 'True' and datediff(p.data, p.producao_data) <> 0)
      or (rf.produto_especial = 'True' and datediff(p.data, p.producao_data) <> 1))`);
  add('fora_producao', foraDiaria, (l) => `${regraProducao(l.especial === 'True', n(l.dias_prod))} Produção marcada para ${plural(n(l.dias_prod))}.`);

  add('sem_hora', await itens("(p.hora is null or p.hora = '00:00:00')"), () => 'Defina o horário de entrega do item.');
  add('qtde_zero', await itens(`${QTDE} <= 0`), () => 'A quantidade total (fixa + extra) é zero ou negativa; cancele o item ou corrija.');
  add('preco_zero', await itens('coalesce(p.produto_preco, 0) <= 0'), () => 'O item será faturado a R$ 0,00.');
  add('produto_inativo', await itens("(pr.id is null or coalesce(pr.ativo, 'True') = 'False')"), (l) => (l.produto ? 'O produto foi inativado ou removido do cadastro depois de programado.' : 'Produto não encontrado no cadastro.'));
  // OPCIONAL (desligada por padrão): muitos itens não usam roteiro/motorista
  if (opcoes.semRoteiro) add('sem_roteiro', await itens('coalesce(p.id_roteiro, 0) = 0'), () => 'Sem roteiro, o item não entra na lista de entregas/itinerário.');
  add('sem_turno', await itens("pr.produto_producao = 'True' and (coalesce(p.producao_turno, 0) = 0 or p.producao_data is null)"), () => 'A produção não sabe quando fazer este item.');
  add('preco_diferente', await itens('pr.id is not null and coalesce(p.produto_preco, 0) > 0 and abs(p.produto_preco - pr.preco) > 0.0001'), () => 'Confira se foi desconto/ajuste proposital (Ajustar preços traz o do cadastro).');

  const dups = await q(`select min(p.id) as id_item, p.id_status, p.id_unidade, p.data, left(p.hora, 5) as hora, un.nome as unidade,
      coalesce(nullif(max(p.produto_descricao_expedicao), ''), max(pr.descricao)) as produto, count(*) as vezes
    ${BASE} where p.data between ? and ? and ${VALIDO}
    group by p.id_status, p.id_unidade, p.data, p.id_produto, p.hora, un.nome having count(*) > 1 order by p.data, un.nome limit ${LIMITE}`, [per.de, per.ate]);
  add('duplicado', dups, (l) => `${l.vezes} itens iguais lançados; some as quantidades em um só ou cancele o repetido.`);

  const atip = await q(`select * from (
      select ${COLS}, ${QTDE} as qtde,
        (select avg(h.qtde_original + h.qtde_alterada) from tb_diaria h where h.id_unidade = p.id_unidade and h.id_produto = p.id_produto
           and h.data < p.data and h.data >= date_sub(p.data, interval 56 day) and dayofweek(h.data) = dayofweek(p.data) and coalesce(h.cancelado, 'False') <> 'True') as media,
        (select count(*) from tb_diaria h where h.id_unidade = p.id_unidade and h.id_produto = p.id_produto
           and h.data < p.data and h.data >= date_sub(p.data, interval 56 day) and dayofweek(h.data) = dayofweek(p.data) and coalesce(h.cancelado, 'False') <> 'True') as amostras
      ${BASE} where p.data between ? and ? and ${VALIDO}) t
    where amostras >= 3 and media >= 5 and (qtde >= media * 3 or qtde <= media / 3) order by data, unidade limit ${LIMITE}`, [per.de, per.ate]);
  add('qtde_atipica', atip, (l) => `Quantidade ${fmt(l.qtde)} contra média de ${fmt(l.media)} nos últimos ${n(l.amostras)} mesmos dias da semana — possível erro de digitação.`);

  // situação da empresa x itens
  const sts = await q(`select ps.id as id_status, ps.id_unidade, ps.data, ps.status, un.nome as unidade,
      sum(case when ${VALIDO} then 1 else 0 end) as validos,
      sum(case when ${VALIDO} and (p.programacao_fixa = 'False' or p.qtde_alterada <> 0) then 1 else 0 end) as alterados,
      sum(case when ${VALIDO} and p.programacao_fixa = 'True' and p.qtde_alterada = 0 then 1 else 0 end) as fixos
    from tb_status ps left join tb_diaria p on p.id_status = ps.id left join tb_unidades un on un.id = ps.id_unidade
    where ps.data between ? and ? group by ps.id, ps.id_unidade, ps.data, ps.status, un.nome order by ps.data, un.nome limit ${LIMITE * 4}`, [per.de, per.ate]);
  const NOME = ['sem itens', 'normal', 'alterada', 'cancelada'];
  for (const s of sts) {
    const st = n(s.status); const base = { ...s, data: s.data };
    if (st === 3) { if (n(s.validos) > 0) out.push(reg('cancelada_com_itens', base, `${n(s.validos)} item(ns) ativo(s) em empresa marcada como cancelada.`)); continue; }
    if (n(s.validos) === 0 && (st === 1 || st === 2)) { out.push(reg('sem_itens', base, `Situação "${NOME[st]}", mas não há itens no dia.`)); continue; }
    const esperado = n(s.alterados) > 0 ? 2 : n(s.fixos) > 0 ? 1 : 0;
    if (esperado !== st) out.push(reg('status_incoerente', base, `Está como "${NOME[st]}", mas pelos itens deveria ser "${NOME[esperado]}" (use Ações do dia ▸ Verificar integridade de status).`));
  }

  // fixa cadastrada para o dia da semana, mas sem os itens fixos no dia (empresa ativa)
  const semFixa = await q(`select ps.id as id_status, ps.id_unidade, ps.data, un.nome as unidade
      from tb_status ps left join tb_unidades un on un.id = ps.id_unidade
     where ps.data between ? and ? and ps.status <> 3
       and exists (select 1 from tb_fixa f where f.id_unidade = ps.id_unidade and f.semana_dia = dayofweek(ps.data))
       and not exists (select 1 from tb_diaria p where p.id_status = ps.id and p.programacao_fixa = 'True')
     order by ps.data, un.nome limit ${LIMITE}`, [per.de, per.ate]);
  add('fixa_nao_ativada', semFixa, () => 'Use Programação fixa ▸ ativar para trazer os itens fixos deste dia da semana.');

  // Programação FIXA das empresas ativas no período (uma ocorrência por data): produção fora do esquema e itens que não vieram para a diária
  const FIXA = `from tb_status ps
      join tb_fixa f on f.id_unidade = ps.id_unidade and f.semana_dia = dayofweek(ps.data)
      left join tb_unidades un on un.id = ps.id_unidade
      left join tb_produtos pr on pr.id = f.id_produto
      left join tb_referencias rf on rf.id = pr.id_referencia
     where ps.data between ? and ? and ps.status <> 3`;
  const FCOLS = `f.id as id_item, ps.id as id_status, ps.id_unidade, ps.data, un.nome as unidade, left(f.hora, 5) as hora,
      coalesce(nullif(f.produto_descricao_expedicao, ''), pr.descricao) as produto, f.produto_qtde as qtde, f.producao_dias as dias_prod,
      coalesce(rf.produto_especial, 'False') as especial`;
  const fixaFora = await q(`select ${FCOLS} ${FIXA} and pr.produto_producao = 'True'
      and ((coalesce(rf.produto_especial, 'False') <> 'True' and f.producao_dias <> 0) or (rf.produto_especial = 'True' and f.producao_dias <> 1))
    order by ps.data, un.nome, f.hora limit ${LIMITE}`, [per.de, per.ate]);
  add('fixa_fora_producao', fixaFora, (l) => `Item fixo de ${n(l.qtde) ? fmt(l.qtde) : ''} un.: ${regraProducao(l.especial === 'True', n(l.dias_prod))} Cadastrado com produção ${plural(n(l.dias_prod))}. Corrija na Programação fixa.`);

  const fixaAus = await q(`select ${FCOLS} ${FIXA}
      and exists (select 1 from tb_diaria p2 where p2.id_status = ps.id and p2.programacao_fixa = 'True')
      and not exists (select 1 from tb_diaria p where p.id_status = ps.id and p.id_produto = f.id_produto and p.hora = f.hora
                       and p.qtde_original = f.produto_qtde and p.programacao_fixa = 'True')
    order by ps.data, un.nome, f.hora limit ${LIMITE}`, [per.de, per.ate]);
  add('fixa_ausente', fixaAus, (l) => `Pela programação fixa deveria ter ${fmt(l.qtde)} às ${l.hora}, mas não há esse item na diária (foi excluído ou alterado?).`);

  const ordem = { erro: 0, aviso: 1, info: 2 };
  out.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade] || a.data.localeCompare(b.data) || String(a.unidade).localeCompare(String(b.unidade)) || String(a.hora ?? '').localeCompare(String(b.hora ?? '')));
  const totais = { erro: 0, aviso: 0, info: 0 }; const porRegra = {};
  for (const p of out) { totais[p.gravidade] += 1; porRegra[p.tipo] = (porRegra[p.tipo] ?? 0) + 1; }
  return {
    periodo: { de: per.de, ate: per.ate, dias: per.dias, rotulo: per.dias === 1 ? dataBr(per.de) : `${dataBr(per.de)} a ${dataBr(per.ate)}` },
    totais, por_regra: Object.entries(REGRAS).map(([tipo, [gravidade, titulo]]) => ({ tipo, gravidade, titulo, qtde: porRegra[tipo] ?? 0 })), problemas: out,
  };
}
