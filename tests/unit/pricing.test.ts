import { describe, expect, it } from 'vitest';
import { formatGBP, MAX_CARD_UPLOAD_BYTES, MAX_ORDER_REQUEST_BYTES, PRICING, quote } from '../../src/lib/pricing';

describe('quote', () => {
  it('charges the base price for one card and one sticker set', () => {
    expect(quote(1, 1).totalPence).toBe(PRICING.basePence);
    expect(quote(1, 0).totalPence).toBe(PRICING.basePence);
    expect(quote(0, 1).totalPence).toBe(PRICING.basePence);
  });
  it('adds extras beyond the first of each', () => {
    const q = quote(3, 2);
    expect(q.totalPence).toBe(PRICING.basePence + 2 * PRICING.extraCardPence + PRICING.extraLabelSetPence);
    expect(q.lines.map((l) => l.quantity)).toEqual([1, 2, 1]);
  });
  it('rejects empty and oversized orders', () => {
    expect(() => quote(0, 0)).toThrow();
    expect(() => quote(PRICING.maxCards + 1, 0)).toThrow();
    expect(() => quote(-1, 1)).toThrow();
    expect(() => quote(1.5, 1)).toThrow();
  });
});

describe('formatGBP', () => {
  it('formats pence', () => {
    expect(formatGBP(499)).toBe('£4.99');
    expect(formatGBP(1000)).toBe('£10.00');
  });
});

describe('upload limits', () => {
  it('a full order of cards fits the request limit', () => {
    // base64 makes every 3 bytes 4; 1000 bytes per card covers the PDF wrapper and JSON
    const fullOrder = PRICING.maxCards * (Math.ceil((MAX_CARD_UPLOAD_BYTES + 1000) / 3) * 4) + 10_000;
    expect(fullOrder).toBeLessThan(MAX_ORDER_REQUEST_BYTES);
  });
  it("leaves room under Netlify's 6 MB request limit", () => {
    expect(MAX_ORDER_REQUEST_BYTES).toBeLessThan(6 * 1024 * 1024 * 0.9);
  });
});
