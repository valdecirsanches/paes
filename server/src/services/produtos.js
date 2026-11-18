/** Produto pelo código. Qualquer produto ativo vale, mesmo de outro cliente; se o código existir em mais de um, prefere o do cliente informado. */
export async function produtoPorCodigo(c, codigo, idCliente = 0) {
  const [[p]] = await c.query(
    `select p.*, r.produto_especial, r.descricao as referencia_descricao, r.codigo_referencia
       from tb_produtos p left join tb_referencias r on r.id = p.id_referencia
      where p.codigo = ? order by (p.id_cliente = ?) desc, (coalesce(p.ativo, 'True') <> 'False') desc, p.id limit 1`, [String(codigo), Number(idCliente) || 0]);
  return p || null;
}
