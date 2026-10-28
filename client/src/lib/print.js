// Impressões da Programação diária (substituem os relatórios ReportBuilder do Delphi).
// Cada função devolve HTML + CSS; `imprimirHtml` abre o diálogo de impressão do navegador.
import { bool, brData, diaExtenso, fmtQtde, hhmm } from './rules.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function imprimirHtml(corpo, css) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  f.contentDocument.open();
  f.contentDocument.write(`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}${css}</style>${corpo}`);
  f.contentDocument.close();
  const imgs = [...f.contentDocument.images];
  const prontas = Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
  Promise.race([prontas, new Promise((r) => setTimeout(r, 3000))]).then(() => setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 250));
}

const dow = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const qtdTexto = (i) => `${fmtQtde(i.qtde_original)} ${Number(i.qtde_alterada) < 0 ? '-' : '+'} ${fmtQtde(Math.abs(i.qtde_alterada))} = ${fmtQtde(i.xqtde_total ?? Number(i.qtde_original) + Number(i.qtde_alterada))}`;
export const nomeDiaMaiusculo = (iso) => semAcento(dow(iso)).toUpperCase();

/* ---------- ppConferencia: lista de conferência em duas vias (A4, 2 colunas de 103 mm) ---------- */
export function conferencia(unidadeNome, itens) {
  const grupos = [];
  [...itens].sort((a, b) => String(a.hora).localeCompare(String(b.hora))).forEach((i) => {
    const g = grupos.find((x) => x.hora === hhmm(i.hora));
    if (g) g.itens.push(i); else grupos.push({ hora: hhmm(i.hora), inform: i.inform, data: i.data, itens: [i] });
  });
  const cab = (via) => `<div class="cab"><b class="via">${via}</b><div class="emp"><b>LEVPÃO INDUSTRIA E COMÉRCIO DE PÃES</b><br>AV CRUZEIRO DO SUL, 219 JD ROCHDALLE - OSASCO<br><span class="tel">Telefone: 11 3687 7622 *** 3602 2168</span></div><hr><b class="un">${esc(unidadeNome)}</b></div>`;
  const grp = (g) => `<div class="g"><div class="gh"><div>Entrega em &nbsp;${esc(brData(g.data))} &nbsp;***&nbsp; ${esc(dow(g.data))}<br><span class="inf">${esc(g.inform ?? '')}</span></div><b class="h">${esc(g.hora)}</b></div>
    <div class="cols"><span>Qtde</span><span>Descrição completa</span><span>Visto</span></div>
    ${g.itens.map((i) => `<div class="it${bool(i.cancelado) ? ' canc' : ''}"><b>${esc(fmtQtde(i.xqtde_total))}</b><b>${esc(i.produto_descricao_expedicao)}${bool(i.cancelado) ? ' (CANCELADO)' : ''}</b><i></i></div>`).join('')}<hr></div>`;
  const via = (n) => cab(n === 1 ? '1 ª Via controle LEVPAO' : '2 ª Via controle CLIENTE');
  const corpo = `<div class="folha"><div class="par">${via(1)}${via(2)}</div>${grupos.map((g) => `<div class="par">${grp(g)}${grp(g)}</div>`).join('')}</div>`;
  const css = `@page{size:A4;margin:1mm}body{margin:0;font:8pt Arial}.par{display:grid;grid-template-columns:1fr 1fr;break-inside:avoid}
  .par>div{padding:0 3mm}.par>div+div{border-left:.3mm solid #000}hr{border:0;border-top:.4mm solid #000;margin:1mm 0}
  .cab{min-height:50mm}.via{display:block;font:12pt Arial;font-weight:normal;margin:5mm 0 8mm;text-align:right}.emp{font:10pt Arial;text-align:center;line-height:1.5}.emp b{font-size:12pt}.tel{font-size:12pt}.un{font-size:10pt}
  .gh{display:flex;justify-content:space-between;font-size:10pt;padding-top:2mm}.h{font-size:18pt}.inf{display:block;margin-top:3mm}.cols{display:grid;grid-template-columns:12mm 1fr 21mm;font-size:8pt;margin:3mm 0 1mm}
  .it{display:grid;grid-template-columns:12mm 1fr 21mm;min-height:5.8mm;align-items:start}.it i{border:.3mm solid #000;height:4mm}.canc{text-decoration:line-through}`;
  return { corpo, css };
}

