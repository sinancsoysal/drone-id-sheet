/** Parsing and validation of UK CAA flyer IDs and operator IDs. */

export const FLYER_ID_RE = /GBR-RP-[A-Z0-9]{12}/;
export const OPERATOR_ID_RE = /GBR-OP-[A-Z0-9]{12}/g;
const UK_OPERATOR_RE = /^GBR-OP-[A-Z0-9]{12}$/;

export interface FlyerDetails {
  flyerId?: string;
  firstName?: string;
  lastName?: string;
  expiry?: string;
}

export interface OperatorCheck {
  ok: boolean;
  id: string;
  /** Why the ID was rejected. */
  message?: string;
}

export const OPERATOR_PREFIX = 'GBR-OP-';
export const OPERATOR_BODY_LENGTH = 12;
const PREFIX_LETTERS = 'GBROP';

export function normaliseOperatorId(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, '').replace(/[‐‑–—]/g, '-');
}

/** Only complete UK operator IDs are accepted: GBR-OP- and 12 letters or numbers. */
export function checkOperatorId(raw: string): OperatorCheck {
  const id = normaliseOperatorId(raw);
  if (!id) return { ok: false, id, message: 'Enter an operator ID.' };
  if (UK_OPERATOR_RE.test(id)) return { ok: true, id };
  if (/^GBR-?RP/.test(id)) {
    return { ok: false, id, message: `${id} is a flyer ID. Operator IDs start with GBR-OP-. Upload the flyer ID PDF instead.` };
  }
  return { ok: false, id, message: `${id} isn't a UK operator ID. It should be GBR-OP- followed by 12 letters or numbers.` };
}

/**
 * Turns whatever is typed or pasted into the GBR-OP-XXXXXXXXXXXX template:
 * capitals only, other characters dropped, dashes added, at most 12 characters
 * after the prefix. The prefix can be typed, pasted or left out.
 */
export function formatOperatorInput(raw: string): string {
  let clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean || looksLikeFlyerId(raw)) return '';
  // pasted text like "Operator ID: GBR-OP-…" starts at the ID
  const at = clean.indexOf(PREFIX_LETTERS);
  if (at > 0) clean = clean.slice(at);
  if (PREFIX_LETTERS.startsWith(clean) && clean.length < PREFIX_LETTERS.length) {
    // still typing the prefix: G, GB, GBR-, GBR-O
    return clean.length >= 3 ? `GBR-${clean.slice(3)}` : clean;
  }
  const body = clean.startsWith(PREFIX_LETTERS) ? clean.slice(PREFIX_LETTERS.length) : clean;
  return OPERATOR_PREFIX + body.slice(0, OPERATOR_BODY_LENGTH);
}

/** True for text that starts like a flyer ID (GBR-RP-), which belongs in the file upload instead. */
export function looksLikeFlyerId(raw: string): boolean {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').startsWith('GBRRP');
}

/** How many characters are still missing from a formatted operator ID. */
export function operatorCharsLeft(formatted: string): number {
  const body = formatted.startsWith(OPERATOR_PREFIX) ? formatted.slice(OPERATOR_PREFIX.length) : '';
  return OPERATOR_BODY_LENGTH - body.length;
}

export function findOperatorIds(text: string): string[] {
  return unique(text.toUpperCase().match(OPERATOR_ID_RE) ?? []);
}

/** Reads ID, names and expiry from the text lines of a CAA flyer ID card. */
export function parseFlyerLines(lines: string[]): FlyerDetails {
  const text = lines.join('\n');
  const out: FlyerDetails = {};
  const id = text.toUpperCase().match(FLYER_ID_RE);
  if (id) out.flyerId = id[0];
  const field = (label: string) => {
    const m = text.match(new RegExp(`${label}\\s*:?[ \\t]*(.+)`, 'i'));
    return m?.[1].trim() || undefined;
  };
  out.firstName = field('First name');
  out.lastName = field('Last name');
  out.expiry = field('Expiry date');

  // On the CAA's own PDFs the field labels are part of the background image,
  // so only the values are text: first name, last name, expiry date, in order.
  if (out.flyerId && !out.firstName && !out.lastName) {
    const at = lines.findIndex((l) => l.toUpperCase().includes(out.flyerId!));
    const after = lines.slice(at + 1).map((l) => l.trim()).filter(Boolean);
    const isDate = (l: string) => DATE_RE.test(l);
    out.expiry ??= after.find(isDate);
    const names = after.filter((l) => !isDate(l)).slice(0, 2);
    [out.firstName, out.lastName] = names;
  }
  return out;
}

const DATE_RE = /^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/;

/** Splits an ID over two lines at the dash nearest the middle. */
export function splitForTwoLines(id: string): [string, string] {
  const mid = id.length / 2;
  let best = -1;
  for (let i = 0; i < id.length; i++) {
    if (id[i] === '-' && (best < 0 || Math.abs(i + 1 - mid) < Math.abs(best + 1 - mid))) best = i;
  }
  const at = best >= 0 ? best + 1 : Math.ceil(mid);
  return [id.slice(0, at), id.slice(at)];
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
