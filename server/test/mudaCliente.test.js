import test from 'node:test';
import assert from 'node:assert/strict';
import { mudaClienteUnidade } from '../src/services/mudaCliente.js';

function banco({ unidade = { id: 5, id_cliente: 1 }, cliente = { id: 2, razao_social: 'NOVO' } } = {}) {
  const sqls = [];
  return { sqls, query: async (sql, p) => {
    sqls.push([sql, p]);
    if (/from tb_unidades/.test(sql)) return [[unidade].filter(Boolean)];
    if (/from tb_clientes/.test(sql)) return [[cliente].filter(Boolean)];
    return [{ affectedRows: 3 }];
  } };
}

test('mudaClienteUnidade: troca unidade, fixa e dias de hoje em diante; histórico fica', async () => {
  const db = banco(); const r = await mudaClienteUnidade(db, 5, 2);
  assert.equal(r.ok, true); assert.equal(r.fixa, 3); assert.equal(r.diaria, 3);
  const up = db.sqls.filter(([s]) => /^update/.test(s)).map(([s]) => s);
  assert.equal(up.length, 4);
  assert.ok(up.filter((s) => /tb_(status|diaria)/.test(s)).every((s) => /data >= curdate\(\)/.test(s)));
  assert.ok(!up.some((s) => /tb_comandas/.test(s)));
});
test('mudaClienteUnidade: erros sem alterar nada', async () => {
  for (const [db, id] of [[banco({ unidade: null }), 2], [banco({ cliente: null }), 2], [banco(), 1]]) {
    const r = await mudaClienteUnidade(db, 5, id);
    assert.ok(r.erro); assert.ok(!db.sqls.some(([s]) => /^update/.test(s)));
  }
});
