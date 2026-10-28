import { invalid } from '../errors.js';
import { isIsoDate } from '../rules.js';

/**
 * Valida/normaliza o corpo de um cadastro a partir de um "schema" { coluna: tipo }.
 * Só as colunas do schema passam (lista branca). Texto vazio vira NULL.
 * Tipos: txt | memo | num | int | bool (True/False) | data | 'enum:A,B,C' | 'bool:SIM,NAO' (valores customizados)
 */
export function limpaCampos(body, schema, { rotulos = {} } = {}) {
  const out = {};
  for (const [col, tipo] of Object.entries(schema)) {
    if (body?.[col] === undefined) continue;
    let v = body[col];
    const nome = rotulos[col] ?? col;
    if (v === null || (typeof v === 'string' && v.trim() === '')) { out[col] = null; continue; }
    if (tipo === 'txt' || tipo === 'memo') {
      v = String(v).trim();
      if (v.length > (tipo === 'memo' ? 4000 : 255)) throw invalid(`Texto muito longo em "${nome}".`);
      out[col] = v;
    } else if (tipo === 'num') {
      const n = Number(String(v).replace(',', '.'));
      if (!Number.isFinite(n) || Math.abs(n) > 1e12) throw invalid(`Valor inválido em "${nome}".`);
      out[col] = n;
    } else if (tipo === 'int') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < -2147483648 || n > 2147483647) throw invalid(`Valor inteiro inválido em "${nome}".`);
      out[col] = n;
    } else if (tipo === 'bool') {
      out[col] = v === true || v === 1 || ['True', 'true', '1'].includes(String(v)) ? 'True' : 'False';
    } else if (tipo === 'data') {
      v = String(v).slice(0, 10);
      if (!isIsoDate(v)) throw invalid(`Data inválida em "${nome}".`);
      out[col] = v;
    } else if (tipo.startsWith('enum:')) {
      const ok = tipo.slice(5).split(',');
      if (!ok.includes(String(v))) throw invalid(`Valor inválido em "${nome}" (use: ${ok.join(', ')}).`);
      out[col] = String(v);
    } else if (tipo.startsWith('bool:')) {
      const [sim, nao] = tipo.slice(5).split(',');
      out[col] = v === true || String(v) === sim ? sim : nao;
    } else throw new Error(`tipo desconhecido: ${tipo}`);
  }
  return out;
}

export const idValido = (v, rotulo = 'Registro') => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > 2147483647) throw invalid(`${rotulo} inválido(a).`);
  return n;
};

/** Traduz erro de integridade (FK) do MySQL em mensagem amigável. */
export const emUso = (err, o = 'Registro') => {
  if (err?.code === 'ER_ROW_IS_REFERENCED_2' || err?.code === 'ER_ROW_IS_REFERENCED') return invalid(`${o} está em uso em outros cadastros/movimentos e não pode ser excluído(a).`);
  return err;
};
