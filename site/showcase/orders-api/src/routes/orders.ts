import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { createOrder, getOrder } from '../services/orderService';
import { hashBody } from '../lib/bodyHash';

export const router = Router();
/**
 * POST /orders — the wire boundary for the orders subsystem.
 *
 * Every request reserves an idempotency key (Redis) before touching
 * Stripe, so a retry from the web client can never double-charge.
 * The key is scoped to the body hash; amount and items are bound to it.
 */
router.post('/orders', asyncHandler(async (req, res) => {
  const { items, amountCents } = req.body;
  const idempotencyKey = req.header('Idempotency-Key') ?? hashBody(req.body);
  const order = await createOrder({ items, amountCents, idempotencyKey });
  res.status(201).json({ order });
}));

router.get('/orders/:id', asyncHandler(async (req, res) => {
  const order = await getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'not found' });
  res.json({ order });
}));