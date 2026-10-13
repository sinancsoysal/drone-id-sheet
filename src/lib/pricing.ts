/** Print & post pricing, shared by the page and the checkout function. */

export const PRICING = {
  currency: 'gbp',
  /** First laminated card + first sticker set + UK postage. */
  basePence: 499,
  extraCardPence: 149,
  extraLabelSetPence: 99,
  maxCards: 6,
  maxLabelSets: 8,
  delivery: 'Royal Mail 2nd Class, UK addresses',
} as const;

/**
 * Most one card may take in a print order. The browser sends cards as base64 in
 * JSON, so maxCards of them must stay under Netlify's 6 MB request limit.
 */
export const MAX_CARD_UPLOAD_BYTES = 600_000;
/** Largest order request the browser sends, leaving room under Netlify's 6 MB. */
export const MAX_ORDER_REQUEST_BYTES = 5_500_000;

export interface QuoteLine {
  description: string;
  unitPence: number;
  quantity: number;
}

export interface Quote {
  lines: QuoteLine[];
  totalPence: number;
}

export function quote(cards: number, labelSets: number): Quote {
  if (!Number.isInteger(cards) || !Number.isInteger(labelSets) || cards < 0 || labelSets < 0) {
    throw new Error('Counts must be whole numbers');
  }
  if (cards + labelSets === 0) throw new Error('Add at least one flyer ID or operator ID');
  if (cards > PRICING.maxCards) throw new Error(`Up to ${PRICING.maxCards} flyer ID cards per order`);
  if (labelSets > PRICING.maxLabelSets) throw new Error(`Up to ${PRICING.maxLabelSets} operator IDs per order`);

  const lines: QuoteLine[] = [
    {
      description: 'Print & post: laminated flyer ID card and operator ID sticker set, UK delivery',
      unitPence: PRICING.basePence,
      quantity: 1,
    },
  ];
  if (cards > 1) {
    lines.push({ description: 'Extra laminated flyer ID card', unitPence: PRICING.extraCardPence, quantity: cards - 1 });
  }
  if (labelSets > 1) {
    lines.push({ description: 'Extra operator ID sticker set', unitPence: PRICING.extraLabelSetPence, quantity: labelSets - 1 });
  }
  return { lines, totalPence: lines.reduce((s, l) => s + l.unitPence * l.quantity, 0) };
}

export function formatGBP(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}
