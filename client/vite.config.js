import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const ESCRITAS = JSON.parse(readFileSync(new URL('./novidades.json', import.meta.url), 'utf8')); // o que mudou em cada fase (texto para o usuário)
// histórico completo: fases sem texto próprio entram com o título da nota do README ("## Fase NNN — título")
const NOVIDADES = (() => {
  const tem = new Set(ESCRITAS.map((n) => n.fase));
  let extra = [];
  try {
    extra = [...readFileSync(new URL('../README.md', import.meta.url), 'utf8').matchAll(/^## Fase (\d+) [—-] (.+)$/gm)]
      .map((m) => ({ fase: Number(m[1]), itens: [m[2].trim()] })).filter((n) => !tem.has(n.fase));
  } catch { /* sem README: só as escritas */ }
  return [...ESCRITAS, ...extra].sort((a, b) => b.fase - a.fase);
})();

const FASE = '285'; // atualizar a cada entrega; aparece no rodapé para conferir se o deploy pegou
const quando = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' '); // hora de Brasília

const BUILD = `fase ${FASE} · build ${quando}`;
// publica /version.json com o build atual: o app compara e avisa o usuário quando sai versão nova
const versaoJson = () => ({ name: 'versao-json', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD, fase: Number(FASE), novidades: NOVIDADES }) }); } });

export default defineConfig({
  define: { __VERSAO__: JSON.stringify(`1.${FASE}`), __BUILD__: JSON.stringify(BUILD), __FASE__: JSON.stringify(Number(FASE)), __NOVIDADES__: JSON.stringify(NOVIDADES) },
  plugins: [react(), versaoJson()],
  // No preview (VITE_MOCK=1) tudo vai em um único arquivo JS.
  build: { rollupOptions: { output: { inlineDynamicImports: !!process.env.VITE_MOCK } } },
  server: { port: 5173, proxy: { '/api': 'http://localhost:5071' } },
});
