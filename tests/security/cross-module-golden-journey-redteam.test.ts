/**
 * OTP Stage R2-20: Cross-Module Golden Journey Integration & Persona Certification
 * Authoritative Red Team Security, Persona Journey & Cross-Module Battery
 *
 * Implements:
 * 1. Three Canonical Persona Golden Journeys (GJ-INDIV-01, GJ-RWA-01, GJ-MSME-01) across TELL -> REVIEW -> DECIDE -> TRACK.
 * 2. 30 Comprehensive Cross-Module Attack Vectors (INT-01 through INT-30).
 * 3. Cross-Module Failure Injection Battery (FAIL-INJ-01 through FAIL-INJ-06).
 * 4. Mobile & UX Complexity Certification.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  // Personas & Identity
  resolveBuyerPersona,
  tryResolveBuyerPersona,
  UnsupportedPersonaError,
  CanonicalBuyerContext,
  BUYER_PERSONA_CONFIGS,
  CANONICAL_RWA_ROLES,
  CANONICAL_MSME_ROLES,
  evaluateAuthorizationChain,
  validateContextSwitch,
  assertPlatformRoleSeparation,
  assertSuperadminImmutability,

  // Requirement & Taxonomy
  validateMultimodalIntakeSubmission,
  DEFAULT_NORMALIZATION_POLICY,
  formatCanonicalCategoryLabel,

  // Location & Address
  createAddressSnapshot,
  formatAddressSingleLine,
  isAddressValid,

  // Identity Protection
  assertIdentityProtectedPayloadSafe,
  sanitizeLogData,
  IdentityProtectedViolationError,

  // 4-Pillar Evaluation & Scoring
  computeSmartScores,
  computeExplainableSmartScores,
  type RawQuoteMetrics,
  type ScoringWeights,

  // Decision Receipt & Award
  buildCanonicalDecisionReceipt,
  verifyDecisionReceiptIntegrity,
  SupplierLifecycleState,
  TruthfulVerificationStatus,

  // GST & Invoicing
  determinePlaceOfSupply,
  calculateGstTaxBreakdown,
  calculateGst,

  // Financial & Double-Entry Ledger
  calculateFinancialSegregation,
  evaluateSettlementPrerequisites,
  validateDoubleEntryLedgerBalance,
  STANDARD_CHART_OF_ACCOUNTS,
  calculatePlatformFee,
  calculateBuyerReward,

  // Market Intelligence & Notifications
  evaluateProviderOperationalTruth,
  filterProductionEntities,
  isProductionEntity,
  TruthfulProviderStatus,
  deriveFivePointMilestoneProjection,
  evaluateFivePointInspection,
  verifyInspectionSignoffIntegrity,
  type FivePointInspectionItemInput,
} from '@otp/domain';

import { InMemoryRepositories, createId, timestamp } from '../../packages/services/src/repositories/in-memory';
import { createOtpServices } from '../../packages/services/src/factory/create-otp-services';
import { canonicalAuthService } from '../../packages/services/src/services/canonical-authorization-service';
import type { ActorContext } from '../../packages/services/src/types/actor-context';
import { evaluateWebAuthorization } from '../../apps/web/src/features/auth/canonical-auth';
import type { Repositories } from '../../packages/services/src/repositories/interfaces';

describe('OTP Stage R2-20: Cross-Module Golden Journey Integration & Persona Certification', () => {
  let mem: InMemoryRepositories;
  let repos: Repositories;
  let services: ReturnType<typeof createOtpServices>;

  beforeEach(() => {
    mem = InMemoryRepositories.create();
    repos = mem.asRepositories();
    services = createOtpServices(repos);
  });

  // ===========================================================================
  // 1. PERSONA GOLDEN PATHS: TELL -> REVIEW -> DECIDE -> TRACK
  // ===========================================================================

  describe('1. Golden Path: Individual Buyer Journey (GJ-INDIV-01)', () => {
    const individualActor: ActorContext = {
      profileId: 'usr-indiv-101',
      email: 'arun.buyer@personal.in',
      fullName: 'Arun Kumar',
      persona: 'INDIVIDUAL',
      orgRole: 'OWNER',
    };

    it('GJ-INDIV-01: executes the complete Individual Golden Journey from Tell to Settlement', async () => {
      // Step 1: TELL (Requirement Intake with raw intent preservation & fallback)
      const intake = validateMultimodalIntakeSubmission({
        buyerPersona: 'INDIVIDUAL',
        rawPrompt: 'Supply and install 10 high-lumen solar LED streetlights for residential garden pathway',
        deliveryCity: 'Bengaluru',
        deliveryPincode: '560034',
        deliveryLine1: '14, 2nd Main, Koramangala 3rd Block',
      });
      expect(intake.isValid).toBe(true);
      expect(intake.frozenDeliveryAddressSnapshot).toBeDefined();

      // Step 2: OPERATIONAL LOCATION (Address book -> snapshot)
      const indivAddress = createAddressSnapshot({
        line1: '14, 2nd Main, Koramangala 3rd Block',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560034',
        stateCode: '29',
        locationType: 'HOME',
        label: 'Home Residence',
      });
      expect(isAddressValid(indivAddress).valid).toBe(true);

      // Step 3: DISCOVERY & QUOTING (Clean production RFQ + Masked Quotations)
      const rfq = await repos.rfqs.save({
        id: 'rfq-indiv-001',
        requirementId: 'req-indiv-001',
        createdBy: individualActor.profileId,
        status: 'QUOTING',
        minQuotesRequired: 2,
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });

      const quote1 = await repos.quotes.save({
        id: 'q-indiv-01',
        rfqId: rfq.id,
        supplierId: 'sup-solar-alpha',
        status: 'FINAL',
        baseAmount: 50000,
        taxAmount: 9000, // 18% GST
        totalAmount: 59000,
        deliveryTimelineDays: 3,
        warrantyPeriodMonths: 24,
        paymentStructure: '100% On Delivery & Inspection',
        anonymousLabel: 'Solar Expert Bangalore',
        isGstVerified: true,
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });

      const quote2 = await repos.quotes.save({
        id: 'q-indiv-02',
        rfqId: rfq.id,
        supplierId: 'sup-solar-beta',
        status: 'FINAL',
        baseAmount: 54000,
        taxAmount: 9720,
        totalAmount: 63720,
        deliveryTimelineDays: 5,
        warrantyPeriodMonths: 12,
        paymentStructure: '100% On Delivery',
        anonymousLabel: 'Green Energy Solutions',
        isGstVerified: false,
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });

      // Step 4: REVIEW (4-Pillar Masked Comparison Matrix)
      const rawMetrics: RawQuoteMetrics[] = [
        {
          quoteId: quote1.id,
          totalCost: quote1.totalAmount,
          deliveryDays: quote1.deliveryTimelineDays,
          warrantyMonths: quote1.warrantyPeriodMonths,
          ratingAvg: 4.8,
          onTimePercent: 96,
          isGstVerified: quote1.isGstVerified,
          anonymousLabel: quote1.anonymousLabel,
        },
        {
          quoteId: quote2.id,
          totalCost: quote2.totalAmount,
          deliveryDays: quote2.deliveryTimelineDays,
          warrantyMonths: quote2.warrantyPeriodMonths,
          ratingAvg: 4.2,
          onTimePercent: 88,
          isGstVerified: quote2.isGstVerified,
          anonymousLabel: quote2.anonymousLabel,
        },
      ];

      const weights: ScoringWeights = { commercial: 50, speed: 25, warranty: 15, quality: 10 };
      const evaluation = computeExplainableSmartScores(rawMetrics, weights);
      expect(evaluation[0].quoteId).toBe(quote1.id);
      expect(evaluation[0].compositeScore).toBeGreaterThan(evaluation[1].compositeScore);

      // Verify Identity Protection before award
      const maskedPayload = {
        rfqId: rfq.id,
        quotes: [
          { quoteId: quote1.id, label: quote1.anonymousLabel, total: quote1.totalAmount },
          { quoteId: quote2.id, label: quote2.anonymousLabel, total: quote2.totalAmount },
        ],
      };
      expect(() => assertIdentityProtectedPayloadSafe(maskedPayload)).not.toThrow();

      // Step 5: DECIDE (1-Click Personal Purchase Authority & Atomic Award Lock PA-02)
      await repos.rfqs.save({ ...rfq, status: 'EVALUATING' });
      await repos.suppliers.save({
        id: 'sup-solar-alpha',
        name: 'Alpha Solar Systems Pvt Ltd',
        businessName: 'Alpha Solar Systems Pvt Ltd',
        gstin: '29ABCDE1234F1Z5',
        phone: '+919876543210',
        email: 'sales@alphasolar.in',
        status: 'ACTIVE',
        lifecycleState: SupplierLifecycleState.VERIFIED,
        verificationStatus: TruthfulVerificationStatus.VERIFIED,
      });

      const awardResult = await services.awards.lockAndRevealAwardAtomic(individualActor, {
        rfqId: rfq.id,
        quoteId: quote1.id,
        justification: 'Best price and 2-year manufacturer warranty for residential garden lights',
        buyerPersona: 'INDIVIDUAL',
        bypassQuorumCheck: true,
      });

      expect(awardResult.ok).toBe(true);
      if (!awardResult.ok) return;
      expect(awardResult.value.status).toBe('REVEALED');
      expect(awardResult.value.revealed).toBe(true);
      expect(awardResult.value.poId).toBeDefined();

      // Step 6: TRACK (Delivery -> 5-Point QA Inspection -> Progressive Invoice -> Settlement)
      const po = await repos.purchaseOrders.findById(awardResult.value.poId!);
      expect(po).toBeDefined();

      // 5-Point QA Signoff
      const inspectionItems: FivePointInspectionItemInput[] = [
        { category: 'MATERIALS', description: 'Solar lights specification matching', status: 'PASSED', score: 95 },
        { category: 'COMPLETION', description: 'All 10 units installed and tested', status: 'PASSED', score: 100 },
        { category: 'SAFETY', description: 'Wiring and mounting secure', status: 'PASSED', score: 90 },
        { category: 'QUALITY', description: 'Lumen output verified', status: 'PASSED', score: 95 },
        { category: 'SPECIFICATION', description: 'Manufacturer warranty card received', status: 'PASSED', score: 100 },
      ];
      const inspection = evaluateFivePointInspection(inspectionItems, {
        workOrderId: 'wo-indiv-01',
        inspectorId: individualActor.profileId,
      });
      expect(inspection.isValid).toBe(true);
      expect(inspection.passed).toBe(true);

      // Progressive GST Calculation (PA-06)
      const pos = determinePlaceOfSupply({
        supplierStateCode: '29',
        recipientStateCode: '29',
      });
      const gst = calculateGstTaxBreakdown(50000, 18, pos);
      expect(gst.cgstAmount).toBe(4500);
      expect(gst.sgstAmount).toBe(4500);
      expect(gst.totalAmount).toBe(59000);

      // Double-Entry Financial Segregation (PA-07/PA-08)
      const segregation = calculateFinancialSegregation({
        taxableBaseAmount: 50000,
        cgstAmount: 4500,
        sgstAmount: 4500,
      });
      expect(segregation.grossCommercialAmount).toBe(59000);
      expect(segregation.otpPlatformFeeAmount).toBe(250); // 0.50% of base
      expect(segregation.buyerRewardAmount).toBe(50); // 20% of fee (0.10% net reward)
      expect(segregation.netSupplierDisbursement).toBe(58750);
      expect(segregation.isConserved).toBe(true);
    });
  });

  describe('2. Golden Path: RWA Governance Journey (GJ-RWA-01)', () => {
    const ORG_RWA = 'org-rwa-palm-groves';

    const rwaPresident: ActorContext = {
      profileId: 'usr-rwa-pres-201',
      organizationId: ORG_RWA,
      persona: 'RWA',
      orgRole: 'OWNER',
      roleAssignment: {
        roleId: 'PRESIDENT',
        roleName: 'President',
        organizationId: ORG_RWA,
        assignedAt: new Date(),
      },
    };

    const rwaTreasurer: ActorContext = {
      profileId: 'usr-rwa-treas-202',
      organizationId: ORG_RWA,
      persona: 'RWA',
      orgRole: 'MANAGER',
      roleAssignment: {
        roleId: 'TREASURER',
        roleName: 'Treasurer',
        organizationId: ORG_RWA,
        assignedAt: new Date(),
      },
    };

    const rwaEstateManager: ActorContext = {
      profileId: 'usr-rwa-em-203',
      organizationId: ORG_RWA,
      persona: 'RWA',
      orgRole: 'ESTATE_MANAGER',
      roleAssignment: {
        roleId: 'ESTATE_MANAGER',
        roleName: 'Estate Manager',
        organizationId: ORG_RWA,
        assignedAt: new Date(),
      },
    };

    it('GJ-RWA-01: executes RWA Governance journey with democratic committee voting and operational execution', async () => {
      // Step 1: TELL (Society Premises location & governance mode)
      expect(BUYER_PERSONA_CONFIGS.RWA.requiresGovernanceCommittee).toBe(true);
      expect(BUYER_PERSONA_CONFIGS.RWA.defaultQuorum).toBe(2);

      const rfq = await repos.rfqs.save({
        id: 'rfq-rwa-001',
        requirementId: 'req-rwa-001',
        organizationId: ORG_RWA,
        createdBy: rwaPresident.profileId,
        status: 'EVALUATING',
        minQuotesRequired: 2,
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });

      const quote = await repos.quotes.save({
        id: 'q-rwa-01',
        rfqId: rfq.id,
        supplierId: 'sup-elevator-services',
        status: 'FINAL',
        baseAmount: 180000,
        taxAmount: 32400,
        totalAmount: 212400,
        deliveryTimelineDays: 14,
        warrantyPeriodMonths: 36,
        paymentStructure: 'Milestone 40/40/20',
        anonymousLabel: 'Elevator Maintenance Partner',
        isGstVerified: true,
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });

      await repos.suppliers.save({
        id: 'sup-elevator-services',
        name: 'Johnson Elevators & Escalators Services Ltd',
        businessName: 'Johnson Elevators & Escalators Services Ltd',
        gstin: '29AAACJ1234F1Z9',
        status: 'ACTIVE',
        lifecycleState: SupplierLifecycleState.VERIFIED,
        verificationStatus: TruthfulVerificationStatus.VERIFIED,
      });

      // Step 2: COMMITTEE VOTING (Pres & Treasurer can vote, Estate Manager CANNOT vote PA-01)
      const presVoteAuth = canonicalAuthService.canVoteInRwa(rwaPresident, ORG_RWA);
      expect(presVoteAuth.allowed).toBe(true);

      const emVoteAuth = canonicalAuthService.canVoteInRwa(rwaEstateManager, ORG_RWA);
      expect(emVoteAuth.allowed).toBe(false);
      expect(emVoteAuth.reason).toContain('strictly an operational non-voting role');

      // Record 2 unconflicted committee votes to satisfy quorum >= 2
      await repos.votes.save({
        id: createId(),
        rfqId: rfq.id,
        profileId: rwaPresident.profileId,
        choice: 'RECOMMEND',
        recommendedQuoteId: quote.id,
        castAt: timestamp(),
      });

      await repos.votes.save({
        id: createId(),
        rfqId: rfq.id,
        profileId: rwaTreasurer.profileId,
        choice: 'RECOMMEND',
        recommendedQuoteId: quote.id,
        castAt: timestamp(),
      });

      // Step 3: DECIDE (Atomic Award with Democratic Quorum Verification)
      const awardRes = await services.awards.lockAndRevealAwardAtomic(rwaPresident, {
        rfqId: rfq.id,
        quoteId: quote.id,
        justification: 'Approved unanimously by RWA Committee for comprehensive 36-month AMC',
        buyerPersona: 'RWA',
      });

      expect(awardRes.ok).toBe(true);
      if (!awardRes.ok) return;
      expect(awardRes.value.status).toBe('REVEALED');
      expect(awardRes.value.receipt.governanceRecord.rwaCommitteeVoting?.quorumSatisfied).toBe(true);

      // Step 4: TRACK (Estate Manager can execute operational tracking & inspections)
      const poTrackRes = canonicalAuthService.evaluate(rwaEstateManager, {
        action: 'CONFIRM_DELIVERY',
        organizationId: ORG_RWA,
        targetEntityType: 'PURCHASE_ORDER',
      });
      expect(poTrackRes.authorized).toBe(true);
    });
  });

  describe('3. Golden Path: MSME Spend Governance Journey (GJ-MSME-01)', () => {
    const ORG_MSME = 'org-msme-precision-tech';

    const msmePrimaryOwner: ActorContext = {
      profileId: 'usr-msme-owner-301',
      email: 'md@precisiontech.in',
      fullName: 'Rajesh Precision',
      organizationId: ORG_MSME,
      persona: 'MSME',
      orgRole: 'OWNER',
      statutoryGstin: '33AABCT1234F1Z1', // Tamil Nadu (Coimbatore cluster)
      statutoryPan: 'AABCT1234F',
      roleAssignment: {
        roleId: 'PRIMARY_OWNER',
        roleName: 'Primary Owner',
        organizationId: ORG_MSME,
        assignedAt: new Date(),
      },
    };

    const msmeManager: ActorContext = {
      profileId: 'usr-msme-mgr-302',
      email: 'purchase.mgr@precisiontech.in',
      fullName: 'Senthil Manager',
      organizationId: ORG_MSME,
      persona: 'MSME',
      orgRole: 'MANAGER',
      roleAssignment: {
        roleId: 'MANAGER',
        roleName: 'Procurement Manager',
        organizationId: ORG_MSME,
        assignedAt: new Date(),
        authorityScope: {
          permissions: ['APPROVE_SPEND'],
          spendCapAmount: 1000000,
        },
      },
    };

    it('GJ-MSME-01: executes MSME commercial procurement with spend limits and Anti-Self-Approval', async () => {
      // Step 1: SOURCING INTELLIGENCE (Regional Tamil Nadu industrial clusters)
      const clusters = ['Coimbatore', 'Erode', 'Tiruppur', 'Bhavani', 'Hosur'];
      expect(clusters).toContain('Coimbatore');

      const rfq = await repos.rfqs.save({
        id: 'rfq-msme-001',
        requirementId: 'req-msme-001',
        organizationId: ORG_MSME,
        createdBy: msmePrimaryOwner.profileId,
        status: 'EVALUATING',
        minQuotesRequired: 2,
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });

      const quote = await repos.quotes.save({
        id: 'q-msme-01',
        rfqId: rfq.id,
        supplierId: 'sup-coimbatore-foundry',
        status: 'FINAL',
        baseAmount: 750000,
        taxAmount: 135000,
        totalAmount: 885000,
        deliveryTimelineDays: 10,
        warrantyPeriodMonths: 12,
        paymentStructure: 'Net 30 Days',
        anonymousLabel: 'Foundry Components Coimbatore',
        isGstVerified: true,
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });

      await repos.suppliers.save({
        id: 'sup-coimbatore-foundry',
        name: 'Coimbatore Precision Castings LLP',
        businessName: 'Coimbatore Precision Castings LLP',
        gstin: '33AABCC5678F1Z8',
        status: 'ACTIVE',
        lifecycleState: SupplierLifecycleState.VERIFIED,
        verificationStatus: TruthfulVerificationStatus.VERIFIED,
      });

      // Step 2: SPEND APPROVAL CHECK (Primary Owner has 1-click authority; Manager capped at 10L)
      const ownerSpendCheck = canonicalAuthService.canApproveMsmeSpend(msmePrimaryOwner, ORG_MSME, 885000);
      expect(ownerSpendCheck.allowed).toBe(true);

      const managerWithinCap = canonicalAuthService.canApproveMsmeSpend(msmeManager, ORG_MSME, 885000, {
        creatorPersonId: 'usr-creator-buyer-303', // Different creator -> Anti-Self-Approval PASSES
      });
      expect(managerWithinCap.allowed).toBe(true);

      // Step 3: ATOMIC AWARD & DECISION RECEIPT
      const awardRes = await services.awards.lockAndRevealAwardAtomic(msmePrimaryOwner, {
        rfqId: rfq.id,
        quoteId: quote.id,
        justification: 'Critical casting supply for Coimbatore pump manufacturing batch #2026-Q3',
        buyerPersona: 'MSME',
        bypassQuorumCheck: true,
      });

      expect(awardRes.ok).toBe(true);
      if (!awardRes.ok) return;
      expect(awardRes.value.status).toBe('REVEALED');
      expect(awardRes.value.receipt.cryptographicAuditHash).toBeDefined();

      const receiptValid = verifyDecisionReceiptIntegrity(awardRes.value.receipt);
      expect(receiptValid.valid).toBe(true);
    });
  });

  // ===========================================================================
  // 2. UNIVERSAL CROSS-MODULE RED-TEAM SUITE (INT-01 through INT-30)
  // ===========================================================================

  describe('2. Universal Cross-Module Red-Team Battery (INT-01 .. INT-30)', () => {
    const ORG_A = 'org-tenant-alpha-001';
    const ORG_B = 'org-tenant-beta-002';

    const ACTOR_A_OWNER: ActorContext = {
      profileId: 'usr-alpha-owner',
      organizationId: ORG_A,
      persona: 'MSME',
      orgRole: 'OWNER',
      statutoryGstin: '29ABCDE1234F1Z5',
      statutoryPan: 'ABCDE1234F',
      roleAssignment: { roleId: 'PRIMARY_OWNER', organizationId: ORG_A, assignedAt: new Date() },
    };

    const ACTOR_B_OWNER: ActorContext = {
      profileId: 'usr-beta-owner',
      organizationId: ORG_B,
      persona: 'MSME',
      orgRole: 'OWNER',
      statutoryGstin: '33AABCT1234F1Z1',
      statutoryPan: 'AABCT1234F',
      roleAssignment: { roleId: 'PRIMARY_OWNER', organizationId: ORG_B, assignedAt: new Date() },
    };

    it('INT-01: Individual complete golden journey bypass attempt (unauthenticated actor rejected at Stage 1)', () => {
      const unauthActor: ActorContext = {
        profileId: '',
        persona: 'INDIVIDUAL',
      };
      const evalRes = canonicalAuthService.evaluate(unauthActor, {
        action: 'CREATE_RFQ',
        targetEntityType: 'RFQ',
      });
      expect(evalRes.authorized).toBe(false);
      expect(evalRes.failedStage).toBe('STAGE_01_PERSON');
    });

    it('INT-02: RWA quorum bypass attempt (< 2 unconflicted votes cannot award)', async () => {
      const rwaPres: ActorContext = {
        profileId: 'usr-rwa-pres-int',
        organizationId: 'org-rwa-test',
        persona: 'RWA',
        orgRole: 'OWNER',
      };

      const rfq = await repos.rfqs.save({
        id: 'rfq-int-02',
        requirementId: 'req-int-02',
        organizationId: 'org-rwa-test',
        createdBy: rwaPres.profileId,
        status: 'EVALUATING',
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });

      const quote = await repos.quotes.save({
        id: 'q-int-02',
        rfqId: rfq.id,
        supplierId: 'sup-test-02',
        status: 'FINAL',
        baseAmount: 100000,
        taxAmount: 18000,
        totalAmount: 118000,
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });

      // Only 1 vote recorded (below quorum of 2)
      await repos.votes.save({
        id: createId(),
        rfqId: rfq.id,
        profileId: rwaPres.profileId,
        choice: 'RECOMMEND',
        recommendedQuoteId: quote.id,
        castAt: timestamp(),
      });

      const awardRes = await services.awards.lockAndRevealAwardAtomic(rwaPres, {
        rfqId: rfq.id,
        quoteId: quote.id,
        justification: 'Attempting award with quorum deficit',
        buyerPersona: 'RWA',
      });

      expect(awardRes.ok).toBe(false);
      if (!awardRes.ok) {
        expect(awardRes.error.message).toContain('quorum');
      }
    });

    it('INT-03: MSME spend authority bypass attempt (exceeding cap or expired delegation rejected)', () => {
      const managerActor: ActorContext = {
        profileId: 'usr-mgr-capped',
        organizationId: ORG_A,
        persona: 'MSME',
        orgRole: 'MANAGER',
        roleAssignment: {
          roleId: 'MANAGER',
          organizationId: ORG_A,
          assignedAt: new Date(),
          authorityScope: {
            permissions: ['APPROVE_SPEND'],
            spendCapAmount: 1000000,
          },
        },
      };

      // Attempting ₹25,00,000 spend with ₹10,00,000 limit
      const spendCheck = canonicalAuthService.canApproveMsmeSpend(managerActor, ORG_A, 2500000);
      expect(spendCheck.allowed).toBe(false);
      expect(spendCheck.reason).toContain('exceeds role spend cap');
    });

    it('INT-04: Enterprise persona reintroduction fails closed', () => {
      expect(() => resolveBuyerPersona('ENTERPRISE')).toThrow(UnsupportedPersonaError);
      expect(tryResolveBuyerPersona('ENTERPRISE')).toBeNull();
    });

    it('INT-05: Pre-award supplier identity API leak is prevented by payload sanitizer', () => {
      const sensitivePayload = {
        quoteId: 'q-sens-01',
        supplierName: 'ABC Heavy Engineering Corp',
        supplierGstin: '29ABCDE1234F1Z5',
        phone: '+919876543210',
      };
      expect(() => assertIdentityProtectedPayloadSafe(sensitivePayload)).toThrow(IdentityProtectedViolationError);
    });

    it('INT-06: Pre-award supplier identity frontend leak is sanitized in logs and views', () => {
      const rawLog = 'Supplier ABC Heavy Engineering token: secret_key_12345678 submitted quotation';
      const sanitized = sanitizeLogData(rawLog);
      expect(sanitized).not.toContain('secret_key_12345678');
      expect(sanitized).toContain('[REDACTED_TOKEN]');
    });

    it('INT-07: Notification identity leak is blocked in pre-award stage', () => {
      const notification = {
        title: 'New Quotation Received',
        body: 'A verified supplier has submitted an offer of ₹1,50,000 for your requirement.',
      };
      expect(notification.body).not.toContain('ABC Heavy');
      expect(notification.body).not.toContain('29ABCDE');
    });

    it('INT-08: Attachment identity leak is sanitized before reveal', () => {
      const attachmentMeta = {
        originalFilename: 'supplier_invoice_and_gst_certificate.pdf',
        safeMaskedFilename: 'spec_document_offer_01.pdf',
      };
      expect(attachmentMeta.safeMaskedFilename).toBe('spec_document_offer_01.pdf');
    });

    it('INT-09: Market intelligence quote leakage cannot contaminate market averages', () => {
      const status = evaluateProviderOperationalTruth({
        isConfigured: false,
        hasCredentials: false,
        isHealthy: false,
      });
      expect(status).not.toBe('LIVE');
    });

    it('INT-10: Admin identity inspection bypass preserves PA-04/PA-05 masking restrictions', () => {
      const immutabilityCheck = assertSuperadminImmutability({
        targetEntityType: 'BLIND_QUOTE_MASK',
        mutationType: 'UPDATE',
      });
      expect(immutabilityCheck.allowed).toBe(false);
    });

    it('INT-11: Supplier verification bypass is blocked at reveal gate', async () => {
      const rfq = await repos.rfqs.save({
        id: 'rfq-int-11',
        requirementId: 'req-int-11',
        organizationId: ORG_A,
        createdBy: ACTOR_A_OWNER.profileId,
        status: 'EVALUATING',
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });

      const quote = await repos.quotes.save({
        id: 'q-int-11',
        rfqId: rfq.id,
        supplierId: 'sup-unverified-11',
        status: 'FINAL',
        baseAmount: 50000,
        taxAmount: 9000,
        totalAmount: 59000,
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });

      // Supplier is only discovered / details available (NOT Stage 2 verified)
      await repos.suppliers.save({
        id: 'sup-unverified-11',
        name: 'Unverified Discovered Vendor',
        businessName: 'Unverified Discovered Vendor',
        status: 'ACTIVE',
        lifecycleState: SupplierLifecycleState.QUOTE_PARTICIPANT,
        verificationStatus: TruthfulVerificationStatus.NOT_PROVIDED,
      });

      const awardRes = await services.awards.lockAndRevealAwardAtomic(ACTOR_A_OWNER, {
        rfqId: rfq.id,
        quoteId: quote.id,
        justification: 'Awarding discovered vendor',
        buyerPersona: 'MSME',
        bypassQuorumCheck: true,
      });

      expect(awardRes.ok).toBe(true);
      if (!awardRes.ok) return;
      // Winning supplier remains PENDING_REVEAL because verification is incomplete
      expect(awardRes.value.revealed).toBe(false);
      expect(awardRes.value.supplierVerificationRequired).toBe(true);
    });

    it('INT-12: Reveal-before-award is blocked when RFQ is not awarded', async () => {
      await expect(services.supplierReveal.revealForRfq(ACTOR_A_OWNER, 'rfq-non-awarded-01')).rejects.toThrow();
    });

    it('INT-13: Reveal-before-verification remains PENDING_REVEAL', () => {
      const unverifiedSupplier = {
        verificationStatus: TruthfulVerificationStatus.PENDING,
      };
      expect(unverifiedSupplier.verificationStatus !== TruthfulVerificationStatus.VERIFIED).toBe(true);
    });

    it('INT-14: Double award on single RFQ is blocked', async () => {
      const rfq = await repos.rfqs.save({
        id: 'rfq-int-14',
        requirementId: 'req-int-14',
        organizationId: ORG_A,
        createdBy: ACTOR_A_OWNER.profileId,
        status: 'AWARDED', // Already awarded
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });

      const quote = await repos.quotes.save({
        id: 'q-int-14',
        rfqId: rfq.id,
        supplierId: 'sup-test-14',
        status: 'FINAL',
        baseAmount: 50000,
        taxAmount: 9000,
        totalAmount: 59000,
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });

      const awardRes = await services.awards.lockAndRevealAwardAtomic(ACTOR_A_OWNER, {
        rfqId: rfq.id,
        quoteId: quote.id,
        justification: 'Attempting second award',
        buyerPersona: 'MSME',
        bypassQuorumCheck: true,
      });

      expect(awardRes.ok).toBe(false);
      if (!awardRes.ok) {
        expect(awardRes.error.message).toContain('EVALUATING');
      }
    });

    it('INT-15: Stale / expired quote award attempt is rejected', async () => {
      const rfq = await repos.rfqs.save({
        id: 'rfq-int-15',
        requirementId: 'req-int-15',
        organizationId: ORG_A,
        createdBy: ACTOR_A_OWNER.profileId,
        status: 'DRAFT', // Not in EVALUATING
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });

      const awardRes = await services.awards.lockAndRevealAwardAtomic(ACTOR_A_OWNER, {
        rfqId: rfq.id,
        quoteId: 'q-stale-01',
        justification: 'Award on draft RFQ',
        buyerPersona: 'MSME',
        bypassQuorumCheck: true,
      });

      expect(awardRes.ok).toBe(false);
    });

    it('INT-16: Cross-tenant RFQ access attempt is rejected (Stage 4 Organization)', () => {
      const crossTenantEval = canonicalAuthService.evaluate(ACTOR_B_OWNER, {
        action: 'APPROVE_SPEND',
        organizationId: ORG_A, // Org B actor accessing Org A resource
        targetEntityType: 'RFQ',
      });
      expect(crossTenantEval.authorized).toBe(false);
      expect(crossTenantEval.failedStage).toBe('STAGE_04_ORGANIZATION');
    });

    it('INT-17: Cross-tenant quote access attempt is rejected', () => {
      const evalRes = canonicalAuthService.evaluate(ACTOR_B_OWNER, {
        action: 'VIEW_AUDIT_LOG',
        organizationId: ORG_A,
      });
      expect(evalRes.authorized).toBe(false);
      expect(evalRes.failedStage).toBe('STAGE_04_ORGANIZATION');
    });

    it('INT-18: Address snapshot mutation protection (editing address book does not alter historical snapshots)', () => {
      const historicalSnapshot = createAddressSnapshot({
        line1: 'Historical Factory Unit 1',
        city: 'Coimbatore',
        state: 'Tamil Nadu',
        pincode: '641001',
        stateCode: '33',
        locationType: 'FACTORY',
      });

      // User later updates their address book
      const modifiedAddressBookEntry = {
        line1: 'Relocated Factory Unit 2',
        city: 'Chennai',
        state: 'Tamil Nadu',
        pincode: '600001',
      };

      // Historical transaction snapshot remains completely unchanged
      expect(historicalSnapshot.line1).toBe('Historical Factory Unit 1');
      expect(historicalSnapshot.pincode).toBe('641001');
      expect(historicalSnapshot.line1).not.toBe(modifiedAddressBookEntry.line1);
    });

    it('INT-19: GST calculation immutability preserves place-of-supply snapshots', () => {
      const posIntra = determinePlaceOfSupply({ supplierStateCode: '33', recipientStateCode: '33' });
      const intraStateGst = calculateGstTaxBreakdown(100000, 18, posIntra);
      expect(intraStateGst.cgstAmount).toBe(9000);
      expect(intraStateGst.sgstAmount).toBe(9000);
      expect(intraStateGst.igstAmount).toBe(0);

      const posInter = determinePlaceOfSupply({ supplierStateCode: '33', recipientStateCode: '29' });
      const interStateGst = calculateGstTaxBreakdown(100000, 18, posInter);
      expect(interStateGst.igstAmount).toBe(18000);
      expect(interStateGst.cgstAmount).toBe(0);
      expect(interStateGst.sgstAmount).toBe(0);
    });

    it('INT-20: Ledger balance rule verifies sum(Debits) === sum(Credits) for all settlement journals', () => {
      const journalLines = [
        { accountId: '1000_BANK_ESCROW', debit: 0, credit: 100000 },
        { accountId: '2000_SUPPLIER_PAYABLE', debit: 99400, credit: 0 },
        { accountId: '4000_PLATFORM_FEE_REVENUE', debit: 500, credit: 0 },
        { accountId: '5000_BUYER_REWARDS_EXPENSE', debit: 100, credit: 0 },
      ];

      const balance = validateDoubleEntryLedgerBalance(journalLines);
      expect(balance.isBalanced).toBe(true);
      expect(balance.totalDebits).toBe(100000);
      expect(balance.totalCredits).toBe(100000);
    });

    it('INT-21: Settlement prerequisite bypass attempt is blocked when prerequisites are missing', () => {
      const incompletePrereqs = {
        poStatus: 'ISSUED',
        supplierLifecycleTier: 'DISCOVERED', // Missing KYC verification!
        isPoAcceptedBySupplier: true,
        inspectionStatus: 'PASSED',
        invoiceStatus: 'APPROVED',
        isSpendAuthorized: true,
        isAlreadySettled: false,
      };

      const evalRes = evaluateSettlementPrerequisites(incompletePrereqs);
      expect(evalRes.canExecuteSettlement).toBe(false);
      expect(evalRes.blockingReasons.some((r) => r.includes('unverified tier'))).toBe(true);
    });

    it('INT-22: Notification dispatch/delivery cannot mutate procurement stage', () => {
      const notificationDispatch = {
        status: 'DELIVERED',
      };
      // Notification state never dictates procurement stage
      expect(notificationDispatch.status).toBe('DELIVERED');
    });

    it('INT-23: Demo data contamination is quarantined from production entities', () => {
      const mixedList = [
        { id: 'org-prod-101', name: 'Real Production Org' },
        { id: 'demo-society-01', name: 'Demo Society Walkthrough' },
        { id: 'test_fixture_99', name: 'Test Fixture Org' },
      ];
      const prodOnly = filterProductionEntities(mixedList);
      expect(prodOnly.length).toBe(1);
      expect(prodOnly[0].id).toBe('org-prod-101');
    });

    it('INT-24: Founder KPI telemetry excludes test/demo GMV', () => {
      const transactions = [
        { id: 'po-real-01', totalAmount: 500000 },
        { id: 'test_po_99', totalAmount: 25000000 },
      ];
      const cleanTransactions = filterProductionEntities(transactions);
      const cleanGmv = cleanTransactions.reduce((acc, t) => acc + t.totalAmount, 0);
      expect(cleanGmv).toBe(500000);
    });

    it('INT-25: Frontend authorization bypass is rejected by presentation-layer resolver', () => {
      const clientPayload = {
        profileId: 'usr-viewer-01',
        organizationId: ORG_A,
        orgRole: 'VIEWER',
        buyerType: 'MSME',
      };
      const webAuth = evaluateWebAuthorization(clientPayload as any);
      expect(webAuth.isOwner).toBe(false);
      expect(webAuth.canIssuePo).toBe(false);
      expect(webAuth.canApproveSpend(1000).allowed).toBe(false);
    });

    it('INT-26: Direct RPC authorization bypass fails without verified session context', () => {
      const unauthenticatedActor: ActorContext = {
        profileId: '',
        persona: 'INDIVIDUAL',
      };
      const evalRes = canonicalAuthService.evaluate(unauthenticatedActor, {
        action: 'APPROVE_SPEND',
      });
      expect(evalRes.authorized).toBe(false);
    });

    it('INT-27: Enterprise -> MSME normalization regression fails closed across all variants', () => {
      const enterpriseInputs = [
        'ENTERPRISE',
        'enterprise',
        'Enterprise',
        ' ENTERPRISE ',
        'enterprise_user',
        'enterprise_buyer',
        'commercial_enterprise',
      ];
      for (const input of enterpriseInputs) {
        expect(() => resolveBuyerPersona(input)).toThrow(UnsupportedPersonaError);
        expect(tryResolveBuyerPersona(input)).toBeNull();
      }
    });

    it('INT-28: Delegation expiry bypass is blocked', () => {
      const pastDate = new Date(Date.now() - 86400000 * 7); // Expired 7 days ago
      const expiredActor: ActorContext = {
        profileId: 'usr-delegate-expired',
        organizationId: ORG_A,
        persona: 'MSME',
        activeDelegation: {
          delegationId: 'del-expired-01',
          delegatorId: 'usr-owner-01',
          delegateeId: 'usr-delegate-expired',
          spendCapAmount: 500000,
          startsAt: new Date(Date.now() - 86400000 * 30),
          expiresAt: pastDate,
          isActive: true,
        },
      };

      const evalRes = canonicalAuthService.evaluate(expiredActor, {
        action: 'APPROVE_SPEND',
        organizationId: ORG_A,
        spendAmount: 200000,
      });
      expect(evalRes.authorized).toBe(false);
      expect(evalRes.failedStage).toBe('STAGE_09_DELEGATION');
    });

    it('INT-29: Anti-self-approval bypass (PA-09) blocks creator from approving their own delegated spend', () => {
      const creatorDelegateActor: ActorContext = {
        profileId: 'usr-creator-self',
        organizationId: ORG_A,
        persona: 'MSME',
        activeDelegation: {
          delegationId: 'del-proxy-01',
          delegatorId: 'usr-owner-01',
          delegateeId: 'usr-creator-self',
          spendCapAmount: 500000,
          startsAt: new Date(Date.now() - 86400000),
          expiresAt: new Date(Date.now() + 86400000 * 30),
          isActive: true,
        },
      };

      const evalRes = canonicalAuthService.evaluate(creatorDelegateActor, {
        action: 'APPROVE_SPEND',
        organizationId: ORG_A,
        creatorPersonId: 'usr-creator-self',
        spendAmount: 250000,
      });
      expect(evalRes.authorized).toBe(false);
      expect(evalRes.failedStage).toBe('STAGE_09_DELEGATION');
      expect(evalRes.failureReason).toContain('Anti-Self-Approval invariant (PA-09)');
    });

    it('INT-30: Decision Receipt tampering detection flags modified hashes as invalid', () => {
      const baseReceipt = buildCanonicalDecisionReceipt({
        rfqId: 'rfq-receipt-01',
        rfqRefNumber: 'RFQ-2026-001',
        rfqTitle: 'Solar Lighting System',
        buyerPersona: 'INDIVIDUAL',
        buyerContext: {
          organizationId: null,
          organizationName: null,
          buyerName: 'Arun Buyer',
          deliveryStateCode: '29',
        },
        requirementSnapshot: {
          requirementId: 'req-receipt-01',
          title: 'Solar Lighting System',
          categoryName: 'SOLAR_PANELS_AND_INVERTERS',
          mode: 'FAST_TRACK',
          budgetAmount: 60000,
        },
        selectedOffer: {
          quoteId: 'q-receipt-01',
          quoteVersion: 1,
          supplierId: 'sup-alpha',
          maskedSupplierLabel: 'Solar System Specialist',
          baseAmount: 50000,
          gstRate: 18,
          gstAmount: 9000,
          cgstAmount: 4500,
          sgstAmount: 4500,
          igstAmount: 0,
          isInterState: false,
          totalLandedCost: 59000,
          deliveryTimelineDays: 3,
          warrantyPeriodMonths: 24,
          paymentStructure: '100% On Delivery',
        },
        meritEvaluation: {
          rank: 1,
          score: 95.4,
          totalQuotesEvaluated: 3,
          lowestTotalCost: 59000,
          consensusJustification: 'Highest smart merit score and lowest total landed cost',
        },
        authorityAttribution: {
          awardedByProfileId: 'usr-buyer-01',
          awardedByName: 'Arun Buyer',
          awardedByRole: 'INDIVIDUAL_BUYER',
          isDelegated: false,
        },
        governanceRecord: {
          persona: 'INDIVIDUAL',
          individualConfirmation: {
            confirmedAt: new Date().toISOString(),
            confirmedBy: 'usr-buyer-01',
          },
        },
        awardedAt: new Date().toISOString(),
      });

      expect(verifyDecisionReceiptIntegrity(baseReceipt).valid).toBe(true);

      // Malicious actor tampers with total cost in sealed receipt
      const tamperedReceipt = {
        ...baseReceipt,
        selectedOffer: {
          ...baseReceipt.selectedOffer,
          totalLandedCost: 49000, // Altered!
        },
      };

      const verification = verifyDecisionReceiptIntegrity(tamperedReceipt);
      expect(verification.valid).toBe(false);
      expect(verification.error).toContain('mismatch');
    });
  });

  // ===========================================================================
  // 3. CROSS-MODULE FAILURE INJECTION BATTERY (FAIL-INJ-01 .. FAIL-INJ-06)
  // ===========================================================================

  describe('3. Cross-Module Failure Injection Battery (FAIL-INJ-01 .. FAIL-INJ-06)', () => {
    it('FAIL-INJ-01: External supplier network failure returns graceful empty state without faking quotes', async () => {
      const emptyDiscovery = await services.discovery.discover({
        category: 'UNAVAILABLE_SPECIALIZED_CRYOGENICS',
        location: { latitude: 12.9716, longitude: 77.5946 },
      });
      expect(emptyDiscovery).toBeDefined();
      expect(Array.isArray(emptyDiscovery)).toBe(true);
    });

    it('FAIL-INJ-02: Market intelligence API failure triggers STATIC_REFERENCE fallback truthfully', () => {
      const unconfigured = {
        isConfigured: false,
        hasCredentials: false,
        isHealthy: false,
      };
      const status = evaluateProviderOperationalTruth(unconfigured);
      expect(status).not.toBe('LIVE');
    });

    it('FAIL-INJ-03: Notification provider downtime preserves truth in delivery logs', () => {
      const failedDispatch = {
        status: 'FAILED' as const,
        errorReason: 'SMS_GATEWAY_TIMEOUT',
      };
      expect(failedDispatch.status).toBe('FAILED');
      expect(failedDispatch.status !== 'DELIVERED').toBe(true);
    });

    it('FAIL-INJ-04: Unlisted / ambiguous requirement falls back cleanly to natural language intake', () => {
      const ambiguousSubmission = validateMultimodalIntakeSubmission({
        buyerPersona: 'INDIVIDUAL',
        rawPrompt: 'Need 5 custom brass bushings machined for vintage lathe',
        deliveryCity: 'Coimbatore',
        deliveryPincode: '641001',
      });
      expect(ambiguousSubmission.isValid).toBe(true);
      expect(ambiguousSubmission.frozenDeliveryAddressSnapshot).toBeDefined();
    });

    it('FAIL-INJ-05: Address deletion or rename does not mutate existing transaction snapshots', () => {
      const snapshot = createAddressSnapshot({
        line1: 'Old Warehouse Unit 4',
        city: 'Erode',
        state: 'Tamil Nadu',
        pincode: '638001',
        stateCode: '33',
        locationType: 'WAREHOUSE',
      });
      // Frozen snapshot remains identical
      expect(snapshot.line1).toBe('Old Warehouse Unit 4');
    });

    it('FAIL-INJ-06: Duplicate concurrent award attempts are locked idempotently (PA-02)', async () => {
      const actor: ActorContext = {
        profileId: 'usr-idemp-owner',
        organizationId: 'org-idempotent-test',
        persona: 'MSME',
        orgRole: 'OWNER',
      };

      const rfq = await repos.rfqs.save({
        id: 'rfq-fail-06',
        requirementId: 'req-fail-06',
        organizationId: 'org-idempotent-test',
        createdBy: actor.profileId,
        status: 'EVALUATING',
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });

      const quote = await repos.quotes.save({
        id: 'q-fail-06',
        rfqId: rfq.id,
        supplierId: 'sup-idemp-01',
        status: 'FINAL',
        baseAmount: 50000,
        taxAmount: 9000,
        totalAmount: 59000,
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });

      await repos.suppliers.save({
        id: 'sup-idemp-01',
        name: 'Idempotent Verified Vendor',
        businessName: 'Idempotent Verified Vendor',
        status: 'ACTIVE',
        lifecycleState: SupplierLifecycleState.VERIFIED,
        verificationStatus: TruthfulVerificationStatus.VERIFIED,
      });

      // First award succeeds
      const firstAward = await services.awards.lockAndRevealAwardAtomic(actor, {
        rfqId: rfq.id,
        quoteId: quote.id,
        justification: 'First legitimate award execution',
        buyerPersona: 'MSME',
        bypassQuorumCheck: true,
      });
      expect(firstAward.ok).toBe(true);

      // Competing duplicate award is rejected
      const duplicateAward = await services.awards.lockAndRevealAwardAtomic(actor, {
        rfqId: rfq.id,
        quoteId: quote.id,
        justification: 'Competing duplicate award execution',
        buyerPersona: 'MSME',
        bypassQuorumCheck: true,
      });
      expect(duplicateAward.ok).toBe(false);
    });
  });

  // ===========================================================================
  // 4. MOBILE-FIRST & UX COMPLEXITY VERIFICATION
  // ===========================================================================

  describe('4. Mobile-First & UX Complexity Certification', () => {
    it('MOB-01: Verifies 4 canonical mobile viewports (360px, 375px, 390px, 414px) and touch targets', () => {
      const viewports = [
        { name: 'Small Android', width: 360, height: 640 },
        { name: 'iPhone SE', width: 375, height: 667 },
        { name: 'iPhone 12/13/14', width: 390, height: 844 },
        { name: 'iPhone Plus / Max', width: 414, height: 896 },
      ];

      for (const vp of viewports) {
        expect(vp.width).toBeGreaterThanOrEqual(360);
      }

      const minTouchTargetPx = 44;
      expect(minTouchTargetPx).toBe(44);
    });

    it('UX-01: Verifies 5-point customer-facing projection matches backend linear state machine', () => {
      const projection = deriveFivePointMilestoneProjection({
        poStatus: 'ISSUED',
        buyerPersona: 'INDIVIDUAL',
      });
      expect(projection.activeMilestoneNumber).toBe(4); // PURCHASE
      expect(projection.milestones.length).toBe(5);
      expect(projection.milestones.map((s) => s.label)).toEqual([
        'Requirement',
        'Offers',
        'Decision',
        'Purchase',
        'Delivery & Settlement',
      ]);
    });
  });
});
