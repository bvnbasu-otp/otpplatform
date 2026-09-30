import type { DiscoveryScopeDescriptor, ScopeFreshnessStatus } from '@otp/domain';

export interface PersistedCoverageSupplier {
  placeId: string;
  businessName: string;
  verificationStage: string;
  provenanceProviders: string[];
  locations: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
  observationsCount: number;
  isOtpRegistered: boolean;
  isGstVerified: boolean;
  complianceStandards: string[];
}

export interface CoverageAssessResult {
  status: ScopeFreshnessStatus;
  knownSupplierCount: number;
  ageInDays: number | null;
}

export interface ReserveCallsResult {
  allowed: boolean;
  requestCount: number;
  remaining: number;
  error?: string;
}

export type GenerationAcquireResult = 'acquired' | 'wait';

export interface LocationPinCoverageStore {
  buildScopeKey(scope: DiscoveryScopeDescriptor): string;
  assess(scopeKey: string, freshnessDays: number): Promise<CoverageAssessResult>;
  listSuppliers(scopeKey: string): Promise<PersistedCoverageSupplier[]>;
  reserveGoogleCalls(calls: number, dailyLimit?: number): Promise<ReserveCallsResult>;
  tryAcquireGeneration(scopeKey: string, lockToken: string): Promise<GenerationAcquireResult>;
  completeGeneration(
    scopeKey: string,
    lockToken: string,
    status: 'completed' | 'failed',
    errorCode?: string,
  ): Promise<boolean>;
  upsertSuppliers(
    scope: DiscoveryScopeDescriptor,
    suppliers: PersistedCoverageSupplier[],
  ): Promise<number>;
  waitForGenerationIdle(scopeKey: string, maxWaitMs: number): Promise<void>;
  /** Re-check generation lock before each billable Google HTTP (prevents stale-lock double spend). */
  assertGenerationLock(scopeKey: string, lockToken: string): Promise<boolean>;
}

/**
 * Production default when Postgres RPC authority (00224) is not wired: fail closed on billable work.
 */
export class FailClosedLocationPinCoverageStore implements LocationPinCoverageStore {
  buildScopeKey(scope: DiscoveryScopeDescriptor): string {
    return buildLocationPinScopeKey(scope);
  }

  async assess(): Promise<CoverageAssessResult> {
    return { status: 'NEVER_DISCOVERED', knownSupplierCount: 0, ageInDays: null };
  }

  async listSuppliers(): Promise<PersistedCoverageSupplier[]> {
    return [];
  }

  async reserveGoogleCalls(calls: number, dailyLimit = 1500): Promise<ReserveCallsResult> {
    if (calls <= 0) {
      return { allowed: true, requestCount: 0, remaining: dailyLimit };
    }
    return {
      allowed: false,
      requestCount: 0,
      remaining: 0,
      error: 'AUTHORITY_UNAVAILABLE',
    };
  }

  async tryAcquireGeneration(_scopeKey: string, _lockToken: string): Promise<GenerationAcquireResult> {
    return 'acquired';
  }

  async completeGeneration(): Promise<boolean> {
    return false;
  }

  async upsertSuppliers(): Promise<number> {
    return 0;
  }

  async waitForGenerationIdle(): Promise<void> {}

  async assertGenerationLock(): Promise<boolean> {
    return false;
  }
}

export function buildLocationPinScopeKey(scope: DiscoveryScopeDescriptor): string {
  return `${scope.state.trim().toLowerCase()}:${scope.city.trim().toLowerCase()}:${scope.pincode.trim()}:${scope.category.trim().toLowerCase()}`;
}

/**
 * Durable semantics for tests and single-node fallback: generation lock uses a unique key row
 * (second concurrent acquire returns 'wait' until release).
 */
export class InMemoryLocationPinCoverageStore implements LocationPinCoverageStore {
  private readonly scopes = new Map<
    string,
    { lastSuccessfulDiscoveryAt: number | null; supplierCount: number }
  >();
  private readonly suppliersByScope = new Map<string, Map<string, PersistedCoverageSupplier>>();
  private readonly generations = new Map<
    string,
    { lockToken: string; status: 'in_progress' | 'completed' | 'failed'; startedAt: number }
  >();
  private dailyUsage = 0;

