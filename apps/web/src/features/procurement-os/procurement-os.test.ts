import { describe, expect, it } from 'vitest';
import { supplierSourceToNetwork, SupplierNetwork } from '@otp/domain';
import { networkLabel } from './lib/network-labels';

describe('procurement OS domain', () => {
  it('maps supplier sources to open network adapters', () => {
    expect(supplierSourceToNetwork('ONDC')).toBe('ONDC');
    expect(supplierSourceToNetwork('BNI')).toBe('BNI');
    expect(supplierSourceToNetwork('ASSOCIATION')).toBe('ASSOCIATION');
    expect(supplierSourceToNetwork('LOCAL_REGISTRY')).toBe('LOCAL_REGISTRY');
    expect(supplierSourceToNetwork('GOOGLE_PLACES')).toBe('GOOGLE_PLACES');
    expect(supplierSourceToNetwork('PLACES')).toBe('GOOGLE_PLACES');
    expect(supplierSourceToNetwork('DIRECT')).toBe('DIRECT');
    expect(supplierSourceToNetwork('REFERRAL')).toBe('DIRECT');
  });

  it('provides truthful UI network labels for all supported networks including Google Places', () => {
    expect(networkLabel(SupplierNetwork.GOOGLE_PLACES)).toBe('Google Places');
    expect(networkLabel(SupplierNetwork.ONDC)).toBe('ONDC');
    expect(networkLabel(SupplierNetwork.LOCAL_REGISTRY)).toBe('OTP Local registry');
  });
});
