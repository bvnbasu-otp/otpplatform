import { describe, expect, it } from 'vitest';
import { generateValidGstin } from '@otp/domain';
import {
  GstVerificationService,
  MockGstVerificationAdapter,
  PRE_SEEDED_GSTINS,
} from '../gst-verification-service';

describe('GST Verification Service', () => {
  const service = new GstVerificationService(new MockGstVerificationAdapter());

  it('verifies a known pre-seeded GSTIN with exact taxpayer metadata', async () => {
    const res = await service.verify(PRE_SEEDED_GSTINS.kavveri);
    expect(res.verified).toBe(true);
    expect(res.details?.legalName).toBe('KAVVERI PUMP & ELECTRICAL SERVICES PRIVATE LIMITED');
    expect(res.details?.status).toBe('ACTIVE');
    expect(res.details?.principalAddress?.city).toBe('Bengaluru');
  });

  it('synthesizes valid active taxpayer details for valid dynamic GSTINs', async () => {
    const dynamicGstin = generateValidGstin({
      stateCode: '33',
      pan: 'AABCT1452F',
      entityNumber: '1',
    });

    const res = await service.verify(dynamicGstin);
    expect(res.verified).toBe(true);
    expect(res.details?.gstin).toBe(dynamicGstin);
    expect(res.details?.pan).toBe('AABCT1452F');
    expect(res.details?.status).toBe('ACTIVE');
  });

  it('fails verification on invalid GSTIN format or checksum error', async () => {
    const res = await service.verify('INVALID_GSTIN_123');
    expect(res.verified).toBe(false);
    expect(res.error).toBeDefined();
  });
});
