/**
 * OTP: Managed Supplier Network Refresh, Controlled Discovery & Location Pre-Population Service
 *
 * Implements Stage R2-07 Core Directives:
 * 1. 30-Day Configurable Supplier Data Refresh Policy.
 * 2. Intelligent & Quota-Aware Discovery with Demand-Priority Engine.
 * 3. New Buyer Onboarding Pre-Warm Engine.
 * 4. Superadmin Location Pre-Population Console backend logic.
 * 5. Superadmin & Founder Discovery Telemetry Aggregator.
 * 6. Relational Discovery Observation & Provenance Tracking (Zero Data Loss).
 */

import {
  type DiscoveryScopeDescriptor,
  type DiscoveryScopeFreshnessAssessment,
  type ScopeFreshnessStatus,
  type ScopeCoverageReport,
  type NetworkSupplierEntity,
  type NetworkSupplierLocation,
  type NetworkSupplierCategory,
  type NetworkDiscoveryObservation,
  type SupplierNetworkRefreshPolicyConfig,
  type ProviderQuotaBudgetConfig,
  type QuotaEvaluationResult,
  type DiscoveryPriorityLevel,
  DEFAULT_SUPPLIER_REFRESH_POLICY,
  DEFAULT_PROVIDER_BUDGET_CONFIGS,
  SupplierTruthfulVerificationStage,
  IndianProcurementStandardsEvaluator,
} from '@otp/domain';
import type { Repositories } from '../repositories/interfaces';
import type { AuditAppService } from './audit-service';
import type { ActorContext } from '../types/actor-context';
import { GooglePlacesDiscoveryAdapter } from '../gis/google-places-discovery-adapter';
import { isVitestMockDiscoveryAllowed } from '../discovery/location-pin-coverage-request-auth';
import type {
  LocationCoverageFreshnessAuthority,
  ScopeFreshnessRecord,
} from '../discovery/location-coverage-freshness-authority';
import type { SupplierNetworkEngine } from '../discovery/supplier-network-engine';
import { runAuthoritativeLocationPinCoverage } from '../discovery/location-pin-coverage-orchestrator';
import {
  readPersistedCoveragePhone,
  redactOperationalPhone,
} from '../discovery/supplier-phone-visibility';
import {
  FailClosedLocationPinCoverageStore,
  InMemoryLocationPinCoverageStore,
  type LocationPinCoverageStore,
  type PersistedCoverageSupplier,
} from '../discovery/location-pin-coverage-store';

export interface PrepareLocationParams {
  state: string;
  city: string;
  pincode: string;
  category: string;
  forceRefresh?: boolean;
  /** When false, assess coverage only (zero Google calls). Default true for prepare flows. */
  executeDiscovery?: boolean;
  bypassSuperadminApproval?: boolean;
}

export interface PrepareLocationResult {
  ok: boolean;
  scopeKey: string;
  status: ScopeFreshnessStatus;
  externalCallsExecuted: number;
  knownSuppliersCount: number;
  newSuppliersDiscovered: number;
  updatedSuppliersCount: number;
  report: ScopeCoverageReport;
  quotaImpact: {
    callsUsed: number;
    dailyRemaining: number;
  };
  message: string;
  error?: string;
}

export interface SupplierNetworkTelemetrySnapshot {
  generatedAt: string;
  coverage: {
    totalActivatedPincodes: number;
    totalActivatedCities: number;
    totalCategoriesCovered: number;
    totalSuppliersInNetwork: number;
  };
  freshness: {
    freshUnder30Days: number;
    refreshEligibleStale: number;
    neverDiscoveredScopes: number;
  };
  population: {
    discoveredInArea: number;
    detailsAvailable: number;
    otpRegistered: number;
    otpVerified: number;
    gstVerified: number;
    inactiveCount: number;
    duplicateCandidatesDetected: number;
  };
  providerUsage: {
    todayRequests: number;
    monthRequests: number;
    remainingDailyBudget: number;
    failedRequests: number;
    cacheHitRatePercent: number;
    externalDiscoveryRatePercent: number;
    buyerDemandReservations: number;
    superadminProactiveCalls: number;
  };
  growth: {
    buyerDrivenDiscoveriesCount: number;
    superadminPrewarmedCount: number;
    rfqsReusingNetworkZeroCalls: number;
    organicConversionRatePercent: number;
  };
}

export interface ManagedSupplierNetworkServiceOptions {
  googlePlacesAdapter?: GooglePlacesDiscoveryAdapter;
  supplierNetworkEngine?: SupplierNetworkEngine;
  serverFetchFn?: (url: string, init?: RequestInit) => Promise<unknown>;
  googleApiKey?: string;
  allowLegacyMockDiscovery?: boolean;
  coverageStore?: LocationPinCoverageStore;
}

