import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import type {
  CoverageAssessResult,
  GenerationAcquireResult,
  LocationPinCoverageStore,
  PersistedCoverageSupplier,
  ReserveCallsResult,
} from '../../../../packages/services/src/discovery/location-pin-coverage-store.ts';
import type { DiscoveryScopeDescriptor } from '../../../../packages/domain/src/types/supplier-network-refresh.ts';
import { buildLocationPinScopeKey } from '../../../../packages/services/src/discovery/location-pin-coverage-store.ts';

export type CoverageScope = {
  state: string;
  city: string;
  pincode: string;
  category: string;
};

export function buildScopeKey(scope: CoverageScope): string {
  return buildLocationPinScopeKey({
    state: scope.state,
    city: scope.city,
    pincode: scope.pincode,
    category: scope.category,
    discoveryContext: 'SUPERADMIN_PREPARE',
  });
}

export async function rpcAssess(
  client: SupabaseClient,
  scopeKey: string,
  freshnessDays: number,
): Promise<{ status: string; knownSupplierCount: number; ageInDays: number | null }> {
  const { data, error } = await client.rpc('location_pin_coverage_assess', {
    p_scope_key: scopeKey,
    p_freshness_days: freshnessDays,
  });
  if (error) throw error;
  const row = data as Record<string, unknown>;
  return {
    status: String(row.status ?? 'NEVER_DISCOVERED'),
    knownSupplierCount: Number(row.knownSupplierCount ?? 0),
    ageInDays: row.ageInDays == null ? null : Number(row.ageInDays),
  };
}

export async function rpcListSuppliers(client: SupabaseClient, scopeKey: string): Promise<unknown[]> {
  const { data, error } = await client.rpc('location_pin_coverage_list_suppliers', {
    p_scope_key: scopeKey,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function rpcReserveCalls(
  client: SupabaseClient,
  calls: number,
  dailyLimit = 1500,
): Promise<{ allowed: boolean; requestCount: number; remaining: number; error?: string }> {
  const { data, error } = await client.rpc('location_pin_coverage_reserve_google_calls', {
    p_calls: calls,
    p_daily_limit: dailyLimit,
  });
  if (error) throw error;
  const row = data as Record<string, unknown>;
  return {
    allowed: Boolean(row.allowed),
    requestCount: Number(row.requestCount ?? 0),
    remaining: Number(row.remaining ?? 0),
    error: row.error ? String(row.error) : undefined,
  };
}

export async function rpcTryAcquire(
  client: SupabaseClient,
  scopeKey: string,
  lockToken: string,
): Promise<'acquired' | 'wait'> {
  const { data, error } = await client.rpc('location_pin_coverage_try_acquire_generation', {
    p_scope_key: scopeKey,
    p_lock_token: lockToken,
  });
  if (error) throw error;
  return data === 'acquired' ? 'acquired' : 'wait';
}

export async function rpcCompleteGeneration(
  client: SupabaseClient,
  scopeKey: string,
  lockToken: string,
  status: 'completed' | 'failed',
  errorCode?: string,
): Promise<boolean> {
  const { data, error } = await client.rpc('location_pin_coverage_complete_generation', {
    p_scope_key: scopeKey,
    p_lock_token: lockToken,
    p_status: status,
    p_error_code: errorCode ?? null,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function rpcAssertGenerationLock(
  client: SupabaseClient,
  scopeKey: string,
  lockToken: string,
): Promise<boolean> {
  const { data, error } = await client.rpc('location_pin_coverage_assert_generation_lock', {
    p_scope_key: scopeKey,
    p_lock_token: lockToken,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function rpcUpsertSuppliers(
  client: SupabaseClient,
  scope: CoverageScope,
  scopeKey: string,
  suppliers: unknown[],
): Promise<number> {
  const { data, error } = await client.rpc('location_pin_coverage_upsert_suppliers', {
    p_scope_key: scopeKey,
    p_state: scope.state,
    p_city: scope.city,
    p_pincode: scope.pincode,
    p_category: scope.category,
    p_suppliers: suppliers,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export class SupabaseLocationPinCoverageStore implements LocationPinCoverageStore {
  constructor(
    private readonly client: SupabaseClient,
    private readonly freshnessDays = 30,
    private readonly dailyLimit = 1500,
  ) {}

  buildScopeKey(scope: DiscoveryScopeDescriptor): string {
    return buildLocationPinScopeKey(scope);
  }

  async assess(scopeKey: string, freshnessDays: number): Promise<CoverageAssessResult> {
    const row = await rpcAssess(this.client, scopeKey, freshnessDays);
    return {
      status: row.status as CoverageAssessResult['status'],
      knownSupplierCount: row.knownSupplierCount,
      ageInDays: row.ageInDays,
    };
  }

  async listSuppliers(scopeKey: string): Promise<PersistedCoverageSupplier[]> {
    const rows = await rpcListSuppliers(this.client, scopeKey);
    return rows as PersistedCoverageSupplier[];
  }

  async reserveGoogleCalls(calls: number, dailyLimit?: number): Promise<ReserveCallsResult> {
    const row = await rpcReserveCalls(this.client, calls, dailyLimit ?? this.dailyLimit);
    return {
      allowed: row.allowed,
      requestCount: row.requestCount,
      remaining: row.remaining,
      error: row.error,
    };
  }

  async tryAcquireGeneration(scopeKey: string, lockToken: string): Promise<GenerationAcquireResult> {
    return rpcTryAcquire(this.client, scopeKey, lockToken);
  }

  async completeGeneration(
    scopeKey: string,
    lockToken: string,
    status: 'completed' | 'failed',
    errorCode?: string,
  ): Promise<boolean> {
    return rpcCompleteGeneration(this.client, scopeKey, lockToken, status, errorCode);
  }

  async upsertSuppliers(
    scope: DiscoveryScopeDescriptor,
    suppliers: PersistedCoverageSupplier[],
  ): Promise<number> {
    const scopeKey = this.buildScopeKey(scope);
    return rpcUpsertSuppliers(
      this.client,
      {
        state: scope.state,
        city: scope.city,
        pincode: scope.pincode,
        category: scope.category,
      },
      scopeKey,
      suppliers,
    );
  }

  async dropUnreachablePlaces(scope: DiscoveryScopeDescriptor, placeIds: string[]): Promise<number> {
    if (placeIds.length === 0) return 0;
    const scopeKey = this.buildScopeKey(scope);
    const { data, error } = await this.client.rpc('location_pin_coverage_drop_unreachable', {
      p_scope_key: scopeKey,
      p_place_ids: placeIds,
    });
    if (error) throw error;
    return Number(data ?? 0);
  }

  async waitForGenerationIdle(scopeKey: string, maxWaitMs: number): Promise<void> {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      const { data } = await this.client
        .from('location_pin_coverage_generation')
        .select('status')
        .eq('scope_key', scopeKey)
        .maybeSingle();
      if (!data || data.status !== 'in_progress') return;
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  async assertGenerationLock(scopeKey: string, lockToken: string): Promise<boolean> {
    return rpcAssertGenerationLock(this.client, scopeKey, lockToken);
  }
}
