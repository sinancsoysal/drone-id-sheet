import { readFileSync } from 'node:fs';
import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cropToCard } from '../../src/lib/crop';

// in-memory stand-ins for Netlify Blobs and the SMTP transport
const blobs = new Map<string, unknown>();
vi.mock('@netlify/blobs', () => ({
  getStore: () => ({
    get: async (key: string) => blobs.get(key) ?? null,
    set: async (key: string, value: unknown) => void blobs.set(key, value),
    setJSON: async (key: string, value: unknown) => void blobs.set(key, structuredClone(value)),
    delete: async (key: string) => void blobs.delete(key),
  }),
}));
const sendMail = vi.fn();
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }));

const { default: webhook } = await import('../../netlify/functions/stripe-webhook.mts');
const { orderEmail } = await import('../../netlify/lib/notify');

const SECRET = 'whsec_test_secret';
const signer = new Stripe('sk_test_dummy');
const font = readFileSync('public/fonts/DejaVuSansMono-Bold.ttf');
const CARD = { left: 68.5, right: 290.5, top: 841.89 - 44, bottom: 841.89 - 202 };

function event(type: string, session: Record<string, unknown>) {
  return JSON.stringify({ id: 'evt_test', object: 'event', type, data: { object: { object: 'checkout.session', ...session } } });
}

async function post(payload: string, signature?: string) {
  const header = signature ?? (await signer.webhooks.generateTestHeaderStringAsync({ payload, secret: SECRET }));
  return webhook(new Request('https://shop.example/api/stripe-webhook', {
    method: 'POST', body: payload, headers: { 'stripe-signature': header },
  }));
}

const paid = (orderId = 'DIS-TEST001') => event('checkout.session.completed', {
  id: 'cs_test_1',
  payment_status: 'paid',
  metadata: { orderId },
  customer_details: { email: 'pilot@example.com' },
  collected_information: {
    shipping_details: { name: 'Alex Example', address: { line1: '1 Sample Street', city: 'London', postal_code: 'SW1A 1AA', country: 'GB' } },
  },
});

beforeEach(async () => {
  blobs.clear();
  sendMail.mockReset();
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  process.env.SMTP_URL = 'smtp://user:pass@smtp.example.com:587';
  process.env.ORDER_EMAIL_TO = 'orders@example.com';
  vi.stubGlobal('fetch', async () => new Response(font));
  const card = await cropToCard(new Uint8Array(readFileSync('e2e/fixtures/sample-flyer-id-alex.pdf')), 0, CARD);
  blobs.set('card/DIS-TEST001/0', card.buffer);
  blobs.set('order/DIS-TEST001', {
    id: 'DIS-TEST001', createdAt: '2026-10-13T09:00:00.000Z', status: 'pending', cards: 1, labelSets: 1,
    operatorIds: ['GBR-OP-SAMPLE00TEST'], totalPence: 499, sessionId: 'cs_test_1',
  });
});

describe('stripe webhook', () => {
  it('emails a paid order with the print file, then deletes the uploads', async () => {
    const res = await post(paid());
    expect(res.status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe('orders@example.com');
    expect(mail.replyTo).toBe('pilot@example.com');
    expect(mail.subject).toContain('DIS-TEST001');
    expect(mail.text).toContain('SW1A 1AA');
    expect(mail.text).toContain('GBR-OP-SAMPLE00TEST');
    expect(mail.attachments[0].filename).toBe('DIS-TEST001.pdf');
    expect(mail.attachments[0].content.subarray(0, 4).toString()).toBe('%PDF');

    expect(blobs.has('card/DIS-TEST001/0')).toBe(false);
    const order = blobs.get('order/DIS-TEST001') as Record<string, unknown>;
    expect(order.status).toBe('paid');
    expect(order.emailedAt).toBeTruthy();
    expect(order.operatorIds).toEqual([]);
  });

  it('sends the email only once when Stripe repeats the event', async () => {
    await post(paid());
    await post(paid());
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('keeps the files and asks Stripe to retry when the email fails', async () => {
    sendMail.mockRejectedValueOnce(new Error('SMTP down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await post(paid())).status).toBe(500);
    expect(blobs.has('card/DIS-TEST001/0')).toBe(true);

    expect((await post(paid())).status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(blobs.has('card/DIS-TEST001/0')).toBe(false);
  });

  it('rejects events without a valid signature', async () => {
    const res = await post(paid(), 't=1,v1=forged');
    expect(res.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('deletes the uploads of expired checkouts without emailing', async () => {
    await post(event('checkout.session.expired', { id: 'cs_test_1', payment_status: 'unpaid', metadata: { orderId: 'DIS-TEST001' } }));
    expect(sendMail).not.toHaveBeenCalled();
    expect(blobs.has('card/DIS-TEST001/0')).toBe(false);
    expect((blobs.get('order/DIS-TEST001') as { status: string }).status).toBe('expired');
  });
});

describe('orderEmail', () => {
  it('summarises the items and the total', () => {
    const mail = orderEmail({
      id: 'DIS-X', createdAt: '', status: 'paid', cards: 2, labelSets: 1, operatorIds: ['GBR-OP-SAMPLE00TEST'], totalPence: 648,
    });
    expect(mail.subject).toBe('New order DIS-X: 2 laminated flyer ID cards, 1 operator ID sticker set (£6.48)');
    expect(mail.text).toContain('no address given');
  });
});
