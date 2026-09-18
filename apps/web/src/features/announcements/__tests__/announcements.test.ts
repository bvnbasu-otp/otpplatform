import { describe, it, expect } from 'vitest';
import { AnnouncementBanner } from '../components/AnnouncementBanner';
import { useAnnouncements } from '../hooks/useAnnouncements';

describe('Announcements Feature & Global Banner', () => {
  it('exports AnnouncementBanner component', () => {
    expect(AnnouncementBanner).toBeDefined();
    expect(typeof AnnouncementBanner).toBe('function');
  });

  it('exports useAnnouncements hook', () => {
    expect(useAnnouncements).toBeDefined();
    expect(typeof useAnnouncements).toBe('function');
  });
});
