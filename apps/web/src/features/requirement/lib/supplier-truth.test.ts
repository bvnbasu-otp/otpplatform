import { describe, expect, it } from 'vitest';
import type { MatchedSupplier } from '../types/discovery';
import {
  discoveryDisplayRank,
  hasGstVerification,
  hasOtpRegistration,
  invitationStatusPresentation,
  sortSuppliersForDisplay,
} from './supplier-truth';

function mockSupplier(overrides: Partial<MatchedSupplier> = {}): MatchedSupplier {
  return {
    invitationId: 'inv-1',
    anonymousLabel: 'Supplier #01',
    status: 'INVITED',
    matchScore: 80,
    matchLevel: 'STRONG',
    matchReasons: [],
    network: 'GOOGLE_PLACES',
    networkLabel: 'Discovered in area',
    gstVerified: false,
    otpRegistered: false,
    isLocal: true,
    availabilityText: 'Availability not confirmed before quote',
    ...overrides,
  };
}

describe('supplier-truth labels', () => {
  it('does not treat GST alone as OTP registration', () => {
    const s = mockSupplier({
      gstVerified: true,
      matchReasons: ['gst_verified'],
      otpRegistered: false,
    });
    expect(hasGstVerification(s)).toBe(true);
    expect(hasOtpRegistration(s)).toBe(false);
  });

  it('requires otp_registered signal for registration badge', () => {
    const s = mockSupplier({
      otpRegistered: true,
      matchReasons: ['otp_registered'],
      network: 'OTP_REGISTERED',
      networkLabel: 'OTP registered supplier',
    });
    expect(hasOtpRegistration(s)).toBe(true);
  });

  it('maps invitation statuses without implying delivery', () => {
    expect(invitationStatusPresentation(mockSupplier({ status: 'QUOTED' })).label).toContain('quote');
    expect(invitationStatusPresentation(mockSupplier({ status: 'DECLINED', declineReason: 'Busy' })).detail).toBe(
      'Busy',
    );
    expect(invitationStatusPresentation(mockSupplier({ status: 'CANDIDATE' })).label).toContain('not yet invited');
  });

  it('sorts OTP-registered suppliers ahead of area discovery', () => {
    const places = mockSupplier({ invitationId: 'a', matchScore: 95, network: 'GOOGLE_PLACES' });
    const otp = mockSupplier({
      invitationId: 'b',
      matchScore: 70,
      otpRegistered: true,
      matchReasons: ['otp_registered'],
      network: 'OTP_REGISTERED',
    });
    expect(discoveryDisplayRank(otp)).toBeLessThan(discoveryDisplayRank(places));
    const sorted = sortSuppliersForDisplay([places, otp]);
    expect(sorted[0]?.invitationId).toBe('b');
  });
});
