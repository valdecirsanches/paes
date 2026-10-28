export async function produtoPorCodigo(c, codigo) {
  const [[p]] = await c.query(
    `select p.*, r.produto_especial, r.descricao as referencia_descricao, r.codigo_referencia
       from tb_produtos p left join tb_referencias r on r.id = p.id_referencia
      where p.codigo = ? limit 1`, [String(codigo)]);
  return p || null;
}
