import { PDFDocument } from 'pdf-lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBlobStore } from './fake-blobs';

const stores = new Map<string, FakeBlobStore>();
const store = (name: string) => {
  if (!stores.has(name)) stores.set(name, new FakeBlobStore());
  return stores.get(name)!;
};
vi.mock('@netlify/blobs', () => ({ getStore: ({ name }: { name: string }) => store(name) }));
const create = vi.fn();
const expire = vi.fn();
const retrieve = vi.fn();
vi.mock('stripe', () => ({ default: class { checkout = { sessions: { create, expire, retrieve } }; } }));

const { default: checkout } = await import('../../netlify/functions/checkout.mts');
const { default: orderStatus } = await import('../../netlify/functions/order-status.mts');
const { CHECKOUT_LIMIT, ORDER_STATUS_LIMIT } = await import('../../netlify/lib/rate-limit');
const { MAX_CARD_UPLOAD_BYTES, PRICING } = await import('../../src/lib/pricing');

const IP = '203.0.113.7';
const post = (body: unknown, ip = IP) =>
  checkout(new Request('https://shop.example/api/checkout', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body),
  }), { ip } as never);
const order = (operatorIds = ['GBR-OP-SAMPLE00TEST'], cards: string[] = []) => post({ cards, operatorIds });

const onePagePdf = async () => {
  const doc = await PDFDocument.create();
  doc.addPage([222, 158]);
  return Buffer.from(await doc.save()).toString('base64');
};
const orders = () => store('orders');
const stored = () => [...orders().entries.keys()];

beforeEach(() => {
  stores.clear();
  create.mockReset();
  expire.mockReset().mockResolvedValue({});
  retrieve.mockReset();
  vi.restoreAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.RESEND_API_KEY = 're_test';
  process.env.ORDER_EMAIL_TO = 'orders@example.com';
  create.mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
});

it('creates a Checkout session and saves the pending order', async () => {
  const res = await order();
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.url).toContain('checkout.stripe.com');
  expect(create.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(499);
  expect(orders().value(`order/${data.ref}`)).toMatchObject({ status: 'pending', sessionId: 'cs_test_1' });
});

it('stores the uploaded cards with the order', async () => {
  const res = await order([], [await onePagePdf(), await onePagePdf()]);
  expect(res.status).toBe(200);
  const { ref } = await res.json();
  expect(stored().sort()).toEqual([`card/${ref}/0`, `card/${ref}/1`, `order/${ref}`]);
});

