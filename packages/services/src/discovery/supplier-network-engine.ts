import {
  SupplierNetwork,
  ProviderExecutionStatus,
  TruthfulProviderStatus,
  CircuitBreakerState,
  type NormalizedSupplierCandidate,
  type ProviderExecutionSummary,
  type EngineDiscoveryRequest,
  type EngineDiscoveryResponse,
  type LocationIntelligencePort,
  type CircuitBreakerStatus,
  type ProviderHealthReport,
  generateCrockfordAlias,
  sanitizeCandidateMatchReasons,
  assertCandidateAntiLeak,
  DynamicDiscoveryConfidenceEngine,
  CanonicalIdentityResolver,
  CapabilityEvidenceEvaluator,
  DynamicCapacityHeadroomCalculator,
  SupplierPerformanceIntelligenceEvaluator,
  FreshnessIntelligenceEvaluator,
  DiscoveryFeedbackSignalsEvaluator,
  type KnownSupplierRegistryEntry,
} from '@otp/domain';
import type {
  SupplierNetworkPort,
  NetworkDiscoveryCandidate,
} from '../interfaces/supplier-network-port';
import type { Repositories } from '../repositories/interfaces';
import { ProviderNeutralLocationIntelligence } from '../gis/provider-neutral-location-intelligence';

export interface DispatcherProviderRegistration {
  adapter: SupplierNetworkPort;
  truthfulStatus?: TruthfulProviderStatus;
  isLive?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerCooldownMs?: number;
}

export interface SourcingDiscoveryCacheOptions {
  enabled?: boolean;
  refreshWindowMs?: number; // Configurable refresh window, defaults to 30 days
}

export interface SupplierNetworkEngineOptions {
  providers?: DispatcherProviderRegistration[];
  locationIntelligence?: LocationIntelligencePort;
  repositories?: Partial<Repositories>;
  knownRegistry?: KnownSupplierRegistryEntry[];
  defaultTimeoutMs?: number;
  defaultMaxRetries?: number;
  defaultRetryBaseDelayMs?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerCooldownMs?: number;
  cacheOptions?: SourcingDiscoveryCacheOptions;
}

interface ProviderStats {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  rateLimitedCalls: number;
  totalLatencyMs: number;
  consecutiveFailures: number;
  lastFailureTimestamp?: number;
  lastSuccessTimestamp?: number;
  lastError?: string;
  circuitState: CircuitBreakerState;
  circuitOpenUntil?: number;
}

/**
 * Supplier Network Engine (SNE) — Provider Dispatcher & Core Orchestration (Phase SN.3).
 *
 * STRICT ARCHITECTURAL INVARIANTS:
 * 1. ZERO AWARD AUTHORITY: SNE can only DISCOVER candidate suppliers. It CANNOT award,
 *    create POs, approve quotes, or change financial ledgers.
 * 2. ZERO PRE-AWARD PII LEAKAGE: All candidate identities are protected under Crockford Base32 aliases.
 *    No PAN, GSTIN, legal names, phone numbers, emails, or bank accounts are exposed.
 * 3. NO NETWORK SOURCE FINGERPRINTS: Match reasons are strictly sanitized to eliminate 'source:BNI', etc.
 * 4. ISOLATED RESILIENCE: Provider timeouts or errors degrade gracefully and return partial results
 *    without crashing the discovery process. Bounded retries and circuit breaker contain cascade faults.
 * 5. TRUTHFUL LABELING: Stubs are strictly marked as STUBBED_SIMULATION and cannot claim LIVE status.
 * 6. CANONICAL IDENTITY RESOLUTION: Tax IDs (PAN, GSTIN) and canonical IDs are matched with strict
 *    conflict detection and tenant isolation. Conflicting candidates are NEVER merged.
 * 7. PERFORMANCE & CAPACITY INTELLIGENCE: Cold-start neutrality, bounded headroom ratios,
 *    180-day staleness decay, and closed-loop feedback signals strictly enrich discovery confidence.
 */
export const DEFAULT_SOURCING_REFRESH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 Days

interface CachedDiscoveryEntry {
  category: string;
  pinCode?: string;
  candidates: NormalizedSupplierCandidate[];
  providerSummaries: ProviderExecutionSummary[];
  cachedAt: number;
  totalCandidatesDiscovered: number;
}

