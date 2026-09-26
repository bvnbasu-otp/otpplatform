import { describe, expect, it } from 'vitest';
import {
  formatDeadlineCountdown,
  formatDate,
  formatDateIST,
  formatDateTime,
  formatDateTimeIST,
  formatRelativeTime,
  formatTimeIST,
} from './date-utils';

describe('date-utils', () => {
  describe('formatDeadlineCountdown', () => {
    it('returns "No deadline set" for null or undefined', () => {
      expect(formatDeadlineCountdown(null)).toEqual({
        label: 'No deadline set',
        isUrgent: false,
        isPassed: false,
      });
      expect(formatDeadlineCountdown(undefined)).toEqual({
        label: 'No deadline set',
        isUrgent: false,
        isPassed: false,
      });
    });

    it('returns "Deadline passed" for past dates', () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      const res = formatDeadlineCountdown(pastDate);
      expect(res.isPassed).toBe(true);
      expect(res.label).toBe('Deadline passed');
    });

    it('returns urgent countdown for deadlines less than 24h away', () => {
      const twoHoursAhead = new Date(Date.now() + 2 * 3600 * 1000 + 30 * 60 * 1000).toISOString();
      const res = formatDeadlineCountdown(twoHoursAhead);
      expect(res.isUrgent).toBe(true);
      expect(res.isPassed).toBe(false);
      expect(res.label).toMatch(/2h \d+m left/);
    });

    it('returns days format for deadlines > 2 days away', () => {
      const fiveDaysAhead = new Date(Date.now() + 5 * 24 * 3600 * 1000 + 60000).toISOString();
      const res = formatDeadlineCountdown(fiveDaysAhead);
      expect(res.isUrgent).toBe(false);
      expect(res.isPassed).toBe(false);
      expect(res.label).toBe('5 days left');
    });
  });

  describe('formatDate & formatDateTime', () => {
    it('formats valid date strings in en-IN format and canonical IST', () => {
      const date = new Date('2026-09-13T10:00:00Z');
      expect(formatDate(date)).toBeTruthy();
      const formatted = formatDateTime(date);
      expect(formatted).toBeTruthy();
      expect(formatted).toContain('IST');
    });

    it('renders the canonical "DD MMM YYYY, HH:mm IST" format in Asia/Kolkata', () => {
      // 10:00 UTC = 15:30 IST
      expect(formatDateTimeIST('2026-09-13T10:00:00Z')).toBe('13 Sep 2026, 15:30 IST');
      expect(formatDateTime('2026-09-13T10:00:00Z')).toBe('13 Sep 2026, 15:30 IST');
      expect(formatDateIST('2026-09-05T10:00:00Z')).toBe('05 Sep 2026');
      expect(formatTimeIST('2026-09-13T10:00:00Z')).toBe('15:30 IST');
    });

    it('rolls the calendar date over at IST midnight, not UTC midnight', () => {
      // 18:45 UTC on 31 Dec = 00:15 IST on 1 Jan
      expect(formatDateTimeIST('2026-12-31T18:45:00Z')).toBe('01 Jan 2027, 00:15 IST');
      expect(formatDateIST('2026-12-31T18:45:00Z')).toBe('01 Jan 2027');
    });

    it('never emits locale-dependent month spellings such as "Sept"', () => {
      for (let m = 0; m < 12; m++) {
        const out = formatDateTimeIST(new Date(Date.UTC(2026, m, 15, 6, 0)));
        expect(out).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} IST$/);
      }
    });

    it('renders the canonical "DD MMM YYYY, HH:mm IST" format in Asia/Kolkata', () => {
      // 10:00 UTC = 15:30 IST
      expect(formatDateTimeIST('2026-09-13T10:00:00Z')).toBe('13 Sep 2026, 15:30 IST');
      expect(formatDateTime('2026-09-13T10:00:00Z')).toBe('13 Sep 2026, 15:30 IST');
      expect(formatDateIST('2026-09-05T10:00:00Z')).toBe('05 Sep 2026');
      expect(formatTimeIST('2026-09-13T10:00:00Z')).toBe('15:30 IST');
    });

    it('rolls the calendar date over at IST midnight, not UTC midnight', () => {
      // 18:45 UTC on 31 Dec = 00:15 IST on 1 Jan
      expect(formatDateTimeIST('2026-12-31T18:45:00Z')).toBe('01 Jan 2027, 00:15 IST');
      expect(formatDateIST('2026-12-31T18:45:00Z')).toBe('01 Jan 2027');
    });

    it('never emits locale-dependent month spellings such as "Sept"', () => {
      for (let m = 0; m < 12; m++) {
        const out = formatDateTimeIST(new Date(Date.UTC(2026, m, 15, 6, 0)));
        expect(out).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} IST$/);
      }
    });

    it('handles empty or invalid inputs gracefully', () => {
      expect(formatDateTimeIST('not-a-date')).toBe('');
      expect(formatDateTimeIST('not-a-date')).toBe('');
      expect(formatDate(null)).toBe('—');
      expect(formatDateTime(undefined)).toBe('—');
      expect(formatRelativeTime('invalid')).toBe('—');
    });
  });
});
