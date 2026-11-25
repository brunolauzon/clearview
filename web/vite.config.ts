import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:7878' },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
  test: { environment: 'node' },
});
