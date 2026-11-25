import test from 'node:test';
import assert from 'node:assert/strict';

test('devolução: item com CFOP de venda (5102 copiado) usa o CFOP da nota (1202)', async () => {
  const { cfopDoItem } = await import('../src/services/nfeJson.js');
  assert.equal(cfopDoItem({ cfop_codigo: '5102' }, { cfop_codigo: '1202' }), '1202');
  assert.equal(cfopDoItem({ cfop_codigo: '1202' }, { cfop_codigo: '1202' }), '1202');
  assert.equal(cfopDoItem({ cfop_codigo: '5102' }, { cfop_codigo: '5102' }), '5102'); // venda normal não muda
  assert.equal(cfopDoItem({ cfop_codigo: '5949' }, { cfop_codigo: '5102' }), '5949');
});

test('AFs dos itens entram nos dados adicionais sem duplicar', async () => {
  const { afsDosItens, informacoesComTudo } = await import('../src/services/nfeJson.js');
  const itens = [{ ordem_compra: '123' }, { ordem_compra: ' 123 ' }, { ordem_compra: '456 (ac1)' }, { ordem_compra: '' }, {}];
  assert.deepEqual(afsDosItens(itens), ['123', '456 (ac1)']);
  assert.equal(informacoesComTudo({ texto_corpo: '' }, itens), 'AFs: 123, 456 (ac1)');
  assert.equal(informacoesComTudo({ texto_corpo: 'Entrega manhã.' }, [{ ordem_compra: '123' }]), 'Entrega manhã. AF: 123');
  assert.equal(informacoesComTudo({ texto_corpo: 'Ref. AF 123 conforme pedido' }, [{ ordem_compra: '123' }]), 'Ref. AF 123 conforme pedido');
});

test('unidade sem UF/cidade/CEP é apontada e o texto de entrega não imprime "null"', async () => {
  const { faltasEnderecoUnidade, textoEntregaUnidade } = await import('../src/services/geraFatura.js');
  assert.deepEqual(faltasEnderecoUnidade({ endereco: 'Av X', cidade: 'Santana', uf: null, cep: '' }), ['a UF', 'o CEP']);
  assert.deepEqual(faltasEnderecoUnidade({ endereco: 'Av X', cidade: 'S', uf: 'SP', cep: '1' }), []);
  const t = textoEntregaUnidade({ nome: 'IFF', endereco: 'Av X', numero: null, bairro: '', cidade: 'Santana', uf: 'SP', cep: '06543-320' });
  assert.equal(t, 'Entrega: IFF;Av X, S/N;Santana/SP CEP:06543-320');
});
