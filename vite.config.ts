import { defineConfig } from 'vite';

/// <reference types="vitest" />
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  server: {
    port: 7812,
    proxy: {
      '/chat': {
        target: 'http://localhost:7811',
        changeOrigin: true,
      },
      '/ai': {
        target: 'http://localhost:7811',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:7811',
        changeOrigin: true,
      }
    }
  },
  build: {
    target: 'ES2020',
    sourcemap: true,
  },
});
