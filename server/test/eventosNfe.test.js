import test from 'node:test';
import assert from 'node:assert/strict';
import { enriquece, arquivoDoEvento, leRetorno } from '../src/services/eventosNfe.js';

test('cancelamento: homologado, protocolo e código saem do JSON da API cada um no seu campo', () => {
  const e = enriquece({ id: 1, nome_evento: 'CANCELAMENTO', resposta: 'Evento registrado', obs: 'just', evento_xml: 'x.xml',
    retorno: JSON.stringify({ homologado: true, protocoloEvento: 135250000012345, codigoStatus: 135, motivo: 'ok' }) });
  assert.equal(e.homologado, true); assert.equal(e.codigo_status, 135); assert.equal(e.protocolo, '135250000012345');
  assert.equal(e.retorno, undefined); // o JSON bruto não vai para a grade
  assert.deepEqual(arquivoDoEvento(e), { nome: 'cancelamento.xml' });
});
test('carta de correção: sequência vem de sequenciaEvento e aponta o XML daquela sequência', () => {
  const e = enriquece({ id: 2, nome_evento: 'CARTA DE CORRECAO', retorno: '{"homologado":true,"sequenciaEvento":3,"protocoloEvento":"9"}' });
  assert.equal(e.sequencia, 3); assert.deepEqual(arquivoDoEvento(e), { nome: 'carta-correcao.xml', seq: 3 });
});
test('autorização usa protocolo e dataAutorizacao; retorno inválido não quebra', () => {
  const e = enriquece({ id: 3, nome_evento: 'AUTORIZACAO', retorno: '{"protocolo":"135","codigoStatusRetorno":"100","dataAutorizacao":"2026-07-30T15:00:00Z"}' });
  assert.equal(e.protocolo, '135'); assert.equal(e.codigo_status, '100'); assert.equal(e.data_registro, '2026-07-30T15:00:00Z'); assert.equal(arquivoDoEvento(e), null);
  assert.deepEqual(leRetorno('{quebrado'), {}); assert.equal(enriquece({ id: 4, nome_evento: 'X', retorno: null }).protocolo, null);
});
