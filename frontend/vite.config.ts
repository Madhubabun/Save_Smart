import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Build modes:
 *  - default: served by the SaveSmart server (or `npm run dev`).
 *  - static: any static host such as GitHub Pages (relative paths, hash routes, installable).
 *  - single: one self-contained HTML file, for sharing as a single link or file.
 */
export default defineConfig(({ mode }) => ({
  base: mode === 'static' || mode === 'single' ? './' : '/',
  plugins: [react(), tailwindcss(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  define: {
    'import.meta.env.VITE_ROUTER': JSON.stringify(mode === 'static' || mode === 'single' ? 'hash' : 'browser'),
    'import.meta.env.VITE_INSTALLABLE': JSON.stringify(mode === 'single' ? 'no' : 'yes'),
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    outDir: mode === 'single' ? 'dist-single' : mode === 'static' ? 'dist-static' : 'dist',
  },
}));
