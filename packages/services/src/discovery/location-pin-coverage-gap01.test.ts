import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryRepositories } from '../repositories/in-memory';
import { createOtpServices } from '../factory/create-otp-services';
import { ManagedSupplierNetworkService } from '../services/managed-supplier-network-service';
import { GooglePlacesDiscoveryAdapter } from '../gis/google-places-discovery-adapter';
import {
  InMemoryLocationPinCoverageStore,
  buildLocationPinScopeKey,
} from './location-pin-coverage-store';
import { runAuthoritativeLocationPinCoverage } from './location-pin-coverage-orchestrator';
import { geocodeIndianPinCode, runManagedGooglePlacesDiscovery } from './google-places-managed-coverage';
import {
  isVitestMockDiscoveryAllowed,
  resolveForceRefreshAuthorization,
} from './location-pin-coverage-request-auth';
import { FailClosedLocationPinCoverageStore } from './location-pin-coverage-store';

describe('GAP-01 authoritative Google Places PIN location coverage', () => {
  const scope = {
    state: 'Karnataka',
    city: 'Bengaluru',
    pincode: '560048',
    category: 'Electrical & Automation',
  };

  function createManagedWithFetch(
    serverFetchFn: (url: string) => Promise<unknown>,
    store?: InMemoryLocationPinCoverageStore,
  ) {
    const coverageStore = store ?? new InMemoryLocationPinCoverageStore();
    return new ManagedSupplierNetworkService(undefined, undefined, undefined, undefined, {
      allowLegacyMockDiscovery: false,
      googleApiKey: 'test-google-key',
      serverFetchFn,
      googlePlacesAdapter: new GooglePlacesDiscoveryAdapter(),
      coverageStore,
    });
  }

  function mockPlacesSearchSuccess(placeId = 'ChIJ_gap01_one') {
    return {
      places: [
        {
          id: `places/${placeId}`,
          displayName: { text: 'Gap01 Electrical Hub' },
          formattedAddress: 'Hoodi, Bengaluru 560048',
          location: { latitude: 12.97, longitude: 77.71 },
          googleMapsUri: `https://maps.google.com/?cid=${placeId}`,
        },
      ],
    };
  }

  function mockGoogleSuccess(placeId = 'ChIJ_gap01_one') {
    return async (url: string) => {
      if (url.includes('geocode')) {
        return {
          status: 'OK',
          results: [{ geometry: { location: { lat: 12.97, lng: 77.71 } }, formatted_address: '560048' }],
        };
      }
      if (url.includes('textsearch/json')) {
        throw new Error('legacy Places Text Search must not be called');
      }
      return mockPlacesSearchSuccess(placeId);
    };
  }

  it('A NEW PIN executes exactly one managed generation and second call adds zero Google HTTP calls', async () => {
    let googleCalls = 0;
    const fetch = async (url: string) => {
      googleCalls += 1;
      return mockGoogleSuccess()(url);
    };
    const manager = createManagedWithFetch(fetch);

    const first = await manager.prepareLocationNetwork({ ...scope, executeDiscovery: true });
    expect(first.ok).toBe(true);
    expect(first.externalCallsExecuted).toBeGreaterThan(0);
    const callsAfterFirst = googleCalls;

    const second = await manager.prepareLocationNetwork({ ...scope, executeDiscovery: true });
    expect(second.externalCallsExecuted).toBe(0);
    expect(googleCalls).toBe(callsAfterFirst);
  });

  it('B FRESH PIN reuses coverage with zero new Google calls', async () => {
    let googleCalls = 0;
    const manager = createManagedWithFetch(async (url) => {
      googleCalls += 1;
      return mockGoogleSuccess()(url);
    });
    await manager.prepareLocationNetwork({ ...scope, executeDiscovery: true });
    const baseline = googleCalls;
    const fresh = await manager.prepareLocationNetwork({ ...scope, executeDiscovery: true });
    expect(fresh.externalCallsExecuted).toBe(0);
    expect(googleCalls).toBe(baseline);
  });

  it('C EXPIRED scope performs one refresh generation', async () => {
    const store = new InMemoryLocationPinCoverageStore();
    let googleCalls = 0;
    const manager = createManagedWithFetch(async (url) => {
      googleCalls += 1;
      return mockGoogleSuccess()(url);
    }, store);
    await manager.prepareLocationNetwork({ ...scope, executeDiscovery: true });
    const scopeKey = buildLocationPinScopeKey({ ...scope, discoveryContext: 'SUPERADMIN_PREPARE' });
    store.setScopeAge(scopeKey, 31 * 24 * 60 * 60 * 1000);
    const before = googleCalls;
    const refresh = await manager.prepareLocationNetwork({ ...scope, executeDiscovery: true });
    expect(refresh.ok).toBe(true);
    expect(googleCalls).toBeGreaterThan(before);
  });

  it('D two simultaneous authoritative requests share one generation (store lock, not service Map)', async () => {
    const store = new InMemoryLocationPinCoverageStore();
    let inFlight = 0;
    let maxInFlight = 0;
    const fetch = async (url: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 40));
      inFlight -= 1;
      if (url.includes('geocode')) {
        return {
          status: 'OK',
          results: [{ geometry: { location: { lat: 12.97, lng: 77.71 } } }],
        };
      }
      return mockPlacesSearchSuccess('ChIJ_concurrent');
    };
    const deps = {
      store,
      freshnessWindowDays: 30,
      dailyLimit: 1500,
      googleApiKey: 'test-google-key',
      serverFetchFn: fetch,
      googlePlacesAdapter: new GooglePlacesDiscoveryAdapter(),
      allowLegacyMockDiscovery: false,
    };
    const [a, b] = await Promise.all([
      runAuthoritativeLocationPinCoverage({ ...scope, executeDiscovery: true }, deps),
      runAuthoritativeLocationPinCoverage({ ...scope, executeDiscovery: true }, deps),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(maxInFlight).toBe(1);
  });

  it('E budget exhausted prevents Google HTTP calls', async () => {
    const store = new InMemoryLocationPinCoverageStore();
    store.setDailyUsage(1500);
    let googleCalls = 0;
    const manager = createManagedWithFetch(async (url) => {
      googleCalls += 1;
      return mockGoogleSuccess()(url);
    }, store);
    const res = await manager.prepareLocationNetwork({ ...scope, executeDiscovery: true, forceRefresh: true });
    expect(res.error).toBe('QUOTA_EXHAUSTED');
    expect(googleCalls).toBe(0);
  });

  it('F failed refresh keeps prior successful coverage', async () => {
    const store = new InMemoryLocationPinCoverageStore();
    let failNext = false;
    const manager = createManagedWithFetch(async (url) => {
      if (failNext) {
        return { places: [] };
      }
      return mockGoogleSuccess('ChIJ_keep_old')(url);
    }, store);
    await manager.prepareLocationNetwork({ ...scope, executeDiscovery: true });
    const scopeKey = buildLocationPinScopeKey({ ...scope, discoveryContext: 'SUPERADMIN_PREPARE' });
    store.setScopeAge(scopeKey, 31 * 24 * 60 * 60 * 1000);
    failNext = true;
    const refresh = await manager.prepareLocationNetwork({ ...scope, executeDiscovery: true, forceRefresh: true });
    expect(refresh.knownSuppliersCount).toBeGreaterThan(0);
    const assessed = await store.assess(scopeKey, 30);
    expect(assessed.knownSupplierCount).toBeGreaterThan(0);
  });

  it('G Force Refresh bypasses TTL but respects budget lock', async () => {
    const store = new InMemoryLocationPinCoverageStore();
    let googleCalls = 0;
    const manager = createManagedWithFetch(async (url) => {
      googleCalls += 1;
      return mockGoogleSuccess()(url);
    }, store);
    await manager.prepareLocationNetwork({ ...scope, executeDiscovery: true });
    const freshReuse = await manager.prepareLocationNetwork({ ...scope, executeDiscovery: true });
    expect(freshReuse.externalCallsExecuted).toBe(0);
    const forced = await manager.prepareLocationNetwork({ ...scope, executeDiscovery: true, forceRefresh: true });
    expect(forced.externalCallsExecuted).toBeGreaterThan(0);
    expect(googleCalls).toBeGreaterThan(1);
    store.setDailyUsage(1500);
    const blocked = await manager.prepareLocationNetwork({ ...scope, executeDiscovery: true, forceRefresh: true });
    expect(blocked.error).toBe('QUOTA_EXHAUSTED');
  });

  it('H buyer onboarding orchestrator and SuperAdmin prepare share the same authoritative store', async () => {
    const shared = new InMemoryLocationPinCoverageStore();
    const fetch = mockGoogleSuccess('ChIJ_shared_path');
    const admin = createManagedWithFetch(fetch, shared);
    await admin.prepareLocationNetwork({ ...scope, executeDiscovery: true });
    const buyerResult = await runAuthoritativeLocationPinCoverage(
      { ...scope, executeDiscovery: true },
      {
        store: shared,
        freshnessWindowDays: 30,
        dailyLimit: 1500,
        googleApiKey: 'test-google-key',
        serverFetchFn: fetch,
        googlePlacesAdapter: new GooglePlacesDiscoveryAdapter(),
      },
    );
    expect(buyerResult.externalCallsExecuted).toBe(0);
    expect(buyerResult.knownSuppliersCount).toBeGreaterThan(0);
  });

  it('I Google discovery results remain DISCOVERED_IN_AREA only', async () => {
    const manager = createManagedWithFetch(mockGoogleSuccess());
    const res = await manager.prepareLocationNetwork({ ...scope, executeDiscovery: true });
    for (const s of res.report.suppliers) {
      expect(s.verificationStage).toBe('DISCOVERED_IN_AREA');
      expect(s.isOtpRegistered).toBe(false);
    }
  });

  it('J geocode failure records truthful failure without geographic text-only success', async () => {
    const manager = createManagedWithFetch(async (url) => {
      if (url.includes('geocode')) {
        return { status: 'ZERO_RESULTS', results: [] };
      }
      throw new Error('text search should not run');
    });
    const res = await manager.prepareLocationNetwork({ ...scope, executeDiscovery: true });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('GEOCODE_FAILED');
    expect(res.knownSuppliersCount).toBe(0);
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

  it('check coverage is read-only with zero external calls', async () => {
    const mem = InMemoryRepositories.create();
    const services = createOtpServices(mem.asRepositories());
    const check = await services.managedSupplierNetwork.checkLocationCoverage({ ...scope, executeDiscovery: false });
    expect(check.externalCallsExecuted).toBe(0);
    expect(check.message).toContain('NEVER_DISCOVERED');
  });

  it('buyer and superadmin share runAuthoritativeLocationPinCoverage orchestrator', async () => {
    const store = new InMemoryLocationPinCoverageStore();
    const fetch = mockGoogleSuccess('ChIJ_same_orchestrator');
    const deps = {
      store,
      freshnessWindowDays: 30,
      dailyLimit: 1500,
      googleApiKey: 'test-google-key',
      serverFetchFn: fetch,
      googlePlacesAdapter: new GooglePlacesDiscoveryAdapter(),
      allowLegacyMockDiscovery: false,
    };
    const adminPath = await runAuthoritativeLocationPinCoverage({ ...scope, executeDiscovery: true }, deps);
    expect(adminPath.externalCallsExecuted).toBeGreaterThan(0);
    const buyerPath = await runAuthoritativeLocationPinCoverage({ ...scope, executeDiscovery: true }, deps);
    expect(buyerPath.externalCallsExecuted).toBe(0);
    expect(buyerPath.knownSuppliersCount).toBeGreaterThan(0);
  });

  it('rejects buyer forceRefresh while allowing superadmin effective refresh', () => {
    const buyer = resolveForceRefreshAuthorization({
      requestedForceRefresh: true,
      isAuthenticated: true,
      isSuperAdmin: false,
    });
    expect(buyer.ok).toBe(false);
    expect(buyer.httpStatus).toBe(403);

    const admin = resolveForceRefreshAuthorization({
      requestedForceRefresh: true,
      isAuthenticated: true,
      isSuperAdmin: true,
    });
    expect(admin.ok).toBe(true);
    expect(admin.effectiveForceRefresh).toBe(true);

    const anon = resolveForceRefreshAuthorization({
      requestedForceRefresh: false,
      isAuthenticated: false,
      isSuperAdmin: false,
    });
    expect(anon.ok).toBe(false);
    expect(anon.httpStatus).toBe(401);
  });

  it('blocks direct managed Google discovery without orchestrator authorization', async () => {
    const adapter = new GooglePlacesDiscoveryAdapter();
    let calls = 0;
    const blocked = await runManagedGooglePlacesDiscovery(
      { ...scope, discoveryContext: 'BUYER_RFQ' },
      adapter,
      {
        apiKey: 'test-key',
        fetchFn: async () => {
          calls += 1;
          return {};
        },
      },
    );
    expect(blocked.externalCallsUsed).toBe(0);
    expect(calls).toBe(0);
    expect(blocked.errorCode).toBe('PROVIDER_ERROR');
  });

  it('production factory cannot execute generateRealisticMockDiscovery', () => {
    expect(isVitestMockDiscoveryAllowed()).toBe(true);
    const prev = process.env.VITEST;
    process.env.VITEST = '';
    expect(isVitestMockDiscoveryAllowed()).toBe(false);
    process.env.VITEST = prev;
  });

  it('fail-closed default store prevents billable Google work without Postgres authority', async () => {
    let calls = 0;
    const manager = new ManagedSupplierNetworkService(undefined, undefined, undefined, undefined, {
      coverageStore: new FailClosedLocationPinCoverageStore(),
      allowLegacyMockDiscovery: false,
      googleApiKey: 'test-key',
      serverFetchFn: async () => {
        calls += 1;
        return mockGoogleSuccess()( '');
      },
    });
    const res = await manager.prepareLocationNetwork({ ...scope, executeDiscovery: true });
    expect(res.error).toBe('QUOTA_EXHAUSTED');
    expect(calls).toBe(0);
  });

  it('authoritative adapter uses Places API (New) searchText, not legacy textsearch/json', async () => {
    const urls: string[] = [];
    const manager = createManagedWithFetch(async (url: string, init?: RequestInit) => {
      urls.push(url);
      if (url.includes('geocode')) {
        return {
          status: 'OK',
          results: [{ geometry: { location: { lat: 12.97, lng: 77.71 } } }],
        };
      }
      expect(init?.method).toBe('POST');
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.['X-Goog-FieldMask']).toContain('places.id');
      expect(headers?.['X-Goog-Api-Key']).toBeDefined();
      expect(headers?.['X-Goog-FieldMask']).not.toBe('*');
      return mockPlacesSearchSuccess('ChIJ_new_api_only');
    });
    const res = await manager.prepareLocationNetwork({ ...scope, executeDiscovery: true });
    expect(res.ok).toBe(true);
    expect(urls.some((u) => u.includes('places:searchText'))).toBe(true);
    expect(urls.some((u) => u.includes('textsearch/json'))).toBe(false);
  });

  it('diagnostic geocode logs omit secrets and URLs', async () => {
    const secretKey = 'test-google-key';
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    try {
      await geocodeIndianPinCode('560048', {
        apiKey: secretKey,
        fetchFn: async () => ({
          __httpStatus: 200,
          status: 'OK',
          results: [{ geometry: { location: { lat: 12.97, lng: 77.71 } } }],
        }),
      });
      const joined = logs.join('\n');
      expect(joined).toContain('GAP01_GEOCODE_START pin=560048');
      expect(joined).toContain('GAP01_GEOCODE_HTTP_STATUS httpStatus=200');
      expect(joined).toContain('GAP01_GEOCODE_GOOGLE_STATUS googleStatus=OK');
      expect(joined).not.toContain(secretKey);
      expect(joined).not.toMatch(/key=/i);
      expect(joined).not.toContain('maps.googleapis.com');
      expect(joined).not.toMatch(/authorization/i);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('REQUEST_DENIED geocode still maps to PROVIDER_UNAVAILABLE auth path without logging secrets', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    const manager = createManagedWithFetch(async (url) => {
      if (url.includes('geocode')) {
        return { __httpStatus: 200, status: 'REQUEST_DENIED', error_message: 'The provided API key is invalid.' };
      }
      throw new Error('places must not run');
    });
    try {
      const res = await manager.prepareLocationNetwork({ ...scope, executeDiscovery: true });
      expect(res.ok).toBe(false);
      expect(res.error).toBe('PROVIDER_UNAVAILABLE');
      const joined = logs.join('\n');
      expect(joined).toContain('GAP01_GEOCODE_ERROR_CLASS=REQUEST_DENIED');
      expect(joined).not.toContain('test-google-key');
      expect(joined).not.toMatch(/key=/i);
      expect(joined).not.toContain('maps.googleapis.com');
    } finally {
      logSpy.mockRestore();
    }
  });

  it('managed discovery logs Places API (New) markers without legacy textsearch', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    const urls: string[] = [];
    const manager = createManagedWithFetch(async (url: string, init?: RequestInit) => {
      urls.push(url);
      if (url.includes('geocode')) {
        return {
          __httpStatus: 200,
          status: 'OK',
          results: [{ geometry: { location: { lat: 12.97, lng: 77.71 } } }],
        };
      }
      expect(init?.method).toBe('POST');
      return { __httpStatus: 200, ...mockPlacesSearchSuccess('ChIJ_diag_places') };
    });
    try {
      const res = await manager.prepareLocationNetwork({ ...scope, executeDiscovery: true });
      expect(res.ok).toBe(true);
      expect(urls.some((u) => u.includes('places:searchText'))).toBe(true);
      expect(urls.some((u) => u.includes('textsearch/json'))).toBe(false);
      const joined = logs.join('\n');
      expect(joined).toContain('GAP01_PLACES_START api=places_api_new');
      expect(joined).toContain('GAP01_PLACES_HTTP_STATUS');
      expect(joined).toContain('GAP01_PLACES_RESULT_COUNT');
      expect(joined).not.toContain('test-google-key');
      expect(joined).not.toMatch(/key=/i);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('deduplicates by Place ID only on merge', async () => {
    const manager = createManagedWithFetch(async (url: string) => {
      if (url.includes('geocode')) {
        return {
          status: 'OK',
          results: [{ geometry: { location: { lat: 12.97, lng: 77.71 } } }],
        };
      }
      return {
        places: [
          {
            id: 'places/ChIJ_dedup',
            displayName: { text: 'Alpha Traders' },
            formattedAddress: 'Hoodi, Bengaluru 560048',
            location: { latitude: 12.97, longitude: 77.71 },
          },
          {
            id: 'places/ChIJ_dedup',
            displayName: { text: 'Alpha Traders Duplicate Name' },
            formattedAddress: 'Hoodi, Bengaluru 560048',
            location: { latitude: 12.97, longitude: 77.71 },
          },
        ],
      };
    });
    const res = await manager.prepareLocationNetwork({ ...scope, executeDiscovery: true });
    expect(res.report.suppliers.length).toBe(1);
  });
});