export class ManagedSupplierNetworkService implements LocationCoverageFreshnessAuthority {
  private readonly refreshPolicy: SupplierNetworkRefreshPolicyConfig;
  private readonly providerBudgets: Map<string, ProviderQuotaBudgetConfig>;
  private readonly knownScopes = new Map<string, { lastDiscoveredAt: number; count: number }>();
  private readonly suppliers = new Map<string, NetworkSupplierEntity>();
  private readonly observations: NetworkDiscoveryObservation[] = [];
  private googlePlacesAdapter?: GooglePlacesDiscoveryAdapter;
  private readonly supplierNetworkEngine?: SupplierNetworkEngine;
  private readonly serverFetchFn?: (url: string, init?: RequestInit) => Promise<unknown>;
  private readonly googleApiKey?: string;
  private readonly allowLegacyMockDiscovery: boolean;
  private readonly coverageStore: LocationPinCoverageStore;
  private readonly generationInFlight = new Map<string, Promise<PrepareLocationResult>>();
  private dailyUsageCount = 0;
  private monthlyUsageCount = 0;
  private cacheHits = 0;
  private externalCalls = 0;
  private buyerDemandDiscoveries = 0;
  private superadminDiscoveries = 0;
  private rfqsZeroCallsReused = 0;

  constructor(
    private readonly repos?: Partial<Repositories>,
    private readonly audit?: AuditAppService,
    policyConfig?: Partial<SupplierNetworkRefreshPolicyConfig>,
    providerBudgets?: Record<string, ProviderQuotaBudgetConfig>,
    options?: ManagedSupplierNetworkServiceOptions,
  ) {
    this.refreshPolicy = { ...DEFAULT_SUPPLIER_REFRESH_POLICY, ...policyConfig };
    this.providerBudgets = new Map(
      Object.entries(providerBudgets ?? DEFAULT_PROVIDER_BUDGET_CONFIGS)
    );
    this.googlePlacesAdapter = options?.googlePlacesAdapter;
    this.supplierNetworkEngine = options?.supplierNetworkEngine;
    this.serverFetchFn = options?.serverFetchFn;
    this.googleApiKey = options?.googleApiKey;
    this.allowLegacyMockDiscovery =
      options?.allowLegacyMockDiscovery ?? (process.env.VITEST === 'true' && isVitestMockDiscoveryAllowed());
    this.coverageStore =
      options?.coverageStore ??
      (process.env.VITEST === 'true'
        ? new InMemoryLocationPinCoverageStore()
        : new FailClosedLocationPinCoverageStore());
  }

  /** Exposes authoritative store for GAP-01 tests (budget, lock, freshness). */
  getAuthoritativeCoverageStore(): LocationPinCoverageStore {
    return this.coverageStore;
  }

  setGooglePlacesAdapter(adapter: GooglePlacesDiscoveryAdapter): void {
    this.googlePlacesAdapter = adapter;
  }

  getManagedScopeKey(scope: DiscoveryScopeDescriptor): string {
    return this.getScopeKey(scope);
  }

  getFreshnessRecord(scopeKey: string): ScopeFreshnessRecord | undefined {
    const entry = this.knownScopes.get(scopeKey);
    if (!entry) return undefined;
    const ageInDays = Math.floor((Date.now() - entry.lastDiscoveredAt) / (1000 * 60 * 60 * 24));
    const status: ScopeFreshnessStatus =
      ageInDays < this.refreshPolicy.freshnessWindowDays ? 'FRESH' : 'REFRESH_ELIGIBLE';
    return {
      lastSuccessfulDiscoveryAt: entry.lastDiscoveredAt,
      supplierCount: entry.count,
      status,
    };
  }

  isScopeFresh(scopeKey: string, freshnessWindowDays: number): boolean {
    const entry = this.knownScopes.get(scopeKey);
    if (!entry || entry.count <= 0) return false;
    const ageInDays = Math.floor((Date.now() - entry.lastDiscoveredAt) / (1000 * 60 * 60 * 24));
    return ageInDays < freshnessWindowDays;
  }

  markSuccessfulDiscovery(scopeKey: string, supplierCount: number, at = Date.now()): void {
    if (supplierCount <= 0) return;
    this.knownScopes.set(scopeKey, { lastDiscoveredAt: at, count: supplierCount });
  }

  public getScopeKey(scope: DiscoveryScopeDescriptor): string {
    return `${scope.state.trim().toLowerCase()}:${scope.city.trim().toLowerCase()}:${scope.pincode.trim()}:${scope.category.trim().toLowerCase()}`;
  }