/* ---------- ppAlteracoes: lista de alterações (A4, 2 colunas, agrupada por empresa) ---------- */
const COR_STATUS = { NORMAL: '#1a7f37', ALTERADA: '#c77700', CANCELADA: '#b00020', NADA: '#666' };
export function alteracoes(data, linhas) {
  const grupos = [];
  linhas.forEach((r) => {
    let g = grupos.find((x) => x.nome === r.nome);
    if (!g) { g = { nome: r.nome, status: r.status_descricao, pasta: r.verificar_pasta, itens: [] }; grupos.push(g); }
    g.itens.push(r);
  });
  const corpo = `<div class="t"><div class="d">${esc(new Date().toLocaleString('pt-BR').slice(0, 16))}</div><b class="e">LEV-PÃO COMÉRCIO DE PÃES LTDA</b><div class="l"><span>Lista de alterações</span><b>${esc(cap(dow(data)))} ${esc(brData(data).slice(0, 5))}</b></div></div>
  <div class="cx">${grupos.map((g) => `<div class="gr"><div class="gh"><b>${esc(g.nome)}</b>${g.pasta === 'True' ? '<span class="pasta">📁</span>' : ''}<span class="st" style="background:${COR_STATUS[g.status] ?? '#666'}">${esc(g.status)}</span></div>
    ${g.itens.map((r) => { const canc = bool(r.cancelado); const s = Number(r.sinal_alteracao);
    return `<div class="it${canc ? ' canc' : ''}"><div class="ln"><span class="hr">${esc(r.hora)}</span><span class="n">${esc(fmtQtde(r.xqtde_original))}</span><span class="n">${s ? (s > 0 ? '+' : '-') + fmtQtde(Math.abs(s)) : ''}</span><b>=</b><span class="n tot">${esc(fmtQtde(r.xqtde_final))}</span><b class="ds">${esc(canc ? r.produto_descricao : r.produto_descricao_expedicao)}</b></div>${r.obs_producao ? `<div class="ob">${esc(r.obs_producao)}</div>` : ''}</div>`; }).join('')}</div>`).join('')}</div>`;
  const css = `@page{size:A4;margin:6.35mm}body{margin:0;font:8pt Arial}.t{border-bottom:.5mm solid #000;padding-bottom:1mm;margin-bottom:2mm;position:relative}.d{position:absolute;right:0;top:0;font-size:8pt}
  .e{display:block;font:18pt Arial;font-weight:normal}.l{display:flex;justify-content:space-between;align-items:end;font-size:18pt}.l b{font:22pt Arial;font-weight:normal}
  .cx{column-count:2;column-gap:6mm}.gr{break-inside:avoid-column;margin-bottom:2mm}.gh{display:flex;align-items:center;gap:2mm;border:.3mm solid #000;padding:1mm 1.5mm;font-size:12pt}.gh b{flex:1}.st{color:#fff;font-weight:bold;padding:0 2mm}
  .it{border-bottom:.2mm solid #aaa;padding:.6mm 0;break-inside:avoid}.ln{display:grid;grid-template-columns:9mm 10mm 9mm 4mm 9mm 1fr;gap:1mm;align-items:baseline}.hr,.n{font-weight:bold;text-align:right}.hr{text-align:left}.tot{border:.3mm solid #000;text-align:center}
  .ds{font-size:8pt}.canc .ds{text-decoration:line-through}.ob{background:#444;color:#fff;font-weight:bold;padding:.5mm 1.5mm;margin-top:.5mm}`;
  return { corpo, css };
}

/* ---------- ppAdesivas (mercadorias): etiqueta 62 × 45 mm, posições do ppAdesivas de u_mercadorias.dfm ----------
   Nome 24pt negrito numa linha só (corta no limite), traço, "dia - dd / mm / aaaa" 12pt centralizado, hora 16pt à esquerda,
   quantidade 16pt centralizada na metade direita, descrição 12pt (até 2 linhas) e "FAVOR CONFERIR A MERCADORIA" 8pt. */
