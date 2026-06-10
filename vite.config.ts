import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'node:path';
import manifest from './manifest.config';

/**
 * Vite build configuration.
 *
 * The @crxjs plugin wires the manifest entry points into Rollup. We add the
 * dashboard HTML page as an explicit Rollup input because it is opened as a
 * full tab (web_accessible_resource) rather than referenced from `action`.
 */
export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    target: 'esnext',
    sourcemap: false,
    rollupOptions: {
      input: {
        dashboard: resolve(__dirname, 'src/dashboard/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // HMR for the extension dev workflow.
    hmr: {
      port: 5173,
    },
  },
});
