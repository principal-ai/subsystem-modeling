/**
 * Reserve a slot for a guest — the write path behind "Confirm booking".
 */
import { db } from './db';

export type CreateBookingInput = {
  host: string;
  slotId: string;
  guestEmail: string;
};

export async function createBooking(input: CreateBookingInput) {
  return db.bookings.insert({
    host: input.host,
    slotId: input.slotId,
    guestEmail: input.guestEmail,
    status: 'confirmed',
  });
}
