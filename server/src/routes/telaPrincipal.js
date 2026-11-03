import { Router } from 'express';
import { AppError, invalid } from '../errors.js';
import { gravarImagem, lerImagem, lerMeta, MAX_BYTES, removerImagem, tipoImagem } from '../services/telaPrincipal.js';

// Imagem da tela principal: qualquer usuário logado vê; só o administrador troca ou volta à padrão.
const router = Router();
const ehAdmin = (req) => String(req.user?.usuario ?? '').toUpperCase() === 'SANCHES';
const soAdmin = (req, _res, next) => (ehAdmin(req) ? next() : next(new AppError(403, 'Só o administrador troca a imagem da tela principal.')));

router.get('/', async (_req, res) => { const m = await lerMeta(); res.json(m ? { personalizada: true, nome: m.nome, bytes: m.bytes, versao: m.versao } : { personalizada: false }); });
router.get('/imagem', async (_req, res) => {
  const [m, b] = await Promise.all([lerMeta(), lerImagem()]);
  if (!m || !b) return res.status(404).json({ message: 'Imagem padrão em uso.' });
  res.type(m.tipo).set('Cache-Control', 'private, max-age=3600').send(b);
});
router.put('/', soAdmin, async (req, res) => {
  const b = Buffer.from(String(req.body?.arquivoBase64 ?? ''), 'base64');
  if (b.length > MAX_BYTES) throw invalid('Imagem muito grande (máx. 4 MB). Reduza ou use JPG.');
  const tipo = tipoImagem(b);
  if (!tipo) throw invalid('Envie uma imagem PNG, JPG ou WEBP.');
  const m = await gravarImagem(b, req.body?.nomeArquivo, tipo);
  res.json({ personalizada: true, nome: m.nome, bytes: m.bytes, versao: m.versao });
});
router.delete('/', soAdmin, async (_req, res) => { await removerImagem(); res.json({ personalizada: false }); });
export default router;
