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
});
