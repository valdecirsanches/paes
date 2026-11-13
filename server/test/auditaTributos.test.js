import test from 'node:test';
import assert from 'node:assert/strict';
import { itensDoXml } from '../src/services/auditaTributos.js';

const XML = `<NFe><infNFe><det nItem="1"><prod><cProd>15.65</cProd><NCM>19059090</NCM><cBenef>SP020030</cBenef></prod><imposto>
<ICMS><ICMS20><orig>0</orig><CST>20</CST><pRedBC>38.89</pRedBC><pICMS>18.00</pICMS></ICMS20></ICMS>
<IPI><IPINT><CST>53</CST></IPINT></IPI><PIS><PISNT><CST>06</CST></PISNT></PIS><COFINS><COFINSAliq><CST>01</CST><pCOFINS>7.60</pCOFINS></COFINSAliq></COFINS>
<IBSCBS><CST>200</CST><gIBSCBS><cClassTrib>200003</cClassTrib><gIBSUF><pIBSUF>0.10</pIBSUF></gIBSUF><gCBS><pCBS>0.90</pCBS></gCBS></gIBSCBS></IBSCBS>
</imposto></det></infNFe></NFe>`;
test('extrai os campos fiscais do item do XML', () => {
  const [i] = itensDoXml(XML);
  assert.equal(i.codigo, '15.65'); assert.equal(i.ncm, '19059090'); assert.equal(i.cBenef, 'SP020030');
  assert.equal(i.cst_icms, '20'); assert.equal(i.aliq_icms, 18); assert.equal(i.red_icms, 38.89);
  assert.equal(i.cst_ipi, '53'); assert.equal(i.cst_pis, '06'); assert.equal(i.cst_cofins, '01'); assert.equal(i.aliq_cofins, 7.6);
  assert.equal(i.cst_ibs, '200'); assert.equal(i.cClassTrib, '200003'); assert.equal(i.pIBS, 0.1); assert.equal(i.pCBS, 0.9);
});
