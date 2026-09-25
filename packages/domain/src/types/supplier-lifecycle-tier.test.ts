import { describe, expect, it } from 'vitest';
import {
  SupplierDiscoveryLifecycleTier,
  FIVE_TIER_LIFECYCLE_SEQUENCE,
  SUPPLIER_TIER_CAPABILITY_MATRIX,
  getSupplierTierCapabilities,
  createDiscoveredSupplierRepresentation,
  evaluateSupplierDiscoveryTier,
  validateDiscoveryTierTransition,
  assertMonotonicTierTransition,
  IllegalLifecycleTransitionError,
  canSupplierSubmitQuoteAtTier,
  isDirectAwardPermittedWithoutOnboarding,
  evaluateSupplierClaimMatch,
  evaluateStage1OtpVerification,
  evaluateStage2GstVerification,
  createSupplierTransactionSnapshot,
} from './supplier-lifecycle-tier';
import { TruthfulVerificationStatus, SupplierLifecycleState } from '../enums/supplier';

describe('5-Tier Canonical Supplier Lifecycle & Capability Matrix', () => {
  it('defines the strict 5-tier ordered progression sequence', () => {
    expect(FIVE_TIER_LIFECYCLE_SEQUENCE).toEqual([
      SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA,
      SupplierDiscoveryLifecycleTier.DETAILS_AVAILABLE,
      SupplierDiscoveryLifecycleTier.OTP_REGISTERED,
      SupplierDiscoveryLifecycleTier.OTP_VERIFIED,
      SupplierDiscoveryLifecycleTier.GST_VERIFIED,
    ]);
  });

  it('enforces complete discrete capability matrix across all 5 tiers', () => {
    // Tier 1: DISCOVERED_IN_AREA
    const cap1 = getSupplierTierCapabilities(SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA);
    expect(cap1.rank).toBe(1);
    expect(cap1.canAppearInNetworkDiscovery).toBe(true);
    expect(cap1.canReceiveRfqInvitation).toBe(false);
    expect(cap1.canSubmitQuote).toBe(false);
    expect(cap1.canClaimProfile).toBe(true);
    expect(cap1.isWinningEligible).toBe(false);
    expect(cap1.canDirectRevealOnAward).toBe(false);
    expect(cap1.canAcceptPurchaseOrder).toBe(false);
    expect(cap1.canParticipateInSettlement).toBe(false);
    expect(cap1.requiresStatutoryOnboardingGate).toBe(true);

    // Tier 2: DETAILS_AVAILABLE
    const cap2 = getSupplierTierCapabilities(SupplierDiscoveryLifecycleTier.DETAILS_AVAILABLE);
    expect(cap2.rank).toBe(2);
    expect(cap2.canReceiveRfqInvitation).toBe(true);
    expect(cap2.canSubmitQuote).toBe(false);
    expect(cap2.isWinningEligible).toBe(false);
    expect(cap2.requiresStatutoryOnboardingGate).toBe(true);

    // Tier 3: OTP_REGISTERED
    const cap3 = getSupplierTierCapabilities(SupplierDiscoveryLifecycleTier.OTP_REGISTERED);
    expect(cap3.rank).toBe(3);
    expect(cap3.canReceiveRfqInvitation).toBe(true);
    expect(cap3.canSubmitQuote).toBe(true);
    expect(cap3.isWinningEligible).toBe(true);
    expect(cap3.canDirectRevealOnAward).toBe(false); // PA-02 gated
    expect(cap3.requiresStatutoryOnboardingGate).toBe(true);

    // Tier 4: OTP_VERIFIED
    const cap4 = getSupplierTierCapabilities(SupplierDiscoveryLifecycleTier.OTP_VERIFIED);
    expect(cap4.rank).toBe(4);
    expect(cap4.canSubmitQuote).toBe(true);
    expect(cap4.isWinningEligible).toBe(true);
    expect(cap4.canDirectRevealOnAward).toBe(false);
    expect(cap4.requiresStatutoryOnboardingGate).toBe(true);

    // Tier 5: GST_VERIFIED
    const cap5 = getSupplierTierCapabilities(SupplierDiscoveryLifecycleTier.GST_VERIFIED);
    expect(cap5.rank).toBe(5);
    expect(cap5.canReceiveRfqInvitation).toBe(true);
    expect(cap5.canSubmitQuote).toBe(true);
    expect(cap5.isWinningEligible).toBe(true);
    expect(cap5.canDirectRevealOnAward).toBe(true);
    expect(cap5.canAcceptPurchaseOrder).toBe(true);
    expect(cap5.canParticipateInSettlement).toBe(true);
    expect(cap5.requiresStatutoryOnboardingGate).toBe(false);
  });

  it('creates truthful discovered supplier representation with zero login or verified badges', () => {
    const discovered = createDiscoveredSupplierRepresentation({
      id: 'disc-001',
      businessName: 'Unregistered Plumbing Depot',
      category: 'Plumbing',
      city: 'Bengaluru',
      state: 'Karnataka',
      pinCode: '560001',
      primaryNetwork: 'LOCAL_REGISTRY',
      discoveredNetworks: ['LOCAL_REGISTRY', 'BNI'],
      confidenceScore: 65,
    });

    expect(discovered.isAccountCreated).toBe(false);
    expect(discovered.hasVerifiedBadge).toBe(false);
    expect(discovered.tier).toBe(SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA);
    expect(discovered.primaryNetwork).toBe('LOCAL_REGISTRY');
    expect(discovered.discoveredNetworks).toEqual(['LOCAL_REGISTRY', 'BNI']);
  });

  it('Tier 1: evaluates candidate with only geographic discovery as DISCOVERED_IN_AREA', () => {
    const res = evaluateSupplierDiscoveryTier({
      businessName: 'Unclaimed Local Supplier',
      city: 'Bengaluru',
      pinCode: '560048',
    });

    expect(res.tier).toBe(SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA);
    expect(res.rank).toBe(1);
    expect(res.canReceiveInvitation).toBe(false);
    expect(res.canSubmitQuote).toBe(false);
    expect(res.requiresAwardOnboarding).toBe(true);
    expect(res.isStatutoryVerified).toBe(false);
  });

  it('Tier 2: evaluates candidate with contact details as DETAILS_AVAILABLE', () => {
    const res = evaluateSupplierDiscoveryTier({
      businessName: 'Local Hardware Store',
      phone: '+919876543210',
      email: 'sales@localhardware.in',
      city: 'Bengaluru',
    });

    expect(res.tier).toBe(SupplierDiscoveryLifecycleTier.DETAILS_AVAILABLE);
    expect(res.rank).toBe(2);
    expect(res.canReceiveInvitation).toBe(true);
    expect(res.canSubmitQuote).toBe(false);
    expect(res.requiresAwardOnboarding).toBe(true);
  });

  it('Tier 3: evaluates claimed profile as OTP_REGISTERED', () => {
    const res = evaluateSupplierDiscoveryTier({
      supplierId: 'sup-registered-01',
      businessName: 'Registered Electricals Ltd',
      phone: '+919876543210',
      email: 'info@reg-elec.com',
      isOtpRegistered: true,
    });

    expect(res.tier).toBe(SupplierDiscoveryLifecycleTier.OTP_REGISTERED);
    expect(res.rank).toBe(3);
    expect(res.canReceiveInvitation).toBe(true);
    expect(res.canSubmitQuote).toBe(true);
    expect(res.requiresAwardOnboarding).toBe(true);
  });

  it('Tier 4: evaluates verified OTP user as OTP_VERIFIED', () => {
    const res = evaluateSupplierDiscoveryTier({
      supplierId: 'sup-verified-01',
      businessName: 'Verified Solar Solutions',
      phone: '+919876543210',
      email: 'solar@verified.com',
      isOtpRegistered: true,
      isOtpVerified: true,
    });

    expect(res.tier).toBe(SupplierDiscoveryLifecycleTier.OTP_VERIFIED);
    expect(res.rank).toBe(4);
    expect(res.canReceiveInvitation).toBe(true);
    expect(res.canSubmitQuote).toBe(true);
    expect(res.requiresAwardOnboarding).toBe(true);
  });

  it('Tier 5: evaluates GST validated profile as GST_VERIFIED', () => {
    const res = evaluateSupplierDiscoveryTier({
      supplierId: 'sup-gst-01',
      businessName: 'Apex Commercial Supplies Pvt Ltd',
      phone: '+919876543210',
      email: 'accounts@apex.in',
      gstin: '29ABCDE1234F1Z5',
      isOtpRegistered: true,
      isOtpVerified: true,
      isGstVerified: true,
    });

    expect(res.tier).toBe(SupplierDiscoveryLifecycleTier.GST_VERIFIED);
    expect(res.rank).toBe(5);
    expect(res.canReceiveInvitation).toBe(true);
    expect(res.canSubmitQuote).toBe(true);
    expect(res.requiresAwardOnboarding).toBe(false);
    expect(res.isStatutoryVerified).toBe(true);
  });

  it('validates legal progressive tier transitions', () => {
    expect(
      validateDiscoveryTierTransition(
        SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA,
        SupplierDiscoveryLifecycleTier.DETAILS_AVAILABLE,
      ).valid,
    ).toBe(true);

    expect(
      validateDiscoveryTierTransition(
        SupplierDiscoveryLifecycleTier.DETAILS_AVAILABLE,
        SupplierDiscoveryLifecycleTier.OTP_REGISTERED,
      ).valid,
    ).toBe(true);

    expect(
      validateDiscoveryTierTransition(
        SupplierDiscoveryLifecycleTier.OTP_REGISTERED,
        SupplierDiscoveryLifecycleTier.GST_VERIFIED,
      ).valid,
    ).toBe(true);

    expect(() =>
      assertMonotonicTierTransition(
        SupplierDiscoveryLifecycleTier.OTP_REGISTERED,
        SupplierDiscoveryLifecycleTier.GST_VERIFIED,
      ),
    ).not.toThrow();
  });

  it('denies illegal backward lifecycle tier transitions and throws IllegalLifecycleTransitionError', () => {
    const res = validateDiscoveryTierTransition(
      SupplierDiscoveryLifecycleTier.GST_VERIFIED,
      SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA,
    );
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('Illegal backward transition');

    expect(() =>
      assertMonotonicTierTransition(
        SupplierDiscoveryLifecycleTier.GST_VERIFIED,
        SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA,
      ),
    ).toThrow(IllegalLifecycleTransitionError);
  });

  it('enforces quoting and direct award permissions by tier', () => {
    expect(canSupplierSubmitQuoteAtTier(SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA)).toBe(false);
    expect(canSupplierSubmitQuoteAtTier(SupplierDiscoveryLifecycleTier.DETAILS_AVAILABLE)).toBe(false);
    expect(canSupplierSubmitQuoteAtTier(SupplierDiscoveryLifecycleTier.OTP_REGISTERED)).toBe(true);
    expect(canSupplierSubmitQuoteAtTier(SupplierDiscoveryLifecycleTier.OTP_VERIFIED)).toBe(true);
    expect(canSupplierSubmitQuoteAtTier(SupplierDiscoveryLifecycleTier.GST_VERIFIED)).toBe(true);

    expect(isDirectAwardPermittedWithoutOnboarding(SupplierDiscoveryLifecycleTier.OTP_REGISTERED)).toBe(false);
    expect(isDirectAwardPermittedWithoutOnboarding(SupplierDiscoveryLifecycleTier.OTP_VERIFIED)).toBe(false);
    expect(isDirectAwardPermittedWithoutOnboarding(SupplierDiscoveryLifecycleTier.GST_VERIFIED)).toBe(true);
  });

  describe('Supplier Claim & Matching Flow', () => {
    it('creates new registered entity when no candidate match exists', () => {
      const match = evaluateSupplierClaimMatch(null, {
        claimedByProfileId: 'prof-123',
        contactPhone: '+919876543210',
        contactEmail: 'new@supplier.in',
        legalBusinessName: 'Brand New Supplier Pvt Ltd',
        verificationMethod: 'PHONE_OTP',
        otpVerified: true,
      });

      expect(match.status).toBe('NO_MATCH_NEW_ENTITY');
      expect(match.targetTier).toBe(SupplierDiscoveryLifecycleTier.OTP_REGISTERED);
      expect(match.requiresManualReview).toBe(false);
    });

    it('confirms high-confidence match when phone and PAN match discovered record', () => {
      const candidate = {
        supplierId: 'cand-001',
        businessName: 'Prime Electricals',
        phone: '+919876543210',
        pan: 'ABCDE1234F',
      };

      const match = evaluateSupplierClaimMatch(candidate, {
        claimedByProfileId: 'prof-123',
        contactPhone: '9876543210',
        contactEmail: 'claims@prime.in',
        legalBusinessName: 'Prime Electricals Pvt Ltd',
        pan: 'ABCDE1234F',
        verificationMethod: 'PHONE_OTP',
        otpVerified: true,
      });

      expect(match.status).toBe('CONFIRMED_MATCH');
      expect(match.matchConfidence).toBeGreaterThanOrEqual(70);
      expect(match.matchedCandidateId).toBe('cand-001');
      expect(match.requiresManualReview).toBe(false);
    });

    it('flags REVIEW_REQUIRED when OTP is unverified or match confidence is below threshold', () => {
      const candidate = {
        supplierId: 'cand-002',
        businessName: 'Southern Pipes',
        phone: '+919999988888',
      };

      const unverifiedMatch = evaluateSupplierClaimMatch(candidate, {
        claimedByProfileId: 'prof-456',
        contactPhone: '9999988888',
        contactEmail: 'hijacker@other.in',
        legalBusinessName: 'Southern Pipes',
        verificationMethod: 'PHONE_OTP',
        otpVerified: false, // Not verified
      });

      expect(unverifiedMatch.status).toBe('REVIEW_REQUIRED');
      expect(unverifiedMatch.requiresManualReview).toBe(true);
    });

    it('detects CONFLICT_DETECTED when PAN differs from candidate record', () => {
      const candidate = {
        supplierId: 'cand-003',
        businessName: 'Apex Cables',
        pan: 'AAAAA1111A',
      };

      const match = evaluateSupplierClaimMatch(candidate, {
        claimedByProfileId: 'prof-789',
        contactPhone: '9876543210',
        contactEmail: 'info@othercables.in',
        legalBusinessName: 'Apex Cables',
        pan: 'BBBBB2222B', // Conflict!
        verificationMethod: 'PHONE_OTP',
        otpVerified: true,
      });

      expect(match.status).toBe('CONFLICT_DETECTED');
      expect(match.requiresManualReview).toBe(true);
    });
  });

  describe('2-Stage Verification Gates', () => {
    it('Stage 1 (OTP Verification): validates representative and contact credentials', () => {
      const res = evaluateStage1OtpVerification({
        authorizedRepName: 'Ramesh Patel',
        contactPhone: '+919876543210',
        phoneOtpVerified: true,
        contactEmail: 'ramesh@patel.test',
        emailOtpVerified: true,
        pan: 'ABCDE1234F',
      });

      expect(res.isValid).toBe(true);
      expect(res.status).toBe(TruthfulVerificationStatus.VERIFIED);
      expect(res.verifiedFields).toContain('authorizedRepName');
      expect(res.verifiedFields).toContain('contactPhone');
      expect(res.verifiedFields).toContain('pan');
    });

    it('Stage 1: fails when phone OTP is unverified', () => {
      const res = evaluateStage1OtpVerification({
        authorizedRepName: 'Ramesh Patel',
        contactPhone: '+919876543210',
        phoneOtpVerified: false,
      });

      expect(res.isValid).toBe(false);
      expect(res.status).toBe(TruthfulVerificationStatus.PENDING);
      expect(res.errors.contactPhone).toContain('Phone OTP verification is required');
    });

    it('Stage 2 (GST Verification): validates 15-char structure, Luhn Mod-36 checksum, and PAN correlation', () => {
      const res = evaluateStage2GstVerification({
        gstin: '29ABCDE1234F1Z5',
        pan: 'ABCDE1234F',
        legalBusinessName: 'Apex Power Pvt Ltd',
      });

      expect(res.isValid).toBe(true);
      expect(res.checksumValid).toBe(true);
      expect(res.panAligned).toBe(true);
      expect(res.status).toBe(TruthfulVerificationStatus.VERIFIED);
    });

    it('Stage 2: rejects invalid GSTIN checksum', () => {
      const res = evaluateStage2GstVerification({
        gstin: '29ABCDE1234F1Z9', // Invalid checksum digit
      });

      expect(res.isValid).toBe(false);
      expect(res.checksumValid).toBe(false);
      expect(res.status).toBe(TruthfulVerificationStatus.FAILED);
      expect(res.errors.gstin).toContain('Invalid GSTIN');
    });

    it('Stage 2: rejects PAN mismatch between standalone PAN and embedded GSTIN PAN', () => {
      const res = evaluateStage2GstVerification({
        gstin: '29ABCDE1234F1Z5',
        pan: 'ZZZZZ9999Z', // Mismatch
      });

      expect(res.isValid).toBe(false);
      expect(res.panAligned).toBe(false);
      expect(res.status).toBe(TruthfulVerificationStatus.FAILED);
      expect(res.errors.pan).toContain('does not match the PAN embedded in GSTIN');
    });

    it('Stage 2: handles graceful offline fallback with truthful PENDING status', () => {
      const res = evaluateStage2GstVerification({
        gstin: '29ABCDE1234F1Z5',
        pan: 'ABCDE1234F',
        providerResponse: {
          status: 'UNAVAILABLE',
        },
      });

      expect(res.isValid).toBe(true);
      expect(res.isOfflineFallback).toBe(true);
      expect(res.status).toBe(TruthfulVerificationStatus.PENDING); // Truthful PENDING, never fake VERIFIED
    });
  });

  describe('Multi-RFQ Reuse & Immutable Snapshots', () => {
    it('creates immutable supplier transaction snapshot for historical PO execution', () => {
      const snapshot = createSupplierTransactionSnapshot({
        id: 'sup-canonical-01',
        legalBusinessName: 'Apex Commercial Supplies Pvt Ltd',
        tradeName: 'Apex Power',
        pan: 'ABCDE1234F',
        gstin: '29ABCDE1234F1Z5',
        registeredAddress: {
          line1: '12 Industrial Suburb',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560022',
        },
        contactPerson: 'Suresh Kumar',
        contactPhone: '+919876543210',
        contactEmail: 'suresh@apex.in',
        lifecycleState: SupplierLifecycleState.VERIFIED,
        verificationStatus: TruthfulVerificationStatus.VERIFIED,
      });

      expect(snapshot.supplierId).toBe('sup-canonical-01');
      expect(snapshot.legalBusinessName).toBe('Apex Commercial Supplies Pvt Ltd');
      expect(snapshot.pan).toBe('ABCDE1234F');
      expect(snapshot.gstin).toBe('29ABCDE1234F1Z5');
      expect(snapshot.snapshotCreatedAt).toBeTruthy();
    });
  });
});
