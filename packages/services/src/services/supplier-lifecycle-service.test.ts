import { describe, expect, it, beforeEach } from 'vitest';
import {
  SupplierDiscoveryLifecycleTier,
  SupplierLifecycleState,
  TruthfulVerificationStatus,
} from '@otp/domain';
import { InMemoryRepositories } from '../repositories/in-memory';
import { InMemoryAuditService } from '../audit/in-memory-audit-service';
import { SupplierLifecycleService } from './supplier-lifecycle-service';
import type { Supplier, Rfq } from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';

const ADMIN_ACTOR: ActorContext = {
  profileId: 'admin-001',
  isPlatformAdmin: true,
};

const SUPPLIER_ACTOR: ActorContext = {
  profileId: 'sup-user-001',
  isPlatformAdmin: false,
};

describe('SupplierLifecycleService — 5-Tier Monotonic Lifecycle & Verification Gate', () => {
  let repos: InMemoryRepositories;
  let audit: InMemoryAuditService;
  let service: SupplierLifecycleService;

  beforeEach(() => {
    repos = InMemoryRepositories.create();
    audit = new InMemoryAuditService();
    service = new SupplierLifecycleService(repos.asRepositories(), audit);
  });

  describe('Candidate Tier Evaluation & Capabilities', () => {
    it('evaluates candidate tier with discrete capability boundaries', () => {
      const evalRes = service.evaluateCandidateTier({
        businessName: 'Unclaimed Depot',
        city: 'Bengaluru',
      });

      expect(evalRes.ok).toBe(true);
      if (!evalRes.ok) return;
      expect(evalRes.value.tier).toBe(SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA);
      expect(evalRes.value.rank).toBe(1);

      const caps = service.getTierCapabilities(SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA);
      expect(caps.ok).toBe(true);
      if (!caps.ok) return;
      expect(caps.value.canAppearInNetworkDiscovery).toBe(true);
      expect(caps.value.canReceiveRfqInvitation).toBe(false);
      expect(caps.value.canSubmitQuote).toBe(false);
    });

    it('returns capabilities for GST_VERIFIED tier', () => {
      const caps = service.getTierCapabilities(SupplierDiscoveryLifecycleTier.GST_VERIFIED);
      expect(caps.ok).toBe(true);
      if (!caps.ok) return;
      expect(caps.value.canReceiveRfqInvitation).toBe(true);
      expect(caps.value.canSubmitQuote).toBe(true);
      expect(caps.value.canDirectRevealOnAward).toBe(true);
      expect(caps.value.canAcceptPurchaseOrder).toBe(true);
      expect(caps.value.requiresStatutoryOnboardingGate).toBe(false);
    });
  });

  describe('Monotonic Lifecycle Transitions', () => {
    it('allows progressive forward transition and records immutable audit log', async () => {
      const supplier: Supplier = {
        id: 'sup-001',
        businessName: 'Local Hardware Depot',
        contactPhone: '+919876543210',
        source: 'DIRECT',
        status: 'PENDING',
        categories: ['Hardware'],
        lifecycleState: SupplierLifecycleState.QUOTE_PARTICIPANT,
        verificationStatus: TruthfulVerificationStatus.NOT_PROVIDED,
      };

      await repos.asRepositories().suppliers.save!(supplier);

      const res = await service.transitionLifecycleTier(
        ADMIN_ACTOR,
        'sup-001',
        SupplierDiscoveryLifecycleTier.OTP_REGISTERED,
        'Supplier claimed profile via verified phone',
      );

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.previousTier).toBe(SupplierDiscoveryLifecycleTier.DETAILS_AVAILABLE);
      expect(res.value.currentTier).toBe(SupplierDiscoveryLifecycleTier.OTP_REGISTERED);

      const saved = await repos.asRepositories().suppliers.findById('sup-001');
      expect(saved?.lifecycleState).toBe(SupplierLifecycleState.ONBOARDING_REQUIRED);

      // Verify audit trail
      expect(audit.events.some((e) => e.action === 'supplier.lifecycle_tier_transitioned')).toBe(true);
    });

    it('denies backward lifecycle downgrade transition', async () => {
      const supplier: Supplier = {
        id: 'sup-gst-verified',
        businessName: 'Apex Commercial Supplies Pvt Ltd',
        gstin: '29ABCDE1234F1Z5',
        pan: 'ABCDE1234F',
        source: 'DIRECT',
        status: 'ACTIVE',
        categories: ['Electrical'],
        lifecycleState: SupplierLifecycleState.VERIFIED,
        verificationStatus: TruthfulVerificationStatus.VERIFIED,
      };

      await repos.asRepositories().suppliers.save!(supplier);

      const res = await service.transitionLifecycleTier(
        ADMIN_ACTOR,
        'sup-gst-verified',
        SupplierDiscoveryLifecycleTier.DETAILS_AVAILABLE,
      );

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.message).toContain('Illegal backward transition');
    });
  });

  describe('Supplier Claim & Matching Flow', () => {
    it('successfully claims discovered profile on valid OTP and matching credentials', async () => {
      const candidate: Supplier = {
        id: 'cand-100',
        businessName: 'Prime Electricals',
        contactPhone: '+919876543210',
        contactEmail: 'sales@prime.in',
        source: 'DIRECT',
        status: 'PENDING',
        categories: ['Electrical'],
        lifecycleState: SupplierLifecycleState.QUOTE_PARTICIPANT,
        verificationStatus: TruthfulVerificationStatus.NOT_PROVIDED,
      };

      await repos.asRepositories().suppliers.save!(candidate);

      const res = await service.claimDiscoveredSupplier(
        SUPPLIER_ACTOR,
        {
          claimedByProfileId: 'sup-user-001',
          contactPhone: '9876543210',
          contactEmail: 'sales@prime.in',
          legalBusinessName: 'Prime Electricals Pvt Ltd',
          pan: 'ABCDE1234F',
          verificationMethod: 'PHONE_OTP',
          otpVerified: true,
        },
        'cand-100',
      );

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.matchEvaluation.status).toBe('CONFIRMED_MATCH');
      expect(res.value.supplier.id).toBe('cand-100'); // Reuses existing canonical entity
      expect(res.value.supplier.legalBusinessName).toBe('Prime Electricals Pvt Ltd');
    });

    it('creates a new supplier entity when no candidate match is provided', async () => {
      const res = await service.claimDiscoveredSupplier(
        SUPPLIER_ACTOR,
        {
          claimedByProfileId: 'sup-user-002',
          contactPhone: '9123456780',
          contactEmail: 'hello@brandnew.in',
          legalBusinessName: 'Brand New Supplies Ltd',
          verificationMethod: 'PHONE_OTP',
          otpVerified: true,
        },
      );

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.matchEvaluation.status).toBe('NO_MATCH_NEW_ENTITY');
      expect(res.value.supplier.businessName).toBe('Brand New Supplies Ltd');
    });

    it('rejects claim when OTP is unverified and flags REVIEW_REQUIRED', async () => {
      const candidate: Supplier = {
        id: 'cand-200',
        businessName: 'Unverified Plumbing',
        contactPhone: '+919999988888',
        source: 'DIRECT',
        status: 'PENDING',
        categories: ['Plumbing'],
      };

      await repos.asRepositories().suppliers.save!(candidate);

      const res = await service.claimDiscoveredSupplier(
        SUPPLIER_ACTOR,
        {
          claimedByProfileId: 'sup-user-003',
          contactPhone: '9999988888',
          contactEmail: 'hijacker@fake.in',
          legalBusinessName: 'Unverified Plumbing',
          verificationMethod: 'PHONE_OTP',
          otpVerified: false, // Not verified
        },
        'cand-200',
      );

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.message).toContain('manual admin review');
    });

    it('rejects claim when PAN conflict is detected against candidate record', async () => {
      const candidate: Supplier = {
        id: 'cand-300',
        businessName: 'Conflicting Supplies',
        pan: 'AAAAA1111A',
        source: 'DIRECT',
        status: 'PENDING',
        categories: ['Cables'],
      };

      await repos.asRepositories().suppliers.save!(candidate);

      const res = await service.claimDiscoveredSupplier(
        SUPPLIER_ACTOR,
        {
          claimedByProfileId: 'sup-user-004',
          contactPhone: '9876543210',
          contactEmail: 'admin@other.in',
          legalBusinessName: 'Conflicting Supplies',
          pan: 'BBBBB2222B', // Conflict!
          verificationMethod: 'PHONE_OTP',
          otpVerified: true,
        },
        'cand-300',
      );

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.message).toContain('Conflict detected');
    });
  });

  describe('2-Stage Verification Gates', () => {
    it('Stage 1: verifies authorized representative, contact OTP, and PAN', async () => {
      const supplier: Supplier = {
        id: 'sup-stage1',
        businessName: 'Patel Building Materials',
        source: 'DIRECT',
        status: 'PENDING',
        categories: ['Cement'],
      };

      await repos.asRepositories().suppliers.save!(supplier);

      const res = await service.verifyStage1Otp(
        ADMIN_ACTOR,
        'sup-stage1',
        {
          authorizedRepName: 'Ramesh Patel',
          contactPhone: '+919876543210',
          phoneOtpVerified: true,
          contactEmail: 'ramesh@patel.test',
          emailOtpVerified: true,
          pan: 'ABCDE1234F',
        },
      );

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.result.isValid).toBe(true);
      expect(res.value.supplier.lifecycleState).toBe(SupplierLifecycleState.VERIFIED);
      expect(res.value.supplier.verificationStatus).toBe(TruthfulVerificationStatus.VERIFIED);
    });

    it('Stage 2: validates GSTIN structure, Luhn Mod-36 checksum, and active status', async () => {
      const supplier: Supplier = {
        id: 'sup-stage2',
        businessName: 'Apex Commercial Supplies',
        pan: 'ABCDE1234F',
        source: 'DIRECT',
        status: 'ACTIVE',
        categories: ['Electrical'],
      };

      await repos.asRepositories().suppliers.save!(supplier);

      const res = await service.verifyStage2Gst(
        ADMIN_ACTOR,
        'sup-stage2',
        {
          gstin: '29ABCDE1234F1Z5',
          pan: 'ABCDE1234F',
          legalBusinessName: 'Apex Commercial Supplies Pvt Ltd',
          providerResponse: {
            status: 'ACTIVE',
            active: true,
          },
        },
      );

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.result.checksumValid).toBe(true);
      expect(res.value.result.panAligned).toBe(true);
      expect(res.value.supplier.verificationStatus).toBe(TruthfulVerificationStatus.VERIFIED);
    });

    it('Stage 2: handles graceful offline fallback with truthful PENDING status', async () => {
      const supplier: Supplier = {
        id: 'sup-stage2-offline',
        businessName: 'Offline Fallback Supplier',
        pan: 'ABCDE1234F',
        source: 'DIRECT',
        status: 'ACTIVE',
        categories: ['Hardware'],
      };

      await repos.asRepositories().suppliers.save!(supplier);

      const res = await service.verifyStage2Gst(
        ADMIN_ACTOR,
        'sup-stage2-offline',
        {
          gstin: '29ABCDE1234F1Z5',
          pan: 'ABCDE1234F',
          providerResponse: {
            status: 'UNAVAILABLE',
          },
        },
      );

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.result.isOfflineFallback).toBe(true);
      expect(res.value.result.status).toBe(TruthfulVerificationStatus.PENDING); // Truthful PENDING
    });
  });

  describe('PA-09 Magic-Link Zero-Login Quoting Flow & Anti-Replay', () => {
    it('creates time-bounded invitation token, redeems once, and prevents replay', async () => {
      const rfq: Rfq = {
        id: 'rfq-magic-001',
        requirementId: 'req-001',
        status: 'OPEN',
        revealStatus: 'BLIND',
        title: 'Transformer RFQ',
        buyerAnonymousToSuppliers: true,
        minQuotesRequired: 3,
        createdBy: 'buyer-001',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const supplier: Supplier = {
        id: 'sup-magic-001',
        businessName: 'Transformer Specialists Ltd',
        source: 'DIRECT',
        status: 'ACTIVE',
        categories: ['Transformers'],
      };

      await repos.asRepositories().rfqs.save!(rfq);
      await repos.asRepositories().suppliers.save!(supplier);

      // 1. Create magic link token
      const tokenRes = await service.createMagicLinkInvitation(ADMIN_ACTOR, 'rfq-magic-001', 'sup-magic-001', 48);
      expect(tokenRes.ok).toBe(true);
      if (!tokenRes.ok) return;

      const { invitationToken } = tokenRes.value;
      expect(invitationToken).toMatch(/^otpmagic_/);

      // 2. First redemption succeeds
      const redeem1 = await service.redeemMagicLinkInvitation(invitationToken);
      expect(redeem1.ok).toBe(true);
      if (!redeem1.ok) return;
      expect(redeem1.value.sessionToken).toMatch(/^sess_/);

      // 3. Second redemption fails (anti-replay)
      const redeem2 = await service.redeemMagicLinkInvitation(invitationToken);
      expect(redeem2.ok).toBe(false);
      if (redeem2.ok) return;
      expect(redeem2.error.message).toContain('already been redeemed');

      // 4. Submit quote using session token
      const quoteRes = await service.submitMagicLinkQuote(redeem1.value.sessionToken, {
        rfqId: 'rfq-magic-001',
        supplierId: 'sup-magic-001',
        basePrice: 50000,
        gstAmount: 9000,
        transportCost: 1500,
        deliveryDays: 14,
        warrantyMonths: 12,
        notes: 'Includes on-site testing',
      });

      expect(quoteRes.ok).toBe(true);
      if (!quoteRes.ok) return;
      expect(quoteRes.value.quoteId).toBeTruthy();
      expect(quoteRes.value.version).toBe(1);

      // 5. Cross-scope quote submission is blocked
      const crossRfqQuote = await service.submitMagicLinkQuote(redeem1.value.sessionToken, {
        rfqId: 'other-rfq-999',
        supplierId: 'sup-magic-001',
        basePrice: 50000,
        gstAmount: 9000,
        transportCost: 1500,
        deliveryDays: 14,
        warrantyMonths: 12,
      });

      expect(crossRfqQuote.ok).toBe(false);
      if (crossRfqQuote.ok) return;
      expect(crossRfqQuote.error.message).toContain('Scope mismatch');
    });
  });

  describe('Multi-RFQ Reuse & Immutable Snapshots', () => {
    it('creates immutable transaction snapshot preserving legal entity state across RFQs', async () => {
      const supplier: Supplier = {
        id: 'sup-canonical-99',
        businessName: 'Evergreen Hardware Ltd',
        legalBusinessName: 'Evergreen Hardware Pvt Ltd',
        tradeName: 'Evergreen',
        pan: 'ABCDE1234F',
        gstin: '29ABCDE1234F1Z5',
        source: 'DIRECT',
        registeredAddress: {
          line1: '10 Industrial Area',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560010',
        },
        contactPerson: 'Arun Kumar',
        contactPhone: '+919876543210',
        contactEmail: 'arun@evergreen.in',
        status: 'ACTIVE',
        categories: ['Hardware'],
        lifecycleState: SupplierLifecycleState.VERIFIED,
        verificationStatus: TruthfulVerificationStatus.VERIFIED,
      };

      await repos.asRepositories().suppliers.save!(supplier);

      const snapRes = await service.getSupplierTransactionSnapshot('sup-canonical-99');
      expect(snapRes.ok).toBe(true);
      if (!snapRes.ok) return;

      expect(snapRes.value.supplierId).toBe('sup-canonical-99');
      expect(snapRes.value.legalBusinessName).toBe('Evergreen Hardware Pvt Ltd');
      expect(snapRes.value.pan).toBe('ABCDE1234F');
      expect(snapRes.value.gstin).toBe('29ABCDE1234F1Z5');
      expect(snapRes.value.snapshotCreatedAt).toBeTruthy();
    });
  });
});
