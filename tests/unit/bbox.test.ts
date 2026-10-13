import { describe, expect, it } from 'vitest';
import { findCardBox } from '../../src/lib/bbox';

function page(w: number, h: number) {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const fill = (x0: number, y0: number, x1: number, y1: number, v = 200) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set([v, v, v, 255], (y * w + x) * 4);
  };
  return { data, fill };
}

describe('findCardBox', () => {
  it('finds a card outline and ignores a header line in the margin', () => {
    const { data, fill } = page(400, 300);
    fill(10, 5, 200, 9); // browser header text
    // card border with content inside
    fill(50, 40, 300, 42); fill(50, 200, 300, 202); fill(50, 40, 52, 202); fill(298, 40, 300, 202);
    fill(70, 60, 180, 70);
    const box = findCardBox(data, 400, 300, { seed: { x: 100, y: 65 } });
    expect(box).toEqual({ x0: 50, y0: 40, x1: 300, y1: 202 });
  });

  it('picks the largest block without a seed', () => {
    const { data, fill } = page(200, 200);
    fill(5, 5, 20, 10);
    fill(40, 40, 160, 120, 240);
    expect(findCardBox(data, 200, 200)).toEqual({ x0: 40, y0: 40, x1: 160, y1: 120 });
  });

  it('returns null for a blank page', () => {
    const { data } = page(50, 50);
    expect(findCardBox(data, 50, 50)).toBeNull();
  });
});