  /**
   * 1. Assess Freshness of a given Scope (Location + Category).
   */
  public assessScopeFreshness(scope: DiscoveryScopeDescriptor): DiscoveryScopeFreshnessAssessment {
    const key = this.getScopeKey(scope);
    const scopeData = this.knownScopes.get(key);

    const stageBreakdown: Record<SupplierTruthfulVerificationStage, number> = {
      DISCOVERED_IN_AREA: 0,
      DETAILS_AVAILABLE: 0,
      OTP_REGISTERED: 0,
      OTP_VERIFIED: 0,
      GST_VERIFIED: 0,
    };

    const matchingSuppliers = this.getSuppliersInScope(scope);
    for (const sup of matchingSuppliers) {
      stageBreakdown[sup.verificationStage] = (stageBreakdown[sup.verificationStage] || 0) + 1;
    }

    if (!scopeData || matchingSuppliers.length === 0) {
      return {
        scope,
        status: 'NEVER_DISCOVERED',
        lastDiscoveredAt: null,
        ageInDays: null,
        knownSupplierCount: 0,
        stageBreakdown,
        canReuseCachedNetwork: false,
        requiresExternalDiscovery: true,
        explanation: `No suppliers discovered in ${scope.city} (${scope.pincode}) for ${scope.category}. External discovery required.`,
      };
    }

    const ageInMs = Date.now() - scopeData.lastDiscoveredAt;
    const ageInDays = Math.floor(ageInMs / (1000 * 60 * 60 * 24));
    const isFresh = ageInDays < this.refreshPolicy.freshnessWindowDays;

    if (isFresh) {
      return {
        scope,
        status: 'FRESH',
        lastDiscoveredAt: new Date(scopeData.lastDiscoveredAt).toISOString(),
        ageInDays,
        knownSupplierCount: matchingSuppliers.length,
        stageBreakdown,
        canReuseCachedNetwork: true,
        requiresExternalDiscovery: false,
        explanation: `Fresh OTP Supplier Network available (${matchingSuppliers.length} suppliers discovered ${ageInDays}d ago < ${this.refreshPolicy.freshnessWindowDays}d window). Zero external API calls required.`,
      };
    }

    return {
      scope,
      status: 'REFRESH_ELIGIBLE',
      lastDiscoveredAt: new Date(scopeData.lastDiscoveredAt).toISOString(),
      ageInDays,
      knownSupplierCount: matchingSuppliers.length,
      stageBreakdown,
      canReuseCachedNetwork: true, // Still reusable if quota exhausted, but eligible for refresh
      requiresExternalDiscovery: true,
      explanation: `Scope is ${ageInDays} days old (>= ${this.refreshPolicy.freshnessWindowDays}d). Eligible for controlled network refresh to update lastSeenAt & capture new regional entrants.`,
    };
  }

  /**
   * 2. Intelligent Quota-Aware & Priority Check before external discovery.
   */
  public evaluateQuota(
    providerName: string,
    priority: DiscoveryPriorityLevel,
    estimatedCalls = 1,
  ): QuotaEvaluationResult {
    const budget = this.providerBudgets.get(providerName) ?? DEFAULT_PROVIDER_BUDGET_CONFIGS.GOOGLE_PLACES;
    if (!budget) {
      return {
        allowed: true,
        priority,
        estimatedCalls,
        currentDailyUsage: this.dailyUsageCount,
        dailyLimit: 1500,
        remainingDailyBudget: 1500,
        requiresSuperadminApproval: false,
        reserveTierApplied: 'NORMAL',
      };
    }
    const dailyLimit = budget.dailyRequestLimit;
    const remainingDailyBudget = Math.max(0, dailyLimit - this.dailyUsageCount);

    // Reserved Tier Calculations
    const emergencyThreshold = budget.emergencyReserveBuffer; // e.g. 200
    const buyerDemandThreshold = budget.buyerDemandReserveBuffer; // e.g. 300

    let reserveTierApplied: 'NORMAL' | 'BUYER_DEMAND_RESERVE' | 'EMERGENCY_RESERVE' = 'NORMAL';
    let allowed = true;
    let rejectionReason: string | undefined;

    if (this.dailyUsageCount + estimatedCalls > dailyLimit) {
      allowed = false;
      rejectionReason = `Daily provider budget exhausted (${this.dailyUsageCount}/${dailyLimit} calls used).`;
    } else if (remainingDailyBudget <= emergencyThreshold) {
      // Emergency reserve: ONLY P1 Active Buyer RFQs permitted
      reserveTierApplied = 'EMERGENCY_RESERVE';
      if (priority !== 'P1_ACTIVE_BUYER_RFQ') {
        allowed = false;
        rejectionReason = `Provider entered Emergency Reserve (< ${emergencyThreshold} calls remaining). Only active Buyer RFQs permitted.`;
      }
    } else if (remainingDailyBudget <= buyerDemandThreshold) {
      // Buyer demand reserve: Only P1 and P2 allowed
      reserveTierApplied = 'BUYER_DEMAND_RESERVE';
      if (priority !== 'P1_ACTIVE_BUYER_RFQ' && priority !== 'P2_NEW_BUYER_ONBOARDING') {
        allowed = false;
        rejectionReason = `Provider entered Buyer Demand Reserve (< ${buyerDemandThreshold} calls remaining). Proactive discovery locked.`;
      }
    }

    const utilizationPercent = (this.dailyUsageCount / dailyLimit) * 100;
    const requiresSuperadminApproval =
      utilizationPercent >= this.refreshPolicy.approvalThresholdPercent &&
      priority !== 'P1_ACTIVE_BUYER_RFQ';

    return {
      allowed,
      priority,
      estimatedCalls,
      currentDailyUsage: this.dailyUsageCount,
      dailyLimit,
      remainingDailyBudget,
      requiresSuperadminApproval,
      rejectionReason,
      reserveTierApplied,
    };
  }

