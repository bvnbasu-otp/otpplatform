import { describe, it, expect } from 'vitest';
import {
  evaluateSupplierAwardEligibility,
  validateSupplierOnboardingProfile,
  checkSupplierExecutionGate,
  type SupplierOnboardingProfileSubmission,
} from './supplier-award-onboarding';
import {
  SupplierLifecycleState,
  TruthfulVerificationStatus,
} from '../enums/supplier';

describe('Supplier Award Onboarding & Truthful Verification Gates', () => {
  const validProfile: SupplierOnboardingProfileSubmission = {
    supplierId: 'sup-100',
    token: 'token-abc-123',
    legalBusinessName: 'Kovai Precision Electricals Pvt Ltd',
    tradeName: 'Kovai Precision',
    gstin: '29ABCDE1234F1Z5', // Structure valid (15 chars)
    pan: 'ABCDE1234F',
    registeredAddress: {
      line1: '12-A SIDCO Industrial Estate',
      line2: 'Kurichi',
      city: 'Coimbatore',
      state: 'Tamil Nadu',
      pincode: '641021',
      country: 'India',
    },
    contactPerson: 'K. Murugesan',
    contactPhone: '+919840012345',
    contactEmail: 'murugesan@kovaiprecision.test',
  };

  describe('evaluateSupplierAwardEligibility', () => {
    it('allows reveal & downstream execution when supplier is VERIFIED', () => {
      const res = evaluateSupplierAwardEligibility({
        supplierId: 'sup-100',
        lifecycleState: SupplierLifecycleState.VERIFIED,
        verificationStatus: TruthfulVerificationStatus.VERIFIED,
      });

      expect(res.canReveal).toBe(true);
      expect(res.canExecuteDownstream).toBe(true);
      expect(res.onboardingRequired).toBe(false);
      expect(res.isVerified).toBe(true);
    });

    it('blocks reveal and mandates onboarding when quote participant wins award', () => {
      const res = evaluateSupplierAwardEligibility({
        supplierId: 'sup-unverified-1',
        lifecycleState: SupplierLifecycleState.QUOTE_PARTICIPANT,
        verificationStatus: TruthfulVerificationStatus.NOT_PROVIDED,
      });

      expect(res.canReveal).toBe(false);
      expect(res.canExecuteDownstream).toBe(false);
      expect(res.onboardingRequired).toBe(true);
      expect(res.isVerified).toBe(false);
      expect(res.blockReason).toContain('onboarding and identity verification required');
    });

    it('blocks reveal when supplier verification is pending or failed', () => {
      const pendingRes = evaluateSupplierAwardEligibility({
        supplierId: 'sup-pending',
        lifecycleState: SupplierLifecycleState.VERIFICATION_PENDING,
        verificationStatus: TruthfulVerificationStatus.PENDING,
      });
      expect(pendingRes.canReveal).toBe(false);

      const failedRes = evaluateSupplierAwardEligibility({
        supplierId: 'sup-failed',
        lifecycleState: SupplierLifecycleState.VERIFICATION_FAILED,
        verificationStatus: TruthfulVerificationStatus.FAILED,
      });
      expect(failedRes.canReveal).toBe(false);
      expect(failedRes.blockReason).toContain('failed statutory validation');
    });
  });

  describe('validateSupplierOnboardingProfile', () => {
    it('validates a complete and truthful profile submission', () => {
      const res = validateSupplierOnboardingProfile(validProfile);
      expect(res.isValid).toBe(true);
      expect(res.errors).toEqual({});
      expect(res.resolvedVerificationStatus).toBe(TruthfulVerificationStatus.VERIFIED);
    });

    it('flags invalid PAN structure or GSTIN/PAN mismatch', () => {
      const mismatched = {
        ...validProfile,
        pan: 'ZZZZZ9999Z', // Does not match ABCDE1234F in GSTIN
      };
      const res = validateSupplierOnboardingProfile(mismatched);
      expect(res.isValid).toBe(false);
      expect(res.errors.pan).toContain('does not match the PAN embedded in GSTIN');
      expect(res.resolvedVerificationStatus).toBe(TruthfulVerificationStatus.FAILED);
    });

    it('flags missing contact details and address lines', () => {
      const incomplete = {
        ...validProfile,
        legalBusinessName: '',
        contactPerson: '',
        contactPhone: 'abc',
        registeredAddress: {
          line1: '',
          city: '',
          state: '',
          pincode: '999',
        },
      };
      const res = validateSupplierOnboardingProfile(incomplete);
      expect(res.isValid).toBe(false);
      expect(res.errors.legalBusinessName).toBeTruthy();
      expect(res.errors.contactPerson).toBeTruthy();
      expect(res.errors.contactPhone).toBeTruthy();
      expect(res.errors.addressLine1).toBeTruthy();
      expect(res.errors.pincode).toBeTruthy();
    });
  });

  describe('checkSupplierExecutionGate', () => {
    it('permits downstream operations for verified active suppliers', () => {
      const gate = checkSupplierExecutionGate({
        id: 'sup-100',
        lifecycleState: SupplierLifecycleState.VERIFIED,
        verificationStatus: TruthfulVerificationStatus.VERIFIED,
      });
      expect(gate.allowed).toBe(true);
    });

    it('blocks downstream operations for unverified suppliers', () => {
      const gate = checkSupplierExecutionGate({
        id: 'sup-new',
        lifecycleState: SupplierLifecycleState.ONBOARDING_REQUIRED,
        verificationStatus: TruthfulVerificationStatus.NOT_PROVIDED,
      });
      expect(gate.allowed).toBe(false);
      expect(gate.error).toContain('Downstream transaction blocked');
    });
  });
});
