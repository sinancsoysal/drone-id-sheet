/**
 * Draws the link preview image (public/og.png) and the home screen icon
 * (public/apple-touch-icon.png) from the guide's sample sheet and the favicon.
 * Run `npm run guide` first if the sheet layout changed.
 */
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const sheet = readFileSync('public/guide/03-preview.png').toString('base64');
const icon = readFileSync('public/favicon.svg', 'utf8');

const og = `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; width: 1200px; height: 630px; display: flex; font-family: "DejaVu Sans", system-ui, sans-serif; background: #f5f5f3; color: #111; overflow: hidden; }
  .text { width: 560px; padding: 72px 0 0 72px; box-sizing: border-box; }
  .brand { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 700; }
  .brand svg { width: 52px; height: 52px; }
  h1 { font-size: 54px; line-height: 1.12; margin: 56px 0 24px; }
  p { font-size: 28px; line-height: 1.35; color: #444; margin: 0; }
  .sheet { flex: 1; position: relative; }
  .sheet img { position: absolute; left: 20px; top: 46px; width: 760px; transform: rotate(-3deg); box-shadow: 0 10px 40px rgba(0,0,0,.18); border-radius: 6px; }
</style>
<div class="text"><div class="brand">${icon}Print Drone IDs</div>
<h1>Drone operator ID labels and flyer ID card</h1><p>Free to print. Or laminated and posted for £4.99.</p></div>
<div class="sheet"><img src="data:image/png;base64,${sheet}"></div>`;

const touch = `<!doctype html><style>body{margin:0}svg{display:block;width:180px;height:180px}</style>${icon.replace('rx="6"', 'rx="0"')}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(og);
await page.screenshot({ path: 'public/og.png' });
await page.setViewportSize({ width: 180, height: 180 });
await page.setContent(touch);
await page.screenshot({ path: 'public/apple-touch-icon.png' });
await browser.close();
