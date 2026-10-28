// Eventos fiscais gravados em tb_nfe_eventos. A resposta completa da API fica em `retorno` (JSON); aqui ela é
// aberta nos campos que a tela mostra, cada um no seu lugar (EMISSAO_NFE.md: homologado, codigoStatus,
// protocoloEvento, sequenciaEvento, dataRegistro, motivo).
export function leRetorno(texto) {
  try { const o = JSON.parse(texto || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; }
}

/** Linha de tb_nfe_eventos → linha da tela (sem o JSON bruto, que pode ser grande). */
export function enriquece(e) {
  const { retorno, ...resto } = e;
  const r = leRetorno(retorno);
  const protocolo = r.protocoloEvento ?? r.protocolo ?? null;
  return {
    ...resto,
    homologado: typeof r.homologado === 'boolean' ? r.homologado : null,
    codigo_status: r.codigoStatus ?? r.codigoStatusRetorno ?? null,
    protocolo: protocolo == null ? null : String(protocolo),
    sequencia: r.sequenciaEvento ?? null,
    data_registro: r.dataRegistro ?? r.dataAutorizacao ?? null,
  };
}

/** Arquivo da API que corresponde a cada tipo de evento (rota /nfe/:id/arquivo/:nome). */
export function arquivoDoEvento(e) {
  if (/CARTA/i.test(e.nome_evento)) return { nome: 'carta-correcao.xml', seq: e.sequencia ?? undefined };
  if (/CANCEL/i.test(e.nome_evento)) return { nome: 'cancelamento.xml' };
  return null;
}