  /**
   * 3. Sourcing Network Query for Active Buyer RFQ (Reuses network if <30d, else refreshes).
   */
  public async discoverForBuyerRfq(
    scope: DiscoveryScopeDescriptor,
    actor?: ActorContext,
  ): Promise<{
    suppliers: NetworkSupplierEntity[];
    reusedExistingNetwork: boolean;
    externalCallsUsed: number;
    freshness: DiscoveryScopeFreshnessAssessment;
  }> {
    const freshness = this.assessScopeFreshness(scope);

    if (freshness.status === 'FRESH') {
      this.cacheHits++;
      this.rfqsZeroCallsReused++;
      return {
        suppliers: this.buyerVisibleSuppliers(scope),
        reusedExistingNetwork: true,
        externalCallsUsed: 0,
        freshness,
      };
    }

    // Scope needs discovery/refresh
    const quota = this.evaluateQuota('GOOGLE_PLACES', 'P1_ACTIVE_BUYER_RFQ', 2);
    if (!quota.allowed) {
      // Fail closed gracefully: Return existing cached suppliers if any, 0 external calls
      return {
        suppliers: this.buyerVisibleSuppliers(scope),
        reusedExistingNetwork: true,
        externalCallsUsed: 0,
        freshness,
      };
    }

    this.buyerDemandDiscoveries++;
    const res = await this.invokeAuthoritativeCoverage(scope, {
      forceRefresh: false,
      executeDiscovery: true,
      discoveryContextLabel: 'BUYER_RFQ',
      skipSuperadminQuotaGates: true,
    });
    return {
      suppliers: this.buyerVisibleSuppliers(scope),
      reusedExistingNetwork: false,
      externalCallsUsed: res.externalCallsExecuted,
      freshness: this.assessScopeFreshness(scope),
    };
  }

  /**
   * 4. New Buyer Onboarding Pre-Warm Engine.
   */
  public async evaluateOnboardingLocation(
    location: { state: string; city: string; pincode: string },
    sampleCategory = 'General Commercial Supplies',
  ): Promise<{
    hasCoverage: boolean;
    knownSuppliersCount: number;
    statusLabel: string;
    stageBreakdown: Record<SupplierTruthfulVerificationStage, number>;
    triggeredDiscovery: boolean;
  }> {
    const scope: DiscoveryScopeDescriptor = {
      state: location.state,
      city: location.city,
      pincode: location.pincode,
      category: sampleCategory,
      discoveryContext: 'BUYER_ONBOARDING',
    };

    const freshness = this.assessScopeFreshness(scope);

    if (freshness.status === 'FRESH' && freshness.knownSupplierCount > 0) {
      return {
        hasCoverage: true,
        knownSuppliersCount: freshness.knownSupplierCount,
        statusLabel: `OTP already has ${freshness.knownSupplierCount} suppliers active in ${location.city} (${location.pincode}).`,
        stageBreakdown: freshness.stageBreakdown,
        triggeredDiscovery: false,
      };
    }

    const quota = this.evaluateQuota('GOOGLE_PLACES', 'P2_NEW_BUYER_ONBOARDING', 1);
    let triggeredDiscovery = false;
    const scopeKey = this.getScopeKey(scope);
    if (quota.allowed && this.refreshPolicy.enableOnboardingPreWarm) {
      triggeredDiscovery = true;
      void this.scheduleControlledDiscovery(scope, 'BUYER_ONBOARDING', 1, false).catch(() => undefined);
    }

    return {
      hasCoverage: freshness.knownSupplierCount > 0,
      knownSuppliersCount: freshness.knownSupplierCount,
      statusLabel:
        freshness.knownSupplierCount > 0
          ? `OTP already has ${freshness.knownSupplierCount} suppliers active in ${location.city} (${location.pincode}).`
          : `Location registered. Regional supplier network is being expanded for ${location.city} (${location.pincode}).`,
      stageBreakdown: freshness.stageBreakdown,
      triggeredDiscovery,
    };
  }

  /**
   * Read-only coverage assessment (admin "Check Existing Coverage").
   */
  public async checkLocationCoverage(params: PrepareLocationParams): Promise<PrepareLocationResult> {
    return this.prepareLocationNetwork({ ...params, executeDiscovery: false, forceRefresh: false });
  }