it('hides Stripe errors from the browser', async () => {
  create.mockRejectedValue(new Error('This API call cannot be made with a publishable API key'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const res = await order();
  expect(res.status).toBe(502);
  const text = await res.text();
  expect(text).toContain('Ordering failed');
  expect(text).not.toContain('publishable');
  expect(text).not.toContain('trace');
});

it('refuses orders until Stripe and email are configured', async () => {
  delete process.env.RESEND_API_KEY;
  expect((await order()).status).toBe(503);
});

it('accepts operator IDs from other countries', async () => {
  const res = await order(['FIN87astrdge12k8']);
  expect(res.status).toBe(200);
  expect(orders().value(`order/${(await res.json()).ref}`)).toMatchObject({ operatorIds: ['FIN87astrdge12k8'] });
});

it('rejects IDs that are too long to print, flyer IDs, incomplete UK IDs and letters the labels lack', async () => {
  for (const id of ['X'.repeat(25), 'GBR-RP-SAMPLEALEX01', 'GBR-OP-SHORT', '<script>', '東京ドローン123', 'مشغل-123']) {
    expect((await order([id])).status).toBe(400);
  }
  expect(create).not.toHaveBeenCalled();
});

it.each([['null'], ['[]'], ['"text"'], ['{"cards": 5}'], ['not json']])('rejects the malformed body %s', async (body) => {
  expect((await post(body)).status).toBe(400);
  expect(create).not.toHaveBeenCalled();
});

describe('request size', () => {
  it('refuses more operator IDs than an order holds without checking each one', async () => {
    const ids = Array.from({ length: 100_000 }, (_, i) => `ID${i}`);
    const started = Date.now();
    const res = await order(ids);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(`Up to ${PRICING.maxLabelSets} operator IDs per order`);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('still takes a full order, with repeated IDs counted once', async () => {
    const ids = Array.from({ length: PRICING.maxLabelSets }, (_, i) => `FRA${i}`);
    expect((await order(ids)).status).toBe(200);
    expect((await order(['FRA1', 'FRA1'])).status).toBe(200);
  });

  it('refuses more cards than an order holds', async () => {
    const card = await onePagePdf();
    expect((await order([], Array(PRICING.maxCards + 1).fill(card))).status).toBe(400);
    expect(stored()).toEqual([]);
  });

  it('refuses a card larger than the page ever sends', async () => {
    const big = Buffer.alloc(MAX_CARD_UPLOAD_BYTES + 200_000, 1).toString('base64');
    expect((await order([], [big])).status).toBe(413);
    expect(stored()).toEqual([]);
  });

  it('refuses a card that is not a one-page PDF', async () => {
    expect((await order([], [Buffer.from('hello').toString('base64')])).status).toBe(400);
  });
});

describe('when checkout fails part way', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('deletes the uploads when Stripe refuses the session', async () => {
    create.mockRejectedValue(new Error('Stripe down'));
    expect((await order(['GBR-OP-SAMPLE00TEST'], [await onePagePdf(), await onePagePdf()])).status).toBe(502);
    expect(stored()).toEqual([]);
    expect(expire).not.toHaveBeenCalled();
  });

  it('deletes the uploads and skips Stripe when storing a card fails', async () => {
    let n = 0;
    orders().beforeWrite = (key) => {
      if (key.startsWith('card/') && n++ === 1) throw new Error('Blobs write failed');
    };
    expect((await order([], [await onePagePdf(), await onePagePdf(), await onePagePdf()])).status).toBe(502);
    expect(create).not.toHaveBeenCalled();
    expect(stored()).toEqual([]);
  });

  it('expires the Stripe session and deletes the uploads when the order cannot be updated', async () => {
    let orderWrites = 0;
    orders().beforeWrite = (key) => {
      if (key.startsWith('order/') && ++orderWrites === 2) throw new Error('Blobs write failed');
    };
    expect((await order(['GBR-OP-SAMPLE00TEST'], [await onePagePdf()])).status).toBe(502);
    expect(expire).toHaveBeenCalledWith('cs_test_1');
    expect(stored()).toEqual([]);
  });

  it('still deletes the uploads when expiring the session fails too', async () => {
    expire.mockRejectedValue(new Error('Stripe down'));
    let orderWrites = 0;
    orders().beforeWrite = (key) => {
      if (key.startsWith('order/') && ++orderWrites === 2) throw new Error('Blobs write failed');
    };
    expect((await order([], [await onePagePdf()])).status).toBe(502);
    expect(stored()).toEqual([]);
  });
});

describe('rate limiting', () => {
  it(`allows ${CHECKOUT_LIMIT.limit} checkouts an hour from one address, then answers 429`, async () => {
    for (let i = 0; i < CHECKOUT_LIMIT.limit; i++) expect((await order()).status).toBe(200);
    create.mockClear();
    const before = stored().length;
    const res = await order([], [await onePagePdf()]);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await res.json()).error).toMatch(/Too many attempts/);
    expect(create).not.toHaveBeenCalled();
    expect(stored().length).toBe(before);
  });

  it('checks the limit before reading the request', async () => {
    for (let i = 0; i < CHECKOUT_LIMIT.limit; i++) await order();
    expect((await post('not json')).status).toBe(429);
  });

  it('counts failed and invalid attempts too', async () => {
    for (let i = 0; i < CHECKOUT_LIMIT.limit; i++) await post('not json');
    expect((await order()).status).toBe(429);
  });

  it('does not hold other customers back', async () => {
    for (let i = 0; i < CHECKOUT_LIMIT.limit + 2; i++) await order();
    expect((await order()).status).toBe(429);
    expect((await post({ cards: [], operatorIds: ['GBR-OP-SAMPLE00TEST'] }, '198.51.100.1')).status).toBe(200);
  });

  it('keeps counting while Stripe is not configured', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    for (let i = 0; i < CHECKOUT_LIMIT.limit; i++) expect((await order()).status).toBe(503);
    expect((await order()).status).toBe(429);
  });

  it('limits the order status page separately', async () => {
    retrieve.mockResolvedValue({ metadata: { orderId: 'DIS-NONE' }, payment_status: 'paid' });
    const status = (ip = IP) => orderStatus(new Request('https://shop.example/api/order-status?session_id=cs_test_1'), { ip } as never);
    for (let i = 0; i < ORDER_STATUS_LIMIT.limit; i++) expect((await status()).status).toBe(404);
    expect((await status()).status).toBe(429);
    expect(retrieve).toHaveBeenCalledTimes(ORDER_STATUS_LIMIT.limit);
    expect((await status('198.51.100.1')).status).toBe(404);
    // checkout has its own count
    expect((await order()).status).toBe(200);
  });
});
