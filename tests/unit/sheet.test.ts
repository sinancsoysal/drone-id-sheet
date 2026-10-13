import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { cropToCard } from '../../src/lib/crop';
import { buildSheet } from '../../src/lib/sheet';

const font = new Uint8Array(readFileSync('public/fonts/DejaVuSansMono-Bold.ttf'));
const fixture = (name: string) => new Uint8Array(readFileSync(`e2e/fixtures/${name}`));
const CARD = { left: 68.5, right: 290.5, top: 841.89 - 44, bottom: 841.89 - 202 };

async function pdfText(bytes: Uint8Array) {
  const task = getDocument({ data: bytes.slice(), standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(content.items.map((i) => ('str' in i ? i.str : '')).join(' '));
  }
  await task.destroy();
  return pages;
}

describe('buildSheet', () => {
  it('builds an A4 sheet with the card and the operator ID labels', async () => {
    const card = await cropToCard(fixture('sample-flyer-id-alex.pdf'), 0, CARD);
    const bytes = await buildSheet({ cards: [card], operatorIds: ['GBR-OP-SAMPLE00TEST'], monoFont: font });
    const pages = await pdfText(bytes);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain('GBR-RP-SAMPLEALEX01');
    // 5 single-line labels plus 4 two-line labels
    expect(pages[0].split('GBR-OP-SAMPLE00TEST').length - 1).toBe(5);
    expect(pages[0].split('SAMPLE00TEST').length - 1).toBe(9);
  });

  it('crops the card to its own page size', async () => {
    const card = await cropToCard(fixture('sample-flyer-id-alex.pdf'), 0, CARD);
    const task = getDocument({ data: card.slice() });
    const page = await (await task.promise).getPage(1);
    const [x0, y0, x1, y1] = page.view;
    expect(x1 - x0).toBeCloseTo(222, 0);
    expect(y1 - y0).toBeCloseTo(158, 0);
    await task.destroy();
  });

  it('builds a print order PDF with a page per material', async () => {
    const card = await cropToCard(fixture('sample-flyer-id-alex.pdf'), 0, CARD);
    const bytes = await buildSheet({
      cards: [card, card], operatorIds: ['GBR-OP-SAMPLE00TEST'], monoFont: font, mode: 'production', orderRef: 'DIS-UNIT',
    });
    const pages = await pdfText(bytes);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('DIS-UNIT');
    expect(pages[0]).toContain('laminate');
    expect(pages[1]).toContain('vinyl');
  });
});
