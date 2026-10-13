/**
 * Finds the flyer ID card on a rendered page: the connected block of non-white
 * pixels around the ID text. Browser headers and footers in the margins are ignored.
 */
export interface PixelBox { x0: number; y0: number; x1: number; y1: number }

export interface FindOptions {
  /** A pixel known to be on the card, e.g. the flyer ID text. */
  seed?: { x: number; y: number };
  /** Pixels darker than this count as ink (0-255). */
  threshold?: number;
  /** Grid cell size in pixels; gaps up to about 2 cells are bridged. */
  cell?: number;
}

export function findCardBox(rgba: Uint8ClampedArray, width: number, height: number, opts: FindOptions = {}): PixelBox | null {
  const threshold = opts.threshold ?? 248;
  const cell = opts.cell ?? 4;
  const gw = Math.ceil(width / cell), gh = Math.ceil(height / cell);
  const ink = new Uint8Array(gw * gh);
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = row + x * 4;
      const a = rgba[i + 3];
      // transparent pixels are page background
      if (a > 16 && (rgba[i] < threshold || rgba[i + 1] < threshold || rgba[i + 2] < threshold)) {
        ink[((y / cell) | 0) * gw + ((x / cell) | 0)] = 1;
      }
    }
  }
  // dilate by one cell so nearby elements of the card join up
  const grown = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      if (!ink[gy * gw + gx]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = gx + dx, ny = gy + dy;
          if (nx >= 0 && ny >= 0 && nx < gw && ny < gh) grown[ny * gw + nx] = 1;
        }
      }
    }
  }

  const label = new Int32Array(gw * gh).fill(-1);
  const boxes: { box: PixelBox; cells: number }[] = [];
  const stack: number[] = [];
  for (let start = 0; start < grown.length; start++) {
    if (!grown[start] || label[start] >= 0) continue;
    const id = boxes.length;
    const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    let cells = 0;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const c = stack.pop()!;
      const cx = c % gw, cy = (c / gw) | 0;
      if (ink[c]) {
        cells++;
        box.x0 = Math.min(box.x0, cx); box.x1 = Math.max(box.x1, cx);
        box.y0 = Math.min(box.y0, cy); box.y1 = Math.max(box.y1, cy);
      }
      for (const n of [c - 1, c + 1, c - gw, c + gw]) {
        if (n < 0 || n >= grown.length || label[n] >= 0 || !grown[n]) continue;
        if ((n === c - 1 && cx === 0) || (n === c + 1 && cx === gw - 1)) continue;
        label[n] = id;
        stack.push(n);
      }
    }
    boxes.push({ box, cells });
  }

  // The card is the largest block whose outline surrounds the seed. Its contents
  // can be separate blocks when the card has a plain white background.
  const area = (b: PixelBox) => (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
  const seed = opts.seed && { x: (opts.seed.x / cell) | 0, y: (opts.seed.y / cell) | 0 };
  let pick = -1;
  boxes.forEach(({ box: b }, i) => {
    if (!Number.isFinite(b.x0)) return;
    if (seed && (seed.x < b.x0 || seed.x > b.x1 || seed.y < b.y0 || seed.y > b.y1)) return;
    if (pick < 0 || area(b) > area(boxes[pick].box)) pick = i;
  });
  if (pick < 0) return seed ? findCardBox(rgba, width, height, { ...opts, seed: undefined }) : null;
  const g = boxes[pick].box;
  return refine(rgba, width, height, threshold, {
    x0: g.x0 * cell, y0: g.y0 * cell,
    x1: Math.min(width, (g.x1 + 1) * cell), y1: Math.min(height, (g.y1 + 1) * cell),
  });
}

/** Tightens a cell-aligned box to the exact ink pixels inside it. */
function refine(rgba: Uint8ClampedArray, width: number, _height: number, threshold: number, b: PixelBox): PixelBox {
  const out = { x0: b.x1, y0: b.y1, x1: b.x0, y1: b.y0 };
  for (let y = b.y0; y < b.y1; y++) {
    for (let x = b.x0; x < b.x1; x++) {
      const i = (y * width + x) * 4;
      if (rgba[i + 3] > 16 && (rgba[i] < threshold || rgba[i + 1] < threshold || rgba[i + 2] < threshold)) {
        if (x < out.x0) out.x0 = x;
        if (x + 1 > out.x1) out.x1 = x + 1;
        if (y < out.y0) out.y0 = y;
        if (y + 1 > out.y1) out.y1 = y + 1;
      }
    }
  }
  return out.x1 > out.x0 ? out : b;
}
