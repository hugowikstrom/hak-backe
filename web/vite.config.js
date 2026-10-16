import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [react()],
  // Mobilklienten bygger till dist/mobil, så webbklienten får inte tömma katalogen.
  build: { outDir: 'dist', emptyOutDir: false, sourcemap: false },
  server: {
    port: 5190,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8120', '/halsa': 'http://127.0.0.1:8120' },
  },
});
