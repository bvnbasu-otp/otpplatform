import {
  type DiscoveryScopeDescriptor,
  type ScopeCoverageReport,
  type ScopeFreshnessStatus,
  SupplierTruthfulVerificationStage,
} from '@otp/domain';
import { GooglePlacesDiscoveryAdapter } from '../gis/google-places-discovery-adapter';
import { runManagedGooglePlacesDiscovery } from './google-places-managed-coverage';
import type {
  LocationPinCoverageStore,
  PersistedCoverageSupplier,
} from './location-pin-coverage-store';

export interface LocationPinCoverageRequest {
  state: string;
  city: string;
  pincode: string;
  category: string;
  forceRefresh?: boolean;
  executeDiscovery?: boolean;
}

export interface LocationPinCoverageResponse {
  ok: boolean;
  scopeKey: string;
  status: ScopeFreshnessStatus;
  externalCallsExecuted: number;
  knownSuppliersCount: number;
  message: string;
  error?: string;
  report: ScopeCoverageReport;
}

export interface LocationPinCoverageOrchestratorDeps {
  store: LocationPinCoverageStore;
  freshnessWindowDays: number;
  dailyLimit: number;
  googleApiKey?: string;
  serverFetchFn?: (url: string, init?: RequestInit) => Promise<unknown>;
  googlePlacesAdapter?: GooglePlacesDiscoveryAdapter;
  allowLegacyMockDiscovery?: boolean;
  mockDiscoveryFn?: (scope: DiscoveryScopeDescriptor) => PersistedCoverageSupplier[];
}

const DEFAULT_CATEGORY = 'General Commercial Supplies';

function toScope(input: LocationPinCoverageRequest): DiscoveryScopeDescriptor {
  return {
    state: (input.state ?? 'Karnataka').trim(),
    city: (input.city ?? 'Bengaluru').trim(),
    pincode: input.pincode.trim(),
    category: (input.category ?? DEFAULT_CATEGORY).trim(),
    discoveryContext: 'SUPERADMIN_PREPARE',
  };
}

function suppliersToReport(
  scope: DiscoveryScopeDescriptor,
  freshness: { status: ScopeFreshnessStatus; knownSupplierCount: number; ageInDays: number | null },
  suppliers: PersistedCoverageSupplier[],
): ScopeCoverageReport {
  const stageBreakdown: Record<string, number> = {
    DISCOVERED_IN_AREA: 0,
    DETAILS_AVAILABLE: 0,
    OTP_REGISTERED: 0,
    OTP_VERIFIED: 0,
    GST_VERIFIED: 0,
  };
  for (const s of suppliers) {
    const stage = s.verificationStage ?? 'DISCOVERED_IN_AREA';
    stageBreakdown[stage] = (stageBreakdown[stage] ?? 0) + 1;
  }
  return {
    scope,
    freshness: {
      scope,
      status: freshness.status,
      knownSupplierCount: freshness.knownSupplierCount,
      lastDiscoveredAt: freshness.ageInDays != null ? new Date(Date.now() - freshness.ageInDays * 86400000).toISOString() : null,
      ageInDays: freshness.ageInDays,
      stageBreakdown: stageBreakdown as ScopeCoverageReport['freshness']['stageBreakdown'],
      canReuseCachedNetwork: freshness.status === 'FRESH' || freshness.knownSupplierCount > 0,
      requiresExternalDiscovery: freshness.status !== 'FRESH',
      explanation: `Coverage status ${freshness.status} for ${scope.pincode}.`,
    },
    suppliers: suppliers.map((s) => {
      const nowIso = new Date().toISOString();
      return {
        id: s.placeId,
        businessName: s.businessName,
        verificationStage: s.verificationStage as SupplierTruthfulVerificationStage,
        firstDiscoveredAt: nowIso,
        lastSeenAt: nowIso,
        lastRefreshedAt: nowIso,
        provenanceProviders: s.provenanceProviders,
        locations: s.locations as unknown as ScopeCoverageReport['suppliers'][0]['locations'],
        categories: s.categories as unknown as ScopeCoverageReport['suppliers'][0]['categories'],
        observationsCount: s.observationsCount,
        isOtpRegistered: s.isOtpRegistered,
        isGstVerified: s.isGstVerified,
        complianceStandards: s.complianceStandards as unknown as ScopeCoverageReport['suppliers'][0]['complianceStandards'],
      };
    }),
    summary: {
      totalKnown: suppliers.length,
      discoveredInArea: suppliers.filter((s) => s.verificationStage === 'DISCOVERED_IN_AREA').length,
      detailsAvailable: suppliers.filter((s) => s.verificationStage === 'DETAILS_AVAILABLE').length,
      otpRegistered: 0,
      otpVerified: 0,
      gstVerified: suppliers.filter((s) => s.isGstVerified).length,
      standardCompliantCount: 0,
    },
  };
}

