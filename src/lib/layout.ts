/**
 * Page layout for the sheet, in millimetres from the top-left corner of an A4 page.
 * Kept free of PDF code so it can be unit tested.
 */
import { splitForTwoLines } from './ids';

export const PAGE = { w: 210, h: 297, margin: 15, footer: 12 } as const;
export const CARD_WIDTH = 78;
const CARD_GAP = 10;

/** DejaVu Sans Mono Bold: cap height and advance width as a fraction of the font size. */
export const CAP_RATIO = 0.729;
export const MONO_ADVANCE = 0.602;
/** CAA: characters on the label must be taller than 3 mm. We keep a margin. */
export const MIN_CAP_MM = 3.3;

export type LabelSize = 'L' | 'M' | 'S';
interface LabelSpec { w: number; h: number; head: number; maxEm: number; gap: number; twoLine?: boolean }
export const LABEL_SPECS: Record<LabelSize, LabelSpec> = {
  L: { w: 82, h: 24, head: 6, maxEm: 6, gap: 8 },
  M: { w: 57, h: 17, head: 4.6, maxEm: 4.6, gap: 4 },
  S: { w: 38, h: 20, head: 4.6, maxEm: 4.8, gap: 5, twoLine: true },
};
/** One set of labels per operator ID: one row per entry. */
export const LABEL_SET: LabelSize[][] = [['L', 'L'], ['M', 'M', 'M'], ['S', 'S', 'S', 'S']];
export const LABELS_PER_SET = LABEL_SET.flat().length;
const LABEL_PAD = 2.5;
const LABEL_PAD_Y = 1.5;

export interface LabelText { lines: string[]; em: number; capMm: number }

/** Picks one or two lines and the largest font size that fits the label. */
export function fitLabelText(id: string, size: LabelSize): LabelText {
  const spec = LABEL_SPECS[size];
  const width = spec.w - 2 * LABEL_PAD;
  const body = spec.h - spec.head - 2 * LABEL_PAD_Y;
  const fit = (lines: string[]) => {
    const longest = Math.max(...lines.map((l) => l.length));
    const byWidth = width / (longest * MONO_ADVANCE);
    const byHeight = body / (CAP_RATIO * (lines.length + 0.55 * (lines.length - 1)));
    const em = Math.min(spec.maxEm, byWidth, byHeight);
    return { lines, em, capMm: em * CAP_RATIO };
  };
  const one = fit([id]);
  if (!spec.twoLine && one.capMm >= MIN_CAP_MM) return one;
  const two = fit(splitForTwoLines(id));
  return two.capMm > one.capMm || spec.twoLine ? two : one;
}

export type Item =
  | { type: 'text'; text: string; x: number; y: number; size: number; bold?: boolean; muted?: boolean; align?: 'left' | 'right' }
  | { type: 'card'; index: number; x: number; y: number; w: number; h: number }
  | { type: 'label'; id: string; size: LabelSize; x: number; y: number; w: number; h: number }
  | { type: 'scale'; x: number; y: number };

export interface SheetLayoutInput {
  /** height / width of each card */
  cardAspects: number[];
  operatorIds: string[];
  mode: 'diy' | 'production';
  orderRef?: string;
}

export function layoutSheet(input: SheetLayoutInput): Item[][] {
  const { cardAspects, operatorIds, mode } = input;
  const ref = input.orderRef ?? '';
  const pages: Item[][] = [];
  let page: Item[] = [];
  let y = 0;
  const bottom = PAGE.h - PAGE.margin - PAGE.footer;
  const newPage = () => {
    page = [];
    pages.push(page);
    y = PAGE.margin;
  };
  const ensure = (h: number) => {
    if (y + h > bottom) newPage();
  };
  const heading = (text: string, note?: string) => {
    page.push({ type: 'text', text, x: PAGE.margin, y, size: 10.5, bold: true });
    y += 5.5;
    if (note) {
      page.push({ type: 'text', text: note, x: PAGE.margin, y, size: 8, muted: true });
      y += 6;
    } else {
      y += 1.5;
    }
  };

  newPage();
  if (mode === 'diy') {
    page.push({ type: 'text', text: 'Drone ID sheet', x: PAGE.margin, y, size: 15, bold: true });
    y += 8;
    page.push({
      type: 'text',
      text: 'Print at 100% / "Actual size" (not "Fit to page") so the cards and labels keep their real size.',
      x: PAGE.margin, y, size: 8.5, muted: true,
    });
    y += 9;
  }

  if (cardAspects.length) {
    if (mode === 'production') {
      heading(`Order ${ref} - flyer ID cards (${cardAspects.length})`,
        'Print on 250gsm card at 100%, laminate in 125 micron pouches, trim leaving a 3 mm sealed edge.');
    } else {
      heading('Flyer ID cards', 'Cut out and carry with you when flying. A laminating pouch or clear tape keeps them tidy.');
    }
    const x0 = (PAGE.w - (2 * CARD_WIDTH + CARD_GAP)) / 2;
    for (let i = 0; i < cardAspects.length; i += 2) {
      const pair = cardAspects.slice(i, i + 2).map((a) => CARD_WIDTH * a);
      const rowH = Math.max(...pair);
      ensure(rowH + 2);
      pair.forEach((h, j) => {
        page.push({ type: 'card', index: i + j, x: x0 + j * (CARD_WIDTH + CARD_GAP), y: y + 1, w: CARD_WIDTH, h });
      });
      y += rowH + 8;
    }
    y += 3;
  }

  if (operatorIds.length) {
    const firstRow = LABEL_SPECS[LABEL_SET[0][0]].h;
    if (mode === 'production') {
      if (cardAspects.length) newPage();
      heading(`Order ${ref} - operator ID stickers (${operatorIds.length} set${operatorIds.length > 1 ? 's' : ''})`,
        'Print on white waterproof vinyl at 100% and kiss-cut along the label outline.');
    } else {
      ensure(12 + firstRow + 2);
      heading('Operator ID labels',
        'Cut along the dashed lines. Stick one on the main body of each drone, or in a compartment that opens without tools.');
    }
    for (const id of operatorIds) {
      for (const row of LABEL_SET) {
        const specs = row.map((s) => LABEL_SPECS[s]);
        const rowW = specs.reduce((s, l) => s + l.w, 0) + specs[0].gap * (row.length - 1);
        const rowH = Math.max(...specs.map((s) => s.h));
        ensure(rowH + 3);
        let x = (PAGE.w - rowW) / 2;
        row.forEach((size, k) => {
          const s = specs[k];
          page.push({ type: 'label', id, size, x, y: y + 1.5, w: s.w, h: s.h });
          x += s.w + s.gap;
        });
        y += rowH + 6.5;
      }
      y += 3;
    }
  }

  pages.forEach((p, i) => {
    const fy = PAGE.h - PAGE.margin + 2;
    p.push({ type: 'scale', x: PAGE.margin, y: fy });
    const label = mode === 'production' ? `Order ${ref} - page ${i + 1} of ${pages.length}` : `Page ${i + 1} of ${pages.length}`;
    p.push({ type: 'text', text: label, x: PAGE.w - PAGE.margin, y: fy - 1.4, size: 7.5, muted: true, align: 'right' });
  });
  return pages;
}
