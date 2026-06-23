/**
 * Philippine Standard Time helpers (UTC+8).
 *
 * Vercel (and most cloud platforms) run in UTC.  Every "date-only" field in
 * the database (attendanceRecord.date, leave dates, etc.) is stored as
 * midnight UTC of the *Philippine* calendar date — e.g. June 2 PHT is stored
 * as 2026-06-02T00:00:00.000Z.  All helpers below honour that convention.
 */

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8

/** Returns the current Philippine calendar date as midnight UTC. */
export function phtToday(): Date {
  const phtNow = new Date(Date.now() + PHT_OFFSET_MS);
  return new Date(Date.UTC(phtNow.getUTCFullYear(), phtNow.getUTCMonth(), phtNow.getUTCDate()));
}

/** Returns the current PHT year. */
export function phtYear(): number {
  return new Date(Date.now() + PHT_OFFSET_MS).getUTCFullYear();
}

/** Returns the current PHT month (1-indexed). */
export function phtMonth(): number {
  return new Date(Date.now() + PHT_OFFSET_MS).getUTCMonth() + 1;
}

/**
 * Returns [monthStart, monthEnd] as UTC Dates for a PHT year and 1-indexed month.
 * e.g. phtMonthBounds(2026, 6) → [2026-06-01T00:00:00Z, 2026-06-30T00:00:00Z]
 */
export function phtMonthBounds(year: number, month: number): [Date, Date] {
  return [
    new Date(Date.UTC(year, month - 1, 1)),
    new Date(Date.UTC(year, month, 0)),
  ];
}
