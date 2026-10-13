import type { Config, Context } from '@netlify/functions';
import { PDFDocument } from 'pdf-lib';
import type Stripe from 'stripe';
import { checkOperatorId } from '../../src/lib/ids';
import { MAX_CARD_UPLOAD_BYTES, PRICING, quote } from '../../src/lib/pricing';
import { mailConfigured } from '../lib/notify';
import { cardKey, deleteCards, deleteOrder, json, newOrderId, orders, saveOrder, stripe, type Order } from '../lib/orders';
import { CHECKOUT_LIMIT, limitRequest } from '../lib/rate-limit';

// the browser keeps each card's image under MAX_CARD_UPLOAD_BYTES; this leaves room for the PDF around it
const MAX_CARD_BYTES = MAX_CARD_UPLOAD_BYTES + 100_000;

export default async (req: Request, context?: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const limited = await limitRequest(req, context, CHECKOUT_LIMIT);
  if (limited) return limited;
  const client = stripe();
  // without email there would be no way to hear about paid orders
  if (!client || !mailConfigured()) return json({ error: 'Ordering is not set up yet. You can still download the PDF for free.' }, 503);

  let body: { cards?: unknown; operatorIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
  const rawCards = Array.isArray(body?.cards) ? body.cards : [];
  const rawIds = Array.isArray(body?.operatorIds) ? body.operatorIds : [];
  if (!rawCards.every((c) => typeof c === 'string') || !rawIds.every((c) => typeof c === 'string')) {
    return json({ error: 'Invalid request' }, 400);
  }
  // the page never sends more than an order can hold, so a longer list isn't worth checking one by one
  if (rawIds.length > PRICING.maxLabelSets) return json({ error: `Up to ${PRICING.maxLabelSets} operator IDs per order` }, 400);

  const operatorIds: string[] = [];
  for (const raw of rawIds as string[]) {
    const check = checkOperatorId(raw);
    if (!check.ok) return json({ error: check.message }, 400);
    if (!operatorIds.includes(check.id)) operatorIds.push(check.id);
  }

  let q;
  try {
    q = quote(rawCards.length, operatorIds.length);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }

  const cards: Uint8Array[] = [];
  for (const b64 of rawCards as string[]) {
    const bytes = Buffer.from(b64, 'base64');
    if (bytes.length > MAX_CARD_BYTES) return json({ error: 'One of the cards is too large.' }, 413);
    try {
      const doc = await PDFDocument.load(bytes);
      if (doc.getPageCount() !== 1) throw new Error('pages');
    } catch {
      return json({ error: 'One of the cards could not be read.' }, 400);
    }
    cards.push(bytes);
  }

  const order: Order = {
    id: newOrderId(),
    createdAt: new Date().toISOString(),
    status: 'pending',
    cards: cards.length,
    labelSets: operatorIds.length,
    operatorIds,
    totalPence: q.totalPence,
  };
  let session: Stripe.Checkout.Session | undefined;
  try {
    // the order is saved before its uploads so anything stored can always be found and deleted
    await saveOrder(order);
    const store = orders();
    const uploads = await Promise.allSettled(cards.map((bytes, i) => store.set(cardKey(order.id, i), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)));
    const failed = uploads.find((u) => u.status === 'rejected');
    if (failed) throw failed.reason;

    const origin = new URL(req.url).origin;
    session = await client.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: order.id,
      metadata: { orderId: order.id },
      payment_intent_data: { metadata: { orderId: order.id } },
      line_items: q.lines.map((l) => ({
        quantity: l.quantity,
        price_data: { currency: PRICING.currency, unit_amount: l.unitPence, product_data: { name: l.description } },
      })),
      shipping_address_collection: { allowed_countries: ['GB'] },
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      success_url: `${origin}/order-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?cancelled=1`,
    });
    order.sessionId = session.id;
    await saveOrder(order);
    return json({ url: session.url, ref: order.id });
  } catch (e) {
    // never send Stripe or storage errors (and their stack traces) to the browser
    console.error('Checkout failed', e);
    await discard(order, client, session);
    return json({ error: 'Ordering failed. Please try again in a few minutes.' }, 502);
  }
};

/** Undoes a checkout that failed part way, so its uploads aren't left on the server. */
async function discard(order: Order, client: Stripe, session?: Stripe.Checkout.Session) {
  // the customer never got the payment link, but it must not stay payable either
  if (session) await client.checkout.sessions.expire(session.id).catch((e) => console.error(`Could not expire ${session.id}`, e));
  try {
    await deleteCards(order);
    await deleteOrder(order.id);
  } catch (e) {
    console.error(`Could not delete the uploads of ${order.id}`, e);
  }
}

export const config: Config = { path: '/api/checkout' };
