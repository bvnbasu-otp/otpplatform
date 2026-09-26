/**
 * Google Places daily quota window.
 *
 * The quota store counts requests per UTC calendar day, so the window resets at
 * 00:00 UTC, which is 05:30 IST. The label shown to operators and the key used
 * by the counter both come from here so they cannot drift apart.
 */

export const GOOGLE_PLACES_QUOTA_RESET_LABEL = 'Resets daily at 05:30 IST / 00:00 UTC';

export interface GooglePlacesQuotaWindow {
  /** YYYY-MM-DD of the UTC day the instant falls in. */
  readonly dayKey: string;
  /** Inclusive start of the window (00:00:00.000 UTC). */
  readonly startsAt: Date;
  /** Exclusive end of the window, which is also the next reset instant. */
  readonly resetsAt: Date;
}

export function getUtcDayKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getUtcMonthKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getGooglePlacesQuotaWindow(now: Date = new Date()): GooglePlacesQuotaWindow {
  const startsAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  const resetsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);
  return { dayKey: getUtcDayKey(now), startsAt, resetsAt };
}
