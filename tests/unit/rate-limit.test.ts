import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clientIp, clientKey, limitRequest, rateLimit, type RateLimitRule } from '../../netlify/lib/rate-limit';
import { FakeBlobStore } from './fake-blobs';

const RULE: RateLimitRule = { name: 'test', limit: 3, windowSeconds: 60 };
const IP = '203.0.113.7';

let store: FakeBlobStore;
let clock: number;
const now = () => clock;
const hit = (ip = IP, rule = RULE) => rateLimit(rule, ip, { store, now });

beforeEach(() => {
  store = new FakeBlobStore();
  clock = Date.UTC(2026, 9, 13, 12, 0, 0);
});

describe('rateLimit', () => {
  it('allows up to the limit, then refuses', async () => {
    expect(await hit()).toEqual({ ok: true, remaining: 2 });
    expect(await hit()).toEqual({ ok: true, remaining: 1 });
    expect(await hit()).toEqual({ ok: true, remaining: 0 });
    expect(await hit()).toEqual({ ok: false, retryAfter: 60 });
    expect(await hit()).toEqual({ ok: false, retryAfter: 60 });
  });

  it('does not count refused requests', async () => {
    for (let i = 0; i < 10; i++) await hit();
    expect(store.value(clientKey(RULE, IP))).toMatchObject({ count: 3 });
  });

  it('counts the wait down to the end of the window', async () => {
    for (let i = 0; i < 3; i++) await hit();
    clock += 45_500;
    expect(await hit()).toEqual({ ok: false, retryAfter: 15 });
    clock += 14_000;
    expect(await hit()).toEqual({ ok: false, retryAfter: 1 });
  });

  it('starts a new window once the old one is over', async () => {
    for (let i = 0; i < 3; i++) await hit();
    clock += 60_000;
    expect(await hit()).toEqual({ ok: true, remaining: 2 });
    expect(store.value(clientKey(RULE, IP))).toEqual({ start: clock, count: 1 });
  });

  it('does not carry requests over into the next window', async () => {
    await hit();
    clock += 59_999;
    await hit();
    await hit();
    clock += 1;
    // a sliding count would refuse here; the window has turned over
    expect(await hit()).toEqual({ ok: true, remaining: 2 });
  });

  it('counts each client separately', async () => {
    for (let i = 0; i < 3; i++) await hit();
    expect((await hit()).ok).toBe(false);
    expect(await hit('198.51.100.1')).toEqual({ ok: true, remaining: 2 });
    expect(await hit('2001:db8::1')).toEqual({ ok: true, remaining: 2 });
  });

  it('counts each endpoint separately', async () => {
    const other: RateLimitRule = { name: 'other', limit: 1, windowSeconds: 60 };
    for (let i = 0; i < 3; i++) await hit();
    expect(await hit(IP, other)).toEqual({ ok: true, remaining: 0 });
    expect((await hit(IP, other)).ok).toBe(false);
    expect((await hit()).ok).toBe(false);
  });

  it('stores a hash of the IP, never the IP itself', async () => {
    await hit();
    await hit('2001:db8::1');
    const keys = [...store.entries.keys()];
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      expect(key).toMatch(/^test\/[0-9a-f]{32}$/);
      expect(key).not.toContain('203.0.113.7');
      expect(key).not.toContain('2001');
    }
    expect(JSON.stringify([...store.entries.values()])).not.toContain('203.0.113');
  });

  it('lets exactly the limit through when requests arrive at the same time', async () => {
    store.latency = 5;
    const rule = { ...RULE, limit: 5 };
    const results = await Promise.all(Array.from({ length: 25 }, () => rateLimit(rule, IP, { store, now, attempts: 50 })));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(store.value(clientKey(rule, IP))).toMatchObject({ count: 5 });
  });

  it('never lets more than the limit through, even when some racing requests give up', async () => {
    store.latency = 5;
    const rule = { ...RULE, limit: 5 };
    const results = await Promise.all(Array.from({ length: 40 }, () => rateLimit(rule, IP, { store, now, attempts: 2 })));
    expect(results.filter((r) => r.ok).length).toBeLessThanOrEqual(5);
    expect((store.value(clientKey(rule, IP)) as { count: number }).count).toBe(results.filter((r) => r.ok).length);
  });

  it('reads the count again when another instance wrote it in between', async () => {
    await hit();
    let sneaked = false;
    store.beforeWrite = (key) => {
      if (sneaked) return;
      sneaked = true;
      // another function instance counts a request between our read and our write
      store.put(key, { start: clock, count: 2 });
    };
    expect(await hit()).toEqual({ ok: true, remaining: 0 });
    expect(store.value(clientKey(RULE, IP))).toEqual({ start: clock, count: 3 });
  });

  it('handles two first requests racing to create the entry', async () => {
    let sneaked = false;
    store.beforeWrite = (key) => {
      if (sneaked) return;
      sneaked = true;
      store.put(key, { start: clock, count: 1 });
    };
    expect(await hit()).toEqual({ ok: true, remaining: 1 });
    expect(store.value(clientKey(RULE, IP))).toEqual({ start: clock, count: 2 });
  });

  it('refuses after too many conflicting writes rather than skipping the count', async () => {
    let n = 0;
    store.beforeWrite = (key) => void store.put(key, { start: clock, count: 0, n: n++ });
    expect(await rateLimit(RULE, IP, { store, now, attempts: 4 })).toEqual({ ok: false, retryAfter: 1 });
    expect(n).toBe(4);
  });

  it.each([
    ['text', 'garbage'],
    ['null', null],
    ['a broken start', { start: 'yesterday', count: 1 }],
    ['a fractional count', { start: 0, count: 1.5 }],
    ['a missing count', { start: 0 }],
  ])('starts afresh when the stored entry holds %s', async (_, data) => {
    store.put(clientKey(RULE, IP), data);
    expect(await hit()).toEqual({ ok: true, remaining: 2 });
    expect(store.value(clientKey(RULE, IP))).toEqual({ start: clock, count: 1 });
  });

  it('does not lock a client out when the clock goes backwards', async () => {
    store.put(clientKey(RULE, IP), { start: clock + 3_600_000, count: 3 });
    expect(await hit()).toEqual({ ok: true, remaining: 2 });
  });
});

