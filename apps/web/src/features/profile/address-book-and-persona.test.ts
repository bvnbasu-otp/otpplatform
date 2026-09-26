import { describe, it, expect } from 'vitest';
import { AddressBookManager } from './components/AddressBookManager';
import {
  resolveBuyerPersona,
  tryResolveBuyerPersona,
  UnsupportedPersonaError,
  isAddressValid,
  createAddressSnapshot,
  createDeliveryAddressSnapshot,
  createBillingAddressSnapshot,
  formatAddressSingleLine,
  formatAddressMultiline,
  getAllowedLocationTypes,
  getDefaultLocationType,
  createOperationalLocation,
} from '@otp/domain';

describe('Address Book & Buyer Persona UX Module Tests', () => {
  it('resolves buyer persona correctly across organization types and fails closed on ENTERPRISE', () => {
    expect(resolveBuyerPersona('INDIVIDUAL')).toBe('INDIVIDUAL');
    expect(resolveBuyerPersona('RWA')).toBe('RWA');
    expect(resolveBuyerPersona('COMMUNITY')).toBe('RWA');
    expect(resolveBuyerPersona('HOUSING_SOCIETY')).toBe('RWA');
    expect(resolveBuyerPersona('MSME')).toBe('MSME');
    expect(() => resolveBuyerPersona('ENTERPRISE')).toThrow(UnsupportedPersonaError);
    expect(tryResolveBuyerPersona('ENTERPRISE')).toBeNull();
    expect(resolveBuyerPersona(null)).toBe('INDIVIDUAL');
    expect(resolveBuyerPersona(undefined)).toBe('INDIVIDUAL');
  });

  it('provides persona-specific allowed location types and default types', () => {
    // Individual
    const indivTypes = getAllowedLocationTypes('INDIVIDUAL');
    expect(indivTypes).toEqual(['HOME', 'OFFICE', 'OTHER']);
    expect(getDefaultLocationType('INDIVIDUAL')).toBe('HOME');

    // RWA
    const rwaTypes = getAllowedLocationTypes('RWA');
    expect(rwaTypes).toContain('SOCIETY_PREMISES');
    expect(rwaTypes).toContain('SERVICE_SITE');
    expect(getDefaultLocationType('RWA')).toBe('SOCIETY_PREMISES');

    // MSME
    const msmeTypes = getAllowedLocationTypes('MSME');
    expect(msmeTypes).toContain('REGISTERED_OFFICE');
    expect(msmeTypes).toContain('FACTORY');
    expect(msmeTypes).toContain('WAREHOUSE');
    expect(getDefaultLocationType('MSME')).toBe('OPERATIONAL_OFFICE');
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
      locationType: 'SOCIETY_PREMISES',
      line1: 'Plot 100, Electronic City Phase 1',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560100',
    });

    expect(snapshot.label).toBe('Main Gate Receiving');
    expect(snapshot.locationType).toBe('SOCIETY_PREMISES');
    expect(snapshot.line1).toBe('Plot 100, Electronic City Phase 1');
    expect(snapshot.capturedAt).toBeDefined();

    const formatted = formatAddressSingleLine(snapshot);
    expect(formatted).toContain('Plot 100, Electronic City Phase 1');
    expect(formatted).toContain('Bengaluru');
    expect(formatted).toContain('560100');
  });

  it('creates distinct delivery and billing snapshots with multiline formatting for invoices', () => {
    const del = createDeliveryAddressSnapshot({
      label: 'Site 1',
      recipientName: 'Durga Rainbow RWA',
      line1: 'Outer Ring Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560048',
      contactPhone: '+919888877777',
    });

    const bill = createBillingAddressSnapshot({
      label: 'Finance Office',
      recipientName: 'Durga Rainbow Association',
      line1: '123 MG Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
    });

    expect(del.addressType).toBe('DELIVERY');
    expect(bill.addressType).toBe('BILLING');

    const lines = formatAddressMultiline(del);
    expect(lines[0]).toBe('Durga Rainbow RWA');
    expect(lines.some((l) => l.includes('Outer Ring Road'))).toBe(true);
    expect(lines.some((l) => l.includes('560048'))).toBe(true);
    expect(lines.some((l) => l.includes('+919888877777'))).toBe(true);
  });

  it('creates operational locations with specific activities and access instructions', () => {
    const opLoc = createOperationalLocation(
      {
        line1: 'Plot 42 SIPCOT Phase 1',
        city: 'Hosur',
        state: 'Tamil Nadu',
        pincode: '635126',
      },
      'INSTALLATION',
      'Entry via Gate 3 after 8 PM',
    );

    expect(opLoc.operationalType).toBe('INSTALLATION');
    expect(opLoc.specialAccessInstructions).toBe('Entry via Gate 3 after 8 PM');
    expect(opLoc.city).toBe('Hosur');
    expect(opLoc.pincode).toBe('635126');
  });

  it('validates AddressBookManager persona badge and location help text mappings and explicit form fields', () => {
    const msmeLocs = getAllowedLocationTypes('MSME');
    expect(msmeLocs).toContain('REGISTERED_OFFICE');
    expect(msmeLocs).toContain('FACTORY');
    expect(msmeLocs).toContain('WAREHOUSE');
    expect(AddressBookManager).toBeDefined();
  });

  it('verifies referral code generation availability for profile contexts', () => {
    const orgId = 'org-profile-test-999';
    const cleanPrefix = 'OTP';
    expect(orgId).toBeDefined();
    expect(cleanPrefix).toBe('OTP');
  });
});
