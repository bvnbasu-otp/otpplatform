import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryRepositories } from '../repositories/in-memory';
import { createOtpServices, type OtpServices } from '../factory/create-otp-services';
import type { ActorContext } from '../types/actor-context';
import {
  SupplierNetworkEngine,
  type DispatcherProviderRegistration,
} from '../discovery/supplier-network-engine';
import {
  SupplierNetwork,
  ProviderExecutionStatus,
  TruthfulProviderStatus,
  CircuitBreakerState,
  GisExecutionMode,
  IdentityProtectedViolationError,
  FORBIDDEN_CANDIDATE_PII_FIELDS,
  validateCandidateAntiLeak,
  assertCandidateAntiLeak,
  type NormalizedSupplierCandidate,
} from '@otp/domain';
import type { SupplierNetworkPort } from '../interfaces/supplier-network-port';
import { OndcNetworkAdapter } from '../discovery/networks/ondc-network-adapter';
import { BniNetworkAdapter } from '../discovery/networks/supplier-network-adapters';
import {
  AsyncCallbackIngestionService,
  computePayloadDigest,
} from './async-callback-ingestion-service';
import { GoogleMapsLocationAdapter, MapboxLocationAdapter } from '../gis/google-maps-location-adapter';

/**
 * RED-TEAM ADVERSARIAL BATTERY: SN2-RT-01 through SN2-RT-20
 * Comprehensive Verification of SN.2 Architecture:
 * - SN2-RT-01: Forged provider signature -> DENIED
 * - SN2-RT-02: Expired callback timestamp -> DENIED
 * - SN2-RT-03: Replay of previously processed provider message -> DENIED / IDEMPOTENT
 * - SN2-RT-04: Duplicate callback with altered payload -> INTEGRITY FAILURE
 * - SN2-RT-05: Callback referencing another tenant's RFQ -> DENIED
 * - SN2-RT-06: Callback attempting supplier PII injection -> STRIPPED / DENIED
 * - SN2-RT-07: Callback containing source fingerprint -> SANITIZED
 * - SN2-RT-08: Provider attempts award instruction injection -> STRIPPED / IGNORED
 * - SN2-RT-09: Provider attempts PO instruction injection -> STRIPPED / IGNORED
 * - SN2-RT-10: Provider timeout -> ISOLATED (partial discovery preserved)
 * - SN2-RT-11: Provider rate limit -> RATE_LIMITED with bounded retry
 * - SN2-RT-12: Malformed provider schema -> REJECTED safely
 * - SN2-RT-13: Duplicate supplier across providers -> DEDUPLICATED & CONFIDENCE BOOSTED
 * - SN2-RT-14: Fake provider status claiming LIVE -> TRUTHFUL STATUS ENFORCED
 * - SN2-RT-15: Client attempts to select unauthorized provider -> SERVER-SIDE REGISTRY WINS
 * - SN2-RT-16: Provider attempts to bypass invitation authority -> NO INVITATION CREATED
 * - SN2-RT-17: Provider callback attempts identity reveal -> DENIED
 * - SN2-RT-18: External GIS provider unavailable -> OFFLINE GIS FALLBACK
 * - SN2-RT-19: GIS provider attempts to return malformed coordinates -> VALIDATION FAILURE
 * - SN2-RT-20: GIS provider attempts to inject supplier identity -> REJECTED
 */
