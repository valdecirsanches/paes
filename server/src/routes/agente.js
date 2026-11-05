import { Router } from 'express';
import { enderecoSite, instaladorBat, pacote } from '../services/agente.js';
import { tokenAgente } from '../services/ponteAgente.js';

const r = Router();
// Público (só código do agente, sem segredos): o PowerShell do instalador baixa sem cookie.
r.get('/pacote', (_req, res) => res.json(pacote()));
// Com login: o .bat embute o endereço deste sistema. Com ?conectar=1 também o token: o agente passa a atender todos os computadores.
for (const [rota, modo, nome] of [['/instalador.bat', 'instalar', 'instalar-agente-impressao.bat'], ['/remover.bat', 'remover', 'remover-agente-impressao.bat']]) {
  r.get(rota, async (req, res) => {
    res.set({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${nome}"` }).send(instaladorBat(enderecoSite(req), modo, undefined, req.query.conectar === '1' ? await tokenAgente() : ''));
  });
}
export default r;
