import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRepositories } from '../repositories/in-memory';
import { createOtpServices } from '../factory/create-otp-services';
import type { ActorContext } from '../types/actor-context';
import { ForbiddenError, NotFoundError, ValidationError } from '../types/errors';
import {
  DEFAULT_SCORECARD_WEIGHTS,
  computeCompositeScore,
  computeScorecardDimensions,
  generateAnonymizedPerformanceBadge,
  resolveRequiredApprovalTiers,
  validateApprovalEligibility,
  compileContractAgreementMarkdown,
  computeContractDocumentHash,
  generateContractSignatureHash,
  verifyContractSignatureHash,
  evaluateMilestoneSlaBreach,
  type ScorecardRatingMetrics,
  type ContractTerms,
} from '@otp/domain';

const BUYER_ORG_ID = 'org-buyer-enterprise-01';
const COUNTERPARTY_ORG_ID = 'org-buyer-counterparty-02';
const SUPPLIER_ID = 'sup-apex-quality-01';

const BUYER_CREATOR: ActorContext = {
  profileId: 'usr-buyer-creator-01',
  organizationId: BUYER_ORG_ID,
  orgRole: 'BUYER',
};

const BUYER_MANAGER: ActorContext = {
  profileId: 'usr-buyer-manager-02',
  organizationId: BUYER_ORG_ID,
  orgRole: 'MANAGER',
};

const BUYER_VP: ActorContext = {
  profileId: 'usr-buyer-vp-03',
  organizationId: BUYER_ORG_ID,
  orgRole: 'APPROVER',
};

const BUYER_CFO: ActorContext = {
  profileId: 'usr-buyer-cfo-04',
  organizationId: BUYER_ORG_ID,
  orgRole: 'OWNER',
};

const PLATFORM_ADMIN: ActorContext = {
  profileId: 'usr-platform-admin',
  isPlatformAdmin: true,
};

const UNAUTHORIZED_ACTOR: ActorContext = {
  profileId: 'usr-unauthorized-adversary',
  organizationId: 'org-outsider-adversary',
  orgRole: 'BUYER',
};

