'use server';

/**
 * Server actions — the wire boundary between the browser and the booking store.
 * Only this module (and server libs it calls) may touch the database.
 */
import { listSlots } from '../../lib/listSlots';
import { createBooking } from '../../lib/createBooking';
import { cancelBooking } from '../../lib/cancelBooking';

export type Slot = { id: string; label: string; startsAt: string };

export async function listOpenSlots(host: string): Promise<Slot[]> {
  return listSlots(host);
}

export async function bookSlot(input: {
  host: string;
  slotId: string;
  guestEmail: string;
}) {
  return createBooking(input);
}

export async function cancelSlot(bookingId: string): Promise<void> {
  await cancelBooking(bookingId);
}
