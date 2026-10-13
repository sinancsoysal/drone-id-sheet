import type { Config } from '@netlify/functions';
import type Stripe from 'stripe';
import { sendOrderEmail } from '../lib/notify';
import { deleteCards, getOrder, json, saveOrder, stripe } from '../lib/orders';

export default async (req: Request) => {
  const client = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!client || !secret) return json({ error: 'Not configured' }, 503);

  let event: Stripe.Event;
  try {
    event = await client.webhooks.constructEventAsync(await req.text(), req.headers.get('stripe-signature') ?? '', secret);
  } catch {
    return json({ error: 'Bad signature' }, 400);
  }

  if (!event.type.startsWith('checkout.session.')) return json({ received: true });
  const session = event.data.object as Stripe.Checkout.Session;
  const order = await getOrder(session.metadata?.orderId ?? '');
  if (!order) return json({ received: true });

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      if (session.payment_status !== 'paid') break;
      if (order.status === 'pending') {
        const legacy = session as unknown as { shipping_details?: { name?: string; address?: Stripe.Address } };
        const ship = session.collected_information?.shipping_details ?? legacy.shipping_details;
        order.status = 'paid';
        order.paidAt = new Date().toISOString();
        order.email = session.customer_details?.email;
        order.shipping = ship ? { name: ship.name, ...ship.address } : null;
        await saveOrder(order);
      }
      if (order.status === 'paid' && !order.emailedAt) {
        try {
          await sendOrderEmail(order, new URL(req.url).origin);
        } catch (e) {
          console.error(`Order email for ${order.id} failed`, e);
          // a non-2xx answer makes Stripe retry the event later; the files are kept until then
          return json({ error: 'Order email failed' }, 500);
        }
        await deleteCards(order);
        order.operatorIds = [];
        order.emailedAt = new Date().toISOString();
        await saveOrder(order);
      }
      break;
    }
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed':
      if (order.status === 'pending') {
        await deleteCards(order);
        order.status = 'expired';
        order.operatorIds = [];
        await saveOrder(order);
      }
      break;
  }
  return json({ received: true });
};

export const config: Config = { path: '/api/stripe-webhook' };
