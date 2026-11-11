/** Troca o cliente dono de uma unidade. O histórico fica com o cliente antigo: só a unidade, a programação fixa e os dias de hoje em diante passam para o novo. */
export async function mudaClienteUnidade(c, idUnidade, idCliente) {
  const [[u]] = await c.query('select id, id_cliente from tb_unidades where id = ? for update', [idUnidade]);
  if (!u) return { erro: 'Unidade não encontrada.' };
  const [[novo]] = await c.query('select id, razao_social from tb_clientes where id = ?', [idCliente]);
  if (!novo) return { erro: 'Cliente inexistente.' };
  if (Number(u.id_cliente) === Number(idCliente)) return { erro: 'A unidade já pertence a este cliente.' };
  await c.query('update tb_unidades set id_cliente = ? where id = ?', [idCliente, idUnidade]);
  const [fixa] = await c.query('update tb_fixa set id_cliente = ? where id_unidade = ?', [idCliente, idUnidade]);
  const [status] = await c.query('update tb_status set id_cliente = ? where id_unidade = ? and data >= curdate()', [idCliente, idUnidade]);
  const [diaria] = await c.query('update tb_diaria set id_cliente = ? where id_unidade = ? and data >= curdate()', [idCliente, idUnidade]);
  return { ok: true, cliente: novo.razao_social, anterior: u.id_cliente, fixa: fixa.affectedRows ?? 0, status: status.affectedRows ?? 0, diaria: diaria.affectedRows ?? 0 };
}
