import { describe, it, expect } from 'vitest';
import { resolveBuyerPersona, isAddressValid, createAddressSnapshot, formatAddressSingleLine } from '@otp/domain';

describe('Address Book & Buyer Persona UX Module Tests', () => {
  it('resolves buyer persona correctly across organization types', () => {
    expect(resolveBuyerPersona('INDIVIDUAL')).toBe('INDIVIDUAL');
    expect(resolveBuyerPersona('RWA')).toBe('RWA');
    expect(resolveBuyerPersona('COMMUNITY')).toBe('RWA');
    expect(resolveBuyerPersona('HOUSING_SOCIETY')).toBe('RWA');
    expect(resolveBuyerPersona('MSME')).toBe('MSME');
    expect(resolveBuyerPersona('ENTERPRISE')).toBe('MSME');
    expect(resolveBuyerPersona(null)).toBe('INDIVIDUAL');
    expect(resolveBuyerPersona(undefined)).toBe('INDIVIDUAL');
  });

  it('validates address structure with strict Indian PIN code format', () => {
    const valid = isAddressValid({
      line1: 'Flat 402, Tower B, Palm Meadows RWA',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560066',
    });
    expect(valid.valid).toBe(true);
    expect(valid.errors).toHaveLength(0);

    const invalidPincode = isAddressValid({
      line1: 'Flat 402, Tower B',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '5600', // Invalid PIN
    });
    expect(invalidPincode.valid).toBe(false);
    expect(invalidPincode.errors.some((e) => e.includes('PIN code'))).toBe(true);
  });

  it('creates frozen immutable address snapshots for RFQ and PO historical preservation', () => {
    const snapshot = createAddressSnapshot({
      label: 'Main Gate Receiving',
      line1: 'Plot 100, Electronic City Phase 1',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560100',
    });

    expect(snapshot.label).toBe('Main Gate Receiving');
    expect(snapshot.line1).toBe('Plot 100, Electronic City Phase 1');
    expect(snapshot.capturedAt).toBeDefined();

    const formatted = formatAddressSingleLine(snapshot);
    expect(formatted).toContain('Plot 100, Electronic City Phase 1');
    expect(formatted).toContain('Bengaluru');
    expect(formatted).toContain('560100');
  });
});
