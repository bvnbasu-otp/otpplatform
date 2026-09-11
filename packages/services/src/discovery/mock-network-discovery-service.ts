import type {
  DiscoveryCriteria,
  DiscoveryResult,
  SupplierDiscoveryService,
} from '../interfaces/supplier-discovery-service';

/** Simulates external network results — same interface as ONDC future adapter. */
export class MockNetworkDiscoveryService implements SupplierDiscoveryService {
  async discover(criteria: DiscoveryCriteria): Promise<DiscoveryResult[]> {
    return [
      {
        supplierId: `mock-network-${criteria.category.toLowerCase().replace(/\s+/g, '-')}`,
        eligibilityScore: 80,
        matchScore: 75,
        matchReasons: ['mock:network', 'category:match'],
        source: 'OTHER',
      },
    ];
  }
}
