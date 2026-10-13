/** Emails a paid order, with its print file attached, to the shop owner. */
import nodemailer from 'nodemailer';
import { formatGBP } from '../../src/lib/pricing';
import { buildSheet } from '../../src/lib/sheet';
import { cardKey, orders, type Order } from './orders';

export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_URL && process.env.ORDER_EMAIL_TO);
}

export interface OrderEmail {
  subject: string;
  text: string;
  replyTo?: string;
}

export function orderEmail(order: Order): OrderEmail {
  const items = [
    order.cards && `${order.cards} laminated flyer ID card${order.cards === 1 ? '' : 's'}`,
    order.labelSets && `${order.labelSets} operator ID sticker set${order.labelSets === 1 ? '' : 's'}`,
  ].filter(Boolean) as string[];
  const s = order.shipping ?? {};
  const address = [s.name, s.line1, s.line2, s.city, s.postal_code, s.country].filter(Boolean);
  const text = [
    `Order ${order.id} is paid: ${formatGBP(order.totalPence)}`,
    '',
    'Items:',
    ...items.map((i) => `  - ${i}`),
    ...(order.operatorIds.length ? ['', 'Operator IDs:', ...order.operatorIds.map((id) => `  - ${id}`)] : []),
    '',
    'Post to:',
    ...(address.length ? address.map((l) => `  ${l}`) : ['  (no address given, check the payment in Stripe)']),
    '',
    `Customer email: ${order.email ?? 'not given'}`,
    `Paid: ${order.paidAt ?? 'unknown'}`,
    `Stripe session: ${order.sessionId ?? 'unknown'}`,
    '',
    `The attached ${order.id}.pdf has the cards on the first page(s): print on 250gsm card at 100%,`,
    'laminate and trim. The sticker pages go on white waterproof vinyl, cut along the label outlines.',
    '',
    'Reply to this email to contact the customer. The uploaded files have been deleted from the server.',
  ].join('\n');
  return {
    subject: `New order ${order.id}: ${items.join(', ')} (${formatGBP(order.totalPence)})`,
    text,
    replyTo: order.email ?? undefined,
  };
}

/** Builds the print PDF from the stored cards and sends the order email. */
export async function sendOrderEmail(order: Order, origin: string): Promise<void> {
  const store = orders();
  const cards: Uint8Array[] = [];
  for (let i = 0; i < order.cards; i++) {
    const buf = await store.get(cardKey(order.id, i), { type: 'arrayBuffer' });
    if (!buf) throw new Error(`Card ${i + 1} of ${order.id} is missing`);
    cards.push(new Uint8Array(buf));
  }
  const font = await fetch(new URL('/fonts/DejaVuSansMono-Bold.ttf', origin));
  if (!font.ok) throw new Error(`Font download failed: ${font.status}`);
  const pdf = await buildSheet({
    cards,
    operatorIds: order.operatorIds,
    monoFont: new Uint8Array(await font.arrayBuffer()),
    mode: 'production',
    orderRef: order.id,
  });

  const mail = orderEmail(order);
  const to = process.env.ORDER_EMAIL_TO!;
  await nodemailer.createTransport(process.env.SMTP_URL!).sendMail({
    from: process.env.ORDER_EMAIL_FROM || to,
    to,
    replyTo: mail.replyTo,
    subject: mail.subject,
    text: mail.text,
    attachments: [{ filename: `${order.id}.pdf`, content: Buffer.from(pdf), contentType: 'application/pdf' }],
  });
}
