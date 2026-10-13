/** Draws the sheet layout into a PDF with pdf-lib. Runs in the browser and in Netlify Functions. */
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { fitLabelText, layoutSheet, PAGE, LABEL_SPECS, type Item } from './layout';

export const MM = 72 / 25.4;
const INK = rgb(0.07, 0.07, 0.07);
const MUTED = rgb(0.35, 0.35, 0.35);
const CUT = rgb(0.62, 0.62, 0.62);
const WHITE = rgb(1, 1, 1);

export interface SheetInput {
  /** Single-page PDFs, each holding one cropped flyer ID card. */
  cards: Uint8Array[];
  operatorIds: string[];
  monoFont: Uint8Array;
  mode?: 'diy' | 'production';
  orderRef?: string;
}

export async function buildSheet(input: SheetInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(input.mode === 'production' ? `Drone ID order ${input.orderRef ?? ''}` : 'Drone ID sheet');
  doc.setCreator('Print Drone IDs');
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(input.monoFont, { subset: true }),
  };
  const cards = await Promise.all(input.cards.map(async (bytes) => (await doc.embedPdf(bytes, [0]))[0]));
  const pages = layoutSheet({
    cardAspects: cards.map((c) => c.height / c.width),
    operatorIds: input.operatorIds,
    mode: input.mode ?? 'diy',
    orderRef: input.orderRef,
  });
  for (const items of pages) {
    const page = doc.addPage([PAGE.w * MM, PAGE.h * MM]);
    for (const item of items) draw(page, item, fonts, cards);
  }
  return doc.save();
}

type Fonts = { regular: PDFFont; bold: PDFFont; mono: PDFFont };
type Embedded = Awaited<ReturnType<PDFDocument['embedPdf']>>[number];

/** mm from top-left to PDF points from bottom-left */
const X = (mm: number) => mm * MM;
const Y = (mm: number) => (PAGE.h - mm) * MM;

function draw(page: PDFPage, item: Item, fonts: Fonts, cards: Embedded[]) {
  switch (item.type) {
    case 'text': {
      const font = item.bold ? fonts.bold : fonts.regular;
      const width = font.widthOfTextAtSize(item.text, item.size);
      const x = item.align === 'right' ? X(item.x) - width : X(item.x);
      page.drawText(item.text, { x, y: Y(item.y) - item.size * 0.75, size: item.size, font, color: item.muted ? MUTED : INK });
      break;
    }
    case 'card': {
      cutBox(page, item.x, item.y, item.w, item.h, 1);
      page.drawPage(cards[item.index], { x: X(item.x), y: Y(item.y + item.h), width: X(item.w), height: item.h * MM });
      break;
    }
    case 'label':
      drawLabel(page, item, fonts);
      break;
    case 'scale': {
      const y = Y(item.y);
      const opts = { thickness: 0.8, color: INK };
      page.drawLine({ start: { x: X(item.x), y }, end: { x: X(item.x + 50), y }, ...opts });
      for (const t of [0, 50]) {
        page.drawLine({ start: { x: X(item.x + t), y: y - 4 }, end: { x: X(item.x + t), y: y + 4 }, ...opts });
      }
      page.drawText('Scale check: this line should measure exactly 50 mm.', {
        x: X(item.x + 53), y: y - 2.5, size: 7.5, font: fonts.regular, color: MUTED,
      });
      break;
    }
  }
}

function cutBox(page: PDFPage, x: number, y: number, w: number, h: number, pad: number) {
  page.drawRectangle({
    x: X(x - pad), y: Y(y + h + pad), width: (w + 2 * pad) * MM, height: (h + 2 * pad) * MM,
    borderColor: CUT, borderWidth: 0.5, borderDashArray: [3, 2],
  });
}

function roundedPath(w: number, h: number, r: number, squareBottom = false) {
  // SVG coordinates in points, y grows downwards from the path origin
  const b = squareBottom
    ? `L ${w} ${h} L 0 ${h}`
    : `L ${w} ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} L ${r} ${h} A ${r} ${r} 0 0 1 0 ${h - r}`;
  return `M ${r} 0 L ${w - r} 0 A ${r} ${r} 0 0 1 ${w} ${r} ${b} L 0 ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
}

function drawLabel(page: PDFPage, item: Extract<Item, { type: 'label' }>, fonts: Fonts) {
  const spec = LABEL_SPECS[item.size];
  cutBox(page, item.x, item.y, item.w, item.h, 1.5);
  const w = item.w * MM, h = item.h * MM, head = spec.head * MM, r = 2 * MM;
  const origin = { x: X(item.x), y: Y(item.y) };
  page.drawSvgPath(roundedPath(w, h, r), { ...origin, color: WHITE });
  page.drawSvgPath(roundedPath(w, head, r, true), { ...origin, color: INK });
  page.drawSvgPath(roundedPath(w, h, r), { ...origin, borderColor: INK, borderWidth: 1.2 });

  // header: "OPERATOR ID" and a small quadcopter
  const hs = head * 0.5;
  page.drawText('OPERATOR ID', {
    x: origin.x + 2.2 * MM, y: origin.y - head / 2 - hs * 0.36, size: hs, font: fonts.bold, color: WHITE,
  });
  drone(page, origin.x + w - head * 0.62 - 1 * MM, origin.y - head / 2, head * 0.78);

  // the ID itself
  const fit = fitLabelText(item.id, item.size);
  const size = fit.em * MM;
  const cap = fit.capMm * MM;
  const gap = cap * 0.55;
  const block = cap * fit.lines.length + gap * (fit.lines.length - 1);
  let base = origin.y - head - (h - head - block) / 2 - cap;
  for (const line of fit.lines) {
    const tw = fonts.mono.widthOfTextAtSize(line, size);
    page.drawText(line, { x: origin.x + (w - tw) / 2, y: base, size, font: fonts.mono, color: rgb(0, 0, 0) });
    base -= cap + gap;
  }
}

function drone(page: PDFPage, cx: number, cy: number, s: number) {
  const a = s * 0.32, t = s * 0.09;
  for (const [dx, dy] of [[-a, -a], [a, -a], [-a, a], [a, a]]) {
    page.drawLine({ start: { x: cx, y: cy }, end: { x: cx + dx, y: cy + dy }, thickness: t, color: WHITE });
    page.drawCircle({ x: cx + dx, y: cy + dy, size: s * 0.17, borderColor: WHITE, borderWidth: t });
  }
  page.drawRectangle({ x: cx - s * 0.11, y: cy - s * 0.11, width: s * 0.22, height: s * 0.22, color: WHITE });
}
