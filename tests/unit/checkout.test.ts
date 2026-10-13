import { beforeEach, expect, it, vi } from 'vitest';

const blobs = new Map<string, unknown>();
vi.mock('@netlify/blobs', () => ({
  getStore: () => ({
    get: async (key: string) => blobs.get(key) ?? null,
    set: async (key: string, value: unknown) => void blobs.set(key, value),
    setJSON: async (key: string, value: unknown) => void blobs.set(key, structuredClone(value)),
    delete: async (key: string) => void blobs.delete(key),
  }),
}));
const create = vi.fn();
vi.mock('stripe', () => ({ default: class { checkout = { sessions: { create } }; } }));

const { default: checkout } = await import('../../netlify/functions/checkout.mts');

const order = (operatorIds = ['GBR-OP-SAMPLE00TEST']) =>
  checkout(new Request('https://shop.example/api/checkout', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cards: [], operatorIds }),
  }));

beforeEach(() => {
  blobs.clear();
  create.mockReset();
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.RESEND_API_KEY = 're_test';
  process.env.ORDER_EMAIL_TO = 'orders@example.com';
});

it('creates a Checkout session and saves the pending order', async () => {
  create.mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
  const res = await order();
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.url).toContain('checkout.stripe.com');
  expect(create.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(499);
  expect(blobs.get(`order/${data.ref}`)).toMatchObject({ status: 'pending', sessionId: 'cs_test_1' });
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
  create.mockResolvedValue({ id: 'cs_test_2', url: 'https://checkout.stripe.com/c/pay/cs_test_2' });
  const res = await order(['FIN87astrdge12k8']);
  expect(res.status).toBe(200);
  expect(blobs.get(`order/${(await res.json()).ref}`)).toMatchObject({ operatorIds: ['FIN87astrdge12k8'] });
});

it('rejects IDs that are too long to print, flyer IDs and incomplete UK IDs', async () => {
  for (const id of ['X'.repeat(25), 'GBR-RP-SAMPLEALEX01', 'GBR-OP-SHORT', '<script>']) {
    expect((await order([id])).status).toBe(400);
  }
  expect(create).not.toHaveBeenCalled();
});
