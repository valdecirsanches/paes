import test from 'node:test';
import assert from 'node:assert/strict';
import { mercadoriasDaData, invalidaMercadorias } from '../src/services/mercCache.js';

const conta = () => { const c = { n: 0, consulta: async (d) => { c.n++; await new Promise((r) => setTimeout(r, 15)); return [{ d, v: c.n }]; } }; return c; };

test('cache: chamadas simultâneas dividem uma consulta; depois responde do cache', async () => {
  invalidaMercadorias(); const c = conta();
  const [a, b] = await Promise.all([mercadoriasDaData('2026-10-26', c.consulta), mercadoriasDaData('2026-10-26', c.consulta)]);
  assert.equal(c.n, 1); assert.equal(a.rows[0].v, b.rows[0].v);
  const r = await mercadoriasDaData('2026-10-26', c.consulta);
  assert.equal(r.origem, 'cache'); assert.equal(c.n, 1);
});
test('cache velho responde na hora e atualiza em segundo plano; muito velho espera o banco', async () => {
  invalidaMercadorias(); const c = conta();
  const t0 = Date.now();
  await mercadoriasDaData('2026-10-27', c.consulta, t0);
  const velho = await mercadoriasDaData('2026-10-27', c.consulta, t0 + 30000);
  assert.equal(velho.origem, 'velho'); assert.equal(velho.rows[0].v, 1);
  await new Promise((r) => setTimeout(r, 40)); assert.equal(c.n, 2); // atualizou por trás
  const novo = await mercadoriasDaData('2026-10-27', c.consulta, Date.now() + 10 * 60000);
  assert.equal(novo.origem, 'banco'); assert.equal(c.n, 3);
});
test('invalidar esvazia: a próxima chamada vai ao banco', async () => {
  invalidaMercadorias(); const c = conta();
  await mercadoriasDaData('2026-10-28', c.consulta); invalidaMercadorias();
  assert.equal((await mercadoriasDaData('2026-10-28', c.consulta)).origem, 'banco'); assert.equal(c.n, 2);
});