  /**
   * 5. Superadmin "Prepare Supplier Network" Console Action.
   */
  public async prepareLocationNetwork(
    params: PrepareLocationParams,
    actor?: ActorContext,
  ): Promise<PrepareLocationResult> {
    const scope: DiscoveryScopeDescriptor = {
      state: params.state,
      city: params.city,
      pincode: params.pincode,
      category: params.category,
      discoveryContext: 'SUPERADMIN_PREPARE',
    };
    const executeDiscovery = params.executeDiscovery !== false;
    const budgetConfig =
      this.providerBudgets.get('GOOGLE_PLACES') ?? DEFAULT_PROVIDER_BUDGET_CONFIGS.GOOGLE_PLACES;
    const dailyLimit = budgetConfig?.dailyRequestLimit ?? 1500;
    const usageProbe = await this.coverageStore.reserveGoogleCalls(0, dailyLimit);
    this.dailyUsageCount = usageProbe.requestCount;

    if (executeDiscovery) {
      const quota = this.evaluateQuota('GOOGLE_PLACES', 'P4_SUPERADMIN_PROACTIVE', 2);
      if (!quota.allowed) {
        const freshness = this.assessScopeFreshness(scope);
        return {
          ok: false,
          scopeKey: this.getScopeKey(scope),
          status: freshness.status,
          externalCallsExecuted: 0,
          knownSuppliersCount: freshness.knownSupplierCount,
          newSuppliersDiscovered: 0,
          updatedSuppliersCount: 0,
          report: this.generateCoverageReport(scope),
          quotaImpact: {
            callsUsed: 0,
            dailyRemaining: quota.remainingDailyBudget,
          },
          message: quota.rejectionReason || 'Provider quota limit reached.',
          error: 'QUOTA_EXHAUSTED',
        };
      }

      if (quota.requiresSuperadminApproval && !params.bypassSuperadminApproval) {
        const freshness = this.assessScopeFreshness(scope);
        return {
          ok: false,
          scopeKey: this.getScopeKey(scope),
          status: freshness.status,
          externalCallsExecuted: 0,
          knownSuppliersCount: freshness.knownSupplierCount,
          newSuppliersDiscovered: 0,
          updatedSuppliersCount: 0,
          report: this.generateCoverageReport(scope),
          quotaImpact: {
            callsUsed: 0,
            dailyRemaining: quota.remainingDailyBudget,
          },
          message:
            'Daily quota utilization exceeds 80%. Explicit confirmation required to proceed with proactive external discovery.',
          error: 'APPROVAL_REQUIRED',
        };
      }
      this.superadminDiscoveries++;
    } else {
      this.cacheHits++;
    }

    return this.invokeAuthoritativeCoverage(scope, {
      forceRefresh: params.forceRefresh,
      executeDiscovery,
      discoveryContextLabel: 'SUPERADMIN_PREPARE',
      skipSuperadminQuotaGates: true,
      dailyLimit,
    });
  }

  private async invokeAuthoritativeCoverage(
    scope: DiscoveryScopeDescriptor,
    options: {
      forceRefresh?: boolean;
      executeDiscovery: boolean;
      discoveryContextLabel: string;
      skipSuperadminQuotaGates: boolean;
      bypassSuperadminApproval?: boolean;
      dailyLimit?: number;
    },
  ): Promise<PrepareLocationResult> {
    const budgetConfig =
      this.providerBudgets.get('GOOGLE_PLACES') ?? DEFAULT_PROVIDER_BUDGET_CONFIGS.GOOGLE_PLACES;
    const dailyLimit = options.dailyLimit ?? budgetConfig?.dailyRequestLimit ?? 1500;

    if (options.executeDiscovery && !options.skipSuperadminQuotaGates) {
      const quota = this.evaluateQuota('GOOGLE_PLACES', 'P4_SUPERADMIN_PROACTIVE', 2);
      if (!quota.allowed) {
        const freshness = this.assessScopeFreshness(scope);
        return {
          ok: false,
          scopeKey: this.getScopeKey(scope),
          status: freshness.status,
          externalCallsExecuted: 0,
          knownSuppliersCount: freshness.knownSupplierCount,
          newSuppliersDiscovered: 0,
          updatedSuppliersCount: 0,
          report: this.generateCoverageReport(scope),
          quotaImpact: {
            callsUsed: 0,
            dailyRemaining: quota.remainingDailyBudget,
          },
          message: quota.rejectionReason || 'Provider quota limit reached.',
          error: 'QUOTA_EXHAUSTED',
        };
      }

      if (quota.requiresSuperadminApproval && !options.bypassSuperadminApproval) {
        const freshness = this.assessScopeFreshness(scope);
        return {
          ok: false,
          scopeKey: this.getScopeKey(scope),
          status: freshness.status,
          externalCallsExecuted: 0,
          knownSuppliersCount: freshness.knownSupplierCount,
          newSuppliersDiscovered: 0,
          updatedSuppliersCount: 0,
          report: this.generateCoverageReport(scope),
          quotaImpact: {
            callsUsed: 0,
            dailyRemaining: quota.remainingDailyBudget,
          },
          message:
            'Daily quota utilization exceeds 80%. Explicit confirmation required to proceed with proactive external discovery.',
          error: 'APPROVAL_REQUIRED',
        };
      }
    }

    const authoritative = await runAuthoritativeLocationPinCoverage(
      {
        state: scope.state,
        city: scope.city,
        pincode: scope.pincode,
        category: scope.category,
        forceRefresh: options.forceRefresh,
        executeDiscovery: options.executeDiscovery,
      },
      {
        store: this.coverageStore,
        freshnessWindowDays: this.refreshPolicy.freshnessWindowDays,
        dailyLimit,
        googleApiKey: this.resolveGoogleApiKey(),
        serverFetchFn: this.serverFetchFn,
        googlePlacesAdapter: this.googlePlacesAdapter,
        allowLegacyMockDiscovery: this.allowLegacyMockDiscovery,
        mockDiscoveryFn: this.allowLegacyMockDiscovery
          ? (s) => this.mockDiscoveryToPersisted(s, options.discoveryContextLabel)
          : undefined,
      },
    );

    await this.syncAuthoritativeCoverageIntoMemory(scope, options.discoveryContextLabel);
    this.dailyUsageCount += authoritative.externalCallsExecuted;
    this.monthlyUsageCount += authoritative.externalCallsExecuted;
    this.externalCalls += authoritative.externalCallsExecuted;

    if (
      options.executeDiscovery &&
      authoritative.ok &&
      authoritative.externalCallsExecuted > 0
    ) {
      this.recordDiscoveryObservations(scope, options.discoveryContextLabel, authoritative.report.suppliers);
    }

    const remaining = await this.coverageStore.reserveGoogleCalls(0, dailyLimit);

    return {
      ok: authoritative.ok,
      scopeKey: authoritative.scopeKey,
      status: authoritative.status,
      externalCallsExecuted: authoritative.externalCallsExecuted,
      knownSuppliersCount: authoritative.knownSuppliersCount,
      newSuppliersDiscovered: 0,
      updatedSuppliersCount: 0,
      report: authoritative.report,
      quotaImpact: {
        callsUsed: authoritative.externalCallsExecuted,
        dailyRemaining: remaining.remaining,
      },
      message: authoritative.message,
      error: authoritative.error,
    };
  }

