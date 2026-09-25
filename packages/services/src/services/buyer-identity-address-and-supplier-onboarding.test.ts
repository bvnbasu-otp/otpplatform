import { describe, it, expect, beforeEach } from 'vitest';
import {
  SupplierLifecycleState,
  TruthfulVerificationStatus,
  BuyerPersona,
  canTransitionMemberClaimState,
  resolveBuyerPersona,
  formatAddressSingleLine,
} from '@otp/domain';
import { InMemoryRepositories } from '../repositories/in-memory';
import { InMemoryAuditService } from '../audit/in-memory-audit-service';
import { AuditAppService } from './audit-service';
import { BuyerAddressService } from './buyer-address-service';
import { SupplierAwardOnboardingService } from './supplier-award-onboarding-service';
import { AwardService } from './award-service';
import { SupplierRevealServiceImpl } from '../reveal/supplier-reveal-service-impl';
import { PurchaseOrderService } from './purchase-order-service';
import { WorkOrderService } from './work-order-service';
import { InvoiceService } from './invoice-service';
import { DefaultApprovalPolicyService } from '../approval/default-approval-policy-service';
import type { ActorContext } from '../types/actor-context';

describe('Buyer Identity + Address + RWA/MSME Organization + Committee/Team + Supplier Award Onboarding Integration', () => {
  let mem: InMemoryRepositories;
  let audit: AuditAppService;
  let policy: DefaultApprovalPolicyService;
  let addressService: BuyerAddressService;
  let onboardingService: SupplierAwardOnboardingService;
  let awardService: AwardService;
  let revealService: SupplierRevealServiceImpl;
  let poService: PurchaseOrderService;
  let woService: WorkOrderService;
  let invoiceService: InvoiceService;

  const buyerActor: ActorContext = {
    profileId: 'buyer-prof-1',
    organizationId: 'org-rwa-100',
    orgRole: 'MANAGER',
    isPlatformAdmin: false,
  };

  const supplierActor: ActorContext = {
    profileId: 'sup-user-1',
    supplierIds: ['sup-unverified-winner'],
    isPlatformAdmin: false,
  };

  beforeEach(() => {
    mem = InMemoryRepositories.create();
    const repos = mem.asRepositories();
    const auditInner = new InMemoryAuditService();
    audit = new AuditAppService(auditInner);
    policy = new DefaultApprovalPolicyService();

    addressService = new BuyerAddressService(repos, audit);
    onboardingService = new SupplierAwardOnboardingService(repos, audit);
    awardService = new AwardService(repos, audit, policy);
    revealService = new SupplierRevealServiceImpl(repos, auditInner);
    poService = new PurchaseOrderService(repos, audit);
    woService = new WorkOrderService(repos, audit);
    invoiceService = new InvoiceService(repos, audit);
  });

  describe('1. Buyer Persona & Address Book Governance', () => {
    it('correctly resolves buyer personas and rejects ENTERPRISE (fail-closed)', () => {
      expect(resolveBuyerPersona('RWA')).toBe('RWA');
      expect(resolveBuyerPersona('MSME')).toBe('MSME');
      expect(resolveBuyerPersona('HOUSING_SOCIETY')).toBe('RWA');
      expect(() => resolveBuyerPersona('ENTERPRISE')).toThrow();
      expect(resolveBuyerPersona(null)).toBe('INDIVIDUAL');
    });

    it('creates, sets primary, and enforces single primary address per organization', async () => {
      const addr1 = await addressService.createAddress(buyerActor, {
        organizationId: 'org-rwa-100',
        label: 'Gate 1 Club House',
        line1: 'Plot 44, Sector 5, Palm Meadows RWA',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560066',
        isPrimary: true,
      });

      expect(addr1.ok).toBe(true);
      if (!addr1.ok) return;
      expect(addr1.value.isPrimary).toBe(true);

      const addr2 = await addressService.createAddress(buyerActor, {
        organizationId: 'org-rwa-100',
        label: 'Tower C Facility Office',
        line1: 'Tower C Ground Floor, Palm Meadows RWA',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560066',
        isPrimary: true, // Should automatically un-primary addr1
      });

      expect(addr2.ok).toBe(true);
      if (!addr2.ok) return;
      expect(addr2.value.isPrimary).toBe(true);

      // Verify addr1 is no longer primary
      const addr1Fetched = await mem.buyerAddresses.get(addr1.value.id);
      expect(addr1Fetched?.isPrimary).toBe(false);

      // Verify getPrimaryAddress returns addr2
      const primaryRes = await addressService.getPrimaryAddress(buyerActor, 'org-rwa-100');
      expect(primaryRes.ok).toBe(true);
      if (!primaryRes.ok) return;
      expect(primaryRes.value?.id).toBe(addr2.value.id);
    });

    it('creates immutable address snapshot resistant to subsequent address edits', async () => {
      const created = await addressService.createAddress(buyerActor, {
        organizationId: 'org-rwa-100',
        label: 'Site Office',
        line1: '100 Main Street',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
        isPrimary: true,
      });
      if (!created.ok) throw created.error;

      const snapshotRes = await addressService.createSnapshot(created.value.id);
      expect(snapshotRes.ok).toBe(true);
      if (!snapshotRes.ok) return;
      const originalSnapshot = snapshotRes.value;

      // Now mutate original address
      await addressService.updateAddress(buyerActor, created.value.id, {
        line1: '999 Completely Altered Street',
      });

      // Frozen snapshot remains unaltered
      expect(originalSnapshot.line1).toBe('100 Main Street');
      expect(formatAddressSingleLine(originalSnapshot)).toContain('100 Main Street');
    });

    it('enforces Org Member Claim Lifecycle transitions (INVITED -> CLAIMED -> PROFILE_COMPLETE -> ACTIVE -> INACTIVE)', () => {
      expect(canTransitionMemberClaimState('INVITED', 'CLAIMED')).toBe(true);
      expect(canTransitionMemberClaimState('CLAIMED', 'PROFILE_COMPLETE')).toBe(true);
      expect(canTransitionMemberClaimState('PROFILE_COMPLETE', 'ACTIVE')).toBe(true);
      expect(canTransitionMemberClaimState('ACTIVE', 'INACTIVE')).toBe(true);
      expect(canTransitionMemberClaimState('INVITED', 'ACTIVE')).toBe(false);
    });
  });

  describe('2. Supplier 2-Stage Lifecycle & Truthful Verification Gates', () => {
    const unverifiedSupplierId = 'sup-unverified-winner';
    const rfqId = 'rfq-solar-001';
    const quoteId = 'quote-solar-001';
    let awardId: string;

    beforeEach(async () => {
      // Seed unverified supplier as QUOTE_PARTICIPANT
      mem.suppliers.set(unverifiedSupplierId, {
        id: unverifiedSupplierId,
        businessName: 'Unverified Solar Services',
        source: 'DIRECT_INVITE',
        status: 'ACTIVE',
        categories: ['SOLAR'],
        lifecycleState: SupplierLifecycleState.QUOTE_PARTICIPANT,
        verificationStatus: TruthfulVerificationStatus.NOT_PROVIDED,
      });

      // Seed RFQ & Quote
      mem.requirements.set('req-001', {
        id: 'req-001',
        organizationId: 'org-rwa-100',
        createdBy: buyerActor.profileId,
        requirementType: 'PRODUCT',
        status: 'SUBMITTED',
        title: 'Society Solar Installation',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      mem.rfqs.set(rfqId, {
        id: rfqId,
        requirementId: 'req-001',
        organizationId: 'org-rwa-100',
        status: 'EVALUATING',
        revealStatus: 'PROTECTED',
        title: 'Society Solar Installation RFQ',
        buyerAnonymousToSuppliers: true,
        minQuotesRequired: 1,
        deliveryAddressSnapshot: {
          line1: 'Palm Meadows RWA Rooftop',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560066',
        },
        createdBy: buyerActor.profileId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      mem.quotes.set(quoteId, {
        id: quoteId,
        rfqId,
        supplierId: unverifiedSupplierId,
        invitationId: 'inv-001',
        status: 'FINAL',
        currentVersion: 1,
        submittedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      mem.quoteVersions.set('qv-001', {
        id: 'qv-001',
        quoteId,
        version: 1,
        snapshot: {
          basePrice: 84745.76,
          gstAmount: 15254.24,
          transportCost: 0,
          totalCost: 100000,
          deliveryDays: 14,
          warrantyMonths: 12,
          currency: 'INR',
        },
        createdBy: unverifiedSupplierId,
        createdAt: new Date().toISOString(),
      });

      // Create Award
      const awardRes = await awardService.createAward(
        buyerActor,
        rfqId,
        quoteId,
        'Lowest qualified quote for solar panels',
      );
      if (!awardRes.ok) throw awardRes.error;
      awardId = awardRes.value.id;
    });

    it('mandates onboarding when unverified supplier wins award', async () => {
      const eligibility = await onboardingService.evaluateAwardEligibility(awardId);
      expect(eligibility.ok).toBe(true);
      if (!eligibility.ok) return;

      expect(eligibility.value.canReveal).toBe(false);
      expect(eligibility.value.canExecuteDownstream).toBe(false);
      expect(eligibility.value.onboardingRequired).toBe(true);
      expect(eligibility.value.blockReason).toContain('onboarding and identity verification required');
    });

    it('blocks reveal attempt while supplier is unverified (Fail-Closed Server Gate)', async () => {
      await expect(revealService.revealForRfq(buyerActor, rfqId)).rejects.toThrow(
        /verification required/i,
      );
    });

    it('blocks PO creation while supplier is unverified', async () => {
      // Even if someone manually tampered award status to REVEALED
      const award = mem.awards.get(awardId)!;
      mem.awards.set(awardId, { ...award, status: 'REVEALED' });

      const poRes = await poService.createFromAward(buyerActor, awardId);
      expect(poRes.ok).toBe(false);
      if (poRes.ok) return;
      expect(poRes.error.message).toContain('Downstream transaction blocked');
    });

    it('completes onboarding claiming, profile submission, and GSTIN/PAN truthful verification', async () => {
      // 1. Generate Onboarding Token
      const tokenRes = await onboardingService.generateOnboardingToken(buyerActor, unverifiedSupplierId);
      expect(tokenRes.ok).toBe(true);
      if (!tokenRes.ok) return;
      const { token } = tokenRes.value;

      // 2. Supplier claims onboarding
      const claimRes = await onboardingService.claimOnboarding(token);
      expect(claimRes.ok).toBe(true);
      if (!claimRes.ok) return;
      expect(claimRes.value.status).toBe(SupplierLifecycleState.ONBOARDING_IN_PROGRESS);

      // 3. Supplier submits profile with statutory GSTIN/PAN
      const profileSubmissionRes = await onboardingService.submitProfile({
        supplierId: unverifiedSupplierId,
        token,
        legalBusinessName: 'Helios Solar Systems India Private Limited',
        tradeName: 'Helios Solar',
        gstin: '29ABCDE1234F1Z5',
        pan: 'ABCDE1234F',
        registeredAddress: {
          line1: '88 Electronic City Phase 1',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560100',
          country: 'India',
        },
        contactPerson: 'Arun Kumar',
        contactPhone: '+919888877777',
        contactEmail: 'arun@heliossolar.test',
      });

      expect(profileSubmissionRes.ok).toBe(true);
      if (!profileSubmissionRes.ok) return;
      expect(profileSubmissionRes.value.supplier.lifecycleState).toBe(SupplierLifecycleState.VERIFIED);
      expect(profileSubmissionRes.value.supplier.verificationStatus).toBe(TruthfulVerificationStatus.VERIFIED);

      // 4. Reveal gate is now unlocked
      const revealRes = await revealService.revealForRfq(buyerActor, rfqId);
      expect(revealRes.supplierBusinessName).toBe('Helios Solar Systems India Private Limited');

      // 5. PO creation now succeeds and captures frozen address snapshots
      const poRes = await poService.createFromAward(buyerActor, awardId);
      expect(poRes.ok).toBe(true);
      if (!poRes.ok) return;
      expect(poRes.value.deliveryAddressSnapshot).toBeDefined();
      expect((poRes.value.deliveryAddressSnapshot as any).line1).toBe('Palm Meadows RWA Rooftop');
    });

    it('blocks downstream execution gates (Work Orders, Invoices) if supplier is unverified or suspended', async () => {
      // Force an unverified supplier PO
      const unverifiedPoId = 'po-unverified-test';
      mem.purchaseOrders.set(unverifiedPoId, {
        id: unverifiedPoId,
        awardId,
        rfqId,
        organizationId: 'org-rwa-100',
        supplierId: unverifiedSupplierId,
        poNumber: 'PO-2026-TEST',
        status: 'ISSUED',
        totalAmount: 50000,
        currency: 'INR',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Supplier tries to accept PO -> BLOCKED
      const acceptRes = await poService.transition(supplierActor, unverifiedPoId, 'ACCEPTED');
      expect(acceptRes.ok).toBe(false);
      if (!acceptRes.ok) {
        expect(acceptRes.error.message).toContain('Downstream transaction blocked');
      }

      // Work order update progress -> BLOCKED
      const woRes = await woService.create(buyerActor, unverifiedPoId, 'Solar Installation WO');
      expect(woRes.ok).toBe(true);
      if (!woRes.ok) return;

      const woProgressRes = await woService.updateProgress(supplierActor, woRes.value.id, 50);
      expect(woProgressRes.ok).toBe(false);
      if (!woProgressRes.ok) {
        expect(woProgressRes.error.message).toContain('Downstream transaction blocked');
      }

      // Invoice submission -> BLOCKED
      const invRes = await invoiceService.submit(
        supplierActor,
        woRes.value.id,
        'INV-001',
        10000,
      );
      expect(invRes.ok).toBe(false);
      if (!invRes.ok) {
        expect(invRes.error.message).toContain('Downstream transaction blocked');
      }
    });
  });
});
