import { describe, expect, it } from 'vitest';
import { formatDeadlineCountdown, formatDate, formatDateTime, formatRelativeTime } from './date-utils';

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

    it('handles empty or invalid inputs gracefully', () => {
      expect(formatDate(null)).toBe('—');
      expect(formatDateTime(undefined)).toBe('—');
      expect(formatRelativeTime('invalid')).toBe('—');
    });
  });
});
