import { describe, it, expect } from 'vitest';
import {
  getUserOnlineStatus,
  getPresenceBadgeConfig,
  formatLastSeenRelative,
  formatLastSeenAbsolute,
} from './presence';

describe('User Online Presence Utilities', () => {
  const BASE_TIME = new Date('2026-09-12T10:00:00.000Z').getTime();

  describe('getUserOnlineStatus', () => {
    it('returns OFFLINE when lastSeenAt is null, undefined, or invalid', () => {
      expect(getUserOnlineStatus(null, BASE_TIME)).toBe('OFFLINE');
      expect(getUserOnlineStatus(undefined, BASE_TIME)).toBe('OFFLINE');
      expect(getUserOnlineStatus('invalid-date', BASE_TIME)).toBe('OFFLINE');
    });

    it('returns ONLINE when lastSeenAt is < 2 minutes ago', () => {
      // 30 seconds ago
      const recent = new Date(BASE_TIME - 30 * 1000).toISOString();
      expect(getUserOnlineStatus(recent, BASE_TIME)).toBe('ONLINE');

      // 1 minute 59 seconds ago
      const justUnder2m = new Date(BASE_TIME - 119 * 1000).toISOString();
      expect(getUserOnlineStatus(justUnder2m, BASE_TIME)).toBe('ONLINE');
    });

    it('returns RECENTLY_ACTIVE when lastSeenAt is between 2 minutes and 30 minutes ago', () => {
      // exactly 2 minutes ago
      const exactly2m = new Date(BASE_TIME - 2 * 60 * 1000).toISOString();
      expect(getUserOnlineStatus(exactly2m, BASE_TIME)).toBe('RECENTLY_ACTIVE');

      // 15 minutes ago
      const midRecent = new Date(BASE_TIME - 15 * 60 * 1000).toISOString();
      expect(getUserOnlineStatus(midRecent, BASE_TIME)).toBe('RECENTLY_ACTIVE');

      // exactly 30 minutes ago
      const exactly30m = new Date(BASE_TIME - 30 * 60 * 1000).toISOString();
      expect(getUserOnlineStatus(exactly30m, BASE_TIME)).toBe('RECENTLY_ACTIVE');
    });

    it('returns OFFLINE when lastSeenAt is > 30 minutes ago', () => {
      // 30 minutes 1 second ago
      const over30m = new Date(BASE_TIME - (30 * 60 + 1) * 1000).toISOString();
      expect(getUserOnlineStatus(over30m, BASE_TIME)).toBe('OFFLINE');

      // 2 hours ago
      const twoHoursAgo = new Date(BASE_TIME - 2 * 60 * 60 * 1000).toISOString();
      expect(getUserOnlineStatus(twoHoursAgo, BASE_TIME)).toBe('OFFLINE');

      // 5 days ago
      const fiveDaysAgo = new Date(BASE_TIME - 5 * 24 * 60 * 60 * 1000).toISOString();
      expect(getUserOnlineStatus(fiveDaysAgo, BASE_TIME)).toBe('OFFLINE');
    });

    it('handles clock skew / future timestamps gracefully as ONLINE', () => {
      const future = new Date(BASE_TIME + 5000).toISOString();
      expect(getUserOnlineStatus(future, BASE_TIME)).toBe('ONLINE');
    });
  });

  describe('formatLastSeenRelative', () => {
    it('returns "Offline" for missing timestamp', () => {
      expect(formatLastSeenRelative(null, BASE_TIME)).toBe('Offline');
      expect(formatLastSeenRelative(undefined, BASE_TIME)).toBe('Offline');
      expect(formatLastSeenRelative('invalid', BASE_TIME)).toBe('Offline');
    });

    it('returns "Online now" for timestamps under 2 minutes', () => {
      const thirtySecAgo = new Date(BASE_TIME - 30 * 1000).toISOString();
      expect(formatLastSeenRelative(thirtySecAgo, BASE_TIME)).toBe('Online now');
    });

    it('returns "Active Xm ago" for timestamps between 2m and 59m', () => {
      const fiveMinAgo = new Date(BASE_TIME - 5 * 60 * 1000).toISOString();
      expect(formatLastSeenRelative(fiveMinAgo, BASE_TIME)).toBe('Active 5m ago');

      const twentyNineMinAgo = new Date(BASE_TIME - 29 * 60 * 1000).toISOString();
      expect(formatLastSeenRelative(twentyNineMinAgo, BASE_TIME)).toBe('Active 29m ago');
    });

    it('returns "Active Xh ago" for timestamps between 1h and 23h', () => {
      const twoHoursAgo = new Date(BASE_TIME - 2 * 60 * 60 * 1000).toISOString();
      expect(formatLastSeenRelative(twoHoursAgo, BASE_TIME)).toBe('Active 2h ago');
    });

    it('returns "Active Xd ago" for timestamps between 1d and 29d', () => {
      const threeDaysAgo = new Date(BASE_TIME - 3 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatLastSeenRelative(threeDaysAgo, BASE_TIME)).toBe('Active 3d ago');
    });
  });

  describe('getPresenceBadgeConfig', () => {
    it('provides distinct colors and badges for each status', () => {
      const online = getPresenceBadgeConfig('ONLINE');
      expect(online.status).toBe('ONLINE');
      expect(online.dotColor).toContain('bg-emerald-500');
      expect(online.icon).toBe('🟢');

      const recent = getPresenceBadgeConfig('RECENTLY_ACTIVE');
      expect(recent.status).toBe('RECENTLY_ACTIVE');
      expect(recent.dotColor).toContain('bg-amber-500');
      expect(recent.icon).toBe('🟡');

      const offline = getPresenceBadgeConfig('OFFLINE');
      expect(offline.status).toBe('OFFLINE');
      expect(offline.dotColor).toContain('bg-slate-400');
      expect(offline.icon).toBe('⚪');
    });
  });

  describe('formatLastSeenAbsolute', () => {
    it('formats valid dates and handles nulls', () => {
      expect(formatLastSeenAbsolute(null)).toBe('No recorded activity');
      expect(formatLastSeenAbsolute('invalid')).toBe('Invalid timestamp');
      const formatted = formatLastSeenAbsolute('2026-09-12T10:00:00.000Z');
      expect(formatted).toBeTruthy();
      expect(formatted).not.toBe('Invalid timestamp');
    });
  });
});
