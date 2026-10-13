import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const pages = ['index', 'guide', 'privacy', 'terms', 'order-success'];

// Shown on the terms and privacy pages; set the real values in the hosting environment.
process.env.VITE_CONTACT_EMAIL ||= 'hello@example.com';
process.env.VITE_BUSINESS_DETAILS ||= '[your business name and postal address]';

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
