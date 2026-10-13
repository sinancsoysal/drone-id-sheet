/**
 * Writes made-up flyer ID and operator ID PDFs for the tests. They follow the
 * layout of the documents from register-drones.caa.co.uk but hold no real IDs.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { PDFDocument, PDFPage, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

const OUT = 'e2e/fixtures';
const A4: [number, number] = [595.28, 841.89];

interface Fonts { regular: PDFFont; bold: PDFFont }

function card(page: PDFPage, f: Fonts, x: number, top: number, title: string, rows: [string, string][], id: string) {
  const w = 222, h = 158, y = A4[1] - top - h;
  page.drawRectangle({ x, y, width: w, height: h, color: rgb(0.975, 0.978, 0.985), borderColor: rgb(0.8, 0.82, 0.85), borderWidth: 0.6 });
  // faint watermark pattern like the real cards
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 4; j++) {
      page.drawCircle({ x: x + 20 + i * 36, y: y + 20 + j * 38, size: 6, borderColor: rgb(0.92, 0.93, 0.94), borderWidth: 1.5 });
    }
  }
  const t = (s: string, dx: number, dy: number, size: number, bold = false, color = rgb(0.1, 0.1, 0.1)) =>
    page.drawText(s, { x: x + dx, y: y + h - dy, size, font: bold ? f.bold : f.regular, color });
  t('UNITED KINGDOM', 9, 14, 6.5, true, rgb(0.13, 0.2, 0.5));
  t('Drone and model aircraft', 9, 25, 9, true);
  t('Proof of completion of online training', 9, 33, 5);
  t(title, 9, 49, 9, true);
  t(id, 9, 61, 7.5, true);
  rows.forEach(([k, v], i) => {
    // the CAA's PDFs have the field labels baked into the background image; an empty label mimics that
    if (k) t(k, 9, 73 + i * 10, 5.5, true);
    t(v, 44, 73 + i * 10, 5.5, true);
  });
  page.drawRectangle({ x: x + 9, y: y + 10, width: 22, height: 24, color: rgb(0.8, 0.1, 0.15) });
  t('SAMPLE', 150, 140, 9, true, rgb(0.8, 0.1, 0.15));
  t('NOT A REAL ID', 150, 149, 5.5, true, rgb(0.8, 0.1, 0.15));
}

async function doc(draw: (page: PDFPage, f: Fonts) => void): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const f = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  draw(pdf.addPage(A4), f);
  return pdf.save();
}

const browserChrome = (page: PDFPage, f: Fonts, title: string) => {
  // what a browser adds when "headers and footers" is ticked in the print dialog
  page.drawText(`13/10/2026, 08:38  ${title}`, { x: 20, y: A4[1] - 18, size: 8, font: f.regular });
  page.drawText('https://register-drones.caa.co.uk/certificate   1/1', { x: 20, y: 14, size: 8, font: f.regular });
};

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/sample-flyer-id-alex.pdf`, await doc((p, f) =>
  card(p, f, 68.5, 44, 'Flyer ID', [['First name:', 'ALEX'], ['Last name:', 'EXAMPLE'], ['Expiry date:', '1 January 2031']], 'GBR-RP-SAMPLEALEX01')));
writeFileSync(`${OUT}/sample-flyer-id-sam.pdf`, await doc((p, f) => {
  browserChrome(p, f, 'Flyer ID');
  card(p, f, 90, 60, 'Flyer ID', [['', 'SAM'], ['', 'SAMPLE'], ['', '2 February 2031']], 'GBR-RP-SAMPLESAM002');
}));
writeFileSync(`${OUT}/sample-operator-id.pdf`, await doc((p, f) =>
  card(p, f, 68.5, 44, 'Operator ID', [['Name:', 'ALEX EXAMPLE'], ['Expiry date:', '1 January 2027']], 'GBR-OP-SAMPLE00TEST')));
writeFileSync(`${OUT}/not-an-id.pdf`, await doc((p, f) =>
  p.drawText('Shopping list: batteries, propellers, SD card', { x: 60, y: 760, size: 12, font: f.regular })));
console.log('fixtures written to', OUT);
