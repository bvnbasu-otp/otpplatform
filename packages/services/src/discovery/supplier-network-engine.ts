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
} from '@otp/domain';
import type {
  SupplierNetworkPort,
  NetworkDiscoveryCandidate,
} from '../interfaces/supplier-network-port';
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

export interface SupplierNetworkEngineOptions {
  providers?: DispatcherProviderRegistration[];
  locationIntelligence?: LocationIntelligencePort;
  defaultTimeoutMs?: number;
  defaultMaxRetries?: number;
  defaultRetryBaseDelayMs?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerCooldownMs?: number;
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
 * Supplier Network Engine (SNE) — Provider Dispatcher & Core Orchestration.
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
 */
export class SupplierNetworkEngine {
  private readonly providers = new Map<SupplierNetwork, DispatcherProviderRegistration>();
  private readonly providerStats = new Map<SupplierNetwork, ProviderStats>();
  private readonly locationIntelligence: LocationIntelligencePort;
  private readonly defaultTimeoutMs: number;
  private readonly defaultMaxRetries: number;
  private readonly defaultRetryBaseDelayMs: number;
  private readonly defaultCircuitThreshold: number;
  private readonly defaultCircuitCooldownMs: number;

  constructor(options: SupplierNetworkEngineOptions = {}) {
    this.locationIntelligence =
      options.locationIntelligence ?? new ProviderNeutralLocationIntelligence();
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 5000;
    this.defaultMaxRetries = options.defaultMaxRetries ?? 2;
    this.defaultRetryBaseDelayMs = options.defaultRetryBaseDelayMs ?? 50;
    this.defaultCircuitThreshold = options.circuitBreakerThreshold ?? 3;
    this.defaultCircuitCooldownMs = options.circuitBreakerCooldownMs ?? 10000;

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
   * Main Orchestration Entry Point: Dispatches discovery requests across all
   * eligible provider adapters with timeout containment, normalization,
   * GIS distance intelligence, dynamic confidence scoring, anti-leak enforcement,
   * and cross-provider deduplication.
   */
  async discoverCandidates(request: EngineDiscoveryRequest): Promise<EngineDiscoveryResponse> {
    const startTime = Date.now();
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

    const durationMs = Date.now() - startTime;

    return {
      candidates: cappedCandidates,
      providerSummaries,
      totalCandidatesDiscovered: rawCandidatesWithNetwork.length,
      totalUniqueCandidates: cappedCandidates.length,
      durationMs,
      hasPartialFailures,
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
   * Normalizes raw candidates, performs spatial GIS calculation, dynamic confidence scoring,
   * sanitizes match reasons, and deduplicates multi-provider matches safely.
   */
  private async normalizeAndDeduplicate(
    items: {
      candidate: NetworkDiscoveryCandidate;
      registration: DispatcherProviderRegistration;
    }[],
    request: EngineDiscoveryRequest,
    excludedIds: Set<string>,
  ): Promise<NormalizedSupplierCandidate[]> {
    // Map keyed by canonical identifier (or externalRef if no canonical ID)
    const dedupedMap = new Map<
      string,
      {
        candidate: NetworkDiscoveryCandidate;
        registration: DispatcherProviderRegistration;
        seenNetworks: Set<SupplierNetwork>;
        bestMatchScore: number;
      }
    >();

    for (const item of items) {
      const raw = item.candidate;
      // Deduplication key
      const key = raw.externalRef || `anon-${raw.network}-${raw.businessName}`;

      if (excludedIds.has(key)) {
        continue;
      }

      const existing = dedupedMap.get(key);
      if (existing) {
        existing.seenNetworks.add(raw.network);
        if (raw.matchScore > existing.bestMatchScore) {
          existing.bestMatchScore = raw.matchScore;
          existing.candidate = raw;
        }
      } else {
        dedupedMap.set(key, {
          candidate: raw,
          registration: item.registration,
          seenNetworks: new Set([raw.network]),
          bestMatchScore: raw.matchScore,
        });
      }
    }

    const normalizedList: NormalizedSupplierCandidate[] = [];
    const rfqSeed = request.rfqId ?? request.category;
    let index = 0;

    for (const [key, val] of dedupedMap.entries()) {
      const raw = val.candidate;
      index++;

      // Generate anonymous uncorrelatable Crockford Base32 alias
      const aliasSeed = `${rfqSeed}:${key}:${index}`;
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
        ...raw.matchReasons,
        distanceResult.isLocal ? 'location_match' : 'regional_coverage',
        raw.capability?.verificationStatus === 'VERIFIED' ? 'verified_active' : 'active_status',
      ]);

      const isLive = val.registration.isLive ?? val.candidate.network === SupplierNetwork.LOCAL_REGISTRY;

      // Multi-network consensus bonus for match score & confidence
      const seenCount = val.seenNetworks.size;
      const consensusBoost = seenCount > 1 ? Math.min(10, (seenCount - 1) * 5) : 0;
      const finalMatchScore = Math.min(100, Math.max(0, Math.round(val.bestMatchScore + consensusBoost)));

      const normalized: NormalizedSupplierCandidate = {
        candidateId: `cand-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        canonicalSupplierId: key.startsWith('supplier-') || key.startsWith('supp-') ? key : undefined,
        anonymousLabel,
        matchScore: finalMatchScore,
        confidenceScore: distanceResult.confidenceScore,
        matchReasons: sanitizedReasons,
        capabilityMatch: {
          isMatch: true,
          matchedCategories: raw.capability?.categories ?? [request.category],
          capacityOk: true,
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
          discoveredNetworks: Array.from(val.seenNetworks),
          externalRef: raw.externalRef,
          discoveredAt: new Date().toISOString(),
          verified: raw.capability?.verificationStatus === 'VERIFIED' || raw.capability?.verificationStatus === 'NETWORK_VERIFIED',
          truthfulStatus: val.registration.truthfulStatus ?? (isLive ? TruthfulProviderStatus.LIVE_ACTIVE : TruthfulProviderStatus.STUBBED_SIMULATION),
        },
        flags: {
          canReceiveRfq: raw.canReceiveRfq ?? true,
          canSubmitQuote: raw.canSubmitQuote ?? true,
          isVerifiedActive: true,
        },
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
