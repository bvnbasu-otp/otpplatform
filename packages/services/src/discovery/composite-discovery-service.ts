import type {
  DiscoveryCriteria,
  DiscoveryResult,
  SupplierDiscoveryService,
} from '../interfaces/supplier-discovery-service';
import type { SupplierNetworkPort } from '../interfaces/supplier-network-port';
import { SupplierNetworkEngine } from './supplier-network-engine';
import { sanitizeCandidateMatchReasons } from '@otp/domain';

export class CompositeDiscoveryService implements SupplierDiscoveryService {
  private readonly engine?: SupplierNetworkEngine;

  constructor(
    private readonly services: (SupplierDiscoveryService | SupplierNetworkPort)[],
    options?: { engine?: SupplierNetworkEngine },
  ) {
    this.engine = options?.engine;
  }

  async discover(criteria: DiscoveryCriteria): Promise<DiscoveryResult[]> {
    const bySupplier = new Map<string, DiscoveryResult>();

    for (const service of this.services) {
      try {
        if ('discover' in service) {
          // Check if it's a SupplierNetworkPort or SupplierDiscoveryService
          const results = await (service as any).discover(criteria);
          if (Array.isArray(results)) {
            for (const r of results) {
              const supplierId = r.supplierId || r.externalRef || 'anon-supplier';
              const matchScore = r.matchScore ?? 70;
              const eligibilityScore = r.eligibilityScore ?? 80;
              const sanitizedReasons = sanitizeCandidateMatchReasons(
                r.matchReasons ?? ['category_match'],
              );
              const source = r.source || r.network || 'LOCAL_REGISTRY';

              const existing = bySupplier.get(supplierId);
              if (!existing || matchScore > existing.matchScore) {
                bySupplier.set(supplierId, {
                  supplierId,
                  eligibilityScore,
                  matchScore,
                  matchReasons: sanitizedReasons,
                  source,
                });
              }
            }
          }
        }
      } catch {
        // Safe isolation: single service failure does not crash composite discovery
        continue;
      }
    }

    return [...bySupplier.values()].sort((a, b) => b.matchScore - a.matchScore);
  }
}