describe('OTP Phase 6.6: Multi-Team Master Assurance Suite (Green, Red, Orange, Blue, Purple)', () => {
  let mem: InMemoryRepositories;
  let services: ReturnType<typeof createOtpServices>;

  beforeEach(async () => {
    mem = InMemoryRepositories.create();
    mem.seedSupplier({
      id: SUPPLIER_ID,
      businessName: 'Apex Quality Industrial Works Pvt Ltd',
      source: 'DIRECT',
      status: 'ACTIVE',
      categories: ['Industrial', 'Fabrication', 'Painting'],
      gstin: '29AABCS1429B1ZX',
    });

    const repos = mem.asRepositories();
    services = createOtpServices(repos);
  });

  async function seedRfqAndQuote(amount: number) {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();

    const req = await repos.requirements.save({
      id: 'req-p66-01',
      organizationId: BUYER_ORG_ID,
      createdBy: BUYER_CREATOR.profileId,
      requirementType: 'PROJECT',
      status: 'RFQ_CREATED',
      title: 'Enterprise Facility Modernization & Structural Works',
      createdAt: now,
      updatedAt: now,
    });

    const rfq = await repos.rfqs.save({
      id: 'rfq-p66-01',
      requirementId: req.id,
      organizationId: BUYER_ORG_ID,
      status: 'EVALUATING',
      revealStatus: 'PROTECTED',
      title: req.title,
      buyerAnonymousToSuppliers: true,
      minQuotesRequired: 3,
      createdBy: BUYER_CREATOR.profileId,
      createdAt: now,
      updatedAt: now,
    });

    const quote = await repos.quotes.save({
      id: 'quote-p66-01',
      rfqId: rfq.id,
      supplierId: SUPPLIER_ID,
      invitationId: 'inv-p66-01',
      status: 'SUBMITTED',
      currentVersion: 1,
      createdAt: now,
      updatedAt: now,
    });

    return { req, rfq, quote };
  }

  // -------------------------------------------------------------------------
  // GREEN TEAM: Happy Path, Functional Governance & End-to-End Pipeline
  // -------------------------------------------------------------------------
  describe('🟩 GREEN TEAM: Functional Pipeline & Lifecycle Verification', () => {
    it('executes full VMI Scorecard computation and produces anonymized evaluation badge', async () => {
      const scorecard = await services.vendorIntelligence.computeSupplierScorecard(
        PLATFORM_ADMIN,
        SUPPLIER_ID,
        'STEP_15_CLOSEOUT'
      );

      expect(scorecard.supplierId).toBe(SUPPLIER_ID);
      expect(scorecard.overallScore).toBeGreaterThanOrEqual(80);
      expect(scorecard.performanceTier).toMatch(/GOLD|PLATINUM/);
      expect(scorecard.dimensions.qualityScore).toBeGreaterThanOrEqual(90);

      const badge = await services.vendorIntelligence.getAnonymizedScorecardBadge(
        'Supplier A7K3',
        SUPPLIER_ID
      );

      expect(badge.supplierAlias).toBe('Supplier A7K3');
      expect(badge.coarseScoreBand).toMatch(/COMMENDED|EXEMPLARY/);
      expect(badge.qualityRatingBand).toBe('4.8 - 5.0 ★');
    });

    it('executes multi-tier approval matrix progression for ₹35,00,000 procurement (>₹25L requires 3 tiers)', async () => {
      const { rfq } = await seedRfqAndQuote(3500000);

      // Configure policy
      await services.enterpriseApprovalMatrix.configurePolicy(PLATFORM_ADMIN, {
        organizationId: BUYER_ORG_ID,
        policyName: 'Alpha Tiered Policy',
      });

      // Initialize stages
      const stages = await services.enterpriseApprovalMatrix.initializeRfqStages(
        BUYER_CREATOR,
        rfq.id,
        3500000
      );

      expect(stages).toHaveLength(3);
      expect(stages[0]?.tierLevel).toBe('TIER_1_MANAGER');
      expect(stages[1]?.tierLevel).toBe('TIER_2_DEPT_HEAD');
      expect(stages[2]?.tierLevel).toBe('TIER_3_EXECUTIVE');

      // Stage 1 approval by distinct manager
      const stg1 = await services.enterpriseApprovalMatrix.submitTierDecision(BUYER_MANAGER, {
        rfqId: rfq.id,
        stageOrder: 1,
        decision: 'APPROVED',
        comments: 'Tier 1 Manager Sign-off complete',
      });
      expect(stg1.status).toBe('APPROVED');

      // Stage 2 approval by VP
      const stg2 = await services.enterpriseApprovalMatrix.submitTierDecision(BUYER_VP, {
        rfqId: rfq.id,
        stageOrder: 2,
        decision: 'APPROVED',
        comments: 'Tier 2 VP Sign-off complete',
      });
      expect(stg2.status).toBe('APPROVED');

      // Stage 3 approval by CFO
      const stg3 = await services.enterpriseApprovalMatrix.submitTierDecision(BUYER_CFO, {
        rfqId: rfq.id,
        stageOrder: 3,
        decision: 'APPROVED',
        comments: 'Tier 3 CFO Sign-off complete',
      });
      expect(stg3.status).toBe('APPROVED');
    });

    it('generates deterministic legal contract agreement and executes bilateral digital signatures', async () => {
      const { rfq, quote } = await seedRfqAndQuote(1500000);

      const terms: ContractTerms = {
        procurementTitle: 'Facility Modernization Works',
        buyerOrganizationId: BUYER_ORG_ID,
        supplierId: SUPPLIER_ID,
        quoteId: quote.id,
        rfqId: rfq.id,
        totalContractValue: 1500000,
        currency: 'INR',
        gstinBuyer: '29ABCDE1234F1Z5',
        gstinSupplier: '29AABCS1429B1ZX',
        liquidatedDamagesClausePercentPerDay: 0.5,
        maxLiquidatedDamagesPercent: 10.0,
        disputeResolutionPeriodDays: 14,
        warrantyPeriodMonths: 12,
        milestones: [
          {
            milestoneIndex: 1,
            title: 'Initial Structural Work',
            targetPercentage: 50,
            allocatedAmount: 750000,
            slaDays: 15,
            deliverables: ['Foundation scaffolding', 'Demolition'],
          },
          {
            milestoneIndex: 2,
            title: 'Finishing & Handover',
            targetPercentage: 50,
            allocatedAmount: 750000,
            slaDays: 15,
            deliverables: ['Painting', 'Final inspection'],
          },
        ],
      };

      const contract = await services.contractOperations.generateContract(BUYER_MANAGER, terms);
      expect(contract.status).toBe('PENDING_BUYER_SIGNATURE');
      expect(contract.documentHash).toHaveLength(64);

      // Sign as buyer
      const buyerSigned = await services.contractOperations.signContract(BUYER_MANAGER, {
        contractId: contract.id,
        partyType: 'BUYER',
      });
      expect(buyerSigned.buyerSignedAt).toBeDefined();
      expect(buyerSigned.status).toBe('PENDING_SUPPLIER_SIGNATURE');

      // Sign as supplier
      const supplierActor: ActorContext = {
        profileId: 'usr-supplier-rep',
        organizationId: 'org-supplier-entity',
        isPlatformAdmin: true,
      };
      const fullyExecuted = await services.contractOperations.signContract(supplierActor, {
        contractId: contract.id,
        partyType: 'SUPPLIER',
      });

      expect(fullyExecuted.supplierSignedAt).toBeDefined();
      expect(fullyExecuted.status).toBe('ACTIVE');
    });
  });

  // -------------------------------------------------------------------------
  // RED TEAM: Adversarial Attacks, Anti-Bypass, & Privilege Escalation Checks
  // -------------------------------------------------------------------------
  describe('🟥 RED TEAM: Anti-Bypass, Security Invariants & Exploit Defenses', () => {
    it('blocks self-approval exploit when procurement creator attempts to approve stage 1', async () => {
      const { rfq } = await seedRfqAndQuote(300000);

      await services.enterpriseApprovalMatrix.configurePolicy(PLATFORM_ADMIN, {
        organizationId: BUYER_ORG_ID,
        policyName: 'Strict Anti-Bypass Policy',
        preventSelfApproval: true,
      });

      await services.enterpriseApprovalMatrix.initializeRfqStages(
        BUYER_CREATOR,
        rfq.id,
        300000
      );

      // Creator attempts to sign off own RFQ
      await expect(
        services.enterpriseApprovalMatrix.submitTierDecision(BUYER_CREATOR, {
          rfqId: rfq.id,
          stageOrder: 1,
          decision: 'APPROVED',
        })
      ).rejects.toThrow(/Anti-bypass policy violation/);
    });

    it('blocks out-of-order stage skipping (attempting Tier 2 before Tier 1)', async () => {
      const { rfq } = await seedRfqAndQuote(1200000);

      await services.enterpriseApprovalMatrix.initializeRfqStages(
        BUYER_CREATOR,
        rfq.id,
        1200000
      );

      // VP attempts to approve Stage 2 while Stage 1 is PENDING
      await expect(
        services.enterpriseApprovalMatrix.submitTierDecision(BUYER_VP, {
          rfqId: rfq.id,
          stageOrder: 2,
          decision: 'APPROVED',
        })
      ).rejects.toThrow(/Sequential governance violation/);
    });

    it('blocks unauthorized outsider from generating contracts or signing buyer contracts', async () => {
      const { rfq, quote } = await seedRfqAndQuote(500000);

      const terms: ContractTerms = {
        procurementTitle: 'Unauthorized Contract Gen',
        buyerOrganizationId: BUYER_ORG_ID,
        supplierId: SUPPLIER_ID,
        quoteId: quote.id,
        rfqId: rfq.id,
        totalContractValue: 500000,
        currency: 'INR',
        gstinBuyer: '29ABCDE1234F1Z5',
        gstinSupplier: '29AABCS1429B1ZX',
        liquidatedDamagesClausePercentPerDay: 0.5,
        maxLiquidatedDamagesPercent: 10.0,
        disputeResolutionPeriodDays: 14,
        warrantyPeriodMonths: 12,
        milestones: [],
      };

      await expect(
        services.contractOperations.generateContract(UNAUTHORIZED_ACTOR, terms)
      ).rejects.toThrow(/Access denied/);
    });
  });

  // -------------------------------------------------------------------------
  // ORANGE TEAM: Financial Controls, Mathematical Invariants & Conservation
  // -------------------------------------------------------------------------
  describe('🟧 ORANGE TEAM: Financial Controls & Liquidated Damages Calculations', () => {
    it('calculates deterministic liquidated damages with ceiling protection', () => {
      // 10 days overdue at 0.5%/day on ₹10,00,000 = 5% = ₹50,000
      const breach1 = evaluateMilestoneSlaBreach({
        milestoneStartDateIso: '2026-09-01T00:00:00.000Z',
        slaDays: 5, // Due Sept 6
        contractTotalValue: 1000000,
        damageRatePerDayPercent: 0.5,
        maxDamagePercent: 10.0,
        currentDateIso: '2026-09-16T00:00:00.000Z', // 10 days late
      });

      expect(breach1.isBreached).toBe(true);
      expect(breach1.daysOverdue).toBe(10);
      expect(breach1.estimatedLiquidatedDamagesAmount).toBe(50000);

      // 30 days overdue at 0.5%/day = 15%, but capped at maxDamage 10% = ₹1,00,000
      const breachCapped = evaluateMilestoneSlaBreach({
        milestoneStartDateIso: '2026-08-01T00:00:00.000Z',
        slaDays: 5,
        contractTotalValue: 1000000,
        damageRatePerDayPercent: 0.5,
        maxDamagePercent: 10.0,
        currentDateIso: '2026-09-16T00:00:00.000Z',
      });

      expect(breachCapped.isBreached).toBe(true);
      expect(breachCapped.estimatedLiquidatedDamagesAmount).toBe(100000);
    });

    it('enforces dimensional scorecard weights conservation (35% + 30% + 20% + 15% = 100%)', () => {
      const sum =
        DEFAULT_SCORECARD_WEIGHTS.qualityWeight +
        DEFAULT_SCORECARD_WEIGHTS.deliveryWeight +
        DEFAULT_SCORECARD_WEIGHTS.slaDisputeWeight +
        DEFAULT_SCORECARD_WEIGHTS.commercialWeight;

      expect(Math.abs(sum - 1.0)).toBeLessThan(0.0001);
    });
  });

  // -------------------------------------------------------------------------
  // BLUE TEAM: Concurrency, Atomic State Transitions & Idempotency
  // -------------------------------------------------------------------------
  describe('🟦 BLUE TEAM: Atomic State & Integrity Checks', () => {
    it('guarantees idempotent scorecard recalculation without data corruption', async () => {
      const sc1 = await services.vendorIntelligence.computeSupplierScorecard(
        PLATFORM_ADMIN,
        SUPPLIER_ID,
        'CRON_RUN_1'
      );
      const sc2 = await services.vendorIntelligence.computeSupplierScorecard(
        PLATFORM_ADMIN,
        SUPPLIER_ID,
        'CRON_RUN_2'
      );

      expect(sc1.supplierId).toBe(sc2.supplierId);
      expect(sc2.version).toBe(sc1.version + 1);
      expect(sc2.overallScore).toBe(sc1.overallScore);
    });

    it('validates contract signature cryptographic verification against tampering', () => {
      const docHash = 'a6c5b9e18b4562771804b9e28fcfc394d12c9803125e174b5a329d2f2541a029';
      const timestamp = '2026-09-18T18:00:00.000Z';
      const sig = generateContractSignatureHash(docHash, BUYER_CFO.profileId, 'CFO', timestamp);

      expect(verifyContractSignatureHash(sig, docHash, BUYER_CFO.profileId, 'CFO', timestamp)).toBe(true);
      expect(verifyContractSignatureHash(sig, docHash, 'usr-imposter', 'CFO', timestamp)).toBe(false);
      expect(verifyContractSignatureHash(sig, 'tampered-doc-hash', BUYER_CFO.profileId, 'CFO', timestamp)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // PURPLE TEAM: Pre-Award Anonymity & Privacy Leak Prevention
  // -------------------------------------------------------------------------
  describe('🟪 PURPLE TEAM: Privacy Leak Prevention & Zero-PII Invariant', () => {
    it('strictly guarantees pre-reveal scorecard badge exposes NO supplier PII or exact raw scores', async () => {
      const badge = await services.vendorIntelligence.getAnonymizedScorecardBadge(
        'Supplier A7K3',
        SUPPLIER_ID
      );

      // Verify alias
      expect(badge.supplierAlias).toBe('Supplier A7K3');
      // No PII leak
      expect(JSON.stringify(badge)).not.toContain('Apex Quality Industrial Works');
      expect(JSON.stringify(badge)).not.toContain('29AABCS1429B1ZX');
      // Banded properties
      expect(badge.completedJobsCountRange).toMatch(/Orders/);
      expect(badge.qualityRatingBand).toMatch(/★/);
      expect(badge.onTimeDeliveryBand).toMatch(/On-Time/);
    });
  });
});