export class SupplierNetworkEngine {
  private readonly providers = new Map<SupplierNetwork, DispatcherProviderRegistration>();
  private readonly providerStats = new Map<SupplierNetwork, ProviderStats>();
  private readonly locationIntelligence: LocationIntelligencePort;
  private readonly repositories?: Partial<Repositories>;
  private readonly knownRegistry?: KnownSupplierRegistryEntry[];
  private readonly defaultTimeoutMs: number;
  private readonly defaultMaxRetries: number;
  private readonly defaultRetryBaseDelayMs: number;
  private readonly defaultCircuitThreshold: number;
  private readonly defaultCircuitCooldownMs: number;
  private readonly cacheEnabled: boolean;
  private readonly cacheRefreshWindowMs: number;
  private readonly discoveryCache = new Map<string, CachedDiscoveryEntry>();
  private cacheHits: number = 0;
  private cacheMisses: number = 0;

  constructor(options: SupplierNetworkEngineOptions = {}) {
    this.locationIntelligence =
      options.locationIntelligence ?? new ProviderNeutralLocationIntelligence();
    this.repositories = options.repositories;
    this.knownRegistry = options.knownRegistry;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 5000;
    this.defaultMaxRetries = options.defaultMaxRetries ?? 2;
    this.defaultRetryBaseDelayMs = options.defaultRetryBaseDelayMs ?? 50;
    this.defaultCircuitThreshold = options.circuitBreakerThreshold ?? 3;
    this.defaultCircuitCooldownMs = options.circuitBreakerCooldownMs ?? 10000;
    this.cacheEnabled = options.cacheOptions?.enabled ?? true;
    this.cacheRefreshWindowMs =
      options.cacheOptions?.refreshWindowMs ?? DEFAULT_SOURCING_REFRESH_WINDOW_MS;

    if (options.providers) {
      for (const reg of options.providers) {
        this.registerProvider(reg);
      }
    }
  }

  /**
   * Register or update a provider adapter with operational metadata.
   */
  registerProvider(registration: DispatcherProviderRegistration): void {
    const network = registration.adapter.network;
    this.providers.set(network, registration);
    if (!this.providerStats.has(network)) {
      this.providerStats.set(network, {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        rateLimitedCalls: 0,
        totalLatencyMs: 0,
        consecutiveFailures: 0,
        circuitState: CircuitBreakerState.CLOSED,
      });
    }
  }

