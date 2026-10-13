import type { Config, Context } from '@netlify/functions';
import { getOrder, json, stripe } from '../lib/orders';
import { limitRequest, ORDER_STATUS_LIMIT } from '../lib/rate-limit';

export default async (req: Request, context?: Context) => {
  const limited = await limitRequest(req, context, ORDER_STATUS_LIMIT);
  if (limited) return limited;
  const client = stripe();
  const sessionId = new URL(req.url).searchParams.get('session_id') ?? '';
  if (!client || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return json({ error: 'Not found' }, 404);
  try {
    const session = await client.checkout.sessions.retrieve(sessionId);
    const order = await getOrder(session.metadata?.orderId ?? '');
    if (!order) return json({ error: 'Not found' }, 404);
    return json({
      ref: order.id,
      paid: session.payment_status === 'paid',
      status: order.status,
      email: session.customer_details?.email ?? null,
    });
  } catch {
    return json({ error: 'Not found' }, 404);
  }
};

export const config: Config = { path: '/api/order-status' };