export function etiquetaMercadoria(d) {
  const iso = String(d.data).slice(0, 10);
  const corpo = `<div class="e"><b class="u">${esc(d.unidade_nome)}</b><i class="ln"></i><b class="dt">${esc(dow(iso))} - ${esc(brData(iso).replaceAll('/', ' / '))}</b>
    <b class="hr">${esc(hhmm(d.hora))}</b><b class="q">${esc(fmtQtde(d.qtde_pendente))}</b><b class="ds">${esc(d.produto_descricao_expedicao)}</b><span class="cf">FAVOR CONFERIR A MERCADORIA</span></div>`;
  const css = `@page{size:62mm 41mm;margin:0}body{margin:0;font-family:Arial,Helvetica,sans-serif}.e{position:relative;width:62mm;height:41mm;overflow:hidden;background:#fff}
  .e>*{position:absolute;display:block;margin:0;font-style:normal;color:#000}
  .u{left:2.38mm;top:2.12mm;width:57.15mm;height:9.8mm;font-size:24pt;line-height:9.8mm;white-space:nowrap;overflow:hidden}
  .ln{left:2.12mm;top:12.17mm;width:57.4mm;height:0;border-top:.3mm solid #000}
  .dt{left:2.65mm;top:12.7mm;width:56.9mm;height:5mm;font-size:12pt;line-height:5mm;text-align:center;white-space:nowrap;overflow:hidden}
  .hr{left:2.65mm;top:17.99mm;width:25.4mm;height:6.35mm;font-size:16pt;line-height:6.35mm;white-space:nowrap}
  .q{left:29.37mm;top:17.99mm;width:30.16mm;height:6.35mm;font-size:16pt;line-height:6.35mm;text-align:center;white-space:nowrap}
  .ds{left:2.65mm;top:24.6mm;width:56.9mm;height:10.05mm;font-size:12pt;line-height:5mm;overflow:hidden}
  .cf{left:2.65mm;top:37.04mm;width:56.9mm;height:3.7mm;font-size:8pt;line-height:3.7mm;text-align:center;font-weight:normal;white-space:nowrap}`;
  return { corpo, css };
}

/* ---------- ppAdesivas (diária): etiqueta adesiva do item, 62 × 45 mm ---------- */
export function etiquetaItem(i, unidadeNome) {
  const corpo = `<div class="e"><b class="nome">${esc(i.nome ?? unidadeNome)}</b><hr class="l1"><div class="dt">${esc(semAcento(cap(dow(i.data))))} - ${esc(brData(i.data).replaceAll('/', ' / '))}</div>
    <b class="hora">${esc(hhmm(i.hora))}</b><b class="qt">${esc(qtdTexto(i))}</b>${bool(i.cancelado) ? '<b class="cc">CANCELADO</b>' : ''}
    <b class="ds">${esc(i.produto_descricao_expedicao)}</b><div class="ob">${esc(i.obs_producao)}</div><div class="in">${esc(i.inform ?? '')}</div><div class="ct">${Number(i.etiqueta_adesiva) ? `(${esc(i.etiqueta_adesiva)})` : ''}</div></div>`;
  const css = `@page{size:62mm 45mm;margin:0}body{margin:0;font-family:Arial}.e{position:relative;width:62mm;height:45mm;overflow:hidden}.e>*{position:absolute;margin:0}
  .nome{left:1.9mm;top:2.6mm;width:58mm;font-size:16pt;white-space:nowrap;overflow:hidden}.l1{left:1.6mm;top:9.5mm;width:58.7mm;border:0;border-top:.3mm solid #000}.dt{left:1.9mm;top:9.3mm;font-size:11pt}
  .hora{left:1.6mm;top:13.8mm;width:13mm;height:5.8mm;border:.3mm solid #000;font-size:12pt;text-align:center}.qt{left:15mm;top:13.8mm;width:45mm;height:5.8mm;border:.3mm solid #000;font-size:12pt;padding-left:1mm}
  .cc{left:29.4mm;top:14.3mm;font-size:12pt;background:#fff}.ds{left:1.6mm;top:19.8mm;width:58.7mm;font-size:8pt}.ob{left:2mm;top:27.8mm;width:58mm;height:7.4mm;border:.3mm solid #000;font-size:8pt;overflow:hidden;padding:.3mm 1mm}
  .in{left:2.4mm;top:36mm;font-size:6pt;white-space:nowrap}.ct{left:55.8mm;top:36mm;font-size:6pt}`;
  return { corpo, css };
}

