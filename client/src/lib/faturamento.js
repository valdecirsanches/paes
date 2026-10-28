// Regras da tela Faturamento que o Delphi calculava na própria tela (sem banco): filtro da grade, cores e derivados.
const num = (v) => Number(v) || 0;
const txt = (v) => (v === null || v === undefined ? '' : String(v));

/** prrFilterRecord: radios Produtos / Programação / Status. */
export function passaFiltro(r, { mercadoria = 2, tipo = 2, status = 0 }) {
  const conv = r.converter === 'True';
  const cancelado = r.cancelado === 'True';
  const quitado = r.quitado_manualmente === 'True';
  const okProduto = mercadoria === 0 ? conv : mercadoria === 1 ? !conv : true;
  const okTipo = tipo === 0 ? num(r.tipo_prog) === 1 : tipo === 1 ? num(r.tipo_prog) === 2 : true;
  let okStatus;
  if (status === 0) { // Pendentes
    okStatus = conv
      ? txt(r.comandas).length === 0 && !quitado && !cancelado
      : (num(r.qtde_cobrado) === 0 || (num(r.valor_pendente) > 0 && num(r.qtde_pendente) > 0)) && !quitado && !cancelado;
  } else if (status === 1) okStatus = num(r.qtde_cobrado) > 0; // Cobrados
  else if (status === 2) { // Descontos
    okStatus = !conv && num(r.qtde_pendente) < 0 && ['1', '2'].includes(txt(r.ps_status)) && !cancelado && r.nome !== 'PRODUÇÃO EXTRA';
  } else if (status === 3) okStatus = cancelado; // Cancelados
  else okStatus = !cancelado; // Todos
  return okProduto && okTipo && okStatus;
}

export const CORES = {
  verde: ['#008000', '#fff'], amarelo: ['#ffff00', '#f00'], vermelho: ['#f00', '#fff'], laranja: ['#ff8000', '#000'],
  azul: ['#00f', '#fff'], aqua: ['#00ffff', '#000'], cinza: ['#808080', '#000'],
};
/** grdRICustomDrawCell: as regras se sobrepõem na ordem; a última que casar vence. */
export function corLinha(r) {
  const pend = num(r.qtde_pendente);
  const cobr = num(r.qtde_cobrado);
  const maiorQueConv = num(r.preco_total) > num(r.conversao_produto_valor);
  let c = null;
  if (pend === 0 || maiorQueConv) c = CORES.verde;
  if (pend < 0) c = CORES.amarelo;
  if (cobr === 0 && pend > 0) c = CORES.vermelho;
  if (cobr > 0 && pend > 0 && maiorQueConv) c = CORES.laranja;
  if (r.quitado_manualmente === 'True') c = CORES.azul;
  if (r.cobranca_cancelada === 'True') c = CORES.aqua;
  if (r.cancelado === 'True') c = CORES.cinza;
  return c ? { background: c[0], color: c[1] } : null;
}

/** Mesmas regras de cor, em tons suaves (fundo claro + barra lateral na cor original) — mais confortável de ler. */
export const SUAVES = new Map([
  ['#008000', ['#dcefd6', '#1f5a14']], ['#ffff00', ['#fff3b8', '#7a5200']], ['#f00', ['#fbdcd6', '#8f2a17']], ['#ff8000', ['#ffe5c7', '#7a4208']],
  ['#00f', ['#dbe5fb', '#1d3f9a']], ['#00ffff', ['#d4f2f4', '#0e5560']], ['#808080', ['#e7e3da', '#6f6a5e']],
]);
export function corSuave(r) {
  const c = corLinha(r); if (!c) return null;
  const [bg, fg] = SUAVES.get(c.background) ?? [c.background, c.color];
  return { background: bg, color: fg, '--acc': c.background };
}

const soma = (rows, k) => rows.reduce((s, r) => s + num(r[k]), 0);
/** Rodapé da grade: soma de Vr Pendência, soma de Valor e contagem de clientes (linhas). */
export const rodape = (rows) => ({ pendente: soma(rows, 'valor_pendente'), valor: soma(rows, 'produto_valor'), linhas: rows.length });

const arred = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
const cada = (v) => num(v) || 1;
/** dsprrDataChange: valores que mudam sozinhos quando um campo é editado. */
export function derivados(f) {
  return {
    qtde: arred(num(f.qtde_original) + num(f.qtde_alterada)),
    preco_total: arred((num(f.qtde_original) + num(f.qtde_alterada)) * (num(f.produto_preco) / cada(f.produto_preco_cada))),
    conversao_produto_valor: arred(num(f.conversao_produto_qtde) * (num(f.conversao_produto_preco) / cada(f.conversao_produto_preco_cada))),
  };
}
/** Código do produto "cobrar como" achado no cadastro: preenche descrição, preço, cada e a quantidade equivalente. */
export function aplicaConversao(f, p) {
  const preco = num(p.preco);
  const mud = {
    conversao_id_produto: p.id, conversao_produto_codigo: p.codigo, conversao_produto_descricao: p.descricao,
    conversao_produto_preco: preco, conversao_produto_preco_cada: p.divisor_basico,
    conversao_produto_qtde: Math.round(num(f.preco_total) / ((preco / cada(p.divisor_basico)) || 1)),
  };
  if (!num(f.produto_preco)) mud.produto_preco = preco;
  return mud;
}
/** Código do produto programado achado no cadastro. */
export const aplicaProduto = (p) => ({
  id_produto: p.id, produto_codigo: p.codigo, produto_descricao: p.descricao,
  produto_descricao_expedicao: p.descricao_expedicao ?? p.descricao, produto_preco: num(p.preco), produto_preco_cada: p.divisor_basico,
});
