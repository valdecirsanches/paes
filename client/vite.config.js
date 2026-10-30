import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const FASE = '136'; // atualizar a cada entrega; aparece no rodapé para conferir se o deploy pegou
const quando = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' '); // hora de Brasília

export default defineConfig({
  define: { __BUILD__: JSON.stringify(`fase ${FASE} · build ${quando}`) },
  plugins: [react()],
  // No preview (VITE_MOCK=1) tudo vai em um único arquivo JS.
  build: { rollupOptions: { output: { inlineDynamicImports: !!process.env.VITE_MOCK } } },
  server: { port: 5173, proxy: { '/api': 'http://localhost:5071' } },
});