/* ---------- ppValidade: etiqueta de validade, 62 × 45 mm ---------- */
export function etiquetaValidade(i) {
  const corpo = `<div class="e"><div class="bx"></div><b class="t">${esc(i.produto_descricao)}</b><b class="p">Pêso  : 0,05 KG</b><b class="tr">Tara   : 0,05 KG</b>
    <b class="il">Ingredientes:</b><div class="ing">${esc(i.ingredientes)}</div><span class="f">Fabricação:</span><b class="fd">${esc(brData(i.data))}</b><span class="v">Validade: </span><b class="vd">${esc(i.validade)}</b>
    <span class="fb">Fabricante: <span class="fn">LEVPÃO COMERCIO DE PÃES LTDA</span></span><span class="cn">CNPJ: 03.707.154/0001-06</span></div>`;
  const css = `@page{size:62mm 45mm;margin:0}body{margin:0;font-family:Arial}.e{position:relative;width:62mm;height:45mm;overflow:hidden;page-break-after:always}.e>*{position:absolute;margin:0}
  .bx{left:0;top:3.7mm;width:58.2mm;height:36.8mm;border:.3mm solid #000}.t{left:3.4mm;top:4.2mm;width:55mm;font-size:12pt;line-height:1.05;max-height:10.3mm;overflow:hidden}.p{left:3.4mm;top:14.5mm;font-size:8pt}.tr{left:34.6mm;top:14.5mm;font-size:8pt}
  .il{left:3.4mm;top:19mm;font-size:5pt}.ing{left:3.4mm;top:21.4mm;width:54mm;height:8.7mm;font-size:4pt;font-weight:bold;overflow:hidden}.f{left:2.6mm;top:31mm;font-size:6pt}.fd{left:14.3mm;top:31mm;font-size:6pt}
  .v{left:27.5mm;top:31mm;font-size:6pt}.vd{left:36.5mm;top:31mm;font-size:6pt}.fb{left:6.9mm;top:35.3mm;font-size:5pt}.fn{font-size:6pt}.cn{left:18.2mm;top:38.1mm;font-size:5pt}`;
  return { corpo, css };
}

/* ---------- Imprimir na expedição: o Delphi escrevia direto na impressora de rede (\\producao\producao).
   Aqui gera o mesmo cupom em texto monoespaçado para o diálogo de impressão. ---------- */
export function cupomExpedicao(i, unidadeNome) {
  const c = String(i.produto_descricao_expedicao ?? '');
  const canc = bool(i.cancelado);
  const hoje = new Date();
  const linhas = [
    `${hoje.toLocaleDateString('pt-BR')} ** ${hoje.toLocaleTimeString('pt-BR').slice(0, 5)}`, '',
    '************************', '*                      *', canc ? '*     CANCELAMENTO     *' : '*      ALTERACAO       *', '*                      *', '************************', '',
    unidadeNome, '', `${semAcento(dow(i.data)).toUpperCase()} ${brData(i.data)}`, '', `      Hora: ${hhmm(i.hora)}`,
    '- - - - - - - - - - - - - - - - - - - - - - - -', canc ? '** ITEM CANCELADO **' : '** ITEM ALTERADO **',
    `=== ${fmtQtde(i.xqtde_total)} ===`, ...(c.match(/.{1,24}/g) ?? []).slice(0, 3),
    '- - - - - - - - - - - - - - - - - - - - - - - -',
  ];
  return { linhas, corpo: `<pre>${esc(linhas.join('\n'))}</pre>`, css: '@page{size:80mm auto;margin:3mm}pre{font:bold 13px/1.25 "Courier New",monospace;margin:0}' };
}

export { diaExtenso };

/** ppReclamacoes: relatório "RECLAMAÇÕES" (reclamante, reclamação, contestação). */
export function reclamacao(r, unidadeNome) {
  const css = '@page{size:A4;margin:10mm}body{font:11pt Arial}h1{font:700 36pt Arial;margin:6mm 0 2mm}h2{font:18pt Arial;margin:0}.l{font-weight:700;margin-top:5mm}.t{white-space:pre-wrap;border:1px solid #000;padding:2mm;min-height:25mm}';
  const corpo = `<h2>Lev-pão comercio de pães Ltda.</h2><h1>RECLAMAÇÕES</h1>
    <div><b>${esc(unidadeNome)}</b> &nbsp; ${esc(String(r.data ?? '').slice(0, 10).split('-').reverse().join('/'))} ${esc(String(r.hora ?? '').slice(0, 5))}</div>
    <div class="l">Reclamante</div><div>${esc(r.reclamante)} ${esc(r.telefone)}</div>
    <div class="l">Reclamação</div><div class="t">${esc(r.reclamacao)}</div>
    <div class="l">Contestação</div><div class="t">${esc(r.explicacao)}</div>`;
  return { corpo, css };
}