  private mockDiscoveryToPersisted(
    scope: DiscoveryScopeDescriptor,
    context: string,
  ): PersistedCoverageSupplier[] {
    return this.generateRealisticMockDiscovery(scope, context).map((raw) => ({
      placeId: raw.placeId,
      businessName: raw.businessName,
      verificationStage: raw.isDetailsComplete
        ? SupplierTruthfulVerificationStage.DETAILS_AVAILABLE
        : SupplierTruthfulVerificationStage.DISCOVERED_IN_AREA,
      provenanceProviders: ['GOOGLE_PLACES'],
      locations: [
        {
          pincode: scope.pincode,
          city: scope.city,
          state: scope.state,
          addressLine: raw.address,
          isPrimary: true,
          serviceRadiusKm: 25,
        },
      ],
      categories: [{ categoryName: scope.category, isPrimary: true, confidenceScore: 80 }],
      observationsCount: 1,
      isOtpRegistered: false,
      isGstVerified: raw.isGstKnown,
      complianceStandards: [],
    }));
  }

  private async syncAuthoritativeCoverageIntoMemory(
    scope: DiscoveryScopeDescriptor,
    _discoveryContextLabel: string,
  ): Promise<void> {
    const scopeKey = this.getScopeKey(scope);
    const persisted = await this.coverageStore.listSuppliers(scopeKey);
    if (persisted.length > 0) {
      const assessed = await this.coverageStore.assess(scopeKey, this.refreshPolicy.freshnessWindowDays);
      const lastAt =
        assessed.ageInDays != null ? Date.now() - assessed.ageInDays * 86400000 : Date.now();
      this.markSuccessfulDiscovery(scopeKey, persisted.length, lastAt);
    }
    for (const row of persisted) {
      const existing = this.findExistingSupplierByPlaceId(row.placeId);
      const nowIso = new Date().toISOString();
      if (existing) {
        existing.lastSeenAt = nowIso;
        existing.lastRefreshedAt = nowIso;
        if (!existing.contactPhone) {
          existing.contactPhone = readPersistedCoveragePhone(row);
        }
        if (!existing.provenanceProviders.includes('GOOGLE_PLACES')) {
          existing.provenanceProviders.push('GOOGLE_PLACES');
        }
        continue;
      }
      const newId = `sup-net-${row.placeId.slice(-8)}`;
      this.suppliers.set(newId, {
        id: newId,
        businessName: row.businessName,
        contactPhone: readPersistedCoveragePhone(row),
        verificationStage: row.verificationStage as SupplierTruthfulVerificationStage,
        firstDiscoveredAt: nowIso,
        lastSeenAt: nowIso,
        lastRefreshedAt: nowIso,
        provenanceProviders: row.provenanceProviders,
        locations: row.locations as unknown as NetworkSupplierLocation[],
        categories: row.categories as unknown as NetworkSupplierCategory[],
        observationsCount: row.observationsCount,
        isOtpRegistered: row.isOtpRegistered,
        isGstVerified: row.isGstVerified,
        complianceStandards: row.complianceStandards as unknown as NetworkSupplierEntity['complianceStandards'],
      });
    }
  }

