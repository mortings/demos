import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Three renderer pages: the settings window, the floating overlay pill and the
// hidden audio engine. All are loaded from file:// so the base must be relative.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    target: 'chrome130',
    rollupOptions: {
      input: {
        settings: resolve(__dirname, 'src/renderer/settings/index.html'),
        overlay: resolve(__dirname, 'src/renderer/overlay/index.html'),
        engine: resolve(__dirname, 'src/renderer/engine/index.html'),
      },
    },
  },
});
