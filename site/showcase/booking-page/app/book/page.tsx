'use client';

/**
 * Public booking UI — browser entry.
 * Talks only to server actions; never imports the DB layer.
 */
import { useEffect, useState } from 'react';
import { listOpenSlots, bookSlot, cancelSlot, type Slot } from './actions';
import { captureEvent } from '../../lib/captureEvent';

export default function BookingPage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookingId, setBookingId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const open = await listOpenSlots('alex');
      setSlots(open);
      captureEvent('slot_viewed', { host: 'alex', count: open.length });
    })();
  }, []);

  async function onBook(slotId: string) {
    const booking = await bookSlot({ host: 'alex', slotId, guestEmail: 'guest@example.com' });
    setBookingId(booking.id);
    captureEvent('booking_created', { bookingId: booking.id, slotId });
  }

  async function onCancel() {
    if (!bookingId) return;
    await cancelSlot(bookingId);
    captureEvent('booking_cancelled', { bookingId });
    setBookingId(null);
  }

  return (
    <main>
      <h1>Book a time with Alex</h1>
      <ul>
        {slots.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => void onBook(s.id)}>
              {s.label}
            </button>
          </li>
        ))}
      </ul>
      {bookingId ? (
        <button type="button" onClick={() => void onCancel()}>
          Cancel booking
        </button>
      ) : null}
    </main>
  );
}
