export const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const STATUS = { 0: 'Nada', 1: 'Normal', 2: 'Alterado', 3: 'Cancelado' };
export const FILTROS = [
  ['todas', 'Todas'], ['normal', 'Normal'], ['normal_alt', 'Normais+Alteradas'],
  ['alt_canc', 'Alteradas+Canceladas'], ['canc', 'Canceladas'], ['nada', 'Nada'],
];
export const ACOMODACOES = [
  ['SACARIA', 'Sacaria'], ['CAIXA BRANCA', 'Caixa branca'], ['CAIXA QUADRADA', 'Caixa quadrada'],
  ['CAIXA AMARELINHA', 'Caixa amarelinha'], ['OUTROS', 'Outros'],
];
export const EXTRAS = [
  ['cortado', 'Cortado', 'CORTADO'], ['margarina', 'C/ margarina', 'C/MARGARINA'],
  ['coco', 'Cobertura côco', 'C/COCO'], ['acucar', 'Cobertura açúcar', 'C/ACUCAR'],
  ['plastico', 'Embalado individual (plástico)', 'EMB/IND/PLASTICO'],
  ['papel', 'Embalado individual (papel)', 'EMB/IND/PAPEL'],
  ['pacote', 'Embalado em pacote plástico', 'EMB/PCT/PLASTICO'],
];

export const bool = (v) => v === true || v === 1 || v === 'True' || v === 'true' || v === '1';

const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const hoje = () => iso(new Date());
export const somaDias = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const semanaDia = (s) => parse(s).getDay() + 1; // Domingo = 1, como no banco
export const brData = (s) => String(s).slice(0, 10).split('-').reverse().join('/');
export const diaExtenso = (s) =>
  parse(s).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
export const hhmm = (h) => String(h ?? '').slice(0, 5);

export const fmtQtde = (n) => Number(n ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
export const fmtMoeda = (n) =>
  Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const seg = (h) => { const [a = 0, b = 0, c = 0] = String(h).split(':').map(Number); return a * 3600 + b * 60 + c; };
export const turnoPorHora = (h) => (seg(h) <= 7 * 3600 ? 1 : seg(h) <= 10 * 3600 ? 2 : 3);
export const cargaPorHora = (h) => (seg(h) < 8 * 3600 ? 1 : seg(h) < 11 * 3600 ? 2 : 3);

/** Descrição para expedição = referência + opções marcadas. */
export const descricaoExpedicao = (referencia, f) =>
  [referencia, ...EXTRAS.filter(([k]) => bool(f[`extra_${k}`])).map(([, , txt]) => txt)]
    .filter(Boolean).join(' ');

export const unitario = (preco, cada) => (Number(preco) || 0) / (Number(cada) || 1);
