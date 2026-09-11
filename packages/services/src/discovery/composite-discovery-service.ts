import type {
  DiscoveryCriteria,
  DiscoveryResult,
  SupplierDiscoveryService,
} from '../interfaces/supplier-discovery-service';

export class CompositeDiscoveryService implements SupplierDiscoveryService {
  constructor(private readonly services: SupplierDiscoveryService[]) {}

  async discover(criteria: DiscoveryCriteria): Promise<DiscoveryResult[]> {
    const bySupplier = new Map<string, DiscoveryResult>();

    for (const service of this.services) {
      const results = await service.discover(criteria);
      for (const r of results) {
        const existing = bySupplier.get(r.supplierId);
        if (!existing || r.matchScore > existing.matchScore) {
          bySupplier.set(r.supplierId, r);
        }
      }
    }

    return [...bySupplier.values()].sort((a, b) => b.matchScore - a.matchScore);
  }
}
