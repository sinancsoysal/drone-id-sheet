import { describe, expect, it } from 'vitest';
import { fitLabelText, LABEL_SPECS, LABELS_PER_SET, layoutSheet, MIN_CAP_MM, PAGE, type Item, type LabelSize } from '../../src/lib/layout';

const boxes = (items: Item[]) => items.filter((i): i is Extract<Item, { w: number }> => 'w' in i);

describe('fitLabelText', () => {
  const sizes = Object.keys(LABEL_SPECS) as LabelSize[];
  it.each(sizes)('keeps UK IDs taller than 3 mm on %s labels', (size) => {
    const fit = fitLabelText('GBR-OP-SAMPLE00TEST', size);
    expect(fit.capMm).toBeGreaterThanOrEqual(MIN_CAP_MM);
  });
  it('uses one line on large labels and two on small ones', () => {
    expect(fitLabelText('GBR-OP-SAMPLE00TEST', 'L').lines).toHaveLength(1);
    expect(fitLabelText('GBR-OP-SAMPLE00TEST', 'S').lines).toEqual(['GBR-OP-', 'SAMPLE00TEST']);
  });
  it('falls back to two lines when a long ID would get too small', () => {
    const fit = fitLabelText('ABCDEFGHIJKLMNOPQRSTUVW', 'M');
    expect(fit.lines).toHaveLength(2);
    expect(fit.capMm).toBeGreaterThanOrEqual(MIN_CAP_MM);
  });
});

describe('layoutSheet', () => {
  it('puts two cards and one label set on one page', () => {
    const pages = layoutSheet({ cardAspects: [0.71, 0.71], operatorIds: ['GBR-OP-AAAA1111BBBB'], mode: 'diy' });
    expect(pages).toHaveLength(1);
    expect(pages[0].filter((i) => i.type === 'card')).toHaveLength(2);
    expect(pages[0].filter((i) => i.type === 'label')).toHaveLength(LABELS_PER_SET);
  });

  it('flows onto more pages and keeps everything inside the margins without overlaps', () => {
    const ids = Array.from({ length: 5 }, (_, i) => `GBR-OP-AAAA1111BBB${i}`);
    const pages = layoutSheet({ cardAspects: Array(7).fill(0.71), operatorIds: ids, mode: 'diy' });
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat().filter((i) => i.type === 'card')).toHaveLength(7);
    expect(pages.flat().filter((i) => i.type === 'label')).toHaveLength(5 * LABELS_PER_SET);
    for (const page of pages) {
      const b = boxes(page);
      for (const r of b) {
        expect(r.x).toBeGreaterThanOrEqual(10);
        expect(r.x + r.w).toBeLessThanOrEqual(PAGE.w - 10);
        expect(r.y).toBeGreaterThanOrEqual(PAGE.margin);
        expect(r.y + r.h).toBeLessThanOrEqual(PAGE.h - PAGE.margin - PAGE.footer + 2);
      }
      for (let i = 0; i < b.length; i++) {
        for (let j = i + 1; j < b.length; j++) {
          const p = b[i], q = b[j];
          const overlap = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
          expect(overlap, `items ${i} and ${j} overlap`).toBe(false);
        }
      }
    }
  });

  it('puts stickers on their own pages for print orders', () => {
    const pages = layoutSheet({ cardAspects: [0.71], operatorIds: ['GBR-OP-AAAA1111BBBB'], mode: 'production', orderRef: 'DIS-TEST' });
    expect(pages).toHaveLength(2);
    expect(pages[0].some((i) => i.type === 'label')).toBe(false);
    expect(pages[1].some((i) => i.type === 'card')).toBe(false);
    expect(pages.flat().some((i) => i.type === 'text' && i.text.includes('DIS-TEST'))).toBe(true);
  });
});
