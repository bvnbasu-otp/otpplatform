import type { DiscoveryScopeDescriptor, ScopeFreshnessStatus } from '@otp/domain';

export interface ScopeFreshnessRecord {
  lastSuccessfulDiscoveryAt: number | null;
  supplierCount: number;
  status: ScopeFreshnessStatus;
}

/**
 * Single authoritative PIN×category freshness (reconciles managed scope registry + adapter cache).
 */
export interface LocationCoverageFreshnessAuthority {
  getManagedScopeKey(scope: DiscoveryScopeDescriptor): string;
  getFreshnessRecord(scopeKey: string): ScopeFreshnessRecord | undefined;
  isScopeFresh(scopeKey: string, freshnessWindowDays: number): boolean;
  markSuccessfulDiscovery(scopeKey: string, supplierCount: number, at?: number): void;
}
