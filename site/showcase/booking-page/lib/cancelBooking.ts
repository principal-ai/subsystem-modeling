/**
 * Release a previously confirmed booking so the slot can be offered again.
 */
import { db } from './db';

export async function cancelBooking(bookingId: string): Promise<void> {
  await db.bookings.update(bookingId, { status: 'cancelled' });
}
