import { sql } from '../lib/db';

export type OrderRow = {
  id: string;
  idempotencyKey: string;
  amountCents: number;
  paymentId: string;
  items: unknown;
  created_at: string;
};

export async function insert(order: OrderRow): Promise<OrderRow> {
  const { rows } = await sql`
    INSERT INTO orders (id, idempotency_key, amount_cents, payment_id, items)
    VALUES (${order.id}, ${order.idempotencyKey}, ${order.amountCents},
            ${order.paymentId}, ${itemsToJsonb(order.items)})
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING *;
  `;
  return rows[0];
}

function itemsToJsonb(items: unknown) {
  return JSON.stringify(items);
}