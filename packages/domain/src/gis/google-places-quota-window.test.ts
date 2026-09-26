import { describe, expect, it } from 'vitest';
import {
  GOOGLE_PLACES_QUOTA_RESET_LABEL,
  getGooglePlacesQuotaWindow,
  getUtcDayKey,
  getUtcMonthKey,
} from './google-places-quota-window';

describe('Google Places quota window (issue 21)', () => {
  it('label states the UTC-midnight reset exactly', () => {
    expect(GOOGLE_PLACES_QUOTA_RESET_LABEL).toBe('Resets daily at 05:30 IST / 00:00 UTC');
  });

  it('rolls the day key at 00:00:00Z (05:30 IST), not at IST midnight', () => {
    // 18:29:59Z and 18:30:00Z straddle IST midnight; both are still the same UTC day.
    const beforeIstMidnight = new Date('2026-09-26T18:29:59Z');
    const atIstMidnight = new Date('2026-09-26T18:30:00Z');
    expect(getUtcDayKey(beforeIstMidnight)).toBe('2026-09-26');
    expect(getUtcDayKey(atIstMidnight)).toBe('2026-09-26');

    const lastUtcSecond = new Date('2026-09-26T23:59:59Z');
    const utcMidnight = new Date('2026-09-27T00:00:00Z');
    expect(getUtcDayKey(lastUtcSecond)).toBe('2026-09-26');
    expect(getUtcDayKey(utcMidnight)).toBe('2026-09-27');
  });

  it('window bounds are [00:00Z, next 00:00Z) and the reset instant is 05:30 IST', () => {
    const w = getGooglePlacesQuotaWindow(new Date('2026-09-26T23:59:59.999Z'));
    expect(w.dayKey).toBe('2026-09-26');
    expect(w.startsAt.toISOString()).toBe('2026-09-26T00:00:00.000Z');
    expect(w.resetsAt.toISOString()).toBe('2026-09-27T00:00:00.000Z');

    const istReset = w.resetsAt.toLocaleString('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    expect(istReset).toBe('05:30');

    const next = getGooglePlacesQuotaWindow(new Date('2026-09-27T00:00:00.000Z'));
    expect(next.dayKey).toBe('2026-09-27');
    expect(next.startsAt.getTime()).toBe(w.resetsAt.getTime());
  });

  it('month key rolls on the UTC month boundary', () => {
    expect(getUtcMonthKey(new Date('2026-09-30T23:59:59Z'))).toBe('2026-09');
    expect(getUtcMonthKey(new Date('2026-10-01T00:00:00Z'))).toBe('2026-10');
  });
});
