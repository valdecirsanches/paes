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

test('destinatário da NFe: cliente por padrão; unidade só quando marcada', async () => {
  const { destinatarioNfe, emiteParaUnidade, faltasDestinatarioUnidade } = await import('../src/services/geraFatura.js');
  const cli = { razao_social: 'COZINHA', cnpj: '1', uf: 'SP', cidade: 'X', endereco: 'A', endereco_numero: '1', bairro: 'B', cep: '1', ie: 'I', fone: '11', pessoa: 'JURIDICA' };
  const uni = { nome: 'U', razao_social: 'ESCOLA LTDA', cnpj: '12.345.678/0001-90', ie: '9', endereco: 'Rua U', numero: '5', bairro: 'C', cidade: 'Santos', uf: 'SP', cep: '11000-000', telefone: '', emite_nfe_unidade: 'False' };
  assert.equal(destinatarioNfe(cli, uni), cli);
  assert.equal(emiteParaUnidade({ emite_nfe_unidade: 'True' }), true);
  const d = destinatarioNfe(cli, { ...uni, emite_nfe_unidade: 'True' });
  assert.equal(d.razao_social, 'ESCOLA LTDA'); assert.equal(d.cidade, 'Santos'); assert.equal(d.pessoa, 'J'); assert.equal(d.fone, '11');
  assert.deepEqual(faltasDestinatarioUnidade({ ...uni, cnpj: '', cep: null }), ['o CNPJ/CPF', 'o CEP']);
});

test('CEP com 7 dígitos é barrado antes de enviar (evita rejeição 225 de schema)', async () => {
  const { validaParaAutorizar } = await import('../src/services/nfeJson.js');
  const r = validaParaAutorizar({ cliente_cep: '0622002', entrega_cep: '0622002', entrega_uf: 'SP', entrega_cidade: 'OSASCO' }, [], {});
  assert.ok(r.some((m) => /CEP/.test(m) && /7 dígitos/.test(m)));
});

test('desativação: texto do aviso', async () => {
  const { textoDesativacao } = await import('../src/services/desativaProgramacao.js');
  assert.equal(textoDesativacao({ itens: 0, dias: 0, preservados: 0 }), null);
  assert.match(textoDesativacao({ itens: 12, dias: 3, preservados: 1 }), /12 item\(ns\) em 3 dia\(s\); 1 item/);
});

test('auditoria: gravar configuração de impressão é registrado; só a leitura é ignorada', async () => {
  const { deveRegistrar } = await import('../src/services/auditoria.js');
  assert.equal(deveRegistrar('GET', '/api/impressao/status', 200), false);
  assert.equal(deveRegistrar('POST', '/api/impressao/config', 200), true);
  assert.equal(deveRegistrar('PUT', '/api/impressao/destinos', 200), true);
  assert.equal(deveRegistrar('DELETE', '/api/status/5/diaria', 200), true);
  assert.equal(deveRegistrar('GET', '/api/auditoria', 200), false);
});
