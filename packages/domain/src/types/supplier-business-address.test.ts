import { describe, expect, it } from 'vitest';
import {
  isSupplierBusinessAddressComplete,
  parseSupplierBusinessAddress,
  toSupplierBusinessAddressRecord,
  validateSupplierBusinessAddress,
} from './supplier-business-address';

describe('supplier business address', () => {
  it('accepts a complete operating address and the legacy postalCode key', () => {
    expect(isSupplierBusinessAddressComplete({
      line1: '12 Industrial Layout',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560022',
    })).toBe(true);
  });

  it('rejects an incomplete operating address and does not treat a registered marker as the business address', () => {
    expect(isSupplierBusinessAddressComplete({ line1: '12 Industrial Layout' })).toBe(false);
    expect(isSupplierBusinessAddressComplete({
      kind: 'REGISTERED',
      line1: 'GST registered office',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
    })).toBe(false);
    expect(parseSupplierBusinessAddress(null)).toBeNull();
  });

  it('writes one primary business-office record without a registered-address field', () => {
    const validation = validateSupplierBusinessAddress({
      line1: '12 Industrial Layout',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560022',
      country: 'India',
    });
    expect(validation.isValid).toBe(true);

    const record = toSupplierBusinessAddressRecord({
      line1: '12 Industrial Layout',
      line2: null,
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560022',
      country: 'India',
    });
    expect(record.kind).toBe('BUSINESS_OFFICE');
    expect(record.postalCode).toBe('560022');
    expect(record).not.toHaveProperty('registered_address');
    expect(validateSupplierBusinessAddress({ line1: 'x', city: '', state: '', pincode: '12' }).isValid).toBe(false);
  });
});
