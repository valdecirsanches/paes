// Regras de negócio puras (sem banco). Vieram dos eventos da u_diaria.pas.

/** O legado guarda booleanos como texto 'True'/'False'. */
export const bool = (v) => v === true || v === 1 || ['True', 'true', '1'].includes(String(v));
export const dbBool = (v) => (bool(v) ? 'True' : 'False');

const parse = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
// Confere ida e volta: '2026-02-30' vira 02/03 no Date e seria aceita sem essa checagem.
export const isIsoDate = (s) =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && parse(s).toISOString().slice(0, 10) === s;
export const addDays = (iso, n) => {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Domingo = 1 ... Sábado = 7. Igual ao DayOfWeek do Delphi e ao DAYOFWEEK() do MySQL. */
export const semanaDia = (iso) => parse(iso).getUTCDay() + 1;
export const brDate = (iso) => String(iso).slice(0, 10).split('-').reverse().join('/');

const segundos = (hhmmss) => {
  const [h = 0, m = 0, s = 0] = String(hhmmss).split(':').map(Number);
  return h * 3600 + m * 60 + s;
};
export const hhmmss = (h) => (String(h).length === 5 ? `${h}:00` : String(h));

/** Turno de produção pela hora de entrega (1º, 2º, 3º horário). */
export const turnoPorHora = (hora) => {
  const t = segundos(hora);
  return t <= 7 * 3600 ? 1 : t <= 10 * 3600 ? 2 : 3;
};
/** Carga (1ª, 2ª, 3ª) pela hora de entrega. */
export const cargaPorHora = (hora) => {
  const t = segundos(hora);
  return t < 8 * 3600 ? 1 : t < 11 * 3600 ? 2 : 3;
};
export const acomodacaoPadrao = (especial) => (especial ? 'CAIXA AMARELINHA' : 'SACARIA');

export const EXTRAS = ['cortado', 'margarina', 'coco', 'acucar', 'plastico', 'papel', 'pacote'];
export const EXTRAS_COLS = EXTRAS.map((e) => `extra_${e}`);
const EXTRA_TXT = {
  cortado: 'CORTADO', margarina: 'C/MARGARINA', coco: 'C/COCO', acucar: 'C/ACUCAR',
  plastico: 'EMB/IND/PLASTICO', papel: 'EMB/IND/PAPEL', pacote: 'EMB/PCT/PLASTICO',
};
/** "Descrição para expedição" = referência + opções marcadas. */
export const descricaoExpedicao = (referencia, row) =>
  [referencia, ...EXTRAS.filter((e) => bool(row[`extra_${e}`])).map((e) => EXTRA_TXT[e])]
    .filter(Boolean).join(' ');

export const unitario = (preco, cada) => (Number(preco) || 0) / (Number(cada) || 1);
export const money = (n) => Math.round(n * 10000) / 10000;

export const STATUS = { 0: 'NADA', 1: 'NORMAL', 2: 'ALTERADA', 3: 'CANCELADA' };

/** Filtro "Apresentação" → valores aceitos pelo relatório de alterações (mesmo mapeamento do rbStatus do Delphi). */
export const FILTRO_STATUS = { normal: [1], alt_canc: [2, 3], normal_alt: [1, 2], canc: [3] }; // demais = todos

/** Regra do ppDetailBand10BeforePrint: quais linhas entram na "Lista de alterações". */
export const linhaDeAlteracao = (r, completa = false) =>
  bool(r.imprimir_toda_programacao) || completa
  || (bool(r.produto_producao) && [1, 2].includes(Number(r.status_x))
      && (!bool(r.programacao_fixa) || Number(r.qtde_alterada) !== 0))
  || bool(r.cancelado);
