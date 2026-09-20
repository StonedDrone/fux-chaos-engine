import { defineConfig } from 'vite';

export default defineConfig({
  // Bind to all interfaces so the sandbox preview proxy can reach the server,
  // and accept the proxied preview host/origin.
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    cors: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020',
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
