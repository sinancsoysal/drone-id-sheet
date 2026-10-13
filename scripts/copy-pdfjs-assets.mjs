// Copies the font and image decoder files pdf.js loads at runtime into public/pdfjs.
import { cpSync, rmSync } from 'node:fs';

const from = 'node_modules/pdfjs-dist';
rmSync('public/pdfjs', { recursive: true, force: true });
for (const dir of ['standard_fonts', 'wasm', 'cmaps', 'iccs']) {
  cpSync(`${from}/${dir}`, `public/pdfjs/${dir}`, { recursive: true });
}
