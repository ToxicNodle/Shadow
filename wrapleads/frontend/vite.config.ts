import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/auth':     'http://localhost:3001',
      '/leads':    'http://localhost:3001',
      '/carriers': 'http://localhost:3001',
      '/searches': 'http://localhost:3001',
      '/apollo':   'http://localhost:3001',
      '/stripe':   'http://localhost:3001',
      '/ai':       'http://localhost:3001',
    },
  },
});
