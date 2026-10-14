/**
 * Draws the sample sheet and label pictures shown on the site (public/images/*.png)
 * from the PDF the guide test downloads, which only holds the synthetic sample IDs.
 * Run `npm run guide` first so the PDF exists. Needs pdftoppm (poppler-utils).
 */
import { execFileSync } from 'node:child_process';
import { globSync, mkdirSync } from 'node:fs';

const [pdf] = globSync('test-results/runs/guide-*-desktop/drone-id-sheet.pdf');
if (!pdf) throw new Error('No sample sheet PDF yet. Run `npm run guide` first.');
mkdirSync('public/images', { recursive: true });

// Crop boxes are in pixels at 100 dpi on the A4 page; scaled up to the render resolution below.
const shots = [
  { name: 'drone-operator-id-sticker-sheet', dpi: 150, x: 0, y: 0, w: 827, h: 800 },
  { name: 'drone-operator-id-labels-three-sizes', dpi: 200, x: 48, y: 470, w: 730, h: 318 },
];

for (const s of shots) {
  const k = s.dpi / 100;
  const box = [s.x, s.y, s.w, s.h].map((v) => String(Math.round(v * k)));
  execFileSync('pdftoppm', ['-r', String(s.dpi), '-png', '-singlefile',
    '-x', box[0], '-y', box[1], '-W', box[2], '-H', box[3], pdf, `public/images/${s.name}`]);
  console.log(`public/images/${s.name}.png`);
}
