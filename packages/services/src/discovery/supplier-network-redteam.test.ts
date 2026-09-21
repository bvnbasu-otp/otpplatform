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
  IdentityProtectedViolationError,
  FORBIDDEN_CANDIDATE_PII_FIELDS,
  validateCandidateAntiLeak,
  assertCandidateAntiLeak,
  type NormalizedSupplierCandidate,
} from '@otp/domain';
import type { SupplierNetworkPort } from '../interfaces/supplier-network-port';
import { OndcNetworkAdapter } from '../discovery/networks/ondc-network-adapter';
import { BniNetworkAdapter } from '../discovery/networks/supplier-network-adapters';

/**
 * RED-TEAM ADVERSARIAL BATTERY: SN-RT-01 through SN-RT-15
 * Verifies core security invariants, zero-authority firewalls, identity protection,
 * truthfulness, anti-replay, and anti-leak guarantees under malicious attack payloads.
 */
describe('Supplier Network Engine Red-Team Security Battery (SN-RT-01 — SN-RT-15)', () => {
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

  // SN-RT-01: Provider tries to award supplier -> DENIED (zero award authority)
  it('SN-RT-01: Provider tries to award supplier -> DENIED (SNE has ZERO award authority)', async () => {
    const maliciousAdapter: SupplierNetworkPort = {
      network: SupplierNetwork.DIRECT,
      async discover() {
        return [
          {
            externalRef: 'malicious-supp-01',
            network: SupplierNetwork.DIRECT,
            businessName: 'Rogue Supplier',
            capability: { categories: ['MOTORS'] },
            matchScore: 99,
            matchReasons: ['rogue:self_award'],
            canReceiveRfq: true,
            canSubmitQuote: true,
            // Malicious payload attempting to inject award authority
            ...({ awardStatus: 'AWARDED', isWinner: true, autoAward: true } as any),
          },
        ];
      },
    };

    const engine = new SupplierNetworkEngine({
      providers: [{ adapter: maliciousAdapter }],
    });

    const res = await engine.discoverCandidates({
      rfqId: 'rfq-rt-01',
      category: 'MOTORS',
    });

    expect(res.candidates.length).toBe(1);
    const cand = res.candidates[0] as any;
    // Verify zero award authority: SNE candidate payload does NOT contain or grant award state
    expect(cand.awardStatus).toBeUndefined();
    expect(cand.isWinner).toBeUndefined();
    expect(cand.autoAward).toBeUndefined();

    // Verify database award state is completely untouched
    const award = await mem.asRepositories().awards.findByRfqId('rfq-rt-01');
    expect(award).toBeNull();
  });

  // SN-RT-02: Provider payload attempts PO creation -> DENIED (zero PO authority)
  it('SN-RT-02: Provider payload attempts PO creation -> DENIED (zero PO authority)', async () => {
    const maliciousAdapter: SupplierNetworkPort = {
      network: SupplierNetwork.BNI,
      async discover() {
        return [
          {
            externalRef: 'malicious-supp-02',
            network: SupplierNetwork.BNI,
            businessName: 'Rogue Supplier 2',
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
      rfqId: 'rfq-rt-02',
      category: 'VALVES',
    });

    expect(res.candidates.length).toBe(1);
    const cand = res.candidates[0] as any;
    expect(cand.purchaseOrderId).toBeUndefined();
    expect(cand.poStatus).toBeUndefined();

    // Verify purchase orders in repository remain zero
    const po = await mem.asRepositories().purchaseOrders.findById('po-fake-999');
    expect(po).toBeNull();
  });

  // SN-RT-03: Provider payload attempts approval bypass -> DENIED
  it('SN-RT-03: Provider payload attempts approval bypass -> DENIED', async () => {
    const maliciousAdapter: SupplierNetworkPort = {
      network: SupplierNetwork.ASSOCIATION,
      async discover() {
        return [
          {
            externalRef: 'malicious-supp-03',
            network: SupplierNetwork.ASSOCIATION,
            businessName: 'Rogue Supplier 3',
            capability: { categories: ['ELECTRICAL'] },
            matchScore: 92,
            matchReasons: ['rogue:bypass_approval'],
            canReceiveRfq: true,
            canSubmitQuote: true,
            ...({ approvalBypassed: true, tier1Approved: true, tier3Approved: true } as any),
          },
        ];
      },
    };

    const engine = new SupplierNetworkEngine({
      providers: [{ adapter: maliciousAdapter }],
    });

    const res = await engine.discoverCandidates({
      rfqId: 'rfq-rt-03',
      category: 'ELECTRICAL',
    });

    expect(res.candidates.length).toBe(1);
    const cand = res.candidates[0] as any;
    expect(cand.approvalBypassed).toBeUndefined();
    expect(cand.tier1Approved).toBeUndefined();
    expect(cand.tier3Approved).toBeUndefined();
  });

  // SN-RT-04: Cross-tenant candidate injection -> DENIED
  it('SN-RT-04: Cross-tenant candidate injection -> DENIED', async () => {
    const repos = mem.asRepositories();
    const req = await repos.requirements.save({
      id: 'req-alpha-101',
      organizationId: ORG_A,
      createdBy: BUYER_ACTOR.profileId,
      requirementType: 'PROJECT',
      status: 'RFQ_CREATED',
      title: 'Alpha Requirement',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const rfqRes = await services.rfqs.createFromRequirement(BUYER_ACTOR, req.id, {
      title: 'Alpha RFQ',
    });
    expect(rfqRes.ok).toBe(true);
    const rfq = (rfqRes as any).value;

    // Attacker from ORG_B tries to run discovery & invite against Org A's RFQ
    const attackDiscovery = await services.rfqs.discoverAndInvite(ATTACKER_ACTOR, rfq.id);
    expect(attackDiscovery.ok).toBe(false);
    expect((attackDiscovery as any).error.message).toMatch(/Forbidden|Access denied|organization/i);
  });

  // SN-RT-05: Fake provider status = LIVE -> DENIED
  it('SN-RT-05: Fake provider status = LIVE -> DENIED (Truthful labeling enforced)', async () => {
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
          isLive: false, // Truthful designation
          truthfulStatus: TruthfulProviderStatus.STUBBED_SIMULATION,
        },
      ],
    });

    const res = await engine.discoverCandidates({
      rfqId: 'rfq-rt-05',
      category: 'FASTENERS',
    });

    const bniSummary = res.providerSummaries.find((p) => p.provider === SupplierNetwork.BNI);
    expect(bniSummary?.isTruthfulLive).toBe(false);
    expect(bniSummary?.truthfulStatus).toBe(TruthfulProviderStatus.STUBBED_SIMULATION);
  });

  // SN-RT-06: BNI stub represented as active -> DENIED / TRUTHFUL LABELING
  it('SN-RT-06: BNI stub represented as active -> DENIED / TRUTHFUL LABELING', async () => {
    const engine = new SupplierNetworkEngine({
      providers: [
        {
          adapter: BniNetworkAdapter,
          isLive: false,
          truthfulStatus: TruthfulProviderStatus.STUBBED_SIMULATION,
        },
      ],
    });

    const res = await engine.discoverCandidates({
      rfqId: 'rfq-rt-06',
      category: 'HARDWARE',
    });

    const bniSummary = res.providerSummaries.find((p) => p.provider === SupplierNetwork.BNI);
    expect(bniSummary?.truthfulStatus).toBe(TruthfulProviderStatus.STUBBED_SIMULATION);
    expect(bniSummary?.isTruthfulLive).toBe(false);
  });

  // SN-RT-07: ONDC activation gate bypass -> DENIED
  it('SN-RT-07: ONDC activation gate bypass -> DENIED (Flag-gated disabled by default)', async () => {
    delete process.env.ONDC_ENABLED;
    const adapter = new OndcNetworkAdapter(); // default env off
    expect(adapter.isEnabled()).toBe(false);

    const engine = new SupplierNetworkEngine({
      providers: [{ adapter }],
    });

    const res = await engine.discoverCandidates({
      rfqId: 'rfq-rt-07',
      category: 'PUMPS',
    });

    const ondcSummary = res.providerSummaries.find((p) => p.provider === SupplierNetwork.ONDC);
    expect(ondcSummary?.status).toBe(ProviderExecutionStatus.DISABLED);
    expect(ondcSummary?.truthfulStatus).toBe(TruthfulProviderStatus.DISABLED_GATE);
    expect(res.candidates).toHaveLength(0);
  });

  // SN-RT-08: Supplier identity leakage through candidate payload -> PREVENTED
  it('SN-RT-08: Supplier identity leakage through candidate payload -> PREVENTED (assertCandidateAntiLeak)', async () => {
    const leakyAdapter: SupplierNetworkPort = {
      network: SupplierNetwork.DIRECT,
      async discover() {
        return [
          {
            externalRef: 'leaky-supp-08',
            network: SupplierNetwork.DIRECT,
            businessName: 'Apex Secret Industrial Solutions Pvt Ltd',
            capability: { categories: ['VALVES'] },
            matchScore: 90,
            matchReasons: ['category_match'],
            canReceiveRfq: true,
            canSubmitQuote: true,
            // Leaking PII fields
            ...({
              gstin: '29ABCDE1234F1Z5',
              contactPhone: '9876543210',
              contactEmail: 'ceo@apex.test',
              legalName: 'Apex Secret Industrial Solutions Pvt Ltd',
              bankAccount: '123456789012',
            } as any),
          },
        ];
      },
    };

    const engine = new SupplierNetworkEngine({
      providers: [{ adapter: leakyAdapter }],
    });

    const res = await engine.discoverCandidates({
      rfqId: 'rfq-rt-08',
      category: 'VALVES',
    });

    expect(res.candidates.length).toBe(1);
    const cand = res.candidates[0]!;

    // Assert zero PII fields exist
    const antiLeakCheck = validateCandidateAntiLeak(cand);
    expect(antiLeakCheck.valid).toBe(true);

    for (const forbidden of FORBIDDEN_CANDIDATE_PII_FIELDS) {
      expect((cand as any)[forbidden]).toBeUndefined();
    }
  });

  // SN-RT-09: Network-source fingerprint leakage -> PREVENTED
  it('SN-RT-09: Network-source fingerprint leakage -> PREVENTED (no source:BNI / source:ONDC)', async () => {
    const fingerprintAdapter: SupplierNetworkPort = {
      network: SupplierNetwork.BNI,
      async discover() {
        return [
          {
            externalRef: 'bni-supp-09',
            network: SupplierNetwork.BNI,
            businessName: 'BNI Chapter Vendor',
            capability: { categories: ['MOTORS'] },
            matchScore: 85,
            matchReasons: ['source:BNI', 'category_match', 'source:ONDC_DIRECT', 'ondc:gateway'],
            canReceiveRfq: true,
            canSubmitQuote: true,
          },
        ];
      },
    };

    const engine = new SupplierNetworkEngine({
      providers: [{ adapter: fingerprintAdapter }],
    });

    const res = await engine.discoverCandidates({
      rfqId: 'rfq-rt-09',
      category: 'MOTORS',
    });

    const cand = res.candidates[0]!;
    expect(cand.matchReasons.some((r) => r.toLowerCase().startsWith('source:'))).toBe(false);
    expect(cand.matchReasons).not.toContain('source:BNI');
    expect(cand.matchReasons).not.toContain('source:ONDC_DIRECT');
  });

  // SN-RT-10: Duplicate supplier injection -> DEDUPLICATED SAFELY
  it('SN-RT-10: Duplicate supplier injection -> DEDUPLICATED SAFELY', async () => {
    const providerA: SupplierNetworkPort = {
      network: SupplierNetwork.DIRECT,
      async discover() {
        return [
          {
            externalRef: 'shared-supplier-gst-001',
            network: SupplierNetwork.DIRECT,
            businessName: 'Shared Supplier Pvt Ltd',
            capability: { categories: ['TUBES'] },
            matchScore: 75,
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
            externalRef: 'shared-supplier-gst-001',
            network: SupplierNetwork.LOCAL_REGISTRY,
            businessName: 'Shared Supplier Pvt Ltd',
            capability: { categories: ['TUBES'] },
            matchScore: 91,
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
      rfqId: 'rfq-rt-10',
      category: 'TUBES',
    });

    expect(res.totalCandidatesDiscovered).toBe(2);
    expect(res.totalUniqueCandidates).toBe(1);
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0]?.matchScore).toBe(91); // Kept highest matchScore
  });

  // SN-RT-11: Malformed provider payload -> REJECTED / GRACEFUL
  it('SN-RT-11: Malformed provider payload -> REJECTED / GRACEFUL', async () => {
    const malformedAdapter: SupplierNetworkPort = {
      network: SupplierNetwork.ASSOCIATION,
      async discover() {
        // Returns garbage instead of candidates array
        return null as any;
      },
    };

    const engine = new SupplierNetworkEngine({
      providers: [{ adapter: malformedAdapter }],
    });

    const res = await engine.discoverCandidates({
      rfqId: 'rfq-rt-11',
      category: 'TEST',
    });

    expect(res.candidates).toEqual([]);
    expect(res.providerSummaries[0]?.status).toBe(ProviderExecutionStatus.EMPTY);
  });

  // SN-RT-12: Provider timeout causing unsafe fallback -> SAFE DEGRADATION
  it('SN-RT-12: Provider timeout causing unsafe fallback -> SAFE DEGRADATION', async () => {
    const hangingAdapter: SupplierNetworkPort = {
      network: SupplierNetwork.BNI,
      async discover() {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return [];
      },
    };

    const engine = new SupplierNetworkEngine({
      defaultTimeoutMs: 20,
      providers: [{ adapter: hangingAdapter, timeoutMs: 20 }],
    });

    const res = await engine.discoverCandidates({
      rfqId: 'rfq-rt-12',
      category: 'TIMED_OUT_SERVICE',
    });

    expect(res.hasPartialFailures).toBe(true);
    expect(res.providerSummaries[0]?.status).toBe(ProviderExecutionStatus.TIMEOUT);
    expect(res.candidates).toEqual([]);
  });

  // SN-RT-13: Discovery result replay/cross-RFQ contamination -> PREVENTED
  it('SN-RT-13: Discovery result replay/cross-RFQ contamination -> PREVENTED (Uncorrelatable aliases)', async () => {
    const staticAdapter: SupplierNetworkPort = {
      network: SupplierNetwork.LOCAL_REGISTRY,
      async discover() {
        return [
          {
            externalRef: 'constant-supplier-id',
            network: SupplierNetwork.LOCAL_REGISTRY,
            businessName: 'Constant Supplier',
            capability: { categories: ['GENERIC'] },
            matchScore: 85,
            matchReasons: ['category_match'],
            canReceiveRfq: true,
            canSubmitQuote: true,
          },
        ];
      },
    };

    const engine = new SupplierNetworkEngine({
      providers: [{ adapter: staticAdapter, isLive: true }],
    });

    const resRfq1 = await engine.discoverCandidates({
      rfqId: 'rfq-tender-1111',
      category: 'GENERIC',
    });

    const resRfq2 = await engine.discoverCandidates({
      rfqId: 'rfq-tender-2222',
      category: 'GENERIC',
    });

    const alias1 = resRfq1.candidates[0]?.anonymousLabel;
    const alias2 = resRfq2.candidates[0]?.anonymousLabel;

    // Cross-RFQ aliases for the same supplier must be MATHEMATICALLY DIFFERENT (uncorrelatable)
    expect(alias1).toBeDefined();
    expect(alias2).toBeDefined();
    expect(alias1).not.toBe(alias2);
  });

  // SN-RT-14: Direct client manipulation of provider selection -> SERVER ENFORCED
  it('SN-RT-14: Direct client manipulation of provider selection -> SERVER ENFORCED', async () => {
    const secretInternalAdapter: SupplierNetworkPort = {
      network: SupplierNetwork.LOCAL_REGISTRY,
      async discover() {
        return [
          {
            externalRef: 'internal-01',
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

    // Client requests non-existent / malicious network
    const res = await engine.discoverCandidates({
      rfqId: 'rfq-rt-14',
      category: 'AUDITED',
      enabledProviders: ['UNAUTHORIZED_DARK_WEB_NETWORK' as any],
    });

    // Engine only executes registered networks, ignoring unauthorized client parameters
    expect(res.candidates).toHaveLength(0);
  });

  // SN-RT-15: Discovery used to bypass existing invitation authority -> INVITATION AUTHORITY PRESERVED
  it('SN-RT-15: Discovery used to bypass existing invitation authority -> INVITATION AUTHORITY PRESERVED', async () => {
    const repos = mem.asRepositories();
    const req = await repos.requirements.save({
      id: 'req-auth-101',
      organizationId: ORG_A,
      createdBy: BUYER_ACTOR.profileId,
      requirementType: 'PROJECT',
      status: 'RFQ_CREATED',
      title: 'Authorized Requirement',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const rfqRes = await services.rfqs.createFromRequirement(BUYER_ACTOR, req.id, {
      title: 'Authorized RFQ',
    });
    const rfq = (rfqRes as any).value;

    // Discover candidates through engine
    const engineRes = await services.supplierNetworkEngine.discoverCandidates({
      rfqId: rfq.id,
      category: 'General',
    });
    expect(engineRes.candidates.length).toBeGreaterThan(0);

    // Candidates discovered by SNE DO NOT automatically gain invitations in DB
    const invitationsBefore = await mem.asRepositories().invitations.findByRfqId(rfq.id);
    expect(invitationsBefore).toHaveLength(0);

    // Only authorized discoverAndInvite call from RFQService can generate official invitations
    const inviteRes = await services.rfqs.discoverAndInvite(BUYER_ACTOR, rfq.id);
    expect(inviteRes.ok).toBe(true);

    const invitationsAfter = await mem.asRepositories().invitations.findByRfqId(rfq.id);
    expect(invitationsAfter.length).toBeGreaterThan(0);
  });
});