  buildScopeKey(scope: DiscoveryScopeDescriptor): string {
    return buildLocationPinScopeKey(scope);
  }

  async assess(scopeKey: string, freshnessDays: number): Promise<CoverageAssessResult> {
    const row = this.scopes.get(scopeKey);
    if (!row || !row.lastSuccessfulDiscoveryAt || row.supplierCount <= 0) {
      return { status: 'NEVER_DISCOVERED', knownSupplierCount: 0, ageInDays: null };
    }
    const ageInDays = Math.floor((Date.now() - row.lastSuccessfulDiscoveryAt) / 86400000);
    const status: ScopeFreshnessStatus =
      ageInDays < freshnessDays ? 'FRESH' : 'REFRESH_ELIGIBLE';
    return { status, knownSupplierCount: row.supplierCount, ageInDays };
  }

  async listSuppliers(scopeKey: string): Promise<PersistedCoverageSupplier[]> {
    const map = this.suppliersByScope.get(scopeKey);
    return map ? [...map.values()] : [];
  }

  async reserveGoogleCalls(calls: number, dailyLimit = 1500): Promise<ReserveCallsResult> {
    if (calls <= 0) {
      return { allowed: true, requestCount: this.dailyUsage, remaining: dailyLimit - this.dailyUsage };
    }
    if (this.dailyUsage + calls > dailyLimit) {
      return {
        allowed: false,
        requestCount: this.dailyUsage,
        remaining: Math.max(0, dailyLimit - this.dailyUsage),
        error: 'QUOTA_EXHAUSTED',
      };
    }
    this.dailyUsage += calls;
    return {
      allowed: true,
      requestCount: this.dailyUsage,
      remaining: dailyLimit - this.dailyUsage,
    };
  }

  async tryAcquireGeneration(scopeKey: string, lockToken: string): Promise<GenerationAcquireResult> {
    const existing = this.generations.get(scopeKey);
    if (existing?.status === 'in_progress') {
      return 'wait';
    }
    this.generations.set(scopeKey, { lockToken, status: 'in_progress', startedAt: Date.now() });
    return 'acquired';
  }

  async completeGeneration(
    scopeKey: string,
    lockToken: string,
    status: 'completed' | 'failed',
  ): Promise<boolean> {
    const row = this.generations.get(scopeKey);
    if (!row || row.lockToken !== lockToken || row.status !== 'in_progress') {
      return false;
    }
    this.generations.set(scopeKey, { ...row, status });
    return true;
  }

  async upsertSuppliers(
    scope: DiscoveryScopeDescriptor,
    suppliers: PersistedCoverageSupplier[],
  ): Promise<number> {
    const scopeKey = this.buildScopeKey(scope);
    const byPlace = this.suppliersByScope.get(scopeKey) ?? new Map<string, PersistedCoverageSupplier>();
    for (const s of suppliers) {
      if (!s.placeId) continue;
      byPlace.set(s.placeId, s);
    }
    this.suppliersByScope.set(scopeKey, byPlace);
    const count = byPlace.size;
    if (count > 0) {
      this.scopes.set(scopeKey, { lastSuccessfulDiscoveryAt: Date.now(), supplierCount: count });
    }
    return count;
  }

  async waitForGenerationIdle(scopeKey: string, maxWaitMs: number): Promise<void> {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      const row = this.generations.get(scopeKey);
      if (!row || row.status !== 'in_progress') {
        return;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  async assertGenerationLock(scopeKey: string, lockToken: string): Promise<boolean> {
    const row = this.generations.get(scopeKey);
    return row?.status === 'in_progress' && row.lockToken === lockToken;
  }

  /** Test helper: exhaust daily budget */
  setDailyUsage(count: number): void {
    this.dailyUsage = count;
  }

  /** Test helper: age scope for expiry */
  setScopeAge(scopeKey: string, ageMs: number): void {
    const row = this.scopes.get(scopeKey);
    if (!row) return;
    row.lastSuccessfulDiscoveryAt = Date.now() - ageMs;
  }
}
