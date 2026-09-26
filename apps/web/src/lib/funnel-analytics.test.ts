import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  trackFunnelEvent,
  getBufferedFunnelEvents,
  clearBufferedFunnelEvents,
  setFunnelEventSink,
  getOrCreateAnonymousSessionId,
} from './funnel-analytics';

describe('Web Funnel Analytics Client (Stage R2-27)', () => {
  beforeEach(() => {
    clearBufferedFunnelEvents();
    setFunnelEventSink(null);
  });

  it('generates or retrieves a persistent anonymous session ID', () => {
    const id1 = getOrCreateAnonymousSessionId();
    const id2 = getOrCreateAnonymousSessionId();
    expect(id1).toBe(id2);
    expect(id1.length).toBeGreaterThan(8);
  });

  it('tracks canonical funnel events cleanly', () => {
    const tracked = trackFunnelEvent('landing_view', {
      persona: 'INDIVIDUAL',
    });
    expect(tracked).toBe(true);

    const events = getBufferedFunnelEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe('landing_view');
    expect(events[0]?.persona).toBe('INDIVIDUAL');
  });

  it('tracks referral events with sanitized codes', () => {
    const tracked = trackFunnelEvent('referral_attributed', {
      referralCode: 'ref-blr-014',
      persona: 'MSME',
    });
    expect(tracked).toBe(true);

    const events = getBufferedFunnelEvents();
    expect(events[0]?.eventType).toBe('referral_attributed');
    expect(events[0]?.referralCode).toBe('REF-BLR-014');
  });

  it('dispatches events to registered custom sink', () => {
    const sinkMock = vi.fn();
    setFunnelEventSink(sinkMock);

    trackFunnelEvent('pricing_view', {
      planTier: 'INDIVIDUAL',
      billingCycle: 'YEARLY',
      amount: 999,
    });

    expect(sinkMock).toHaveBeenCalledTimes(1);
    expect(sinkMock.mock.calls[0]?.[0]?.eventType).toBe('pricing_view');
    expect(sinkMock.mock.calls[0]?.[0]?.amount).toBe(999);
  });

  it('drops events containing raw PII in metadata', () => {
    const tracked = trackFunnelEvent('signup_started', {
      metadata: {
        rawUserEmail: 'test@example.com',
      },
    });

    expect(tracked).toBe(false);
    expect(getBufferedFunnelEvents()).toHaveLength(0);
  });
});