/** ppPasta: programação fixa da unidade, agrupada por dia da semana. */
export function pasta(unidadeNome, linhas) {
  const css = '@page{size:A4;margin:10mm}body{font:10pt Arial}h1{font:700 16pt Arial;margin:0 0 3mm}h2{font:700 11pt Arial;margin:4mm 0 1mm;border-bottom:1px solid #000}.r{display:grid;grid-template-columns:14mm 18mm 1fr;padding:.4mm 0}';
  let dia = null; let corpo = `<h1>${esc(unidadeNome)} — programação fixa</h1>`;
  for (const l of linhas) {
    if (l.dia !== dia) { dia = l.dia; corpo += `<h2>${esc(l.dia)}</h2>`; }
    corpo += `<div class="r"><span>${esc(hhmm(l.hora))}</span><span style="text-align:right;padding-right:3mm">${esc(fmtQtde(l.produto_qtde))}</span><span>${esc(l.produto_descricao_expedicao)}</span></div>`;
  }
  return { corpo, css };
}

/* ---------- Produção (u_producao) ---------- */
const dtLonga = (iso) => `${dow(iso)} - ${brData(iso)}`;
const porTurno = (linhas) => {
  const g = new Map();
  for (const l of linhas) { if (!g.has(l.producao_turno)) g.set(l.producao_turno, []); g.get(l.producao_turno).push(l); }
  return [...g.entries()];
};

/** ppRpsr / ppRper: resumo da produção do dia (A4 retrato), um bloco por horário. Botão da impressora simples. */
export function producaoResumo(tipo, linhas) {
  const sal = tipo === 'salgados';
  const css = `@page{size:A4;margin:6.35mm}body{font-family:Arial;color:#000}
.g{break-inside:avoid;margin-bottom:3mm;border-bottom:.3mm dotted #000;padding-bottom:2mm}
.h{border:1px solid #000;padding:1mm 2mm 2mm;margin-bottom:2mm}
.l1{display:flex;justify-content:space-between;align-items:end;font-size:14pt;${sal ? '' : 'font-weight:700;'}}
.l2{display:flex;justify-content:space-between;align-items:center}
.cz{background:silver;font-size:22pt;font-weight:700;display:flex;justify-content:space-between;flex:1;margin-right:6mm;padding:0 2mm}
.tn{font-size:26pt;font-weight:700;white-space:nowrap}
.r{display:flex;gap:3mm;margin-top:1.2mm}.q,.d{border:1px solid #000;font-size:20pt;font-weight:700;padding:.5mm 2mm;line-height:1.1}
.q{width:28mm;text-align:center;flex:none}.d{flex:1}`;
  const corpo = porTurno(linhas).map(([turno, ls]) => `<div class="g"><div class="h">
    <div class="l1"><span>${sal ? 'PRODUÇÃO de' : 'Produção de'} ${esc(sal ? brData(ls[0].producao_data) : dtLonga(String(ls[0].producao_data).slice(0, 10)))}</span></div>
    <div class="l2"><div class="cz"><span>${sal ? 'Salgados' : 'ESPECIAIS'}</span><span style="text-transform:${sal ? 'none' : 'uppercase'}">${esc(dow(ls[0].producao_data))}</span></div><div class="tn">${esc(turno)}º Horário</div></div></div>
    ${ls.map((l) => `<div class="r"><div class="q">${esc(Number(l.producao_qtde))}</div><div class="d">${esc(l.descricao)}</div></div>`).join('')}</div>`).join('');
  return { corpo: corpo || '<p>Sem produção para a data.</p>', css };
}

