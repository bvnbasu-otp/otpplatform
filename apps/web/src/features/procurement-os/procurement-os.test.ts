import { describe, expect, it } from 'vitest';
import { supplierSourceToNetwork } from '@otp/domain';

describe('procurement OS domain', () => {
  it('maps supplier sources to open network adapters', () => {
    expect(supplierSourceToNetwork('ONDC')).toBe('ONDC');
    expect(supplierSourceToNetwork('BNI')).toBe('BNI');
    expect(supplierSourceToNetwork('ASSOCIATION')).toBe('ASSOCIATION');
    expect(supplierSourceToNetwork('LOCAL_REGISTRY')).toBe('LOCAL_REGISTRY');
    expect(supplierSourceToNetwork('DIRECT')).toBe('DIRECT');
    expect(supplierSourceToNetwork('REFERRAL')).toBe('DIRECT');
  });
});
