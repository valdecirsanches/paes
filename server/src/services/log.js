export const logDiaria = (c, idDiaria, idUsuario, texto) =>
  c.query(
    'insert into tb_diaria_log (id_diaria, id_usuario, data, hora, log) values (?, ?, curdate(), curtime(), ?)',
    [idDiaria, idUsuario, texto],
  );

export const logFixa = (c, idFixa, idUsuario, texto) =>
  c.query(
    'insert into tb_fixa_log (id_fixa, id_usuario, data, hora, log) values (?, ?, curdate(), curtime(), ?)',
    [idFixa, idUsuario, texto],
  );
