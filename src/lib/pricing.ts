/** Print & post pricing, shared by the page and the checkout function. */

export const PRICING = {
  currency: 'gbp',
  /** First laminated card + first sticker set + UK postage. */
  basePence: 499,
  extraCardPence: 149,
  extraLabelSetPence: 99,
  maxCards: 8,
  maxLabelSets: 8,
  delivery: 'Royal Mail 2nd Class, UK addresses',
} as const;

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
