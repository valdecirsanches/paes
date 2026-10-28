export class AppError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
export const notFound = (what) => new AppError(404, `${what} não encontrado(a).`);
export const invalid = (msg) => new AppError(422, msg);

/** Copia só as chaves permitidas: evita que o cliente grave colunas arbitrárias. */
export function pick(obj = {}, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}
