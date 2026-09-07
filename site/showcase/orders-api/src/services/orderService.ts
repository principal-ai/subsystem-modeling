import { randomUUID } from 'node:crypto';
import { stripeClient } from '../lib/stripeClient';
import { redisClient } from '../lib/redisClient';
import { orderRepository } from '../repositories/orderRepository';

export interface CreateOrderInput {
  items: Array<{ sku: string; quantity: number }>;
  amountCents: number;
  idempotencyKey?: string;
}

export async function createOrder(input: CreateOrderInput) {
  const idempotencyKey = input.idempotencyKey ?? randomUUID();
  const cached = await redisClient.hGet('orders', idempotencyKey);
  if (cached) return JSON.parse(cached);

  // Order of side effects matters — each step is keyed so a client retry
  // (same `Idempotency-Key` header) short-circuits to the stored result
  // instead of running the whole path a second time.

  // 1. Reserve the key in Redis first. It must land before any charge is
  //    attempted so a crash mid-flight folds into the cached result above.
  await reserveIdempotencyKey(idempotencyKey);

  // 2. Capture payment through Stripe. This is the flow's only truly
  //    irreversible side effect, and it is bound to the reserved key so
  //    the retry path above can prove what happened to a given request.
  //    A declined card (requires_payment_method) releases the key so the
  //    client may retry with a different payment method.

  const payment = await capturePayment(input.amountCents);
  if (payment.status === 'requires_payment_method') {
    await releaseIdempotencyKey(idempotencyKey);
    throw new PaymentFailedError(payment);
  }

  // 3. Persist the order with the payment id for reconciliation.
  const order = await saveOrder({
    idempotencyKey,
    amountCents: input.amountCents,
    paymentId: payment.id,
    items: input.items,
  });

  return order;
}

class PaymentFailedError extends Error {
  constructor(public readonly payment: { status: string }) {
    super(`payment ${payment.status}`);
  }
}

async function reserveIdempotencyKey(key: string) {
  await redisClient.hSet('orders', key, JSON.stringify({ reservedAt: Date.now() }));
}

async function releaseIdempotencyKey(key: string) {
  await redisClient.hDel('orders', key);
}

async function capturePayment(amountCents: number) {
  return stripeClient.paymentIntents.create({
    amount: amountCents,
    currency: 'usd',
    automatic_payment_methods: { enabled: true },
  });
}

async function saveOrder(order: unknown) {
  return orderRepository.insert({ ...order, id: randomUUID() });
}