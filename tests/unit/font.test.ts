import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { FONT, labelCharRanges } from '../../scripts/make-label-chars';
import { checkOperatorId } from '../../src/lib/ids';
import { LABEL_CHAR_RANGES } from '../../src/lib/label-chars';
import { CAP_RATIO, MONO_ADVANCE } from '../../src/lib/layout';

it('layout metrics match the bundled label font', () => {
  const font = fontkit.create(readFileSync('public/fonts/DejaVuSansMono-Bold.ttf'));
  expect(font.glyphForCodePoint(0x48).bbox.maxY / font.unitsPerEm).toBeCloseTo(CAP_RATIO, 2);
  expect(font.glyphForCodePoint(0x47).advanceWidth / font.unitsPerEm).toBeCloseTo(MONO_ADVANCE, 2);
});

it('the list of printable letters matches the bundled label font (run `npm run label-chars` after changing it)', () => {
  expect(LABEL_CHAR_RANGES).toEqual(labelCharRanges(readFileSync(FONT)));
});

it('every letter an operator ID may hold has a glyph in the label font', () => {
  const font = fontkit.create(readFileSync(FONT));
  for (const [first, last] of LABEL_CHAR_RANGES) {
    for (let cp = first; cp <= last; cp++) {
      const ch = String.fromCodePoint(cp);
      expect(font.hasGlyphForCodePoint(cp), ch).toBe(true);
      expect(checkOperatorId(`A${ch}1`).ok, ch).toBe(true);
    }
  }
});