/** ppEnt_sal / ppEnt_esp: "Entrega para" (A4 paisagem, 2 colunas). Um horário por página; dentro, um bloco por referência. Impressora azul. */
export function producaoEntrega(tipo, linhas) {
  const sal = tipo === 'salgados';
  const css = `@page{size:A4 landscape;margin:6.35mm}body{font-family:Arial;color:#000}
.s{break-before:page}.s:first-child{break-before:auto}
.cab{display:flex;align-items:center;justify-content:space-between;border:1px solid #000;padding:1mm 2mm;margin-bottom:2mm}
.cab .t{font-size:28pt;font-weight:700}.cab .e{font-size:14pt;font-weight:700}
.col{column-count:2;column-gap:4mm}
.gr{break-inside:avoid;margin-bottom:2mm}.gh{background:silver;font-size:14pt;font-weight:700;padding:0 1mm}
.i{border-bottom:.3mm solid #000;padding:.6mm 0;break-inside:avoid;font-size:8pt}
.i .l{display:grid;grid-template-columns:37mm 12mm 12mm 1fr;gap:1mm;align-items:baseline}
.i .h{font-weight:700;text-align:right}.i .q{border:1px solid #000;font-weight:700;font-size:9pt;text-align:right;padding:0 1mm}
.i .o{background:#000;color:#fff;font-size:${sal ? 8 : 10}pt;white-space:pre-wrap;padding:0 1mm;margin-top:.5mm}
.tot{display:flex;justify-content:flex-end;padding:.5mm 0}.tot b{padding:0 2mm;font-size:${sal ? 16 : 14}pt;${sal ? 'background:#000;color:#fff' : 'background:silver'}}`;
  const corpo = porTurno(linhas).map(([turno, ls]) => {
    const refs = [];
    ls.forEach((l) => { const g = refs.find((x) => x.id === l.id_referencia); if (g) g.ls.push(l); else refs.push({ id: l.id_referencia, nome: l.referencia_descricao, ls: [l] }); });
    return `<section class="s"><div class="cab"><div class="t">${sal ? 'SALGADOS' : 'ESPECIAIS'} &nbsp; ${esc(turno)}º Horário</div>
      <div class="e">${sal ? 'Entrega para' : 'entrega para'} &nbsp; ${esc(dtLonga(String(ls[0].data).slice(0, 10)))}</div></div>
      <div class="col">${refs.map((g) => `<div class="gr"><div class="gh">${esc(g.nome)}</div>${g.ls.map((l) => `<div class="i"><div class="l"><span>${esc(l.cliente_nome)}</span><span class="h">${esc(hhmm(l.hora))}</span><span class="q">${esc(Number(l.qtde_producao))}</span><span>${esc(l.produto_descricao_expedicao)}</span></div>${l.obs_producao ? `<div class="o">${esc(l.obs_producao)}</div>` : ''}</div>`).join('')}
        <div class="tot"><b>${esc(fmtQtde(g.ls.reduce((s, l) => s + Number(l.qtde_producao), 0)))}</b></div></div>`).join('')}</div></section>`;
  }).join('');
  return { corpo: corpo || '<p>Sem entregas para a data.</p>', css };
}

/* ---------- Faturamento (comanda e demonstrativo): o original escrevia texto para impressora matricial ---------- */
const padR = (s, n) => String(s).padStart(n); // xpadr: alinha à direita
const padL = (s, n) => String(s).padEnd(n); // xpadl: alinha à esquerda
const nf = (v, min, max, grupo) => Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: grupo });
const dataExtensoMaiusculo = (iso) => semAcento(`${dow(iso)} ${brData(iso)}`).toUpperCase();
const TRACO = '- - - - - - - - - - - - - - - - - - - - - - - - - - - - - -';
const LINHA = '------------------------------------------------------------';

/** Estilos: g = #14 (largo), n = #18 (normal), c = #15 (condensado). */
function textoParaHtml(linhas) {
  const css = '@page{size:A4;margin:8mm}body{font-family:"Courier New",monospace;font-weight:bold}.g{font-size:15pt;white-space:pre}.n{font-size:11pt;white-space:pre}.c{font-size:9pt;white-space:pre}.p{font-size:9pt;white-space:pre}';
  return { corpo: linhas.map(([e, t]) => `<div class="${e}">${esc(t) || '&nbsp;'}</div>`).join(''), css, linhas: linhas.map(([e, t]) => ({ e: e === 'p' ? 'n' : e, t })) }; // linhas = mesmo texto para impressora térmica ESC/POS
}

/** bImprimirClick: comanda com itens, total, assinatura e as mercadorias que saíram sem cobrança. */
export function comandaTexto(comanda, itens, mercadorias, unidadeNome) {
  const L = [];
  L.push(['g', `COMANDA: ${comanda.id}`], ['n', `Responsavel: ${comanda.usuario ?? ''}`], ['n', 'Data de Emissao: '],
    ['g', dataExtensoMaiusculo(String(comanda.data_emissao).slice(0, 10))], ['c', TRACO], ['n', 'Cliente:'], ['g', unidadeNome ?? ''], ['c', LINHA],
    ['c', '   Qtde Descricao do produto               Vr Un.  Vr total']);
  let total = 0;
  for (const i of itens) {
    L.push(['c', `${padR(nf(i.new_qtde, 0, 2, false), 7)} ${padL(semAcento(i.descricao_generica ?? '').slice(0, 34), 34)} ${padR(nf(i.preco, 3, 3, true), 6)} ${padR(nf(i.vr_item, 3, 3, true), 9)}`]);
    total += Number(i.vr_item) || 0;
  }
  L.push(['c', `${TRACO} `], ['g', `Vr total ${padR(`R$ ${nf(total, 2, 2, true)}`, 12)}`], ['c', LINHA], ['p', ''],
    ['c', '----------------------------  ------------------------------'], ['c', 'Assinatura e nome legivel do recebedor']);
  if (mercadorias.length) {
    L.push(['p', ''], ['p', ''], ['c', LINHA]);
    for (const m of mercadorias) L.push(['p', `${padR(nf(m.qtde, 1, 1, false), 7)} ${m.descricao ?? ''}`]);
    L.push(['c', LINHA]);
  }
  return textoParaHtml(L);
}

