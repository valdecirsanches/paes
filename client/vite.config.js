import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const FASE = '226'; // atualizar a cada entrega; aparece no rodapé para conferir se o deploy pegou
const quando = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' '); // hora de Brasília

const BUILD = `fase ${FASE} · build ${quando}`;
// publica /version.json com o build atual: o app compara e avisa o usuário quando sai versão nova
const versaoJson = () => ({ name: 'versao-json', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) }); } });

export default defineConfig({
  define: { __VERSAO__: JSON.stringify(`1.${FASE}`), __BUILD__: JSON.stringify(BUILD) },
  plugins: [react(), versaoJson()],
  // No preview (VITE_MOCK=1) tudo vai em um único arquivo JS.
  build: { rollupOptions: { output: { inlineDynamicImports: !!process.env.VITE_MOCK } } },
  server: { port: 5173, proxy: { '/api': 'http://localhost:5071' } },
});
