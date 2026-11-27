import { Router } from 'express';
import { consultaCep } from '../services/cep.js';
import { codigoMunicipio } from '../services/municipios.js';

const router = Router();
// Código IBGE de uma cidade/UF (tabela embutida; é o mesmo que a geração da NFe usa)
router.get('/municipio', (req, res) => res.json({ ibge: codigoMunicipio(req.query.uf, req.query.cidade) }));
// Endereço pelo CEP (lupa dos cadastros de cliente e unidade)
router.get('/:cep', async (req, res) => res.json(await consultaCep(req.params.cep)));
export default router;