/** btnDemoClick: demonstrativo (não gera comanda) com as linhas visíveis na grade. */
export function demonstrativoTexto(linhas, dataSaida, unidadeNome, usuario = '') {
  const L = [['g', 'DEMONSTRATIVO'], ['n', `Responsavel: ${usuario}`], ['n', 'Data de Emissao: '], ['g', dataExtensoMaiusculo(dataSaida)],
    ['c', TRACO], ['n', 'Cliente:'], ['g', unidadeNome ?? ''], ['c', '-----------------------------------------------------------'],
    ['c', 'Data     Qtde Descricao do produto         Vr Un.  Vr total']];
  let total = 0;
  for (const r of linhas) {
    const xp = Number(r.xpreco) || 0;
    const q = Number(r.qtde) || 0;
    L.push(['c', `${String(r.data).slice(8, 10)}/${String(r.data).slice(5, 7)} ${padR(nf(q, 1, 1, false), 7)} ${padL(semAcento(r.produto_descricao ?? '').slice(0, 27), 27)} ${padR(nf(Math.round(xp * 1000) / 1000, 3, 3, true), 7)} ${padR(nf(xp * q, 3, 3, true), 9)}`]);
    total += Math.round(xp * q * 100) / 100;
  }
  L.push(['c', TRACO], ['g', `Vr total ${padR(`R$ ${nf(Math.round(total * 100) / 100, 2, 2, true)}`, 12)}`], ['c', '-----------------------------------------------------------'], ['p', ''],
    ['c', '----------------------------  -----------------------------'], ['c', 'Assinatura e nome legivel do recebedor']);
  return textoParaHtml(L);
}

/* ---------- Tabela de preços (u_produtos / u_clientes: botão "Tabela de preços") ---------- */
const m2 = (v) => Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
export function tabelaPrecos(clienteNome, produtos) {
  const linhas = [...produtos].sort((a, b) => String(a.descricao).localeCompare(String(b.descricao), 'pt-BR'));
  const corpo = `<h1>LEV-PAO COMERCIO DE PAES LTDA</h1><h2>TABELA DE PREÇOS${clienteNome ? ` — ${esc(clienteNome)}` : ''}</h2>
    <table><thead><tr><th>Código</th><th>Descrição do produto</th><th>UN</th><th class="d">Preço</th><th class="d">Cada</th></tr></thead><tbody>
    ${linhas.map((p) => `<tr><td>${esc(p.codigo)}</td><td>${esc(p.descricao)}</td><td>${esc(p.un)}</td><td class="d">${m2(p.preco)}</td><td class="d">${esc(p.divisor_basico)}</td></tr>`).join('')}
    </tbody></table><p class="rod">${esc(new Date().toLocaleString('pt-BR'))}</p>`;
  const css = '@page{size:A4;margin:12mm}body{font:10pt Arial}h1{font-size:13pt;margin:0}h2{font-size:11pt;margin:2mm 0 4mm}table{width:100%;border-collapse:collapse}th{border-bottom:.4mm solid #000;text-align:left}td,th{padding:.6mm 1mm}tr{break-inside:avoid}.d{text-align:right}.rod{font-size:8pt;margin-top:4mm}';
  return { corpo, css };
}

/* ---------- Listagem (ppListagem de u_clientes): unidades exibidas na grade, A4 paisagem ---------- */
export function listagemUnidades(unidades) {
  const corpo = `<div class="cab"><img src="${location.origin}/logo.jpg" alt=""><div><h1>LEV-PÃO COMÉRCIO DE PÃES</h1><h2>LISTAGEM DE CLIENTES</h2></div></div>
    <table><thead><tr><th>Nome</th><th>Contato</th><th>Telefone</th></tr></thead><tbody>
    ${unidades.map((u) => `<tr><td>${esc(u.nome)}</td><td>${esc(u.contato)}</td><td>${esc(u.telefone)}</td></tr>`).join('')}
    </tbody></table>`;
  const css = '@page{size:A4 landscape;margin:10mm}body{font:8pt Arial}.cab{display:flex;align-items:center;gap:6mm;margin-bottom:4mm}.cab img{height:16mm}h1,h2{font-size:18pt;margin:0;font-weight:normal}table{width:100%;border-collapse:collapse}th{border-bottom:.4mm solid #000;text-align:left}td,th{padding:.7mm 1mm;border-bottom:.2mm solid #999}tr{break-inside:avoid}';
  return { corpo, css };
}

