import { describe, expect, it, beforeEach } from 'vitest';
import {
  GoogleGisSafetyQuotaGuard,
  InMemoryGoogleGisQuotaStore,
  DEFAULT_GOOGLE_GIS_LIMITS,
} from './google-gis-safety-quota';
import { GoogleMapsLocationAdapter } from './google-maps-location-adapter';
import { ProviderNeutralLocationIntelligence } from './provider-neutral-location-intelligence';

describe('Google GIS Safety Quota Guard Unit Tests', () => {
  let store: InMemoryGoogleGisQuotaStore;
  let guard: GoogleGisSafetyQuotaGuard;

  beforeEach(async () => {
    store = new InMemoryGoogleGisQuotaStore();
    guard = new GoogleGisSafetyQuotaGuard({ store });
  });

  it('initializes with default safety limits (1500 daily / 50000 monthly)', () => {
    expect(guard.getLimits().maxDaily).toBe(1500);
    expect(guard.getLimits().maxMonthly).toBe(50000);
  });

  it('allows reservation when within limits', async () => {
    const res = await guard.acquireReservation();
    expect(res.allowed).toBe(true);
    expect(res.currentUsage.dailyCount).toBe(1);
    expect(res.currentUsage.monthlyCount).toBe(1);
  });

  it('fails closed when daily quota (e.g. 1500) is exceeded', async () => {
    const customGuard = new GoogleGisSafetyQuotaGuard({
      store: new InMemoryGoogleGisQuotaStore(),
      limits: { maxDaily: 3, maxMonthly: 50 },
    });

    const res1 = await customGuard.acquireReservation();
    const res2 = await customGuard.acquireReservation();
    const res3 = await customGuard.acquireReservation();
    const res4 = await customGuard.acquireReservation();

    expect(res1.allowed).toBe(true);
    expect(res2.allowed).toBe(true);
    expect(res3.allowed).toBe(true);
    expect(res4.allowed).toBe(false);
    expect(res4.reason).toBe('DAILY_QUOTA_EXCEEDED');
    expect(res4.currentUsage.dailyCount).toBe(3);
  });

  it('fails closed when monthly quota (e.g. 50000) is exceeded', async () => {
    const customGuard = new GoogleGisSafetyQuotaGuard({
      store: new InMemoryGoogleGisQuotaStore(),
      limits: { maxDaily: 100, maxMonthly: 2 },
    });

    const res1 = await customGuard.acquireReservation();
    const res2 = await customGuard.acquireReservation();
    const res3 = await customGuard.acquireReservation();

    expect(res1.allowed).toBe(true);
    expect(res2.allowed).toBe(true);
    expect(res3.allowed).toBe(false);
    expect(res3.reason).toBe('MONTHLY_QUOTA_EXCEEDED');
    expect(res3.currentUsage.monthlyCount).toBe(2);
  });

  it('atomically enforces concurrent reservation requests without over-allocation', async () => {
    const customGuard = new GoogleGisSafetyQuotaGuard({
      store: new InMemoryGoogleGisQuotaStore(),
      limits: { maxDaily: 10, maxMonthly: 100 },
    });

    // Fire 25 simultaneous concurrent reservation requests
    const promises = Array.from({ length: 25 }, () => customGuard.acquireReservation());
    const results = await Promise.all(promises);

    const allowed = results.filter((r) => r.allowed);
    const denied = results.filter((r) => !r.allowed);

    expect(allowed).toHaveLength(10);
    expect(denied).toHaveLength(15);
    const usage = await customGuard.getUsage();
    expect(usage.dailyCount).toBe(10);
  });

  it('rolls daily window on date change', async () => {
    const day1 = new Date('2026-09-21T10:00:00Z');
    const day2 = new Date('2026-09-22T10:00:00Z');

    const customGuard = new GoogleGisSafetyQuotaGuard({
      store: new InMemoryGoogleGisQuotaStore(),
      limits: { maxDaily: 2, maxMonthly: 10 },
    });

    await customGuard.acquireReservation(day1);
    await customGuard.acquireReservation(day1);
    const deniedDay1 = await customGuard.acquireReservation(day1);
    expect(deniedDay1.allowed).toBe(false);

    // Next day: daily count resets to 0, monthly count persists
    const allowedDay2 = await customGuard.acquireReservation(day2);
    expect(allowedDay2.allowed).toBe(true);
    expect(allowedDay2.currentUsage.dailyCount).toBe(1);
    expect(allowedDay2.currentUsage.monthlyCount).toBe(3);
  });

  it('fails closed when quota store throws an error', async () => {
    const faultyStore = {
      reserveQuota: async () => {
        throw new Error('REDIS_STORE_CORRUPTED');
      },
      getUsage: async () => ({ dailyCount: 0, monthlyCount: 0, dayKey: '', monthKey: '' }),
      reset: async () => {},
    };

    const faultyGuard = new GoogleGisSafetyQuotaGuard({ store: faultyStore });
    const res = await faultyGuard.acquireReservation();

    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('STORE_ERROR');
  });

  it('integrates with GoogleMapsLocationAdapter to fallback seamlessly on quota exhaustion', async () => {
    const quotaGuard = new GoogleGisSafetyQuotaGuard({
      store: new InMemoryGoogleGisQuotaStore(),
      limits: { maxDaily: 1, maxMonthly: 50 },
    });

    const adapter = new GoogleMapsLocationAdapter({
      apiKey: 'test-google-key',
      quotaGuard,
    });

    // First call: consumes quota, returns enhanced confidence (100)
    const res1 = await adapter.calculateDistance(
      { coordinates: { lat: 12.9716, lng: 77.5946 } },
      { coordinates: { lat: 12.9698, lng: 77.7500 } },
    );
    expect(res1.confidenceScore).toBe(100);

    // Second call: quota exhausted -> fails closed to offline fallback (confidence 95)
    const res2 = await adapter.calculateDistance(
      { coordinates: { lat: 12.9716, lng: 77.5946 } },
      { coordinates: { lat: 12.9000, lng: 77.6000 } },
    );
    expect(res2.calculationMethod).toBe('HAVERSINE_COORDINATES');
    expect(res2.confidenceScore).toBe(95);
  });

  it('is cache-aware and does not consume quota on repeated identical requests', async () => {
    const quotaGuard = new GoogleGisSafetyQuotaGuard({
      store: new InMemoryGoogleGisQuotaStore(),
      limits: { maxDaily: 2, maxMonthly: 50 },
    });

    const adapter = new GoogleMapsLocationAdapter({
      apiKey: 'test-google-key',
      quotaGuard,
    });

    const origin = { city: 'Bengaluru', pinCode: '560001' };
    const dest = { city: 'Bengaluru', pinCode: '560001' };

    await adapter.calculateDistance(origin, dest);
    await adapter.calculateDistance(origin, dest);
    await adapter.calculateDistance(origin, dest);

    const usage = await quotaGuard.getUsage();
    // Only 1 reservation made because cache serviced the subsequent 2 requests
    expect(usage.dailyCount).toBe(1);
  });
});
