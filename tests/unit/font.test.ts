import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { CAP_RATIO, MONO_ADVANCE } from '../../src/lib/layout';

it('layout metrics match the bundled label font', () => {
  const font = fontkit.create(readFileSync('public/fonts/DejaVuSansMono-Bold.ttf'));
  expect(font.glyphForCodePoint(0x48).bbox.maxY / font.unitsPerEm).toBeCloseTo(CAP_RATIO, 2);
  expect(font.glyphForCodePoint(0x47).advanceWidth / font.unitsPerEm).toBeCloseTo(MONO_ADVANCE, 2);
});
