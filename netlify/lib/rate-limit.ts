/**
 * Fixed-window rate limiting per client IP, kept in Netlify Blobs so every
 * function instance sees the same counts. Each update is a conditional write
 * on the entry's ETag, so requests racing each other can't both take the last
 * slot. Only a hash of the IP is stored.
 */
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';

export interface RateLimitRule {
  /** Keeps the counts of different endpoints apart. */
  name: string;
  /** Requests allowed per window. */
  limit: number;
  windowSeconds: number;
}

/** Ordering: a real customer orders once or twice; each attempt stores up to 6 MB of uploads for an hour. */
export const CHECKOUT_LIMIT: RateLimitRule = { name: 'checkout', limit: 10, windowSeconds: 60 * 60 };
/** The success page asks once per visit; each request is a call to the Stripe API. */
export const ORDER_STATUS_LIMIT: RateLimitRule = { name: 'order-status', limit: 30, windowSeconds: 10 * 60 };

interface Window {
  start: number;
  count: number;
}

/** The part of a Netlify Blobs store the limiter uses. */
export interface CounterStore {
  getWithMetadata(key: string, options: { type: 'json' }): Promise<{ data: unknown; etag?: string } | null>;
  setJSON(key: string, value: unknown, options: { onlyIfMatch: string } | { onlyIfNew: true }): Promise<{ modified: boolean }>;
}

export type RateLimitResult = { ok: true; remaining: number } | { ok: false; retryAfter: number };

export interface RateLimitOptions {
  store?: CounterStore;
  now?: () => number;
  /** Conditional writes to try before giving up on a heavily contended entry. */
  attempts?: number;
}

const counters = (): CounterStore => getStore({ name: 'rate-limits', consistency: 'strong' }) as unknown as CounterStore;

export const clientKey = (rule: RateLimitRule, ip: string) =>
  `${rule.name}/${createHash('sha256').update(ip).digest('hex').slice(0, 32)}`;

function readWindow(data: unknown): Window | null {
  const w = data as Partial<Window> | null;
  return w && Number.isFinite(w.start) && Number.isInteger(w.count) ? (w as Window) : null;
}

/** Counts one request from `ip` against `rule` and says whether it may go ahead. */
export async function rateLimit(rule: RateLimitRule, ip: string, options: RateLimitOptions = {}): Promise<RateLimitResult> {
  const store = options.store ?? counters();
  const now = options.now ?? Date.now;
  const key = clientKey(rule, ip);
  const windowMs = rule.windowSeconds * 1000;

  for (let attempt = 0; attempt < (options.attempts ?? 5); attempt++) {
    const entry = await store.getWithMetadata(key, { type: 'json' });
    const current = readWindow(entry?.data);
    const t = now();
    const expired = !current || t >= current.start + windowMs || current.start > t;
    if (!expired && current.count >= rule.limit) {
      return { ok: false, retryAfter: Math.max(1, Math.ceil((current.start + windowMs - t) / 1000)) };
    }
    const next: Window = expired ? { start: t, count: 1 } : { start: current.start, count: current.count + 1 };
    const condition = entry?.etag ? { onlyIfMatch: entry.etag } : ({ onlyIfNew: true } as const);
    const { modified } = await store.setJSON(key, next, condition);
    if (modified) return { ok: true, remaining: rule.limit - next.count };
    // another request changed the entry since we read it: read it again
  }
  // only a flood of simultaneous requests from one address gets here
  return { ok: false, retryAfter: 1 };
}

/** The client's IP: Netlify's context first, then the header its edge sets. */
export function clientIp(req: Request, context?: { ip?: string }): string {
  return context?.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown';
}

/**
 * Returns a 429 response when the client is over the limit, or null to go ahead.
 * If the counter store itself fails, the request is let through: an outage of
 * the limiter shouldn't stop customers from ordering.
 */
export async function limitRequest(req: Request, context: { ip?: string } | undefined, rule: RateLimitRule, options?: RateLimitOptions): Promise<Response | null> {
  let result: RateLimitResult;
  try {
    result = await rateLimit(rule, clientIp(req, context), options);
  } catch (e) {
    console.error(`Rate limiter for ${rule.name} failed, letting the request through`, e);
    return null;
  }
  if (result.ok) return null;
  return new Response(JSON.stringify({ error: 'Too many attempts. Please wait a few minutes and try again.' }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'retry-after': String(result.retryAfter) },
  });
}
