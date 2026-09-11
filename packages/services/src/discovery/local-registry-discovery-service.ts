import type { SupplierRepository } from '../repositories/interfaces';
import type {
  DiscoveryCriteria,
  DiscoveryResult,
  SupplierDiscoveryService,
} from '../interfaces/supplier-discovery-service';

/**
 * Local registry discovery — source is stored but NEVER used in scoring (INV-044).
 */
export class LocalRegistryDiscoveryService implements SupplierDiscoveryService {
  constructor(private readonly suppliers: SupplierRepository) {}

  async discover(criteria: DiscoveryCriteria): Promise<DiscoveryResult[]> {
    const candidates = await this.suppliers.findActiveByCategory(criteria.category);

    return candidates
      .map((s) => {
        const maxHp = (s.capabilities?.maxHp as number | undefined) ?? 0;
        const reqHp = (criteria.structuredSpecs?.motorCapacityHp as number | undefined) ?? 0;
        const hpOk = reqHp === 0 || maxHp >= reqHp;

        const eligibilityScore = hpOk ? 100 : 0;
        const ratingBoost = (s.ratingAvg ?? 3) * 10;
        const matchScore = hpOk ? Math.min(100, 70 + ratingBoost) : 0;

        return {
          supplierId: s.id,
          eligibilityScore,
          matchScore,
          matchReasons: hpOk
            ? [`category:${criteria.category}`, `maxHp:${maxHp}`]
            : ['ineligible:hp'],
          source: s.source,
        };
      })
      .filter((r) => r.eligibilityScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore);
  }
}
