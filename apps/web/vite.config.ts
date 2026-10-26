/// <reference types="vitest" />
import { defineConfig, defaultClientConditions } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // Resolve @cookout-ai/domain to its TypeScript source (see the package's exports map) in the
    // dev server, Vitest, and `vite build` alike, so none of them depend on a built dist/.
    conditions: ['@cookout-ai/source', ...defaultClientConditions],
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
});
