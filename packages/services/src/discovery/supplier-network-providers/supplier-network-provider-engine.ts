import {
  type NormalizedDiscoverySupplier,
  type PossibleSupplierMatch,
  type SupplierDiscoveryRequest,
  type SupplierNetworkProvider,
  type SupplierNetworkProviderResult,
  mapSourceKindToBuyerCountBucket,
} from '@otp/domain';

export interface SupplierDiscoveryAggregate {
  results: SupplierNetworkProviderResult[];
  merged: NormalizedDiscoverySupplier[];
  possibleMatches: PossibleSupplierMatch[];
  buyerCounts: {
    otpVerified: number;
    network: number;
    local: number;
    total: number;
  };
  allProvidersFailed: boolean;
  discoveryTemporarilyUnavailable: boolean;
}

function strongIdKey(row: NormalizedDiscoverySupplier): string | null {
  if (row.gstin) return `gstin:${row.gstin.toUpperCase()}`;
  if (row.otpSupplierId) return `otp:${row.otpSupplierId}`;
  if (row.ondcProviderId) return `ondc:${row.ondcProviderId}`;
  if (row.placeId) return `place:${row.placeId}`;
  if (row.phone) return `phone:${row.phone.replace(/\D/g, '').slice(-10)}`;
  if (row.domain) return `domain:${row.domain.toLowerCase()}`;
  return null;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export class SupplierNetworkProviderEngine {
  constructor(private readonly providers: SupplierNetworkProvider[]) {}

  async discover(request: SupplierDiscoveryRequest): Promise<SupplierDiscoveryAggregate> {
    const results = await Promise.all(this.providers.map((p) => p.discover(request)));
    const merged: NormalizedDiscoverySupplier[] = [];
    const seenStrong = new Set<string>();
    const possibleMatches: PossibleSupplierMatch[] = [];
    const nameIndex = new Map<string, NormalizedDiscoverySupplier>();

    for (const result of results) {
      for (const cand of result.candidates) {
        const key = strongIdKey(cand);
        if (key) {
          if (seenStrong.has(key)) {
            continue;
          }
          seenStrong.add(key);
          merged.push(cand);
          continue;
        }

        const nameKey = normalizeName(cand.businessName);
        const prior = nameIndex.get(nameKey);
        if (prior && prior.sourceKind !== cand.sourceKind) {
          possibleMatches.push({
            leftRef: prior.externalRef,
            rightRef: cand.externalRef,
            factors: [{ code: 'similar_name', label: 'Similar business name across sources' }],
            verdict: 'POSSIBLE_MATCH',
          });
          merged.push(cand);
          continue;
        }

        nameIndex.set(nameKey, cand);
        merged.push(cand);
      }
    }

    const buyerCounts = { otpVerified: 0, network: 0, local: 0, total: merged.length };
    for (const row of merged) {
      const bucket = mapSourceKindToBuyerCountBucket(row.sourceKind);
      if (bucket === 'otpVerified') buyerCounts.otpVerified += 1;
      else if (bucket === 'network') buyerCounts.network += 1;
      else buyerCounts.local += 1;
    }

    const attempted = results.length;
    const hardFailures = results.filter(
      (r) => r.candidates.length === 0 && r.integrationState !== 'NOT_CONFIGURED',
    ).length;
    const allProvidersFailed = attempted > 0 && merged.length === 0 && hardFailures === attempted;

    return {
      results,
      merged,
      possibleMatches,
      buyerCounts,
      allProvidersFailed,
      discoveryTemporarilyUnavailable: allProvidersFailed,
    };
  }
}
