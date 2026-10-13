/** Parsing and validation of UK CAA flyer IDs and operator IDs. */

export const FLYER_ID_RE = /GBR-RP-[A-Z0-9]{12}/;
export const OPERATOR_ID_RE = /GBR-OP-[A-Z0-9]{12}/g;
const UK_OPERATOR_RE = /^GBR-OP-[A-Z0-9]{12}$/;
const LOOSE_ID_RE = /^[A-Z0-9][A-Z0-9-]{5,23}$/;

export interface FlyerDetails {
  flyerId?: string;
  firstName?: string;
  lastName?: string;
  expiry?: string;
}

export interface OperatorCheck {
  ok: boolean;
  id: string;
  /** Shown to the user when the ID is accepted but looks unusual, or rejected. */
  message?: string;
}

export function normaliseOperatorId(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, '').replace(/[‐‑–—]/g, '-');
}

export function checkOperatorId(raw: string): OperatorCheck {
  const id = normaliseOperatorId(raw);
  if (!id) return { ok: false, id, message: 'Enter an operator ID.' };
  if (UK_OPERATOR_RE.test(id)) return { ok: true, id };
  if (/^GBR-RP-/.test(id)) {
    return { ok: false, id, message: `${id} is a flyer ID. Operator IDs start with GBR-OP-. Upload the flyer ID PDF instead.` };
  }
  if (/^GBR-OP-/.test(id)) {
    return { ok: false, id, message: `${id} doesn't look right. UK operator IDs are GBR-OP- followed by 12 letters or numbers.` };
  }
  if (LOOSE_ID_RE.test(id)) {
    return { ok: true, id, message: `${id} isn't in the UK format (GBR-OP-…). Check it matches your registration.` };
  }
  return { ok: false, id, message: `${raw.trim()} doesn't look like an operator ID.` };
}

/** Splits free text (commas, spaces, new lines) into candidate operator IDs. */
export function splitOperatorInput(text: string): string[] {
  const found = text.toUpperCase().match(OPERATOR_ID_RE);
  if (found) return unique(found);
  return unique(text.split(/[\s,;]+/).map(normaliseOperatorId).filter(Boolean));
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
