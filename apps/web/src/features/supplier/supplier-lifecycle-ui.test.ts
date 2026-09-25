import { describe, it, expect } from 'vitest';
import {
  SupplierDiscoveryLifecycleTier,
  getSupplierTierCapabilities,
  SUPPLIER_TIER_CAPABILITY_MATRIX,
  createDiscoveredSupplierRepresentation,
  evaluateSupplierDiscoveryTier,
  evaluateStage1OtpVerification,
  evaluateStage2GstVerification,
  TruthfulVerificationStatus,
} from '@otp/domain';
import { describeQuickQuoteFailure } from '../quick-quote/api/quick-quote';

describe('Supplier 5-Tier Lifecycle & UI Truthfulness Tests', () => {
  describe('Canonical Capability Matrix & Badge UI Models', () => {
    it('renders truthful distinct badge labels and variants across all 5 tiers', () => {
      const tier1 = getSupplierTierCapabilities(SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA);
      expect(tier1.badgeLabel).toBe('Discovered in Area');
      expect(tier1.badgeVariant).toBe('neutral');

      const tier2 = getSupplierTierCapabilities(SupplierDiscoveryLifecycleTier.DETAILS_AVAILABLE);
      expect(tier2.badgeLabel).toBe('Contact Details Available');
      expect(tier2.badgeVariant).toBe('info');

      const tier3 = getSupplierTierCapabilities(SupplierDiscoveryLifecycleTier.OTP_REGISTERED);
      expect(tier3.badgeLabel).toBe('OTP Registered');
      expect(tier3.badgeVariant).toBe('secondary');

      const tier4 = getSupplierTierCapabilities(SupplierDiscoveryLifecycleTier.OTP_VERIFIED);
      expect(tier4.badgeLabel).toBe('OTP Verified');
      expect(tier4.badgeVariant).toBe('primary');

      const tier5 = getSupplierTierCapabilities(SupplierDiscoveryLifecycleTier.GST_VERIFIED);
      expect(tier5.badgeLabel).toBe('GST Verified');
      expect(tier5.badgeVariant).toBe('success');
    });

    it('ensures discovered supplier has zero verified badge or login account', () => {
      const discovered = createDiscoveredSupplierRepresentation({
        id: 'disc-ui-001',
        businessName: 'Apex Hardware Store',
        category: 'Hardware',
        city: 'Bengaluru',
        state: 'Karnataka',
        pinCode: '560001',
        primaryNetwork: 'LOCAL_REGISTRY',
      });

      expect(discovered.isAccountCreated).toBe(false);
      expect(discovered.hasVerifiedBadge).toBe(false);
      expect(discovered.tier).toBe(SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA);
    });
  });

  describe('Quick-Quote Failure States & Truthful Copy', () => {
    it('provides clear, helpful failure descriptions for magic link errors', () => {
      const invalid = describeQuickQuoteFailure('INVALID');
      expect(invalid.title).toContain('already been used, or has expired');

      const rfqClosed = describeQuickQuoteFailure('RFQ_CLOSED');
      expect(rfqClosed.title).toContain('enquiry has closed');

      const notInvited = describeQuickQuoteFailure('NOT_INVITED');
      expect(notInvited.title).toContain('not open to you');

      const unavailable = describeQuickQuoteFailure('UNAVAILABLE');
      expect(unavailable.title).toContain('Something went wrong');
    });
  });

  describe('Stage 2 GST Verification Truthful Fallbacks', () => {
    it('truthfully reports PENDING on external registry downtime without fabricating VERIFIED', () => {
      const res = evaluateStage2GstVerification({
        gstin: '29ABCDE1234F1Z5',
        pan: 'ABCDE1234F',
        providerResponse: {
          status: 'UNAVAILABLE',
        },
      });

      expect(res.isValid).toBe(true);
      expect(res.isOfflineFallback).toBe(true);
      expect(res.status).toBe(TruthfulVerificationStatus.PENDING);
    });

    it('fails closed when GSTIN fails Luhn Mod-36 checksum validation', () => {
      const res = evaluateStage2GstVerification({
        gstin: '29ABCDE1234F1Z0', // Invalid check digit
      });

      expect(res.isValid).toBe(false);
      expect(res.status).toBe(TruthfulVerificationStatus.FAILED);
      expect(res.errors.gstin).toContain('Invalid GSTIN');
    });
  });
});
