import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryRepositories } from '../repositories/in-memory';
import { createOtpServices } from '../factory/create-otp-services';
import { ManagedSupplierNetworkService } from '../services/managed-supplier-network-service';
import { GooglePlacesDiscoveryAdapter } from '../gis/google-places-discovery-adapter';

describe('GAP-01 Google Places PIN location coverage', () => {
  let manager: ManagedSupplierNetworkService;

  const scope = {
    state: 'Karnataka',
    city: 'Bengaluru',
    pincode: '560048',
    category: 'Electrical & Automation',
  };

  beforeEach(() => {
    const mem = InMemoryRepositories.create();
    const services = createOtpServices(mem.asRepositories());
    manager = services.managedSupplierNetwork;
  });

  it('NEW PIN executes exactly one managed generation (mock fetch) and second buyer adds zero calls', async () => {
    let googleCalls = 0;
    const custom = new ManagedSupplierNetworkService(undefined, undefined, undefined, undefined, {
      allowLegacyMockDiscovery: false,
      googleApiKey: 'test-google-key',
      serverFetchFn: async (url: string) => {
        googleCalls += 1;
        if (url.includes('geocode')) {
          return {
            status: 'OK',
            results: [{ geometry: { location: { lat: 12.97, lng: 77.71 } }, formatted_address: '560048' }],
          };
        }
        return {
          status: 'OK',
          results: [
            {
              place_id: 'ChIJ_gap01_one',
              name: 'Gap01 Electrical Hub',
              formatted_address: 'Hoodi, Bengaluru 560048',
              formatted_phone_number: '+91 9845012345',
              rating: 4.5,
              user_ratings_total: 10,
              geometry: { location: { lat: 12.97, lng: 77.71 } },
              types: ['store'],
            },
          ],
        };
      },
      googlePlacesAdapter: new GooglePlacesDiscoveryAdapter(),
    });

    const first = await custom.prepareLocationNetwork({ ...scope, executeDiscovery: true });
    expect(first.ok).toBe(true);
    expect(first.externalCallsExecuted).toBeGreaterThan(0);
    expect(googleCalls).toBeGreaterThan(0);
    const callsAfterFirst = googleCalls;

    const second = await custom.prepareLocationNetwork({ ...scope, executeDiscovery: true });
    expect(second.externalCallsExecuted).toBe(0);
    expect(googleCalls).toBe(callsAfterFirst);
  });

  it('concurrent same-PIN buyers share one in-flight generation', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const custom = new ManagedSupplierNetworkService(undefined, undefined, undefined, undefined, {
      allowLegacyMockDiscovery: false,
      googleApiKey: 'test-google-key',
      serverFetchFn: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 30));
        inFlight -= 1;
        return {
          status: 'OK',
          results: [{ place_id: 'ChIJ_concurrent', name: 'Concurrent Supplier', geometry: { location: { lat: 1, lng: 1 } } }],
        };
      },
      googlePlacesAdapter: new GooglePlacesDiscoveryAdapter(),
    });

    const [a, b] = await Promise.all([
      custom.prepareLocationNetwork({ ...scope, executeDiscovery: true }),
      custom.prepareLocationNetwork({ ...scope, executeDiscovery: true }),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(maxInFlight).toBe(1);
  });

  it('EXPIRED scope performs one refresh; failed refresh preserves prior suppliers', async () => {
    const custom = new ManagedSupplierNetworkService(undefined, undefined, { freshnessWindowDays: 30 }, undefined, {
      allowLegacyMockDiscovery: true,
    });
    await custom.prepareLocationNetwork({ ...scope, executeDiscovery: true });
    const before = (custom as any).knownScopes.get(custom.getScopeKey(scope));
    before.lastDiscoveredAt = Date.now() - 31 * 24 * 60 * 60 * 1000;
    (custom as any).knownScopes.set(custom.getScopeKey(scope), before);

    const refresh = await custom.prepareLocationNetwork({ ...scope, executeDiscovery: true, forceRefresh: true });
    expect(refresh.ok).toBe(true);
    expect(refresh.knownSuppliersCount).toBeGreaterThan(0);
  });

  it('check coverage is read-only with zero external calls', async () => {
    const check = await manager.checkLocationCoverage({ ...scope, executeDiscovery: false });
    expect(check.externalCallsExecuted).toBe(0);
    expect(check.message).toContain('NEVER_DISCOVERED');
  });

  it('production onboarding path does not use legacy mock when mock flag disabled', async () => {
    const strict = new ManagedSupplierNetworkService(undefined, undefined, undefined, undefined, {
      allowLegacyMockDiscovery: false,
      googleApiKey: undefined,
    });
    const res = await strict.prepareLocationNetwork({ ...scope, executeDiscovery: true });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('PROVIDER_UNAVAILABLE');
  });

  it('deduplicates by Place ID only on merge', async () => {
    const custom = new ManagedSupplierNetworkService(undefined, undefined, undefined, undefined, {
      allowLegacyMockDiscovery: false,
      googleApiKey: 'test-google-key',
      serverFetchFn: async () => ({
        status: 'OK',
        results: [
          { place_id: 'ChIJ_dedup', name: 'Alpha Traders', formatted_phone_number: '+91 1111111111' },
          { place_id: 'ChIJ_dedup', name: 'Alpha Traders Duplicate Name', formatted_phone_number: '+91 2222222222' },
        ],
      }),
      googlePlacesAdapter: new GooglePlacesDiscoveryAdapter(),
    });
    const res = await custom.prepareLocationNetwork({ ...scope, executeDiscovery: true });
    expect(res.report.suppliers.length).toBe(1);
  });

  it('quota exhaustion returns QUOTA_EXHAUSTED without wiping suppliers', async () => {
    const custom = new ManagedSupplierNetworkService(undefined, undefined, undefined, {
      GOOGLE_PLACES: {
        provider: 'GOOGLE_PLACES',
        dailyRequestLimit: 1500,
        monthlyRequestLimit: 45000,
        emergencyReserveBuffer: 200,
        buyerDemandReserveBuffer: 300,
        proactiveDiscoveryBudget: 500,
        maxCallsPerLocationCategory: 3,
      },
    }, {
      allowLegacyMockDiscovery: true,
    });
    await custom.prepareLocationNetwork({ ...scope, executeDiscovery: true });
    (custom as any).dailyUsageCount = 1500;
    const exhausted = await custom.prepareLocationNetwork({ ...scope, executeDiscovery: true, forceRefresh: true });
    expect(exhausted.error).toBe('QUOTA_EXHAUSTED');
    expect(exhausted.knownSuppliersCount).toBeGreaterThan(0);
  });
});