  private recordDiscoveryObservations(
    scope: DiscoveryScopeDescriptor,
    context: string,
    suppliers: NetworkSupplierEntity[],
  ): void {
    const scopeKey = this.getScopeKey(scope);
    const nowIso = new Date().toISOString();
    for (const supplier of suppliers) {
      const placeId =
        this.observations.find((o) => o.supplierId === supplier.id)?.externalRef ??
        supplier.id;
      const observation: NetworkDiscoveryObservation = {
        id: `obs-${crypto.randomUUID().slice(0, 8)}`,
        supplierId: supplier.id,
        scopeKey,
        provider: 'GOOGLE_PLACES',
        externalRef: placeId,
        observedAt: nowIso,
        rawPayloadHash: `SHA256:${Date.now().toString(16)}`,
        discoveryContext: context,
        observedData: {
          businessName: supplier.businessName,
          phone: supplier.contactPhone,
        },
      };
      this.observations.push(observation);
      const entity = this.suppliers.get(supplier.id);
      if (entity) {
        entity.observationsCount++;
      }
    }
  }

  private scheduleControlledDiscovery(
    scope: DiscoveryScopeDescriptor,
    context: string,
    _callsBudget: number,
    forceRefresh: boolean,
  ): Promise<PrepareLocationResult> {
    return this.invokeAuthoritativeCoverage(scope, {
      forceRefresh,
      executeDiscovery: true,
      discoveryContextLabel: context,
      skipSuperadminQuotaGates: true,
    });
  }

  /**
   * 7. Generate Full Scope Coverage & Freshness Report.
   */
  public generateCoverageReport(scope: DiscoveryScopeDescriptor): ScopeCoverageReport {
    const freshness = this.assessScopeFreshness(scope);
    const suppliers = this.getSuppliersInScope(scope);

    return {
      scope,
      freshness,
      suppliers,
      summary: {
        totalKnown: suppliers.length,
        discoveredInArea: freshness.stageBreakdown.DISCOVERED_IN_AREA,
        detailsAvailable: freshness.stageBreakdown.DETAILS_AVAILABLE,
        otpRegistered: freshness.stageBreakdown.OTP_REGISTERED,
        otpVerified: freshness.stageBreakdown.OTP_VERIFIED,
        gstVerified: freshness.stageBreakdown.GST_VERIFIED,
        standardCompliantCount: suppliers.filter((s) => s.complianceStandards.length > 0).length,
      },
    };
  }

  /**
   * 8. Superadmin & Founder Telemetry Aggregator.
   */
  public getTelemetrySnapshot(): SupplierNetworkTelemetrySnapshot {
    const allSuppliers = Array.from(this.suppliers.values());
    const activatedPincodes = new Set<string>();
    const activatedCities = new Set<string>();
    const categoriesCovered = new Set<string>();

    const population = {
      discoveredInArea: 0,
      detailsAvailable: 0,
      otpRegistered: 0,
      otpVerified: 0,
      gstVerified: 0,
      inactiveCount: 0,
      duplicateCandidatesDetected: 0,
    };

    for (const sup of allSuppliers) {
      if (sup.verificationStage === 'DISCOVERED_IN_AREA') population.discoveredInArea++;
      else if (sup.verificationStage === 'DETAILS_AVAILABLE') population.detailsAvailable++;
      else if (sup.verificationStage === 'OTP_REGISTERED') population.otpRegistered++;
      else if (sup.verificationStage === 'OTP_VERIFIED') population.otpVerified++;
      else if (sup.verificationStage === 'GST_VERIFIED') population.gstVerified++;

      for (const loc of sup.locations) {
        activatedPincodes.add(loc.pincode);
        activatedCities.add(loc.city.toLowerCase());
      }
      for (const cat of sup.categories) {
        categoriesCovered.add(cat.categoryName.toLowerCase());
      }
    }

    let freshUnder30 = 0;
    let staleOver30 = 0;
    const now = Date.now();
    for (const scopeInfo of this.knownScopes.values()) {
      const ageDays = (now - scopeInfo.lastDiscoveredAt) / (1000 * 60 * 60 * 24);
      if (ageDays < this.refreshPolicy.freshnessWindowDays) {
        freshUnder30++;
      } else {
        staleOver30++;
      }
    }

    const totalRequests = this.cacheHits + this.externalCalls;
    const cacheHitRatePercent = totalRequests > 0 ? Math.round((this.cacheHits / totalRequests) * 100) : 100;
    const externalDiscoveryRatePercent = totalRequests > 0 ? Math.round((this.externalCalls / totalRequests) * 100) : 0;

    const registeredOrVerified = population.otpRegistered + population.otpVerified + population.gstVerified;
    const organicConversionRatePercent = allSuppliers.length > 0
      ? Math.round((registeredOrVerified / allSuppliers.length) * 100)
      : 0;

    return {
      generatedAt: new Date().toISOString(),
      coverage: {
        totalActivatedPincodes: activatedPincodes.size,
        totalActivatedCities: activatedCities.size,
        totalCategoriesCovered: categoriesCovered.size,
        totalSuppliersInNetwork: allSuppliers.length,
      },
      freshness: {
        freshUnder30Days: freshUnder30,
        refreshEligibleStale: staleOver30,
        neverDiscoveredScopes: Math.max(0, 10 - this.knownScopes.size),
      },
      population,
      providerUsage: {
        todayRequests: this.dailyUsageCount,
        monthRequests: this.monthlyUsageCount,
        remainingDailyBudget: Math.max(0, 1500 - this.dailyUsageCount),
        failedRequests: 0,
        cacheHitRatePercent,
        externalDiscoveryRatePercent,
        buyerDemandReservations: this.buyerDemandDiscoveries,
        superadminProactiveCalls: this.superadminDiscoveries,
      },
      growth: {
        buyerDrivenDiscoveriesCount: this.buyerDemandDiscoveries,
        superadminPrewarmedCount: this.superadminDiscoveries,
        rfqsReusingNetworkZeroCalls: this.rfqsZeroCallsReused,
        organicConversionRatePercent,
      },
    };
  }