  /**
   * Get all registered provider networks.
   */
  getRegisteredNetworks(): SupplierNetwork[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get Circuit Breaker status for a specific provider.
   */
  getCircuitBreakerStatus(provider: SupplierNetwork): CircuitBreakerStatus {
    const stats = this.providerStats.get(provider);
    const reg = this.providers.get(provider);
    const threshold = reg?.circuitBreakerThreshold ?? this.defaultCircuitThreshold;
    const cooldownMs = reg?.circuitBreakerCooldownMs ?? this.defaultCircuitCooldownMs;

    if (!stats) {
      return {
        provider,
        state: CircuitBreakerState.CLOSED,
        consecutiveFailures: 0,
        failureThreshold: threshold,
        cooldownMs,
      };
    }

    // Check if cooldown has elapsed for OPEN circuit
    if (stats.circuitState === CircuitBreakerState.OPEN && stats.circuitOpenUntil) {
      if (Date.now() >= stats.circuitOpenUntil) {
        stats.circuitState = CircuitBreakerState.HALF_OPEN;
      }
    }

    return {
      provider,
      state: stats.circuitState,
      consecutiveFailures: stats.consecutiveFailures,
      failureThreshold: threshold,
      cooldownMs,
      lastFailureTimestamp: stats.lastFailureTimestamp,
      lastSuccessTimestamp: stats.lastSuccessTimestamp,
      nextProbeTimestamp: stats.circuitOpenUntil,
    };
  }

  /**
   * Get comprehensive health report across all or specific providers.
   */
  getProviderHealthReport(provider?: SupplierNetwork): ProviderHealthReport[] {
    const targets = provider ? [provider] : Array.from(this.providers.keys());
    return targets.map((p) => {
      const reg = this.providers.get(p);
      const stats = this.providerStats.get(p) ?? {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        rateLimitedCalls: 0,
        totalLatencyMs: 0,
        consecutiveFailures: 0,
        circuitState: CircuitBreakerState.CLOSED,
      };
      const cbStatus = this.getCircuitBreakerStatus(p);
      const isLive = reg?.isLive ?? reg?.adapter.isTruthfulLive ?? false;
      const truthfulStatus =
        reg?.truthfulStatus ??
        (isLive ? TruthfulProviderStatus.LIVE_ACTIVE : TruthfulProviderStatus.STUBBED_SIMULATION);

      return {
        provider: p,
        truthfulStatus,
        circuitBreaker: cbStatus,
        isAvailable: cbStatus.state !== CircuitBreakerState.OPEN,
        totalCalls: stats.totalCalls,
        successfulCalls: stats.successfulCalls,
        failedCalls: stats.failedCalls,
        rateLimitedCalls: stats.rateLimitedCalls,
        averageLatencyMs:
          stats.totalCalls > 0 ? Math.round(stats.totalLatencyMs / stats.totalCalls) : 0,
        lastError: stats.lastError,
        lastSeenTimestamp: stats.lastSuccessTimestamp
          ? new Date(stats.lastSuccessTimestamp).toISOString()
          : undefined,
      };
    });
  }

  /**
   * Reset Circuit Breaker for testing or operational recovery.
   */
  resetCircuitBreaker(provider: SupplierNetwork): void {
    const stats = this.providerStats.get(provider);
    if (stats) {
      stats.circuitState = CircuitBreakerState.CLOSED;
      stats.consecutiveFailures = 0;
      stats.circuitOpenUntil = undefined;
    }
  }

  /**
   * Generates a cache key for discovery requests by category and geographic location/pincode.
   */
  private getCacheKey(request: EngineDiscoveryRequest): string {
    const cat = request.category.toLowerCase().trim();
    const pin = request.location?.pinCode?.trim() || request.location?.city?.toLowerCase().trim() || 'ALL';
    return `${cat}::${pin}`;
  }

  /**
   * Invalidate discovery cache entries for a category and/or pin code, or clear all.
   */
  invalidateDiscoveryCache(category?: string, pinCode?: string): void {
    if (!category) {
      this.discoveryCache.clear();
      return;
    }
    const pin = pinCode?.trim() || 'ALL';
    const key = `${category.toLowerCase().trim()}::${pin}`;
    this.discoveryCache.delete(key);
  }

  /**
   * Get current cache stats for monitoring and telemetry.
   */
  getDiscoveryCacheStats(): { size: number; hits: number; misses: number; refreshWindowMs: number } {
    return {
      size: this.discoveryCache.size,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      refreshWindowMs: this.cacheRefreshWindowMs,
    };
  }

  /**
   * Interrogate a specific cache entry.
   */
  getDiscoveryCacheEntry(category: string, pinCode?: string): CachedDiscoveryEntry | undefined {
    const pin = pinCode?.trim() || 'ALL';
    const key = `${category.toLowerCase().trim()}::${pin}`;
    return this.discoveryCache.get(key);
  }

  /**
   * Main Orchestration Entry Point: Dispatches discovery requests across all
   * eligible provider adapters with timeout containment, normalization,
   * GIS distance intelligence, dynamic confidence scoring, anti-leak enforcement,
   * SN.3 canonical identity resolution, multi-provider deduplication, and 30-day cache reuse.
   */
  async discoverCandidates(request: EngineDiscoveryRequest): Promise<EngineDiscoveryResponse> {
    const startTime = Date.now();
    const cacheKey = this.getCacheKey(request);

    // 1. Check 30-Day Configurable Cache
    if (this.cacheEnabled && !request.forceRefresh) {
      const cached = this.discoveryCache.get(cacheKey);
      if (cached && (Date.now() - cached.cachedAt) < this.cacheRefreshWindowMs) {
        this.cacheHits += 1;
        const cacheAgeDays = Math.round((Date.now() - cached.cachedAt) / (24 * 60 * 60 * 1000) * 10) / 10;
        
        // Filter out any excluded supplier IDs
        const excludedIds = new Set(request.excludedSupplierIds ?? []);
        const filtered = cached.candidates.filter(
          (c) => !c.canonicalSupplierId || !excludedIds.has(c.canonicalSupplierId),
        );
        const cappedCandidates =
          request.maxCandidates && request.maxCandidates > 0
            ? filtered.slice(0, request.maxCandidates)
            : filtered;

        return {
          candidates: cappedCandidates,
          providerSummaries: cached.providerSummaries,
          totalCandidatesDiscovered: cached.totalCandidatesDiscovered,
          totalUniqueCandidates: cappedCandidates.length,
          durationMs: Date.now() - startTime,
          hasPartialFailures: false,
          isCached: true,
          cacheAgeDays,
        };
      }
    }

    this.cacheMisses += 1;
    const enabledNetworks = request.enabledProviders ?? Array.from(this.providers.keys());
    const excludedIds = new Set(request.excludedSupplierIds ?? []);

    const providerPromises: Promise<{
      provider: SupplierNetwork;
      summary: ProviderExecutionSummary;
      candidates: NetworkDiscoveryCandidate[];
    }>[] = [];

    for (const network of enabledNetworks) {
      const reg = this.providers.get(network);
      if (!reg) continue;

      providerPromises.push(this.executeProvider(reg, request));
    }

    // Execute provider adapters in parallel with isolated error boundaries
    const executionResults = await Promise.all(providerPromises);

    const providerSummaries: ProviderExecutionSummary[] = [];
    const rawCandidatesWithNetwork: {
      candidate: NetworkDiscoveryCandidate;
      registration: DispatcherProviderRegistration;
    }[] = [];

    let hasPartialFailures = false;

    for (const res of executionResults) {
      providerSummaries.push(res.summary);
      if (
        res.summary.status === ProviderExecutionStatus.TIMEOUT ||
        res.summary.status === ProviderExecutionStatus.INTERNAL_ERROR ||
        res.summary.status === ProviderExecutionStatus.UNAVAILABLE ||
        res.summary.status === ProviderExecutionStatus.RATE_LIMITED
      ) {
        hasPartialFailures = true;
      }

      for (const cand of res.candidates) {
        rawCandidatesWithNetwork.push({
          candidate: cand,
          registration: this.providers.get(res.provider)!,
        });
      }
    }

    // Process, normalize, calculate GIS intelligence, dynamic confidence, and deduplicate candidates
    const normalizedCandidates = await this.normalizeAndDeduplicate(
      rawCandidatesWithNetwork,
      request,
      excludedIds,
    );

    // Apply ranking & max candidates limit
    normalizedCandidates.sort((a, b) => b.matchScore - a.matchScore);
    const cappedCandidates =
      request.maxCandidates && request.maxCandidates > 0
        ? normalizedCandidates.slice(0, request.maxCandidates)
        : normalizedCandidates;

    // Strict Anti-Leak Enforcement Assertion on every returned candidate
    for (const cand of cappedCandidates) {
      assertCandidateAntiLeak(cand);
    }

    // Save into Sourcing Discovery Cache
    if (this.cacheEnabled) {
      this.discoveryCache.set(cacheKey, {
        category: request.category,
        pinCode: request.location?.pinCode ?? undefined,
        candidates: normalizedCandidates,
        providerSummaries,
        cachedAt: Date.now(),
        totalCandidatesDiscovered: rawCandidatesWithNetwork.length,
      });
    }

    const durationMs = Date.now() - startTime;

    return {
      candidates: cappedCandidates,
      providerSummaries,
      totalCandidatesDiscovered: rawCandidatesWithNetwork.length,
      totalUniqueCandidates: cappedCandidates.length,
      durationMs,
      hasPartialFailures,
      isCached: false,
    };
  }

  /**
   * Executes a single provider adapter with bounded retries, rate-limiting detection,
   * circuit breaker tripping, and status isolation.
   */
  private async executeProvider(
    reg: DispatcherProviderRegistration,
    request: EngineDiscoveryRequest,
  ): Promise<{
    provider: SupplierNetwork;
    summary: ProviderExecutionSummary;
    candidates: NetworkDiscoveryCandidate[];
  }> {
    const providerStartTime = Date.now();
    const network = reg.adapter.network;
    const isLive = reg.isLive ?? reg.adapter.isTruthfulLive ?? false;
    const truthfulStatus =
      reg.truthfulStatus ??
      (isLive ? TruthfulProviderStatus.LIVE_ACTIVE : TruthfulProviderStatus.STUBBED_SIMULATION);

    const stats = this.providerStats.get(network) ?? {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rateLimitedCalls: 0,
      totalLatencyMs: 0,
      consecutiveFailures: 0,
      circuitState: CircuitBreakerState.CLOSED,
    };
    this.providerStats.set(network, stats);
    stats.totalCalls++;

    // 1. Check if provider is enabled
    if (reg.adapter.isEnabled && !reg.adapter.isEnabled()) {
      return {
        provider: network,
        summary: {
          provider: network,
          status: ProviderExecutionStatus.DISABLED,
          candidateCount: 0,
          durationMs: Date.now() - providerStartTime,
          truthfulStatus: TruthfulProviderStatus.DISABLED_GATE,
          isTruthfulLive: false,
        },
        candidates: [],
      };
    }

    // 2. Check Circuit Breaker State
    const cb = this.getCircuitBreakerStatus(network);
    if (cb.state === CircuitBreakerState.OPEN) {
      return {
        provider: network,
        summary: {
          provider: network,
          status: ProviderExecutionStatus.UNAVAILABLE,
          candidateCount: 0,
          durationMs: Date.now() - providerStartTime,
          truthfulStatus,
          isTruthfulLive: isLive,
          errorMessage: `Circuit breaker OPEN for provider ${network} (${stats.consecutiveFailures} consecutive failures)`,
        },
        candidates: [],
      };
    }

    const timeoutMs = request.timeoutMs ?? reg.timeoutMs ?? this.defaultTimeoutMs;
    const maxRetries = reg.maxRetries ?? this.defaultMaxRetries;
    const retryBaseDelay = reg.retryBaseDelayMs ?? this.defaultRetryBaseDelayMs;
    const failureThreshold = reg.circuitBreakerThreshold ?? this.defaultCircuitThreshold;
    const cooldownMs = reg.circuitBreakerCooldownMs ?? this.defaultCircuitCooldownMs;

    let attempt = 0;
    let lastErr: any = null;
    let isRateLimit = false;

    while (attempt <= maxRetries) {
      try {
        const candidates = await Promise.race([
          reg.adapter.discover({
            category: request.category,
            location: request.location
              ? {
                  city: request.location.city ?? undefined,
                  pinCode: request.location.pinCode ?? undefined,
                }
              : undefined,
            structuredSpecs: request.structuredSpecs,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('PROVIDER_TIMEOUT')), timeoutMs),
          ),
        ]);

        const durationMs = Date.now() - providerStartTime;
        const count = candidates?.length ?? 0;

        // Record Success
        stats.successfulCalls++;
        stats.consecutiveFailures = 0;
        stats.circuitState = CircuitBreakerState.CLOSED;
        stats.lastSuccessTimestamp = Date.now();
        stats.totalLatencyMs += durationMs;

        return {
          provider: network,
          summary: {
            provider: network,
            status: count > 0 ? ProviderExecutionStatus.SUCCESS : ProviderExecutionStatus.EMPTY,
            candidateCount: count,
            durationMs,
            truthfulStatus,
            isTruthfulLive: isLive,
          },
          candidates: candidates ?? [],
        };
      } catch (err: any) {
        lastErr = err;
        attempt++;

        // Detect Rate Limit
        const errMsg = String(err?.message || '');
        if (
          errMsg.includes('429') ||
          errMsg.includes('RATE_LIMIT') ||
          errMsg.includes('Rate limit exceeded') ||
          err?.status === 429
        ) {
          isRateLimit = true;
          stats.rateLimitedCalls++;
        }

        // Bounded exponential backoff before next attempt
        if (attempt <= maxRetries) {
          let delayMs = retryBaseDelay * Math.pow(2, attempt - 1);
          // Check for Retry-After header if provided
          if (err?.retryAfterSeconds && typeof err.retryAfterSeconds === 'number') {
            delayMs = Math.min(timeoutMs, err.retryAfterSeconds * 1000);
          }
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    // All retry attempts exhausted - record failure & check circuit breaker
    const durationMs = Date.now() - providerStartTime;
    stats.failedCalls++;
    stats.consecutiveFailures++;
    stats.lastFailureTimestamp = Date.now();
    stats.lastError = lastErr?.message ?? 'Unknown provider error';
    stats.totalLatencyMs += durationMs;

    if (stats.consecutiveFailures >= failureThreshold) {
      stats.circuitState = CircuitBreakerState.OPEN;
      stats.circuitOpenUntil = Date.now() + cooldownMs;
    }

    const isTimeout = lastErr?.message === 'PROVIDER_TIMEOUT';

    return {
      provider: network,
      summary: {
        provider: network,
        status: isRateLimit
          ? ProviderExecutionStatus.RATE_LIMITED
          : isTimeout
            ? ProviderExecutionStatus.TIMEOUT
            : ProviderExecutionStatus.INTERNAL_ERROR,
        candidateCount: 0,
        durationMs,
        truthfulStatus,
        isTruthfulLive: isLive,
        errorMessage: isTimeout
          ? 'Provider request timed out'
          : isRateLimit
            ? 'Provider rate limit encountered with bounded retries'
            : lastErr?.message ?? 'Unknown provider error',
      },
      candidates: [],
    };
  }

  /**
   * Normalizes raw candidates, performs canonical identity resolution, capability evidence tiering,
   * spatial GIS calculation, capacity headroom, performance intelligence, freshness assessment,
   * dynamic confidence scoring, sanitizes match reasons, and deduplicates multi-provider matches safely.
   */
  private async normalizeAndDeduplicate(
    items: {
      candidate: NetworkDiscoveryCandidate;
      registration: DispatcherProviderRegistration;
    }[],
    request: EngineDiscoveryRequest,
    excludedIds: Set<string>,
  ): Promise<NormalizedSupplierCandidate[]> {
    // 1. Prepare Identity Resolution Inputs
    const identityInputs = items.map((item, idx) => ({
      item,
      candidateId: `cand-${item.candidate.network}-${idx}-${item.candidate.externalRef || item.candidate.businessName}`,
      canonicalSupplierId: item.candidate.canonicalSupplierId || (item.candidate as any).supplierId,
      pan: item.candidate.pan,
      gstin: item.candidate.gstin,
      externalRef: item.candidate.externalRef,
      businessName: item.candidate.businessName,
      network: item.candidate.network,
      tenantId: item.candidate.tenantId ?? request.organizationId,
    }));

    // 2. Perform Canonical Identity Resolution & Deduplication
    const { deduped } = CanonicalIdentityResolver.deduplicateCandidates(identityInputs, {
      tenantId: request.organizationId,
      knownRegistry: this.knownRegistry,
    });

    const normalizedList: NormalizedSupplierCandidate[] = [];
    const rfqSeed = request.rfqId ?? request.category;
    let index = 0;

    for (const group of deduped) {
      const primaryItem = group.primary.item;
      const raw = primaryItem.candidate;
      index++;

      // Exclusion check
      const canonicalRef = raw.canonicalSupplierId || raw.externalRef || `anon-${raw.network}-${raw.businessName}`;
      if (excludedIds.has(canonicalRef)) {
        continue;
      }

      // Aggregate seen networks across merged providers
      const seenNetworks = new Set<SupplierNetwork>();
      let bestMatchScore = raw.matchScore ?? 70;

      for (const entry of group.all) {
        seenNetworks.add(entry.item.candidate.network);
        if (entry.item.candidate.matchScore > bestMatchScore) {
          bestMatchScore = entry.item.candidate.matchScore;
        }
      }

      // Generate anonymous uncorrelatable Crockford Base32 alias
      const aliasSeed = `${rfqSeed}:${canonicalRef}:${index}`;
      const anonymousLabel = `Supplier ${generateCrockfordAlias(aliasSeed, 4)}`;

      // Location Intelligence Seam calculation
      const candidateLocation = {
        city: raw.capability?.serviceArea?.city ?? null,
        pinCode: raw.capability?.serviceArea?.pinCode ?? null,
      };

      const distanceResult = request.location
        ? await this.locationIntelligence.calculateDistance(
            candidateLocation,
            request.location,
          )
        : {
            distanceKm: undefined,
            isLocal: true,
            calculationMethod: 'UNDECLARED_NEUTRAL' as const,
            confidenceScore: 50,
          };

      // Match Reasons Sanitization (Anti-Leak)
      const sanitizedReasons = sanitizeCandidateMatchReasons([
        ...(raw.matchReasons ?? []),
        distanceResult.isLocal ? 'location_match' : 'regional_coverage',
        raw.capability?.verificationStatus === 'VERIFIED' ? 'verified_active' : 'active_status',
      ]);

      const isLive = primaryItem.registration.isLive ?? raw.network === SupplierNetwork.LOCAL_REGISTRY;

      // Multi-network consensus bonus for match score
      const seenCount = seenNetworks.size;
      const consensusBoost = seenCount > 1 ? Math.min(10, (seenCount - 1) * 5) : 0;
      const finalMatchScore = Math.min(100, Math.max(0, Math.round(bestMatchScore + consensusBoost)));

      // SN3-02: Capability Evidence Tiering
      const verificationSummary = CapabilityEvidenceEvaluator.evaluateEvidence({
        network: raw.network,
        verificationStatus: raw.capability?.verificationStatus,
        hasPlatformOrders: raw.hasPlatformOrders,
        isNetworkAuthenticated: raw.isNetworkAuthenticated,
        chamberAttestation: raw.chamberAttestation,
        claimedTier: raw.claimedTier,
        categories: raw.capability?.categories,
      });

      // SN3-03: Dynamic Capacity Headroom
      const capacityHeadroom = DynamicCapacityHeadroomCalculator.calculateHeadroom({
        declaredCapacity: raw.declaredCapacity,
        observedCapacity: raw.observedCapacity,
        activeBacklog: raw.activeBacklog,
        capacityUnit: raw.capacityUnit,
        backlogUnit: raw.backlogUnit,
        tenantId: request.organizationId,
      });

      // SN3-04: Supplier Performance Intelligence
      let scorecardFromRepo = null;
      if (raw.canonicalSupplierId && this.repositories?.supplierScorecards) {
        try {
          scorecardFromRepo = await this.repositories.supplierScorecards.findBySupplierId(
            raw.canonicalSupplierId,
          );
        } catch {
          scorecardFromRepo = null;
        }
      }

      const performanceSummary = SupplierPerformanceIntelligenceEvaluator.evaluatePerformance({
        scorecard: scorecardFromRepo as any,
        dimensions: raw.performanceMetrics as any,
        completedOrdersCount: raw.performanceMetrics?.completedOrdersCount,
      });

      // SN3-05: Freshness / Staleness Intelligence
      const freshnessAssessment = FreshnessIntelligenceEvaluator.evaluateFreshness(
        raw.lastVerifiedAt,
      );

      // SN3-06: Discovery Feedback Signals
      const feedbackSignals = DiscoveryFeedbackSignalsEvaluator.evaluateSignals(
        raw.feedbackStats ?? {},
      );

      // Construct normalized candidate
      const normalized: NormalizedSupplierCandidate = {
        candidateId: `cand-${canonicalRef.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        canonicalSupplierId: raw.canonicalSupplierId || (canonicalRef.startsWith('supplier-') || canonicalRef.startsWith('supp-') ? canonicalRef : undefined),
        anonymousLabel,
        matchScore: finalMatchScore,
        confidenceScore: distanceResult.confidenceScore,
        matchReasons: sanitizedReasons,
        capabilityMatch: {
          isMatch: true,
          matchedCategories: raw.capability?.categories ?? [request.category],
          capacityOk: capacityHeadroom.isHeadroomKnown ? capacityHeadroom.status !== 'EXHAUSTED' : true,
          capacityHeadroomRatio: capacityHeadroom.headroomRatio,
        },
        locationMatch: {
          isLocal: distanceResult.isLocal,
          serviceAreaMatch: distanceResult.isLocal,
          distanceKm: distanceResult.distanceKm,
          deliveryCity: request.location?.city ?? undefined,
          deliveryPinCode: request.location?.pinCode ?? undefined,
          estimatedTransitDays: distanceResult.estimatedTransitDays,
          calculationMethod: distanceResult.calculationMethod,
        },
        provenance: {
          primaryNetwork: raw.network,
          discoveredNetworks: Array.from(seenNetworks),
          externalRef: raw.externalRef,
          discoveredAt: new Date().toISOString(),
          verified: verificationSummary.isPlatformVerified || verificationSummary.isNetworkVerified,
          truthfulStatus:
            primaryItem.registration.truthfulStatus ??
            (isLive ? TruthfulProviderStatus.LIVE_ACTIVE : TruthfulProviderStatus.STUBBED_SIMULATION),
        },
        flags: {
          canReceiveRfq: raw.canReceiveRfq ?? true,
          canSubmitQuote: raw.canSubmitQuote ?? true,
          isVerifiedActive: true,
        },
        identityResolution: group.resolution,
        verificationSummary,
        capacityHeadroom,
        performanceSummary,
        freshnessAssessment,
        feedbackSignals,
      };

      // Compute dynamic discovery confidence score
      const confidenceAssessment = DynamicDiscoveryConfidenceEngine.assessCandidate(
        normalized,
        request.category,
      );
      normalized.confidenceScore = confidenceAssessment.overallConfidenceScore;

      normalizedList.push(normalized);
    }

    return normalizedList;
  }
}