function rawToPersisted(
  scope: DiscoveryScopeDescriptor,
  raw: {
    placeId: string;
    businessName: string;
    formattedAddress?: string;
    phone?: string;
    isGstKnown?: boolean;
    isDetailsComplete?: boolean;
  },
): PersistedCoverageSupplier {
  return {
    placeId: raw.placeId,
    businessName: raw.businessName,
    verificationStage: SupplierTruthfulVerificationStage.DISCOVERED_IN_AREA,
    provenanceProviders: ['GOOGLE_PLACES'],
    locations: [
      {
        pincode: scope.pincode,
        city: scope.city,
        state: scope.state,
        isPrimary: true,
        serviceRadiusKm: 25,
        addressLine: raw.formattedAddress,
      },
    ],
    categories: [{ categoryName: scope.category, isPrimary: true, confidenceScore: 75 }],
    observationsCount: 1,
    isOtpRegistered: false,
    isGstVerified: Boolean(raw.isGstKnown),
    complianceStandards: [],
  };
}

export async function runAuthoritativeLocationPinCoverage(
  input: LocationPinCoverageRequest,
  deps: LocationPinCoverageOrchestratorDeps,
): Promise<LocationPinCoverageResponse> {
  const scope = toScope(input);
  const scopeKey = deps.store.buildScopeKey(scope);
  const executeDiscovery = input.executeDiscovery !== false;
  const forceRefresh = Boolean(input.forceRefresh);

  if (!/^\d{6}$/.test(scope.pincode)) {
    return {
      ok: false,
      scopeKey,
      status: 'NEVER_DISCOVERED',
      externalCallsExecuted: 0,
      knownSuppliersCount: 0,
      message: 'Pincode must be 6 digits.',
      error: 'VALIDATION',
      report: toScopeReport(scope, 'NEVER_DISCOVERED', 0, []),
    };
  }

  let assessed = await deps.store.assess(scopeKey, deps.freshnessWindowDays);
  let suppliers = await deps.store.listSuppliers(scopeKey);

  if (!executeDiscovery) {
    return {
      ok: true,
      scopeKey,
      status: assessed.status,
      externalCallsExecuted: 0,
      knownSuppliersCount: assessed.knownSupplierCount,
      message: `Coverage status assessed: ${assessed.status}.`,
      report: toSuppliersReport(scope, assessed, suppliers),
    };
  }

  if (assessed.status === 'FRESH' && !forceRefresh) {
    return {
      ok: true,
      scopeKey,
      status: 'FRESH',
      externalCallsExecuted: 0,
      knownSuppliersCount: assessed.knownSupplierCount,
      message: `Scope already fresh (${assessed.knownSupplierCount} suppliers). External calls bypassed.`,
      report: toSuppliersReport(scope, assessed, suppliers),
    };
  }

  const lockToken = crypto.randomUUID();
  let acquired = await deps.store.tryAcquireGeneration(scopeKey, lockToken);
  if (acquired === 'wait') {
    await deps.store.waitForGenerationIdle(scopeKey, 5000);
    assessed = await deps.store.assess(scopeKey, deps.freshnessWindowDays);
    suppliers = await deps.store.listSuppliers(scopeKey);
    if (assessed.status === 'FRESH' && !forceRefresh) {
      return {
        ok: true,
        scopeKey,
        status: assessed.status,
        externalCallsExecuted: 0,
        knownSuppliersCount: assessed.knownSupplierCount,
        message: 'Joined in-flight generation; reused fresh coverage.',
        report: toSuppliersReport(scope, assessed, suppliers),
      };
    }
    acquired = await deps.store.tryAcquireGeneration(scopeKey, lockToken);
    if (acquired === 'wait') {
      suppliers = await deps.store.listSuppliers(scopeKey);
      assessed = await deps.store.assess(scopeKey, deps.freshnessWindowDays);
      return {
        ok: suppliers.length > 0,
        scopeKey,
        status: assessed.status,
        externalCallsExecuted: 0,
        knownSuppliersCount: assessed.knownSupplierCount,
        message: 'Generation already in progress; returned durable coverage snapshot.',
        report: toSuppliersReport(scope, assessed, suppliers),
      };
    }
  }

  const priorCount = suppliers.length;
  const estimatedCalls = 1 + 3;
  const quotaProbe = await deps.store.reserveGoogleCalls(0, deps.dailyLimit);
  if (quotaProbe.remaining < estimatedCalls) {
    await deps.store.completeGeneration(scopeKey, lockToken, 'failed', 'QUOTA_EXHAUSTED');
    return quotaFailure(scope, scopeKey, assessed, suppliers, priorCount);
  }

  let externalCallsExecuted = 0;
  const discovered: PersistedCoverageSupplier[] = [];

  try {
    const apiKey = deps.googleApiKey?.trim();
    const adapter = deps.googlePlacesAdapter ?? new GooglePlacesDiscoveryAdapter();
    if (apiKey && deps.serverFetchFn) {
      const assertLockHeld = async (): Promise<boolean> =>
        deps.store.assertGenerationLock(scopeKey, lockToken);

      const geocodeReserve = await deps.store.reserveGoogleCalls(1, deps.dailyLimit);
      if (!geocodeReserve.allowed) {
        await deps.store.completeGeneration(scopeKey, lockToken, 'failed', 'QUOTA_EXHAUSTED');
        return quotaFailure(scope, scopeKey, assessed, suppliers, priorCount);
      }
      if (!(await assertLockHeld())) {
        await deps.store.completeGeneration(scopeKey, lockToken, 'failed', 'LOCK_LOST');
        return {
          ok: priorCount > 0,
          scopeKey,
          status: assessed.status,
          externalCallsExecuted: 0,
          knownSuppliersCount: priorCount,
          message: 'Generation lock lost before geocode; aborted with zero new Google calls.',
          error: 'LOCK_LOST',
          report: toSuppliersReport(scope, assessed, suppliers),
        };
      }

      const managed = await runManagedGooglePlacesDiscovery(scope, adapter, {
        apiKey,
        fetchFn: deps.serverFetchFn,
        forceRefresh,
        maxQueries: 3,
        orchestratorAuthorized: true,
        assertLockHeld,
        reserveCallFn: async () => {
          if (!(await assertLockHeld())) {
            return false;
          }
          const r = await deps.store.reserveGoogleCalls(1, deps.dailyLimit);
          return r.allowed;
        },
      });
      externalCallsExecuted = managed.externalCallsUsed;

      if (managed.errorCode === 'GEOCODE_FAILED') {
        await deps.store.completeGeneration(scopeKey, lockToken, 'failed', 'GEOCODE_FAILED');
        return {
          ok: false,
          scopeKey,
          status: assessed.status,
          externalCallsExecuted,
          knownSuppliersCount: priorCount,
          message: managed.explanation,
          error: 'GEOCODE_FAILED',
          report: toSuppliersReport(scope, assessed, suppliers),
        };
      }

      if (managed.quotaExhausted || managed.errorCode === 'QUOTA_EXHAUSTED') {
        await deps.store.completeGeneration(scopeKey, lockToken, 'failed', 'QUOTA_EXHAUSTED');
        return quotaFailure(scope, scopeKey, assessed, suppliers, priorCount);
      }

      if (managed.authFailure || managed.errorCode === 'AUTH_FAILURE') {
        await deps.store.completeGeneration(scopeKey, lockToken, 'failed', 'AUTH_FAILURE');
        return {
          ok: false,
          scopeKey,
          status: assessed.status,
          externalCallsExecuted,
          knownSuppliersCount: priorCount,
          message: managed.explanation,
          error: 'PROVIDER_UNAVAILABLE',
          report: toSuppliersReport(scope, assessed, suppliers),
        };
      }

      for (const raw of managed.rawCandidates) {
        if (!raw.placeId) continue;
        discovered.push(rawToPersisted(scope, raw));
      }
    } else if (deps.allowLegacyMockDiscovery && deps.mockDiscoveryFn) {
      externalCallsExecuted = 1;
      const reserve = await deps.store.reserveGoogleCalls(externalCallsExecuted, deps.dailyLimit);
      if (!reserve.allowed) {
        await deps.store.completeGeneration(scopeKey, lockToken, 'failed', 'QUOTA_EXHAUSTED');
        return quotaFailure(scope, scopeKey, assessed, suppliers, priorCount);
      }
      discovered.push(...deps.mockDiscoveryFn(scope));
    } else {
      await deps.store.completeGeneration(scopeKey, lockToken, 'failed', 'PROVIDER_UNAVAILABLE');
      return {
        ok: false,
        scopeKey,
        status: assessed.status,
        externalCallsExecuted: 0,
        knownSuppliersCount: priorCount,
        message: 'Google Places managed discovery is not configured (credentials/server fetch required).',
        error: 'PROVIDER_UNAVAILABLE',
        report: toSuppliersReport(scope, assessed, suppliers),
      };
    }

    if (discovered.length > 0) {
      await deps.store.upsertSuppliers(scope, discovered);
    }

    await deps.store.completeGeneration(
      scopeKey,
      lockToken,
      discovered.length > 0 ? 'completed' : 'failed',
      discovered.length > 0 ? undefined : 'ZERO_RESULTS',
    );

    assessed = await deps.store.assess(scopeKey, deps.freshnessWindowDays);
    suppliers = await deps.store.listSuppliers(scopeKey);

    return {
      ok: discovered.length > 0 || priorCount > 0,
      scopeKey,
      status: assessed.status,
      externalCallsExecuted,
      knownSuppliersCount: suppliers.length,
      message:
        discovered.length > 0
          ? `Discovered ${discovered.length} Google Places suppliers for ${scope.pincode}.`
          : priorCount > 0
            ? 'Refresh returned zero new suppliers; prior coverage preserved.'
            : 'Discovery completed with zero suppliers (not cached as fresh).',
      report: toSuppliersReport(scope, assessed, suppliers),
    };
  } catch (err) {
    await deps.store.completeGeneration(scopeKey, lockToken, 'failed', 'PROVIDER_ERROR');
    return {
      ok: priorCount > 0,
      scopeKey,
      status: assessed.status,
      externalCallsExecuted,
      knownSuppliersCount: priorCount,
      message: err instanceof Error ? err.message : 'Coverage failed',
      error: 'PROVIDER_ERROR',
      report: toSuppliersReport(scope, assessed, suppliers),
    };
  }
}

