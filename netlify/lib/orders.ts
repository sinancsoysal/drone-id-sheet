import { getStore } from '@netlify/blobs';
import Stripe from 'stripe';

export type OrderStatus = 'pending' | 'paid' | 'expired';

export interface Address {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

export interface Order {
  id: string;
  createdAt: string;
  status: OrderStatus;
  cards: number;
  labelSets: number;
  /** Removed once the order email has been sent. */
  operatorIds: string[];
  totalPence: number;
  sessionId?: string;
  email?: string | null;
  shipping?: Address | null;
  paidAt?: string;
  /** When the order email with the print file went out. */
  emailedAt?: string;
}

export const orders = () => getStore({ name: 'orders', consistency: 'strong' });
export const orderKey = (id: string) => `order/${id}`;
export const cardKey = (id: string, i: number) => `card/${id}/${i}`;

export async function getOrder(id: string): Promise<Order | null> {
  return (await orders().get(orderKey(id), { type: 'json' })) as Order | null;
}

export async function saveOrder(order: Order) {
  await orders().setJSON(orderKey(order.id), order);
}

export async function deleteOrder(id: string) {
  await orders().delete(orderKey(id));
}

export async function deleteCards(order: Order) {
  const store = orders();
  await Promise.all(Array.from({ length: order.cards }, (_, i) => store.delete(cardKey(order.id, i))));
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newOrderId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(7));
  return `DIS-${[...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')}`;
}

export function stripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
