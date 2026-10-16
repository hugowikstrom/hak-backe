import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Mobilappen är en egen klient under /mobil/ med egen servicearbetare.
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  base: '/mobil/',
  plugins: [react()],
  build: { outDir: '../dist/mobil', emptyOutDir: true, sourcemap: false },
  server: {
    port: 5191,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8120' },
  },
});
