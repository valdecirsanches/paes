import { pool } from '../db.js';
import { invalid } from '../errors.js';

// Aparência por usuário (cores, modo claro/escuro, tamanho da letra): fica no servidor e acompanha o usuário em qualquer computador.
export const MODOS = ['claro', 'escuro'];
export const FONTES = [90, 100, 110, 120, 130];
const COR = /^#[0-9a-f]{6}$/i;

/** Valida e normaliza o tema recebido do navegador. */
export function normalizaTema(t) {
  if (!t || typeof t !== 'object') throw invalid('Tema inválido.');
  if (!COR.test(String(t.btn ?? ''))) throw invalid('Cor de botão inválida.');
  if (!COR.test(String(t.barra ?? ''))) throw invalid('Cor da barra inválida.');
  const modo = t.modo ?? 'claro';
  if (!MODOS.includes(modo)) throw invalid('Modo inválido (claro ou escuro).');
  const fonte = Number(t.fonte ?? 100);
  if (!FONTES.includes(fonte)) throw invalid(`Tamanho da letra inválido (${FONTES.join(', ')}).`);
  return { btn: String(t.btn).toLowerCase(), barra: String(t.barra).toLowerCase(), modo, fonte };
}

let pronta = null;
const garanteTabela = () => (pronta ??= pool.query(`create table if not exists tb_usuario_tema (
  id_usuario int not null primary key,
  tema varchar(400) not null,
  atualizado datetime not null
) default charset=utf8mb4`).catch((e) => { pronta = null; throw e; }));

export async function lerTemaUsuario(idUsuario) {
  await garanteTabela();
  const [[r]] = await pool.query('select tema from tb_usuario_tema where id_usuario = ?', [idUsuario]);
  if (!r) return null;
  try { return normalizaTema(JSON.parse(r.tema)); } catch { return null; }
}
export async function gravaTemaUsuario(idUsuario, tema) {
  await garanteTabela();
  await pool.query('insert into tb_usuario_tema (id_usuario, tema, atualizado) values (?, ?, now()) on duplicate key update tema = values(tema), atualizado = now()', [idUsuario, JSON.stringify(tema)]);
}
export async function apagaTemaUsuario(idUsuario) {
  await garanteTabela();
  await pool.query('delete from tb_usuario_tema where id_usuario = ?', [idUsuario]);
}
