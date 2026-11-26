import { pool } from '../db.js';
import { addDays, isIsoDate } from '../rules.js';

// "Verificar problemas de programação" — SÓ as regras do sistema antigo (u_prg_conflitos / "Verificar conflitos de produção"):
//  1) fixa_ausente: item da Programação FIXA que não consta na diária (mesmo produto, hora e quantidade);
//  2) fixa_fora_producao: item da fixa com produção fora do esquema (comum = mesmo dia da entrega; especial = 1 dia antes);
//  3) fora_producao: o mesmo, para o item da diária.
// (As conferências extras que existiram nas fases 3xx — preço zero, duplicado, quantidade atípica, situação etc. — foram retiradas: ruído demais.)
export const REGRAS = {
  fixa_ausente: 'PROGRAMAÇÃO FIXA — não consta na diária',
  fixa_fora_producao: 'PROGRAMAÇÃO FIXA — produção fora do esquema',
  fora_producao: 'PROGRAMAÇÃO DIÁRIA — produção fora do esquema',
};
const MAX_DIAS = 31;
const LIMITE = 500; // por regra

const VALIDO = "coalesce(p.cancelado, 'False') <> 'True'";
const n = (v) => Number(v) || 0;
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

const reg = (tipo, l, detalhe) => ({
  tipo, titulo: REGRAS[tipo], detalhe,
  data: String(l.data).slice(0, 10), id_status: l.id_status ?? null, id_unidade: l.id_unidade ?? null, unidade: l.unidade ?? '—',
  // Abrir: item da diária; no problema da fixa, o item cadastrado na Programação fixa; "não consta na diária" abre só a empresa
  destino: tipo === 'fixa_fora_producao' ? 'fixa' : 'diaria', id_item: tipo === 'fixa_ausente' ? null : l.id_item ?? null,
  produto: l.produto ?? null, hora: l.hora ?? null, qtde: n(l.qtde), dias_prod: n(l.dias_prod),
});

export async function verificaProgramacao(de, ate, db = pool) {
  const per = periodo(de, ate);
  const q = async (sql, args) => (await db.query(sql, args))[0];
  const out = [];
  const add = (tipo, linhas, detalhe) => { for (const l of linhas) out.push(reg(tipo, l, detalhe(l))); };

  // Programação FIXA das empresas ativas no período (uma ocorrência por data)
  const FIXA = `from tb_status ps
      join tb_fixa f on f.id_unidade = ps.id_unidade and f.semana_dia = dayofweek(ps.data)
      left join tb_unidades un on un.id = ps.id_unidade
      left join tb_produtos pr on pr.id = f.id_produto
      left join tb_referencias rf on rf.id = pr.id_referencia
     where ps.data between ? and ? and ps.status <> 3`;
  const FCOLS = `f.id as id_item, ps.id as id_status, ps.id_unidade, ps.data, un.nome as unidade, left(f.hora, 5) as hora,
      coalesce(nullif(f.produto_descricao_expedicao, ''), pr.descricao) as produto, f.produto_qtde as qtde, f.producao_dias as dias_prod,
      coalesce(rf.produto_especial, 'False') as especial`;

  const fixaAus = await q(`select ${FCOLS} ${FIXA}
      and exists (select 1 from tb_diaria p2 where p2.id_status = ps.id and p2.programacao_fixa = 'True')
      and not exists (select 1 from tb_diaria p where p.id_status = ps.id and p.id_produto = f.id_produto and p.hora = f.hora
                       and p.qtde_original = f.produto_qtde and p.programacao_fixa = 'True')
    order by ps.data, un.nome, f.hora limit ${LIMITE}`, [per.de, per.ate]);
  add('fixa_ausente', fixaAus, () => 'Não consta na diária.');

  const fixaFora = await q(`select ${FCOLS} ${FIXA} and pr.produto_producao = 'True'
      and ((coalesce(rf.produto_especial, 'False') <> 'True' and f.producao_dias <> 0) or (rf.produto_especial = 'True' and f.producao_dias <> 1))
    order by ps.data, un.nome, f.hora limit ${LIMITE}`, [per.de, per.ate]);
  add('fixa_fora_producao', fixaFora, (l) => `${regraProducao(l.especial === 'True', n(l.dias_prod))} Cadastrado com produção ${plural(n(l.dias_prod))}.`);

  // Diária: produto de produção comum é feito no MESMO dia da entrega; produto especial, 1 DIA ANTES.
  const foraDiaria = await q(`select p.id as id_item, p.id_status, p.id_unidade, p.data, left(p.hora, 5) as hora, un.nome as unidade,
      coalesce(nullif(p.produto_descricao_expedicao, ''), p.produto_descricao, pr.descricao) as produto, (p.qtde_original + p.qtde_alterada) as qtde,
      datediff(p.data, p.producao_data) as dias_prod, coalesce(rf.produto_especial, 'False') as especial
    from tb_diaria p
      join tb_status ps on ps.id = p.id_status
      left join tb_unidades un on un.id = p.id_unidade
      left join tb_produtos pr on pr.id = p.id_produto
      left join tb_referencias rf on rf.id = pr.id_referencia
    where p.data between ? and ? and ${VALIDO} and pr.produto_producao = 'True' and p.producao_data is not null
      and ((coalesce(rf.produto_especial, 'False') <> 'True' and datediff(p.data, p.producao_data) <> 0)
        or (rf.produto_especial = 'True' and datediff(p.data, p.producao_data) <> 1))
    order by p.data, un.nome, p.hora limit ${LIMITE}`, [per.de, per.ate]);
  add('fora_producao', foraDiaria, (l) => `${regraProducao(l.especial === 'True', n(l.dias_prod))} Produção marcada para ${plural(n(l.dias_prod))}.`);

  const ordemTipo = Object.keys(REGRAS);
  out.sort((a, b) => ordemTipo.indexOf(a.tipo) - ordemTipo.indexOf(b.tipo) || a.data.localeCompare(b.data) || String(a.unidade).localeCompare(String(b.unidade)) || String(a.hora ?? '').localeCompare(String(b.hora ?? '')));
  const porRegra = {};
  for (const p of out) porRegra[p.tipo] = (porRegra[p.tipo] ?? 0) + 1;
  return {
    periodo: { de: per.de, ate: per.ate, dias: per.dias, rotulo: per.dias === 1 ? dataBr(per.de) : `${dataBr(per.de)} a ${dataBr(per.ate)}` },
    total: out.length, por_regra: Object.entries(REGRAS).map(([tipo, titulo]) => ({ tipo, titulo, qtde: porRegra[tipo] ?? 0 })), problemas: out,
  };
}
