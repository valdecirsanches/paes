import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // No preview (VITE_MOCK=1) tudo vai em um único arquivo JS.
  build: { rollupOptions: { output: { inlineDynamicImports: !!process.env.VITE_MOCK } } },
  server: { port: 5173, proxy: { '/api': 'http://localhost:5071' } },
});
