import { describe, expect, it } from 'vitest';
import {
  sanitizeIndianPhone,
  validateIndianPincode,
  getOutreachDirectoryLeads,
  getUnlockedOrganicPincodes,
  registerOrganicPincode,
  unlockOrganicPincodeManually,
  parseAndIngestLeadRecords,
  inferIndianCity,
  inferIndianState,
  SNE_17_CATEGORIES,
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

  it('accurately resolves regional cluster cities and states dynamically without tweaking', () => {
    // Erode & Bhavani
    expect(inferIndianCity('638301')).toBe('Bhavani');
    expect(inferIndianCity('638001')).toBe('Erode');
    expect(inferIndianCity('638052')).toBe('Perundurai');
    expect(inferIndianState('638301')).toBe('Tamil Nadu');

    // Tiruppur & Coimbatore
    expect(inferIndianCity('641601')).toBe('Tiruppur');
    expect(inferIndianCity('641654')).toBe('Avinashi');
    expect(inferIndianCity('641001')).toBe('Coimbatore');
    expect(inferIndianCity('641018')).toBe('Coimbatore');

    // Hosur & Salem
    expect(inferIndianCity('635109')).toBe('Hosur');
    expect(inferIndianCity('636001')).toBe('Salem');

    // Karnataka & Kerala
    expect(inferIndianCity('560001')).toBe('Bengaluru');
    expect(inferIndianCity('570001')).toBe('Mysuru');
    expect(inferIndianCity('682001')).toBe('Kochi');
  });

  it('matches SNE_17_CATEGORIES with the Authoritative 17 Canonical Categories', () => {
    expect(SNE_17_CATEGORIES).toHaveLength(17);
    expect(SNE_17_CATEGORIES).toContain('Construction & Civil Infrastructure');
    expect(SNE_17_CATEGORIES).toContain('Plumbing & Sanitary');
    expect(SNE_17_CATEGORIES).toContain('Electrical & Power');
    expect(SNE_17_CATEGORIES).toContain('HVAC & Refrigeration');
    expect(SNE_17_CATEGORIES).toContain('Machinery & Engineering');
    expect(SNE_17_CATEGORIES).toContain('Textile & Apparel');
    expect(SNE_17_CATEGORIES).toContain('Agriculture & Commodities');
    expect(SNE_17_CATEGORIES).toContain('Property & Facility Management');
  });

  it('supports on-demand PIN code unlock for any unlisted PIN code via unlockOrganicPincodeManually', () => {
    const pin = unlockOrganicPincodeManually('638301');
    expect(pin).toBeDefined();
    expect(pin?.pincode).toBe('638301');
    expect(pin?.city).toBe('Bhavani');
    expect(pin?.state).toBe('Tamil Nadu');
    expect(pin?.isUnlocked).toBe(true);

    const allUnlocked = getUnlockedOrganicPincodes();
    expect(allUnlocked.some((p) => p.pincode === '638301')).toBe(true);
  });
});
