/**
 * Stand-in data layer for the showcase (Postgres/SQLite/etc. in a real app).
 */
export const db = {
  slots: {
    async findOpen(_host: string) {
      return [
        { id: 'slot_10', label: 'Tue 10:00', startsAt: '2026-09-08T10:00:00Z' },
        { id: 'slot_11', label: 'Tue 11:00', startsAt: '2026-09-08T11:00:00Z' },
      ];
    },
  },
  bookings: {
    async insert(row: {
      host: string;
      slotId: string;
      guestEmail: string;
      status: string;
    }) {
      return { id: 'bk_1', ...row };
    },
    async update(_id: string, _patch: { status: string }) {
      return;
    },
  },
};