function quotaFailure(
  scope: DiscoveryScopeDescriptor,
  scopeKey: string,
  assessed: { status: ScopeFreshnessStatus; knownSupplierCount: number; ageInDays: number | null },
  suppliers: PersistedCoverageSupplier[],
  priorCount: number,
): LocationPinCoverageResponse {
  return {
    ok: false,
    scopeKey,
    status: assessed.status,
    externalCallsExecuted: 0,
    knownSuppliersCount: Math.max(priorCount, suppliers.length),
    message: 'Daily Google Places budget exhausted.',
    error: 'QUOTA_EXHAUSTED',
    report: toSuppliersReport(scope, assessed, suppliers),
  };
}

function toScopeReport(
  scope: DiscoveryScopeDescriptor,
  status: ScopeFreshnessStatus,
  count: number,
  suppliers: PersistedCoverageSupplier[],
): ScopeCoverageReport {
  return toSuppliersReport(scope, { status, knownSupplierCount: count, ageInDays: null }, suppliers);
}

function toSuppliersReport(
  scope: DiscoveryScopeDescriptor,
  assessed: { status: ScopeFreshnessStatus; knownSupplierCount: number; ageInDays: number | null },
  suppliers: PersistedCoverageSupplier[],
): ScopeCoverageReport {
  return suppliersToReport(scope, assessed, suppliers);
}
