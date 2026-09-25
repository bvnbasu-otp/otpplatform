import { describe, expect, it, vi } from 'vitest';
import {
  SupplierNetworkEngine,
  DEFAULT_SOURCING_REFRESH_WINDOW_MS,
} from './supplier-network-engine';
import {
  SupplierNetwork,
  type EngineDiscoveryRequest,
} from '@otp/domain';
import type { SupplierNetworkPort } from '../interfaces/supplier-network-port';

describe('Sourcing Discovery Cache & 30-Day Refresh Window Contract', () => {
  it('DEFAULT_SOURCING_REFRESH_WINDOW_MS equals exactly 30 days in milliseconds', () => {
    expect(DEFAULT_SOURCING_REFRESH_WINDOW_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(DEFAULT_SOURCING_REFRESH_WINDOW_MS).toBe(2592000000);
  });

  it('executes 560048 + Electrical scenario with zero external API calls on subsequent buyer RFQ', async () => {
    const externalAdapterDiscoverMock = vi.fn().mockResolvedValue([
      {
        supplierId: 'sup-elec-01',
        businessName: 'Whitefield Electrical Supplies',
        categoryCode: 'electrical',
        categories: ['electrical', 'cables'],
        network: SupplierNetwork.DIRECT,
        rating: 4.8,
      },
      {
        supplierId: 'sup-elec-02',
        businessName: 'Mahadevapura Power Systems',
        categoryCode: 'electrical',
        categories: ['electrical', 'transformers'],
        network: SupplierNetwork.LOCAL_REGISTRY,
        rating: 4.6,
      },
    ]);

    const mockAdapter: SupplierNetworkPort = {
      network: SupplierNetwork.DIRECT,
      discover: externalAdapterDiscoverMock,
    };

    const engine = new SupplierNetworkEngine({
      providers: [
        {
          adapter: mockAdapter,
        },
      ],
      cacheOptions: {
        enabled: true,
        refreshWindowMs: DEFAULT_SOURCING_REFRESH_WINDOW_MS,
      },
    });

    const initialRfqRequest: EngineDiscoveryRequest = {
      rfqId: 'rfq-buyer-1-initial',
      category: 'Electrical',
      location: {
        pinCode: '560048',
        city: 'Bengaluru',
      },
    };

    // First Buyer RFQ: Cache MISS -> Calls external provider adapter
    const firstResponse = await engine.discoverCandidates(initialRfqRequest);
    expect(firstResponse.isCached).toBe(false);
    expect(firstResponse.candidates.length).toBe(2);
    expect(externalAdapterDiscoverMock).toHaveBeenCalledTimes(1);

    const cacheStatsAfterFirst = engine.getDiscoveryCacheStats();
    expect(cacheStatsAfterFirst.size).toBe(1);
    expect(cacheStatsAfterFirst.hits).toBe(0);
    expect(cacheStatsAfterFirst.misses).toBe(1);

    // Second Buyer RFQ (560048 + Electrical): Cache HIT -> ZERO external API calls
    const subsequentRfqRequest: EngineDiscoveryRequest = {
      rfqId: 'rfq-buyer-2-subsequent',
      category: 'Electrical',
      location: {
        pinCode: '560048',
        city: 'Bengaluru',
      },
    };

    const secondResponse = await engine.discoverCandidates(subsequentRfqRequest);
    expect(secondResponse.isCached).toBe(true);
    expect(secondResponse.candidates.length).toBe(2);
    // External adapter mock NOT called again (still exactly 1 call)
    expect(externalAdapterDiscoverMock).toHaveBeenCalledTimes(1);

    const cacheStatsAfterSecond = engine.getDiscoveryCacheStats();
    expect(cacheStatsAfterSecond.hits).toBe(1);
    expect(cacheStatsAfterSecond.misses).toBe(1);

    // Third Buyer RFQ with different category: Cache MISS -> Calls adapter
    const differentCategoryRequest: EngineDiscoveryRequest = {
      rfqId: 'rfq-buyer-3-solar',
      category: 'Solar',
      location: {
        pinCode: '560048',
        city: 'Bengaluru',
      },
    };

    const thirdResponse = await engine.discoverCandidates(differentCategoryRequest);
    expect(thirdResponse.isCached).toBe(false);
    expect(externalAdapterDiscoverMock).toHaveBeenCalledTimes(2);
  });

  it('respects forceRefresh parameter to bypass cache when explicitly requested', async () => {
    const discoverMock = vi.fn().mockResolvedValue([
      {
        supplierId: 'sup-01',
        businessName: 'Vendor Tech',
        categoryCode: 'furniture',
        network: SupplierNetwork.DIRECT,
      },
    ]);

    const engine = new SupplierNetworkEngine({
      providers: [
        {
          adapter: {
            network: SupplierNetwork.DIRECT,
            discover: discoverMock,
          },
        },
      ],
      cacheOptions: { enabled: true },
    });

    const request: EngineDiscoveryRequest = {
      category: 'Furniture',
      location: { pinCode: '560001' },
    };

    await engine.discoverCandidates(request);
    expect(discoverMock).toHaveBeenCalledTimes(1);

    // Subsequent request with forceRefresh: true
    const forcedResponse = await engine.discoverCandidates({
      ...request,
      forceRefresh: true,
    });

    expect(forcedResponse.isCached).toBe(false);
    expect(discoverMock).toHaveBeenCalledTimes(2);
  });

  it('supports cache invalidation by category and pinCode', async () => {
    const discoverMock = vi.fn().mockResolvedValue([
      {
        supplierId: 'sup-01',
        businessName: 'Vendor Tech',
        categoryCode: 'cctv',
        network: SupplierNetwork.LOCAL_REGISTRY,
      },
    ]);

    const engine = new SupplierNetworkEngine({
      providers: [
        {
          adapter: {
            network: SupplierNetwork.LOCAL_REGISTRY,
            discover: discoverMock,
          },
        },
      ],
    });

    await engine.discoverCandidates({ category: 'cctv', location: { pinCode: '560001' } });
    expect(engine.getDiscoveryCacheStats().size).toBe(1);

    // Invalidate
    engine.invalidateDiscoveryCache('cctv', '560001');
    expect(engine.getDiscoveryCacheStats().size).toBe(0);

    // Re-discovery after invalidation triggers fresh provider query
    await engine.discoverCandidates({ category: 'cctv', location: { pinCode: '560001' } });
    expect(discoverMock).toHaveBeenCalledTimes(2);
  });
});
