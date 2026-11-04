import { describe, expect, it } from 'vitest';
import {
  sanitizeIndianPhone,
  validateIndianPincode,
  getOutreachDirectoryLeads,
  getUnlockedOrganicPincodes,
  registerOrganicPincode,
  parseAndIngestLeadRecords,
  INITIAL_OUTREACH_LEADS,
} from './outreach-sourcing-engine';

describe('Outreach Sourcing Engine & Organic Pincode Registry', () => {
  it('sanitizes valid 10-digit, 11-digit (leading 0), and 12-digit Indian mobile numbers to E.164 format', () => {
    expect(sanitizeIndianPhone('9972967530')).toBe('+919972967530');
    expect(sanitizeIndianPhone('+91 99729 67530')).toBe('+919972967530');
    expect(sanitizeIndianPhone('09972967530')).toBe('+919972967530');
    expect(sanitizeIndianPhone('+91-99729-67530')).toBe('+919972967530');
    expect(sanitizeIndianPhone('9845011223')).toBe('+919845011223');

    // Invalid numbers
    expect(sanitizeIndianPhone('12345')).toBeNull();
    expect(sanitizeIndianPhone('5555555555')).toBeNull(); // Indian mobiles start with 6-9
    expect(sanitizeIndianPhone('')).toBeNull();
  });

  it('validates 6-digit Indian PIN codes correctly', () => {
    expect(validateIndianPincode('560001')).toBe(true);
    expect(validateIndianPincode('600034')).toBe(true);
    expect(validateIndianPincode('682001')).toBe(true);
    expect(validateIndianPincode('110001')).toBe(true);

    // Invalid PINs
    expect(validateIndianPincode('060001')).toBe(false); // cannot start with 0
    expect(validateIndianPincode('56000')).toBe(false); // 5 digits
    expect(validateIndianPincode('5600012')).toBe(false); // 7 digits
    expect(validateIndianPincode('ABCDEF')).toBe(false);
  });

  it('retrieves seeded benchmark leads for South & North Indian hubs', () => {
    const leads = getOutreachDirectoryLeads();
    expect(leads.length).toBeGreaterThanOrEqual(10);

    const rwaLeads = getOutreachDirectoryLeads({ entityType: 'RWA' });
    expect(rwaLeads.length).toBeGreaterThan(0);
    expect(rwaLeads.every((l) => l.entityType === 'RWA')).toBe(true);

    const msmeLeads = getOutreachDirectoryLeads({ entityType: 'MSME' });
    expect(msmeLeads.length).toBeGreaterThan(0);
    expect(msmeLeads.every((l) => l.entityType === 'MSME')).toBe(true);

    const blrLeads = getOutreachDirectoryLeads({ city: 'Bengaluru' });
    expect(blrLeads.length).toBeGreaterThan(0);
    expect(blrLeads.every((l) => l.city === 'Bengaluru')).toBe(true);
  });

  it('dynamically computes organic unlocked PIN codes with active entity network density', () => {
    const unlocked = getUnlockedOrganicPincodes();
    expect(unlocked.length).toBeGreaterThan(0);

    // Pincodes should be unlocked and sorted by entity count
    expect(unlocked[0]?.density.totalEntities).toBeGreaterThan(0);
    expect(unlocked.every((p) => p.isUnlocked)).toBe(true);

    // Find Bengaluru 560001 or 560087
    const blrPin = unlocked.find((p) => p.city === 'Bengaluru');
    expect(blrPin).toBeDefined();
    expect(blrPin?.state).toBe('Karnataka');
  });

  it('registers a new organic PIN code on registration trigger', () => {
    const newPin = registerOrganicPincode('682035', 'RWA', { city: 'Kochi', state: 'Kerala' });
    expect(newPin).toBeDefined();
    expect(newPin?.pincode).toBe('682035');
    expect(newPin?.isUnlocked).toBe(true);
    expect(newPin?.density.rwaCount).toBeGreaterThanOrEqual(1);
  });

  it('ingests CSV lead lines, normalizes mobile numbers, and unlocks new PIN codes organically', () => {
    const rawData = `
      Green Glen Layout RWA, Col. Sharma, 9845099881, 560103, RWA, Property & Facility Management
      Sri Krishna Precision Dies MSME, K. Krishna, +91 9444088771, 600058, MSME, Machinery & Engineering
    `;

    const result = parseAndIngestLeadRecords(rawData, 'MSME');
    expect(result.added).toBe(2);
    expect(result.errors.length).toBe(0);
    expect(result.unlockedPincodesCount).toBe(2);

    const updatedLeads = getOutreachDirectoryLeads();
    expect(updatedLeads.some((l) => l.pincode === '560103')).toBe(true);
    expect(updatedLeads.some((l) => l.pincode === '600058')).toBe(true);
  });

  it('rejects invalid records and reports exact line errors', () => {
    const malformedData = `
      Incomplete Line
      Bad Phone Company, John, 1234, 560001, MSME
      Bad Pin Company, Jane, 9845011111, 123, MSME
    `;

    const result = parseAndIngestLeadRecords(malformedData);
    expect(result.added).toBe(0);
    expect(result.errors.length).toBe(3);
  });
});
