import { describe, expect, it } from 'vitest';
import {
  SupplierDiscoveryLifecycleTier,
  FIVE_TIER_LIFECYCLE_SEQUENCE,
  evaluateSupplierDiscoveryTier,
  validateDiscoveryTierTransition,
  canSupplierSubmitQuoteAtTier,
  isDirectAwardPermittedWithoutOnboarding,
} from './supplier-lifecycle-tier';

describe('5-Tier Sourcing Lifecycle Engine', () => {
  it('defines the strict 5-tier ordered progression sequence', () => {
    expect(FIVE_TIER_LIFECYCLE_SEQUENCE).toEqual([
      SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA,
      SupplierDiscoveryLifecycleTier.DETAILS_AVAILABLE,
      SupplierDiscoveryLifecycleTier.OTP_REGISTERED,
      SupplierDiscoveryLifecycleTier.OTP_VERIFIED,
      SupplierDiscoveryLifecycleTier.GST_VERIFIED,
    ]);
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
    expect(res.canSubmitQuote).toBe(false); // Must register via magic link first
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
    expect(res.requiresAwardOnboarding).toBe(true); // Still requires statutory GST check
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
    expect(res.requiresAwardOnboarding).toBe(false); // Exempt from redundant onboarding
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
  });

  it('denies illegal backward lifecycle tier transitions without justification', () => {
    const res = validateDiscoveryTierTransition(
      SupplierDiscoveryLifecycleTier.GST_VERIFIED,
      SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA,
    );
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('Illegal backward transition');
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
});