  // --- Internal Helpers ---

  /**
   * Buyer RFQ sourcing is pre-reveal. Persisted phone stays on the internal
   * entity for Admin/SuperAdmin and is omitted here. Disclosure is reveal_award
   * when reveal_status is REVEALED, not this roster.
   */
  private buyerVisibleSuppliers(scope: DiscoveryScopeDescriptor): NetworkSupplierEntity[] {
    return this.getSuppliersInScope(scope).map((supplier) => redactOperationalPhone(supplier));
  }

  private getSuppliersInScope(scope: DiscoveryScopeDescriptor): NetworkSupplierEntity[] {
    const list: NetworkSupplierEntity[] = [];
    const catSearch = scope.category.trim().toLowerCase();
    const pinSearch = scope.pincode.trim();
    const citySearch = scope.city.trim().toLowerCase();

    for (const s of this.suppliers.values()) {
      const matchesLoc = s.locations.some(
        (l) => l.pincode === pinSearch || l.city.toLowerCase() === citySearch
      );
      const matchesCat = s.categories.some(
        (c) => c.categoryName.toLowerCase().includes(catSearch) || catSearch.includes(c.categoryName.toLowerCase())
      );
      if (matchesLoc && matchesCat) {
        list.push(s);
      }
    }
    return list;
  }

  private findExistingSupplierByPlaceId(placeId?: string): NetworkSupplierEntity | undefined {
    if (!placeId) return undefined;
    for (const s of this.suppliers.values()) {
      const obs = this.observations.find((o) => o.supplierId === s.id && o.externalRef === placeId);
      if (obs) return s;
    }
    return undefined;
  }

  private findExistingSupplier(raw: { businessName: string; phone?: string; placeId?: string }): NetworkSupplierEntity | undefined {
    if (raw.placeId) {
      return this.findExistingSupplierByPlaceId(raw.placeId);
    }
    return undefined;
  }

  private resolveGoogleApiKey(): string | undefined {
    const key =
      this.googleApiKey ??
      process.env.GOOGLE_PLACES_API_KEY ??
      process.env.GOOGLE_MAPS_API_KEY ??
      undefined;
    return key && key.trim().length > 0 ? key.trim() : undefined;
  }

  private generateRealisticMockDiscovery(
    scope: DiscoveryScopeDescriptor,
    context: string,
  ): Array<{
    businessName: string;
    phone: string;
    address: string;
    rating: number;
    userRatingsTotal: number;
    placeId: string;
    isGstKnown: boolean;
    isDetailsComplete: boolean;
  }> {
    if (!isVitestMockDiscoveryAllowed()) {
      throw new Error('generateRealisticMockDiscovery is Vitest-only and cannot run in production factories');
    }
    const categorySlug = scope.category.split(' ')[0] || 'Industrial';
    return [
      {
        businessName: `${scope.city} ${categorySlug} Enterprises`,
        phone: '+91 98450 11223',
        address: `Shop 12, Main Market, ${scope.city}, ${scope.state} ${scope.pincode}`,
        rating: 4.6,
        userRatingsTotal: 48,
        placeId: `ChIJ_${scope.pincode}_01`,
        isGstKnown: true,
        isDetailsComplete: true,
      },
      {
        businessName: `Apex ${scope.category} Solutions`,
        phone: '+91 98450 44556',
        address: `Plot 5, Industrial Area, ${scope.city}, ${scope.state} ${scope.pincode}`,
        rating: 4.8,
        userRatingsTotal: 120,
        placeId: `ChIJ_${scope.pincode}_02`,
        isGstKnown: false,
        isDetailsComplete: true,
      },
      {
        businessName: `Sri Balaji ${categorySlug} & Co`,
        phone: '+91 98450 77889',
        address: `2nd Cross, Commercial Street, ${scope.city}, ${scope.state} ${scope.pincode}`,
        rating: 4.3,
        userRatingsTotal: 22,
        placeId: `ChIJ_${scope.pincode}_03`,
        isGstKnown: false,
        isDetailsComplete: false,
      },
    ];
  }
}
