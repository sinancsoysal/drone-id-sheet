import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const pages = ['index', 'guide', 'privacy', 'terms', 'order-success'];

export default defineConfig({
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rolldownOptions: {
      input: Object.fromEntries(pages.map((p) => [p, resolve(import.meta.dirname, `${p}.html`)])),
    },
  },
  preview: { port: 4173, strictPort: true },
  // pdf.js and pdf-lib load only on the first upload; bundling them up front stops the dev server reloading mid-upload
  optimizeDeps: { include: ['pdfjs-dist/legacy/build/pdf.mjs', 'pdf-lib', '@pdf-lib/fontkit'] },
});
