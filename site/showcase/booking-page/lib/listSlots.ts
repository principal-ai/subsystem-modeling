/**
 * Load open slots for a host from the booking store.
 */
import { db } from './db';

export type Slot = { id: string; label: string; startsAt: string };

export async function listSlots(host: string): Promise<Slot[]> {
  return db.slots.findOpen(host);
}
