// Valida só a camada HTTP que falha antes de tocar no banco.
import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';

app.locals.exigirLogin = false; // estes testes exercitam as regras, não o login (ver auth.test.js)
let server;
let base;
test.before(async () => {
  await new Promise((ok) => { server = app.listen(0, ok); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const call = async (method, path, body) => {
  const res = await fetch(base + path, {
    method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
};

test('data inválida → 422', async () => {
  assert.equal((await call('GET', '/api/status?data=lixo')).status, 422);
});
test('filtro fora da lista → 422 (nada vai para o SQL)', async () => {
  assert.equal((await call('GET', '/api/status?data=2026-10-26&filtro=x%27%3B--')).status, 422);
});
test('movimento-dia sem data → 422', async () => {
  assert.equal((await call('POST', '/api/status/movimento-dia', {})).status, 422);
});
test('replicar com opção inválida → 422', async () => {
  assert.equal((await call('POST', '/api/fixa/1/replicar', { dias: 'abc' })).status, 422);
});
test('dia da semana inválido → 422', async () => {
  assert.equal((await call('POST', '/api/status/1/fixa/copiar-dia-seguinte', { semana_dia: 9 })).status, 422);
});
test('rota inexistente → 404', async () => {
  assert.equal((await call('GET', '/api/nao-existe')).status, 404);
});
test('mercadorias sem data → 422', async () => {
  assert.equal((await call('GET', '/api/mercadorias')).status, 422);
});
test('etiquetas sem itens → 422', async () => {
  assert.equal((await call('POST', '/api/mercadorias/etiquetas', { ids: [] })).status, 422);
});
test('etiquetas com id malicioso → 422 (nada vai para o SQL)', async () => {
  assert.equal((await call('POST', '/api/mercadorias/etiquetas', { ids: ['1) or (1=1'] })).status, 422);
  assert.equal((await call('POST', '/api/mercadorias/etiquetas/dados', { ids: 'x' })).status, 422);
});
test('alterações: data e filtro validados', async () => {
  assert.equal((await call('GET', '/api/alteracoes')).status, 422);
  assert.equal((await call('GET', '/api/alteracoes?data=2026-10-26&filtro=x%27')).status, 422);
});
test('reclamação sem reclamante → 422 ou 404, nunca grava', async () => {
  const r = await call('PUT', '/api/reclamacoes/1', { reclamante: '   ' });
  assert.equal(r.status, 422);
});
test('conversão: id inválido → 422', async () => {
  assert.equal((await call('PUT', '/api/mercadorias/abc', { conversao_produto_qtde: 1 })).status, 422);
  assert.equal((await call('GET', '/api/mercadorias/0')).status, 422);
});
test('conversão: quantidade/preço inválidos → 422 antes de tocar no banco', async () => {
  assert.equal((await call('PUT', '/api/mercadorias/5', { conversao_produto_qtde: 'x' })).status, 422);
  assert.equal((await call('PUT', '/api/mercadorias/5', { conversao_produto_preco: -3 })).status, 422);
  assert.equal((await call('PUT', '/api/mercadorias/5', { campo_proibido: 1 })).status, 422);
});

test('produção: tipo fora da lista → 422', async () => {
  assert.equal((await call('GET', '/api/producao/resumo?tipo=x%27--&data=2026-10-26')).status, 422);
});
test('produção: data inválida → 422', async () => {
  assert.equal((await call('GET', '/api/producao/resumo?tipo=salgados&data=2026-13-01')).status, 422);
  assert.equal((await call('GET', '/api/producao/entrega?tipo=especiais')).status, 422);
});
test('produção: destinos exige horário e referência numéricos → 422', async () => {
  assert.equal((await call('GET', '/api/producao/destinos?tipo=salgados&data=2026-10-26&turno=a&referencia=1')).status, 422);
  assert.equal((await call('GET', '/api/producao/destinos?tipo=salgados&data=2026-10-26&turno=1&referencia=0')).status, 422);
});
test('produção: troca de horário valida tudo antes do banco → 422', async () => {
  const linha = { id_unidade: 1, data: '2026-10-27', hora: '06:00:00', id_referencia: 5, producao_turno: 1 };
  const ok = { data: '2026-10-26', turno: 2, itens: [linha] };
  assert.equal((await call('PUT', '/api/producao/turno', { ...ok, turno: 4 })).status, 422);
  assert.equal((await call('PUT', '/api/producao/turno', { ...ok, itens: [] })).status, 422);
  assert.equal((await call('PUT', '/api/producao/turno', { ...ok, data: 'lixo' })).status, 422);
  assert.equal((await call('PUT', '/api/producao/turno', { ...ok, itens: [{ ...linha, hora: "6';drop" }] })).status, 422);
  assert.equal((await call('PUT', '/api/producao/turno', { ...ok, itens: [{ ...linha, id_unidade: '1 or 1=1' }] })).status, 422);
});

test('faturamento: período inválido ou grande demais → 422', async () => {
  assert.equal((await call('GET', '/api/faturamento/itens?inicio=lixo&fim=2026-10-26')).status, 422);
  assert.equal((await call('GET', '/api/faturamento/itens?inicio=2026-10-27&fim=2026-10-26')).status, 422);
  assert.equal((await call('GET', '/api/faturamento/itens?inicio=2025-01-01&fim=2026-10-26')).status, 422);
  assert.equal((await call('GET', '/api/faturamento/itens?inicio=2026-10-26&fim=2026-10-26&unidade=1%20or%201=1')).status, 422);
});
test('faturamento: tipo de faturamento fora da lista → 422', async () => {
  assert.equal((await call('GET', '/api/faturamento/unidades?tipo=x%27--')).status, 422);
  assert.equal((await call('PUT', '/api/faturamento/unidades/1', { tipo_faturamento: 'QUALQUER' })).status, 422);
  assert.equal((await call('PUT', '/api/faturamento/unidades/1', {})).status, 422);
});
test('faturamento: gerar comanda valida ids, unidade e data antes do banco → 422', async () => {
  const ok = { ids: [1, 2], unidade: 5, data_emissao: '2026-10-26' };
  assert.equal((await call('POST', '/api/faturamento/comandas', { ...ok, ids: [] })).status, 422);
  assert.equal((await call('POST', '/api/faturamento/comandas', { ...ok, ids: ['1 or 1=1'] })).status, 422);
  assert.equal((await call('POST', '/api/faturamento/comandas', { ...ok, unidade: 0 })).status, 422);
  assert.equal((await call('POST', '/api/faturamento/comandas', { ...ok, data_emissao: '2026-02-30' })).status, 422);
});
test('faturamento: edição do item valida números e campos → 422', async () => {
  assert.equal((await call('PUT', '/api/faturamento/diaria/1', {})).status, 422);
  assert.equal((await call('PUT', '/api/faturamento/diaria/1', { qtde_alterada: 'abc' })).status, 422);
  assert.equal((await call('PUT', '/api/faturamento/diaria/1', { produto_preco: -1 })).status, 422);
  assert.equal((await call('PUT', '/api/faturamento/diaria/abc', { obs: 'x' })).status, 422);
  assert.equal((await call('POST', '/api/faturamento/baixa', { ids: [] })).status, 422);
  assert.equal((await call('DELETE', '/api/faturamento/comandas/0')).status, 422);
});

test('faturamento: gerar NFe com id de comanda inválido → 422', async () => {
  assert.equal((await call('POST', '/api/faturamento/comandas/abc/nfe', { data_emissao: '2026-10-26' })).status, 422);
});

test('nfe: validações antes de tocar no banco/API', async () => {
  assert.equal((await call('POST', '/api/nfe/autorizar', { ids: [] })).status, 422);
  assert.equal((await call('POST', '/api/nfe/autorizar', { ids: ['x'] })).status, 422);
  assert.equal((await call('POST', '/api/nfe/abc/cancelar', { justificativa: 'x'.repeat(20) })).status, 422);
  assert.equal((await call('POST', '/api/nfe/1/cancelar', { justificativa: 'curta' })).status, 422);
  assert.equal((await call('POST', '/api/nfe/1/carta-correcao', { correcao: 'curta' })).status, 422);
  assert.equal((await call('POST', '/api/nfe/inutilizar', { ano: 2026, modelo: 55, serie: 1, numero_inicial: 10, numero_final: 5, justificativa: 'x'.repeat(20) })).status, 422);
  assert.equal((await call('GET', '/api/nfe?inicio=lixo&fim=2026-10-26')).status, 422);
  assert.equal((await call('PUT', '/api/nfe/itens/abc', { qtde: 1 })).status, 422);
  assert.equal((await call('PUT', '/api/nfe/itens/1', {})).status, 422);
  assert.equal((await call('PUT', '/api/nfe/referencias/abc', { nNF: 1 })).status, 422);
  assert.equal((await call('POST', '/api/nfe/abc/referencias', {})).status, 422);
  assert.equal((await call('POST', '/api/nfe/1/itens', { produto_codigo: '' })).status, 422);
  assert.equal((await call('POST', '/api/nfe/1/itens', { produto_codigo: '10.001', qtde: -1 })).status, 422);
  assert.equal((await call('DELETE', '/api/nfe/itens/abc')).status, 422);
  assert.equal((await call('POST', '/api/nfe/certificado', {})).status, 422);
  assert.equal((await call('POST', '/api/nfe/certificado', { senha: 'x', nomeArquivo: 'cert.txt', arquivoBase64: 'AAAA' })).status, 422);
  assert.equal((await call('POST', '/api/nfe/certificado', { senha: 'x', nomeArquivo: 'cert.pfx', arquivoBase64: 'AAAA' })).status, 422);
  assert.equal((await call('POST', '/api/nfe/certificado/a3', { nomeArquivo: 'c.pfx', descricao: 'x', nomeAgente: 'y', arquivoBase64: 'A'.repeat(200) })).status, 422);
  assert.equal((await call('POST', '/api/nfe/certificado/a3', { nomeArquivo: 'c.cer', descricao: '', nomeAgente: 'y', arquivoBase64: 'A'.repeat(200) })).status, 422);
  assert.equal((await call('POST', '/api/nfe/certificado/a3', { nomeArquivo: 'c.cer', descricao: 'x', nomeAgente: '', arquivoBase64: 'A'.repeat(200) })).status, 422);
  assert.equal((await call('POST', '/api/nfe/certificado/a3', { nomeArquivo: 'c.cer', descricao: 'x', nomeAgente: 'y', arquivoBase64: 'AAAA' })).status, 422);
  assert.equal((await call('PUT', '/api/nfe/certificado/a3/id', { certificadoId: '../x' })).status, 422);
  assert.equal((await call('DELETE', '/api/nfe/certificado/a3/agente/..%2Fx')).status, 422);
  assert.equal((await call('PUT', '/api/nfe/tributos/abc', { cst: '000' })).status, 422);
  assert.equal((await call('PUT', '/api/nfe/tributos/1', { pIBS: 'x' })).status, 422);
  assert.equal((await call('PUT', '/api/nfe/duplicatas/abc', { valor: 1 })).status, 422);
  assert.equal((await call('POST', '/api/nfe/1/destinatario', { razao_social: '  ' })).status, 422);
});

test('comandas: unidade/modo/data inválidos → 422', async () => {
  assert.equal((await call('GET', '/api/comandas')).status, 422);
  assert.equal((await call('GET', '/api/comandas?unidade=1&modo=x')).status, 422);
  assert.equal((await call('GET', '/api/comandas?unidade=1&emissao=lixo')).status, 422);
});
test('comandas: item com dados inválidos → 422 antes do banco', async () => {
  assert.equal((await call('POST', '/api/comandas/1/itens', { produto_codigo: '', qtde: 1, preco: 1 })).status, 422);
  assert.equal((await call('POST', '/api/comandas/1/itens', { produto_codigo: '10', qtde: 0, preco: 1 })).status, 422);
  assert.equal((await call('POST', '/api/comandas/1/itens', { produto_codigo: '10', qtde: 1, preco: -2 })).status, 422);
  assert.equal((await call('PUT', '/api/comandas/itens/1', { qtde: 'abc', preco: 1 })).status, 422);
  assert.equal((await call('PUT', '/api/comandas/itens/1', { qtde: 1, cada: 0, preco: 1 })).status, 422);
  assert.equal((await call('DELETE', '/api/comandas/itens/0')).status, 422);
});
test('comandas: NFe sem seleção, data ruim ou unidade ruim → 422', async () => {
  assert.equal((await call('POST', '/api/comandas/nfe', { ids: [], unidade: 1, data_saida: '2026-10-26' })).status, 422);
  assert.equal((await call('POST', '/api/comandas/nfe', { ids: [1], unidade: 0, data_saida: '2026-10-26' })).status, 422);
  assert.equal((await call('POST', '/api/comandas/nfe', { ids: [1], unidade: 1, data_saida: '26/10/2026' })).status, 422);
});

test('tributos: validações antes do banco → 422', async () => {
  assert.equal((await call('POST', '/api/tributos', { aliq_icms: '12' })).status, 422); // sem descrição
  assert.equal((await call('POST', '/api/tributos', { descricao: 'X', aliq_icms: 'abc' })).status, 422);
  assert.equal((await call('PUT', '/api/tributos/1', { descricao: '   ' })).status, 422);
  assert.equal((await call('PUT', '/api/tributos/1', { pIBS: 'x' })).status, 422);
  assert.equal((await call('PUT', '/api/tributos/1', { campo_inexistente: 'x' })).status, 422); // nada para gravar
  assert.equal((await call('PUT', '/api/tributos/0', { descricao: 'X' })).status, 422);
  assert.equal((await call('DELETE', '/api/tributos/abc')).status, 422);
  assert.equal((await call('POST', '/api/tributos/atribuir', { tributo_id: 1, produtos: [] })).status, 422);
  assert.equal((await call('POST', '/api/tributos/atribuir', { tributo_id: 0, produtos: [1] })).status, 422);
  assert.equal((await call('POST', '/api/tributos/atribuir', { tributo_id: 1, produtos: ['x'] })).status, 422);
});

test('cadastros: validações antes do banco → 422', async () => {
  const c = '/api/cadastros';
  assert.equal((await call('POST', `${c}/funcionarios`, {})).status, 422); // sem nome
  assert.equal((await call('POST', `${c}/funcionarios`, { nome: 'A', nascimento: '31/12/1990' })).status, 422);
  assert.equal((await call('PUT', `${c}/funcionarios/1`, { nome: '  ' })).status, 422);
  assert.equal((await call('PUT', `${c}/funcionarios/1`, { campo_que_nao_existe: 1 })).status, 422);
  assert.equal((await call('DELETE', `${c}/funcionarios/x`)).status, 422);
  assert.equal((await call('POST', `${c}/clientes`, {})).status, 422);
  assert.equal((await call('POST', `${c}/clientes`, { razao_social: 'X', pessoa: 'OUTRA' })).status, 422);
  assert.equal((await call('POST', `${c}/clientes`, { razao_social: 'X', ativo: 'TALVEZ' })).status, 422);
  assert.equal((await call('POST', `${c}/clientes`, { razao_social: 'X', dias_vencto: 'abc' })).status, 422);
  assert.equal((await call('POST', `${c}/clientes/unidades`, { nome: 'U' })).status, 422); // sem cliente
  assert.equal((await call('POST', `${c}/clientes/unidades`, { id_cliente: 1, nome: 'U', tipo_faturamento: 'ANUAL' })).status, 422);
  assert.equal((await call('GET', `${c}/clientes/unidades?cliente=0`)).status, 422);
  assert.equal((await call('POST', `${c}/produtos`, { descricao: 'P' })).status, 422); // sem código
  assert.equal((await call('GET', `${c}/produtos/proximo-codigo`)).status, 422);
  assert.equal((await call('GET', `${c}/produtos?cliente=x`)).status, 422);
  assert.equal((await call('PUT', `${c}/produtos/1`, { preco: 'abc' })).status, 422);
  assert.equal((await call('DELETE', `${c}/produtos/0`)).status, 422);
});
test('funcionário: foto com tipo ou conteúdo inválido → 422', async () => {
  const f = (nome, corpo) => fetch(`${base}/api/cadastros/funcionarios/1/foto?nome=${nome}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: corpo }).then((r) => r.status);
  assert.equal(await f('x.exe', Buffer.from([1, 2, 3])), 422);
  assert.equal(await f('x.png', Buffer.from([1, 2, 3, 4])), 422); // assinatura não é PNG
  assert.equal(await f('x.png', Buffer.alloc(0)), 422);
});