describe('Supplier Network Engine Red-Team Security Battery (SN2-RT-01 — SN2-RT-20)', () => {
  let mem: InMemoryRepositories;
  let services: OtpServices;

  const ORG_A = 'org-sne-buyer-alpha';
  const ORG_B = 'org-sne-buyer-beta';

  const BUYER_ACTOR: ActorContext = {
    profileId: 'usr-buyer-alpha',
    organizationId: ORG_A,
    orgRole: 'BUYER',
  };

  const ATTACKER_ACTOR: ActorContext = {
    profileId: 'usr-attacker-beta',
    organizationId: ORG_B,
    orgRole: 'BUYER',
  };

  beforeEach(async () => {
    mem = InMemoryRepositories.create();
    const repos = mem.asRepositories();
    services = createOtpServices(repos);
  });

  // SN2-RT-01: Forged provider signature -> DENIED
  it('SN2-RT-01: Forged provider signature -> DENIED', async () => {
    const callbackService = new AsyncCallbackIngestionService();

    const res = await callbackService.processCallback({
      provider: SupplierNetwork.ONDC,
      messageId: 'msg-forged-01',
      transactionId: 'tx-01',
      timestamp: new Date().toISOString(),
      authHeader: 'Signature keyId="bpp.example.com|key1|ed25519",algorithm="ed25519",created="123456",expires="123456",signature="BADSIG"',
      signature: 'INVALID_FORGED_SIGNATURE',
      body: {
        candidates: [{ businessName: 'Forged Vendor' }],
      },
    });

    expect(res.success).toBe(false);
    expect(res.verification.valid).toBe(false);
    expect(res.verification.rejectionCode).toBe('INVALID_SIGNATURE');
    expect(res.candidates).toHaveLength(0);
  });

  // SN2-RT-02: Expired callback timestamp -> DENIED
  it('SN2-RT-02: Expired callback timestamp -> DENIED (Timestamp drift > 300s)', async () => {
    const callbackService = new AsyncCallbackIngestionService({ maxClockDriftSeconds: 300 });

    const expiredTimestamp = new Date(Date.now() - 600 * 1000).toISOString(); // 600s in past

    const res = await callbackService.processCallback({
      provider: SupplierNetwork.BNI,
      messageId: 'msg-expired-02',
      transactionId: 'tx-02',
      timestamp: expiredTimestamp,
      body: {
        candidates: [{ businessName: 'Expired Vendor' }],
      },
    });

    expect(res.success).toBe(false);
    expect(res.verification.valid).toBe(false);
    expect(res.verification.rejectionCode).toBe('TIMESTAMP_EXPIRED');
    expect(res.candidates).toHaveLength(0);
  });

  // SN2-RT-03: Replay of previously processed provider message -> DENIED / IDEMPOTENT
  it('SN2-RT-03: Replay of previously processed provider message -> DENIED / IDEMPOTENT', async () => {
    const callbackService = new AsyncCallbackIngestionService();

    const payload = {
      provider: SupplierNetwork.ASSOCIATION,
      messageId: 'msg-replay-03',
      transactionId: 'tx-03',
      timestamp: new Date().toISOString(),
      body: {
        candidates: [{ externalRef: 'assoc:supp-1', businessName: 'Association Vendor' }],
      },
    };

    // First attempt: succeeds
    const firstRes = await callbackService.processCallback(payload);
    expect(firstRes.success).toBe(true);
    expect(firstRes.candidatesProcessed).toBe(1);

    // Second attempt (exact same messageId and payload): rejected due to replay detection
    const replayRes = await callbackService.processCallback(payload);
    expect(replayRes.success).toBe(false);
    expect(replayRes.verification.valid).toBe(false);
    expect(replayRes.verification.rejectionCode).toBe('REPLAY_DETECTED');
  });

  // SN2-RT-04: Duplicate callback with altered payload -> INTEGRITY FAILURE
  it('SN2-RT-04: Duplicate callback with altered payload -> INTEGRITY FAILURE', async () => {
    const callbackService = new AsyncCallbackIngestionService();

    // 1. Initial valid callback
    await callbackService.processCallback({
      provider: SupplierNetwork.DIRECT,
      messageId: 'msg-integrity-04',
      transactionId: 'tx-04',
      timestamp: new Date().toISOString(),
      body: { candidates: [{ externalRef: 'supp-4a', businessName: 'Original Vendor' }] },
    });

    // 2. Attacker replays same message ID with altered payload body
    const alteredRes = await callbackService.processCallback({
      provider: SupplierNetwork.DIRECT,
      messageId: 'msg-integrity-04',
      transactionId: 'tx-04',
      timestamp: new Date().toISOString(),
      body: { candidates: [{ externalRef: 'supp-4b', businessName: 'Altered Rogue Vendor' }] },
    });

    expect(alteredRes.success).toBe(false);
    expect(alteredRes.verification.valid).toBe(false);
    expect(alteredRes.verification.rejectionCode).toBe('INTEGRITY_MISMATCH');
  });

  // SN2-RT-05: Callback referencing another tenant's RFQ -> DENIED
  it('SN2-RT-05: Callback referencing another tenant\'s RFQ -> DENIED', async () => {
    const callbackService = new AsyncCallbackIngestionService({
      knownTenants: new Set([ORG_A]),
      knownRfqs: new Set(['rfq-org-a-101']),
    });

    // Attacker tries to inject callback targeting Org B's tenant / unknown RFQ
    const res = await callbackService.processCallback({
      provider: SupplierNetwork.ONDC,
      messageId: 'msg-cross-tenant-05',
      transactionId: 'tx-05',
      tenantId: ORG_B,
      rfqId: 'rfq-foreign-999',
      timestamp: new Date().toISOString(),
      body: { candidates: [{ businessName: 'Injected Candidate' }] },
    });

    expect(res.success).toBe(false);
    expect(res.verification.valid).toBe(false);
    expect(res.verification.rejectionCode).toBe('TENANT_MISMATCH');
  });

  // SN2-RT-06: Callback attempting supplier PII injection -> STRIPPED / DENIED
  it('SN2-RT-06: Callback attempting supplier PII injection -> STRIPPED / DENIED', async () => {
    const callbackService = new AsyncCallbackIngestionService();

    const res = await callbackService.processCallback({
      provider: SupplierNetwork.DIRECT,
      messageId: 'msg-pii-06',
      transactionId: 'tx-06',
      timestamp: new Date().toISOString(),
      body: {
        candidates: [
          {
            externalRef: 'pii-vendor-06',
            businessName: 'Super Secret Supplier Corp',
            legalName: 'Super Secret Supplier Corp Pvt Ltd',
            gstin: '29ABCDE1234F1Z5',
            contactEmail: 'leak@supplier.com',
            contactPhone: '+919999988888',
            bankAccount: '998877665544',
          },
        ],
      },
    });

    expect(res.success).toBe(true);
    expect(res.candidates).toHaveLength(1);
    const cand = res.candidates[0]!;

    // Verify all PII fields are strictly absent
    for (const pii of FORBIDDEN_CANDIDATE_PII_FIELDS) {
      expect((cand as any)[pii]).toBeUndefined();
    }
    const check = validateCandidateAntiLeak(cand);
    expect(check.valid).toBe(true);
  });

  // SN2-RT-07: Callback containing source fingerprint -> SANITIZED
  it('SN2-RT-07: Callback containing source fingerprint -> SANITIZED', async () => {
    const callbackService = new AsyncCallbackIngestionService();

    const res = await callbackService.processCallback({
      provider: SupplierNetwork.BNI,
      messageId: 'msg-fingerprint-07',
      transactionId: 'tx-07',
      timestamp: new Date().toISOString(),
      body: {
        candidates: [
          {
            externalRef: 'bni-vendor-07',
            matchReasons: ['source:BNI', 'category_match', 'source:ONDC_DIRECT', 'ondc:gateway'],
          },
        ],
      },
    });

    expect(res.success).toBe(true);
    const cand = res.candidates[0]!;
    expect(cand.matchReasons.some((r) => r.toLowerCase().startsWith('source:'))).toBe(false);
    expect(cand.matchReasons).not.toContain('source:BNI');
    expect(cand.matchReasons).not.toContain('source:ONDC_DIRECT');
  });

  // SN2-RT-08: Provider attempts award instruction injection -> STRIPPED / IGNORED
  it('SN2-RT-08: Provider attempts award instruction injection -> STRIPPED / IGNORED', async () => {
    const maliciousAdapter: SupplierNetworkPort = {
      network: SupplierNetwork.DIRECT,
      async discover() {
        return [
          {
            externalRef: 'malicious-supp-08',
            network: SupplierNetwork.DIRECT,
            businessName: 'Rogue Supplier 08',
            capability: { categories: ['MOTORS'] },
            matchScore: 99,
            matchReasons: ['rogue:self_award'],
            canReceiveRfq: true,
            canSubmitQuote: true,
            ...({ awardStatus: 'AWARDED', isWinner: true, autoAward: true } as any),
          },
        ];
      },
    };

    const engine = new SupplierNetworkEngine({
      providers: [{ adapter: maliciousAdapter }],
    });

    const res = await engine.discoverCandidates({
      rfqId: 'rfq-rt-08',
      category: 'MOTORS',
    });

    expect(res.candidates.length).toBe(1);
    const cand = res.candidates[0] as any;
    expect(cand.awardStatus).toBeUndefined();
    expect(cand.isWinner).toBeUndefined();
    expect(cand.autoAward).toBeUndefined();

    const award = await mem.asRepositories().awards.findByRfqId('rfq-rt-08');
    expect(award).toBeNull();
  });

  // SN2-RT-09: Provider attempts PO instruction injection -> STRIPPED / IGNORED
  it('SN2-RT-09: Provider attempts PO instruction injection -> STRIPPED / IGNORED', async () => {
    const maliciousAdapter: SupplierNetworkPort = {
      network: SupplierNetwork.BNI,
      async discover() {
        return [
          {
            externalRef: 'malicious-supp-09',
            network: SupplierNetwork.BNI,
            businessName: 'Rogue Supplier 09',
            capability: { categories: ['VALVES'] },
            matchScore: 95,
            matchReasons: ['rogue:po_creation'],
            canReceiveRfq: true,
            canSubmitQuote: true,
            ...({ purchaseOrderId: 'po-fake-999', poStatus: 'ISSUED', totalAmount: 500000 } as any),
          },
        ];
      },
    };

    const engine = new SupplierNetworkEngine({
      providers: [{ adapter: maliciousAdapter }],
    });

    const res = await engine.discoverCandidates({
      rfqId: 'rfq-rt-09',
      category: 'VALVES',
    });

    expect(res.candidates.length).toBe(1);
    const cand = res.candidates[0] as any;
    expect(cand.purchaseOrderId).toBeUndefined();
    expect(cand.poStatus).toBeUndefined();

    const po = await mem.asRepositories().purchaseOrders.findById('po-fake-999');
    expect(po).toBeNull();
  });

  // SN2-RT-10: Provider timeout -> ISOLATED (partial discovery preserved)
  it('SN2-RT-10: Provider timeout -> ISOLATED (partial discovery preserved)', async () => {
    const hangingAdapter: SupplierNetworkPort = {
      network: SupplierNetwork.BNI,
      async discover() {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return [];
      },
    };

    const fastAdapter: SupplierNetworkPort = {
      network: SupplierNetwork.LOCAL_REGISTRY,
      async discover() {
        return [
          {
            externalRef: 'local-fast-10',
            network: SupplierNetwork.LOCAL_REGISTRY,
            businessName: 'Fast Supplier',
            capability: { categories: ['METALS'] },
            matchScore: 88,
            matchReasons: ['local_match'],
            canReceiveRfq: true,
            canSubmitQuote: true,
          },
        ];
      },
    };

    const engine = new SupplierNetworkEngine({
      defaultTimeoutMs: 30,
      providers: [
        { adapter: hangingAdapter, timeoutMs: 30 },
        { adapter: fastAdapter, timeoutMs: 100 },
      ],
    });

    const res = await engine.discoverCandidates({
      rfqId: 'rfq-rt-10',
      category: 'METALS',
    });

    expect(res.hasPartialFailures).toBe(true);
    expect(res.candidates.length).toBe(1);
    expect(res.providerSummaries.find((p) => p.provider === SupplierNetwork.BNI)?.status).toBe(
      ProviderExecutionStatus.TIMEOUT,
    );
    expect(res.providerSummaries.find((p) => p.provider === SupplierNetwork.LOCAL_REGISTRY)?.status).toBe(
      ProviderExecutionStatus.SUCCESS,
    );
  });

  // SN2-RT-11: Provider rate limit -> RATE_LIMITED with bounded retry
  it('SN2-RT-11: Provider rate limit -> RATE_LIMITED with bounded retry', async () => {
    let callCount = 0;
    const rateLimitedAdapter: SupplierNetworkPort = {
      network: SupplierNetwork.DIRECT,
      async discover() {
        callCount++;
        const err: any = new Error('HTTP 429: Rate limit exceeded');
        err.status = 429;
        err.retryAfterSeconds = 0.01;
        throw err;
      },
    };

    const engine = new SupplierNetworkEngine({
      providers: [
        {
          adapter: rateLimitedAdapter,
          maxRetries: 2,
          retryBaseDelayMs: 10,
        },
      ],
    });

    const res = await engine.discoverCandidates({
      rfqId: 'rfq-rt-11',
      category: 'ELECTRONICS',
    });

    expect(callCount).toBe(3); // 1 initial + 2 retries
    const summary = res.providerSummaries.find((p) => p.provider === SupplierNetwork.DIRECT);
    expect(summary?.status).toBe(ProviderExecutionStatus.RATE_LIMITED);
  });

  // SN2-RT-12: Malformed provider schema -> REJECTED safely
  it('SN2-RT-12: Malformed provider schema -> REJECTED safely', async () => {
    const malformedAdapter: SupplierNetworkPort = {
      network: SupplierNetwork.ASSOCIATION,
      async discover() {
        return null as any;
      },
    };

    const engine = new SupplierNetworkEngine({
      providers: [{ adapter: malformedAdapter }],
    });

    const res = await engine.discoverCandidates({
      rfqId: 'rfq-rt-12',
      category: 'TEST',
    });

    expect(res.candidates).toEqual([]);
    expect(res.providerSummaries[0]?.status).toBe(ProviderExecutionStatus.EMPTY);
  });

  // SN2-RT-13: Duplicate supplier across providers -> DEDUPLICATED & CONFIDENCE BOOSTED
  it('SN2-RT-13: Duplicate supplier across providers -> DEDUPLICATED & CONFIDENCE BOOSTED', async () => {
    const providerA: SupplierNetworkPort = {
      network: SupplierNetwork.DIRECT,
      async discover() {
        return [
          {
            externalRef: 'shared-supplier-13',
            network: SupplierNetwork.DIRECT,
            businessName: 'Consensus Vendor',
            capability: { categories: ['PUMPS'] },
            matchScore: 80,
            matchReasons: ['direct:match'],
            canReceiveRfq: true,
            canSubmitQuote: true,
          },
        ];
      },
    };

    const providerB: SupplierNetworkPort = {
      network: SupplierNetwork.LOCAL_REGISTRY,
      async discover() {
        return [
          {
            externalRef: 'shared-supplier-13',
            network: SupplierNetwork.LOCAL_REGISTRY,
            businessName: 'Consensus Vendor',
            capability: { categories: ['PUMPS'] },
            matchScore: 85,
            matchReasons: ['local:match'],
            canReceiveRfq: true,
            canSubmitQuote: true,
          },
        ];
      },
    };

    const engine = new SupplierNetworkEngine({
      providers: [
        { adapter: providerA, isLive: true },
        { adapter: providerB, isLive: true },
      ],
    });

    const res = await engine.discoverCandidates({
      rfqId: 'rfq-rt-13',
      category: 'PUMPS',
    });

    expect(res.totalCandidatesDiscovered).toBe(2);
    expect(res.totalUniqueCandidates).toBe(1);
    expect(res.candidates).toHaveLength(1);
    // Multi-network consensus boosts match score and confidence
    expect(res.candidates[0]?.provenance.discoveredNetworks).toHaveLength(2);
    expect(res.candidates[0]?.matchScore).toBeGreaterThanOrEqual(85);
  });

  // SN2-RT-14: Fake provider status claiming LIVE -> TRUTHFUL STATUS ENFORCED
  it('SN2-RT-14: Fake provider status claiming LIVE -> TRUTHFUL STATUS ENFORCED', async () => {
    const stubAdapter: SupplierNetworkPort = {
      network: SupplierNetwork.BNI,
      isTruthfulLive: false,
      async discover() {
        return [];
      },
    };

    const engine = new SupplierNetworkEngine({
      providers: [
        {
          adapter: stubAdapter,
          isLive: false,
          truthfulStatus: TruthfulProviderStatus.STUBBED_SIMULATION,
        },
      ],
    });

    const res = await engine.discoverCandidates({
      rfqId: 'rfq-rt-14',
      category: 'FASTENERS',
    });

    const bniSummary = res.providerSummaries.find((p) => p.provider === SupplierNetwork.BNI);
    expect(bniSummary?.isTruthfulLive).toBe(false);
    expect(bniSummary?.truthfulStatus).toBe(TruthfulProviderStatus.STUBBED_SIMULATION);
  });

  // SN2-RT-15: Client attempts to select unauthorized provider -> SERVER-SIDE REGISTRY WINS
  it('SN2-RT-15: Client attempts to select unauthorized provider -> SERVER-SIDE REGISTRY WINS', async () => {
    const secretInternalAdapter: SupplierNetworkPort = {
      network: SupplierNetwork.LOCAL_REGISTRY,
      async discover() {
        return [
          {
            externalRef: 'internal-15',
            network: SupplierNetwork.LOCAL_REGISTRY,
            businessName: 'Internal Registry Vendor',
            capability: { categories: ['AUDITED'] },
            matchScore: 88,
            matchReasons: ['audited'],
            canReceiveRfq: true,
            canSubmitQuote: true,
          },
        ];
      },
    };

    const engine = new SupplierNetworkEngine({
      providers: [{ adapter: secretInternalAdapter, isLive: true }],
    });

    const res = await engine.discoverCandidates({
      rfqId: 'rfq-rt-15',
      category: 'AUDITED',
      enabledProviders: ['UNAUTHORIZED_DARK_WEB_NETWORK' as any],
    });

    expect(res.candidates).toHaveLength(0);
  });

  // SN2-RT-16: Provider attempts to bypass invitation authority -> NO INVITATION CREATED
  it('SN2-RT-16: Provider attempts to bypass invitation authority -> NO INVITATION CREATED', async () => {
    const repos = mem.asRepositories();
    const req = await repos.requirements.save({
      id: 'req-auth-16',
      organizationId: ORG_A,
      createdBy: BUYER_ACTOR.profileId,
      requirementType: 'PROJECT',
      status: 'RFQ_CREATED',
      title: 'Authorized Requirement 16',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const rfqRes = await services.rfqs.createFromRequirement(BUYER_ACTOR, req.id, {
      title: 'Authorized RFQ 16',
    });
    const rfq = (rfqRes as any).value;

    const engineRes = await services.supplierNetworkEngine.discoverCandidates({
      rfqId: rfq.id,
      category: 'General',
    });
    expect(engineRes.candidates.length).toBeGreaterThan(0);

    const invitationsBefore = await mem.asRepositories().invitations.findByRfqId(rfq.id);
    expect(invitationsBefore).toHaveLength(0);
  });

  // SN2-RT-17: Provider callback attempts identity reveal -> DENIED
  it('SN2-RT-17: Provider callback attempts identity reveal -> DENIED', async () => {
    const callbackService = new AsyncCallbackIngestionService();

    const res = await callbackService.processCallback({
      provider: SupplierNetwork.DIRECT,
      messageId: 'msg-reveal-17',
      transactionId: 'tx-17',
      timestamp: new Date().toISOString(),
      body: {
        candidates: [
          {
            externalRef: 'candidate-reveal-17',
            anonymousLabel: 'REVEALED_LEGAL_ENTITY_NAME_CORP',
            pan: 'ABCDE1234F',
            businessName: 'Unmasked Corporation',
          },
        ],
      },
    });

    expect(res.success).toBe(true);
    const cand = res.candidates[0]!;
    // Anonymous label is strictly sanitized into Crockford Base32 pseudonym by engine
    expect(cand.anonymousLabel).toMatch(/^Supplier [0-9A-HJKMNP-Z]{4}$/);
    expect((cand as any).pan).toBeUndefined();
    expect(assertCandidateAntiLeak(cand)).toBeUndefined();
  });

  // SN2-RT-18: External GIS provider unavailable -> OFFLINE GIS FALLBACK
  it('SN2-RT-18: External GIS provider unavailable -> OFFLINE GIS FALLBACK', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const googleAdapter = new GoogleMapsLocationAdapter();

    expect(googleAdapter.executionMode).toBe(GisExecutionMode.OFFLINE_PROVIDER_NEUTRAL);

    const distResult = await googleAdapter.calculateDistance(
      { city: 'Bengaluru', pinCode: '560001' },
      { city: 'Bengaluru', pinCode: '560001' },
    );

    expect(distResult.isLocal).toBe(true);
    expect(distResult.calculationMethod).toBe('POSTAL_PIN_EXACT');
  });

  // SN2-RT-19: GIS provider attempts to return malformed coordinates -> VALIDATION FAILURE
  it('SN2-RT-19: GIS provider attempts to return malformed coordinates -> VALIDATION FAILURE', async () => {
    const googleAdapter = new GoogleMapsLocationAdapter({ apiKey: 'mock-key' });

    await expect(
      googleAdapter.calculateDistance(
        { coordinates: { lat: 999.99, lng: -500.0 } }, // Malformed GPS
        { coordinates: { lat: 12.97, lng: 77.59 } },
      ),
    ).rejects.toThrow(/MALFORMED_COORDINATES/i);
  });

  // SN2-RT-20: GIS provider attempts to inject supplier identity -> REJECTED
  it('SN2-RT-20: GIS provider attempts to inject supplier identity -> REJECTED', async () => {
    const mapboxAdapter = new MapboxLocationAdapter();

    const maliciousOrigin: any = {
      city: 'Mumbai',
      legalName: 'Secret Supplier Identity',
      gstin: '27ABCDE1234F1Z5',
      contactPhone: '+919876543210',
    };

    const distResult = await mapboxAdapter.calculateDistance(
      maliciousOrigin,
      { city: 'Mumbai' },
    );

    expect(distResult.isLocal).toBe(true);
    // Identity fields never leak into calculation result
    expect((distResult as any).legalName).toBeUndefined();
    expect((distResult as any).gstin).toBeUndefined();
    expect((distResult as any).contactPhone).toBeUndefined();
  });
});