/* ---------- Etiquetas 62 x 45 mm (ppAdesivas / ppReport2 / ppBoasFestasT / ppBoasFestasU) ---------- */
// homenagem = true: "Dia do nutricionista" (com o texto); false: "Boas Festas" (só logo, unidade e nutricionista).
export function etiquetasNutricionista(unidades, homenagem) {
  const corpo = unidades.map((u) => `<div class="et"><img src="${location.origin}/etiqueta-logo.png" alt="">${homenagem ? '<div class="h">Homenagem da LEVPÃO ao dia do NUTRICIONISTA</div>' : ''}<div class="n">${esc(u.nome)}</div><div class="l"></div><div class="x">${esc(u.nutricionista_nome)}</div></div>`).join('');
  const css = '@page{size:62mm 45mm;margin:0}body{margin:0;font-family:Arial}.et{width:62mm;height:45mm;position:relative;overflow:hidden;break-after:page}.et img{position:absolute;left:3.4mm;top:3.2mm;width:55.5mm}.h{position:absolute;left:3.4mm;top:14.8mm;width:56.9mm;font-size:10pt;text-align:center;line-height:1.1}.n{position:absolute;left:3.4mm;top:24mm;width:57mm;font-size:16pt;white-space:nowrap;overflow:hidden}.l{position:absolute;left:3.4mm;top:31mm;width:57.4mm;border-top:.26mm solid #000}.x{position:absolute;left:3.7mm;top:31.5mm;width:56.9mm;font-size:20pt;text-align:center;white-space:nowrap;overflow:hidden}';
  return { corpo, css };
}

/* ---------- Lista de funcionários (ppReport1 de u_funcionarios) ---------- */
export function listaFuncionarios(funcs) {
  const corpo = `<h1>LEV-PAO COMERCIO DE PAES LTDA</h1><h2>LISTA DE FUNCIONARIOS</h2><hr>${funcs.map((f) => `<div class="l">${esc(f.nome)}</div>`).join('')}`;
  const css = '@page{size:A4;margin:12mm}body{font:11pt Arial}h1{font-size:13pt;margin:0}h2{font-size:11pt;margin:2mm 0}.l{padding:1.2mm 0;border-bottom:.2mm solid #999}';
  return { corpo, css };
}


/* ---------- ppEtinerario: uma página por motorista; horário em barra cinza; empresas com telefone e contato ---------- */
export function itinerarioImpressao(rows) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const motoristas = [];
  for (const r of rows) {
    let m = motoristas.find((x) => x.id === r.id_motorista);
    if (!m) { m = { id: r.id_motorista, nome: r.nome, celular: r.celular, rotas: [] }; motoristas.push(m); }
    let t = m.rotas.find((x) => x.id === r.id_roteiro);
    if (!t) { t = { id: r.id_roteiro, horario: r.horario, empresas: [] }; m.rotas.push(t); }
    if (r.nome_exibe) t.empresas.push(r);
  }
  const corpo = motoristas.map((m) => `<section class="pg"><div class="cab"><b>Lev-Pão - Indústria de Alimentos</b><u>Etinerário de entregas</u><span>${esc(hoje)}</span></div>
    <div class="mot"><span>${esc(m.nome)}</span><span>${esc(m.celular)}</span></div>
    ${m.rotas.map((t) => `<div class="hr">${esc(t.horario)}</div>${t.empresas.map((e) => `<div class="em"><span>${esc(e.nome_exibe)}</span><span>${esc(e.telefone)}</span><span>${esc(e.contato)}</span></div>`).join('') || '<div class="em">(sem empresas)</div>'}`).join('')}</section>`).join('');
  const css = `@page{size:A4;margin:6mm}body{margin:0;font-family:Arial}.pg{page-break-after:always}.cab{display:flex;justify-content:space-between;align-items:baseline;border-bottom:.3mm solid #000;margin-bottom:2mm}.cab b{font-size:16pt;font-weight:normal}.cab u{font-size:12pt}.cab span{font-size:8pt}
  .mot{display:flex;gap:8mm;font-size:16pt;border-bottom:.3mm solid #000;margin-bottom:2mm}.hr{background:#c0c0c0;font-size:16pt;margin-top:2mm;break-after:avoid}.em{display:grid;grid-template-columns:79mm 59mm 1fr;font-size:10pt;padding:.4mm 2mm;break-inside:avoid}`;
  return { corpo, css };
}
