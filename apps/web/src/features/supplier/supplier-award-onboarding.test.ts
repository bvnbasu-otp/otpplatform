import { describe, it, expect } from 'vitest';
import {
  evaluateSupplierAwardEligibility,
  validateSupplierOnboardingProfile,
  SupplierLifecycleState,
  TruthfulVerificationStatus,
} from '@otp/domain';

describe('Supplier Award Onboarding UI & Gate Logic Tests', () => {
  it('blocks reveal and downstream execution when supplier is unverified quote participant', () => {
    const check = evaluateSupplierAwardEligibility({
      supplierId: 'sup-part-1',
      lifecycleState: SupplierLifecycleState.QUOTE_PARTICIPANT,
      verificationStatus: TruthfulVerificationStatus.NOT_PROVIDED,
    });

    expect(check.canReveal).toBe(false);
    expect(check.canExecuteDownstream).toBe(false);
    expect(check.onboardingRequired).toBe(true);
    expect(check.blockReason).toContain('onboarding and identity verification required');
  });

  it('validates complete supplier onboarding profile with valid GSTIN and PAN', () => {
    const valid = validateSupplierOnboardingProfile({
      legalBusinessName: 'Apex Electricals Pvt Ltd',
      tradeName: 'Apex Power',
      gstin: '29ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
      registeredAddress: {
        line1: '12-A Industrial Suburb',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560022',
        country: 'India',
      },
      contactPerson: 'Suresh Kumar',
      contactPhone: '+919876543210',
      contactEmail: 'suresh@apexpower.test',
    });

    expect(valid.isValid).toBe(true);
    expect(valid.errors).toEqual({});
    expect(valid.resolvedVerificationStatus).toBe(TruthfulVerificationStatus.VERIFIED);
  });

  it('detects mismatched PAN in GSTIN and prevents truthful verification', () => {
    const invalid = validateSupplierOnboardingProfile({
      legalBusinessName: 'Apex Electricals Pvt Ltd',
      gstin: '29ABCDE1234F1Z5',
      pan: 'XXXXX9999X', // Mismatched
      registeredAddress: {
        line1: '12-A Industrial Suburb',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560022',
      },
      contactPerson: 'Suresh Kumar',
      contactPhone: '+919876543210',
      contactEmail: 'suresh@apexpower.test',
    });

    expect(invalid.isValid).toBe(false);
    expect(invalid.errors.pan).toContain('does not match the PAN embedded in GSTIN');
    expect(invalid.resolvedVerificationStatus).toBe(TruthfulVerificationStatus.FAILED);
  });
});
