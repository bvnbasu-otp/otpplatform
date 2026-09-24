import { describe, it, expect } from 'vitest';
import {
  isAddressValid,
  createAddressSnapshot,
  formatAddressSingleLine,
  type BuyerAddress,
} from './buyer-address';

describe('BuyerAddress Domain Model & Historical Snapshotting', () => {
  const sampleAddress: BuyerAddress = {
    id: 'addr-001',
    organizationId: 'org-123',
    profileId: 'prof-456',
    label: 'Durga Rainbow Block A - Main Site',
    line1: 'Flat 402, Durga Rainbow Apartments',
    line2: 'Outer Ring Road, Mahadevapura',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560048',
    country: 'India',
    isPrimary: true,
    gstinStateCode: '29',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  };

  it('validates a complete, structurally valid address', () => {
    const res = isAddressValid(sampleAddress);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('flags missing required address fields (line1, city, state, PIN)', () => {
    const invalid = isAddressValid({
      label: 'Site Office',
      line1: '',
      city: '',
      state: '',
      pincode: '123', // invalid PIN length
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toContain('Address line 1 is mandatory.');
    expect(invalid.errors).toContain('City is mandatory.');
    expect(invalid.errors).toContain('State is mandatory.');
    expect(invalid.errors).toContain('PIN code must be a valid 6-digit Indian postal code.');
  });

  it('creates an immutable frozen address snapshot preserving all statutory details', () => {
    const capturedAt = '2026-09-24T12:00:00.000Z';
    const snapshot = createAddressSnapshot(sampleAddress, capturedAt);

    expect(snapshot.addressId).toBe('addr-001');
    expect(snapshot.label).toBe('Durga Rainbow Block A - Main Site');
    expect(snapshot.line1).toBe('Flat 402, Durga Rainbow Apartments');
    expect(snapshot.line2).toBe('Outer Ring Road, Mahadevapura');
    expect(snapshot.city).toBe('Bengaluru');
    expect(snapshot.state).toBe('Karnataka');
    expect(snapshot.pincode).toBe('560048');
    expect(snapshot.gstinStateCode).toBe('29');
    expect(snapshot.capturedAt).toBe(capturedAt);
  });

  it('formats address to a clean single line for PDF receipts and invoices', () => {
    const singleLine = formatAddressSingleLine(sampleAddress);
    expect(singleLine).toBe(
      'Flat 402, Durga Rainbow Apartments, Outer Ring Road, Mahadevapura, Bengaluru, Karnataka, 560048, India',
    );
  });

  it('handles optional line2 gracefully when formatting', () => {
    const noLine2: BuyerAddress = {
      ...sampleAddress,
      line2: null,
    };
    const formatted = formatAddressSingleLine(noLine2);
    expect(formatted).toBe(
      'Flat 402, Durga Rainbow Apartments, Bengaluru, Karnataka, 560048, India',
    );
  });
});