describe('clientIp', () => {
  const req = (headers: Record<string, string> = {}) => new Request('https://shop.example/api/x', { headers });
  it("prefers Netlify's context", () => {
    expect(clientIp(req({ 'x-nf-client-connection-ip': '198.51.100.1' }), { ip: IP })).toBe(IP);
  });
  it('falls back to the header Netlify sets', () => {
    expect(clientIp(req({ 'x-nf-client-connection-ip': '198.51.100.1' }))).toBe('198.51.100.1');
    expect(clientIp(req({ 'x-nf-client-connection-ip': '198.51.100.1' }), {})).toBe('198.51.100.1');
  });
  it('puts clients without an address in one shared bucket', () => {
    expect(clientIp(req())).toBe('unknown');
  });
});

describe('limitRequest', () => {
  const req = () => new Request('https://shop.example/api/x', { method: 'POST' });
  const limit = () => limitRequest(req(), { ip: IP }, RULE, { store, now });

  it('lets requests under the limit through', async () => {
    expect(await limit()).toBeNull();
  });

  it('answers 429 with Retry-After once over the limit', async () => {
    for (let i = 0; i < 3; i++) expect(await limit()).toBeNull();
    clock += 20_000;
    const res = (await limit())!;
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('40');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-type')).toBe('application/json');
    expect((await res.json()).error).toMatch(/Too many attempts/);
  });

  it('lets requests through when the store is down, and logs it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    store.beforeRead = () => { throw new Error('Blobs unavailable'); };
    expect(await limit()).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Rate limiter for test failed'), expect.any(Error));
    log.mockRestore();
  });

  it('lets requests through when a write fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    store.beforeWrite = () => { throw new Error('Blobs unavailable'); };
    expect(await limit()).toBeNull();
    log.mockRestore();
  });
});
