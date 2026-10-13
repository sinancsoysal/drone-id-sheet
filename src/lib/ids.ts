/** Parsing and validation of flyer IDs and operator IDs. */
import { LABEL_CHAR_RANGES } from './label-chars';

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
/** Longest operator ID that still prints at least 3.3 mm tall on the smallest label. */
export const OPERATOR_MAX_LENGTH = 24;
const PREFIX_LETTERS = 'GBROP';
/** Letters and numbers the label font has, plus the separators IDs are written with. */
const PRINTABLE = LABEL_CHAR_RANGES.map(([a, b]) => (a === b ? `\\u{${a.toString(16)}}` : `\\u{${a.toString(16)}}-\\u{${b.toString(16)}}`)).join('') + ' ./-';
const NOT_ALLOWED = new RegExp(`[^${PRINTABLE}]`, 'gu');
const ONLY_ALLOWED = new RegExp(`^[${PRINTABLE}]+$`, 'u');

/** Letters and numbers in the text that the label font can't print, e.g. Chinese or Arabic. */
export function unprintableLetters(raw: string): string[] {
  return [...new Set([...raw].filter((ch) => /[\p{L}\p{N}]/u.test(ch) && !ONLY_ALLOWED.test(ch)))];
}

/**
 * Tidies an operator ID without changing it: typographic dashes become hyphens,
 * spaces are collapsed. UK IDs are put in capitals.
 */
export function normaliseOperatorId(raw: string): string {
  const id = raw.replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ').trim();
  return isUkOperatorInput(id) ? id.toUpperCase().replace(/\s+/g, '') : id;
}

/** True when the text is (the start of) a UK operator ID, which gets the GBR-OP- template. */
export function isUkOperatorInput(raw: string): boolean {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.includes(PREFIX_LETTERS) || (clean.length >= 3 && PREFIX_LETTERS.startsWith(clean));
}

/**
 * Operator IDs differ from country to country, so anything up to
 * OPERATOR_MAX_LENGTH characters is accepted. Only UK IDs, which start with
 * GBR-OP-, must have their full 12 characters after the prefix.
 */
export function checkOperatorId(raw: string): OperatorCheck {
  const id = normaliseOperatorId(raw);
  if (!/[\p{L}\p{N}]/u.test(id)) return { ok: false, id, message: 'Enter an operator ID.' };
  if (looksLikeFlyerId(id)) {
    return { ok: false, id, message: `${id} is a flyer ID. Upload the flyer ID PDF instead.` };
  }
  if (isUkOperatorInput(id)) {
    if (UK_OPERATOR_RE.test(id)) return { ok: true, id };
    return { ok: false, id, message: `${id} isn't a complete UK operator ID. It should be GBR-OP- followed by 12 letters or numbers.` };
  }
  if (id.length > OPERATOR_MAX_LENGTH) {
    return { ok: false, id, message: `${id} is too long. Operator IDs can have up to ${OPERATOR_MAX_LENGTH} characters.` };
  }
  if (!ONLY_ALLOWED.test(id)) {
    const letters = unprintableLetters(id);
    const which = letters.length ? ` (${letters.join(' ')})` : '';
    return { ok: false, id, message: `${id} has characters that can't be printed on the labels${which}. Use letters, numbers and dashes.` };
  }
  return { ok: true, id };
}

/**
 * Cleans up what is typed or pasted into the operator ID box. UK IDs are kept in
 * the GBR-OP-XXXXXXXXXXXX template: capitals, dashes added, at most 12
 * characters after the prefix. Other IDs keep what was typed, without symbols or
 * letters the label font can't print, up to OPERATOR_MAX_LENGTH characters.
 */
export function formatOperatorInput(raw: string): string {
  if (looksLikeFlyerId(raw)) return '';
  if (!isUkOperatorInput(raw)) {
    return raw.replace(/[‐‑–—]/g, '-').replace(NOT_ALLOWED, '').replace(/\s+/g, ' ').replace(/^[ ./-]+/, '').slice(0, OPERATOR_MAX_LENGTH);
  }
  let clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // start at the last prefix: pasted text like "Operator ID: GBR-OP-…", or an ID
  // pasted after a prefix that was already typed, must not end up as GBR-OP-GBROP…
  const at = clean.lastIndexOf(PREFIX_LETTERS);
  if (at > 0) clean = clean.slice(at);
  if (clean.length < PREFIX_LETTERS.length) {
    // still typing the prefix: GBR-, GBR-O
    return `GBR-${clean.slice(3)}`;
  }
  return OPERATOR_PREFIX + clean.slice(PREFIX_LETTERS.length, PREFIX_LETTERS.length + OPERATOR_BODY_LENGTH);
}

/** True for text that starts like a UK flyer ID (GBR-RP-), which belongs in the file upload instead. */
export function looksLikeFlyerId(raw: string): boolean {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').startsWith('GBRRP');
}

/** How many characters are still missing from a UK operator ID that is being typed. */
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

/** Splits an ID over two lines at the dash or space nearest the middle. */
export function splitForTwoLines(id: string): [string, string] {
  const mid = id.length / 2;
  let best = -1;
  for (let i = 0; i < id.length; i++) {
    if ((id[i] === '-' || id[i] === ' ') && (best < 0 || Math.abs(i + 1 - mid) < Math.abs(best + 1 - mid))) best = i;
  }
  const at = best >= 0 ? best + 1 : Math.ceil(mid);
  return [id.slice(0, at).trimEnd(), id.slice(at)];
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
