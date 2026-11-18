import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from './faturamento.js';
test('exporta funções de filtro e cor', () => {
  assert.equal(typeof F.passaFiltro, 'function');
  assert.equal(typeof F.corLinha, 'function');
  assert.equal(typeof F.rodape, 'function');
  assert.ok(F.CORES);
});

test('conversão "cobrar como" vale só para a quantidade pendente', () => {
  const f = { qtde_original: 630, qtde_alterada: 100, qtde_cobrado: 630, produto_preco: 0.76, produto_preco_cada: 1 };
  assert.equal(F.qtdePendente(f), 100);
  const m = F.aplicaConversao({ ...f, ...F.derivados(f) }, { id: 1, codigo: '10.01', descricao: 'PAO FRANCES KG', preco: 13.01, divisor_basico: 20 });
  assert.equal(m.conversao_produto_qtde, 117); // 100 × 0,76 ÷ (13,01/20), e não 853 (do total 730)
  const tudo = F.aplicaConversao({ ...f, qtde_cobrado: 0, ...F.derivados({ ...f, qtde_cobrado: 0 }) }, { id: 1, codigo: '10.01', descricao: 'X', preco: 13.01, divisor_basico: 20 });
  assert.equal(tudo.conversao_produto_qtde, 853);
});
