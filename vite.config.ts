import { defineConfig } from 'vitest/config';
import { reportCollector } from './scripts/collector';

// base './' keeps asset paths relative, so the same build works on GitHub Pages,
// Netlify, a Heroku static app, a LAN dev server, and inside a Capacitor shell.
export default defineConfig({
  base: './',
  plugins: [reportCollector()],
  build: {
    target: 'es2022',
    sourcemap: true,
    // Report chunk sizes; the rig is expected to stay small.
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
