import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Kiosken är öppen för alla i backen – egen klient utan inloggning.
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  base: '/fik/',
  plugins: [react()],
  build: { outDir: '../dist/fik', emptyOutDir: true, sourcemap: false },
  server: {
    fs: { allow: [new URL('../..', import.meta.url).pathname] }, port: 5192, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8120' } },
});
