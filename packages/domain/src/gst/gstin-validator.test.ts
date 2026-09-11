import { describe, expect, it } from 'vitest';
import {
  calculateGstinChecksum,
  generateValidGstin,
  INDIAN_STATE_CODES,
  validateGstin,
} from './gstin-validator';

describe('GSTIN Validator', () => {
  it('validates a correct Karnataka GSTIN', () => {
    // Generate valid Karnataka (29) GSTIN for a Firm (F)
    const gstin = generateValidGstin({ stateCode: '29', pan: 'ABCFE1234F', entityNumber: '1' });
    const result = validateGstin(gstin);

    expect(result.valid).toBe(true);
    expect(result.stateCode).toBe('29');
    expect(result.stateName).toBe('Karnataka');
    expect(result.pan).toBe('ABCFE1234F');
    expect(result.entityType).toBe('Partnership Firm / LLP');
  });

  it('validates a correct Tamil Nadu Company GSTIN', () => {
    // Generate valid Tamil Nadu (33) GSTIN for a Company (C)
    const gstin = generateValidGstin({ stateCode: '33', pan: 'AABCC5678C', entityNumber: '1' });
    const result = validateGstin(gstin);

    expect(result.valid).toBe(true);
    expect(result.stateCode).toBe('33');
    expect(result.stateName).toBe('Tamil Nadu');
    expect(result.pan).toBe('AABCC5678C');
    expect(result.entityType).toBe('Company (Private / Public Limited)');
  });

  it('rejects an invalid format with incorrect length', () => {
    const result = validateGstin('29ABCDE1234F');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('must be exactly 15 characters');
  });

  it('rejects an invalid state code', () => {
    const result = validateGstin('99ABCDE1234F1Z5');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid state code');
  });

  it('detects a corrupted checksum digit', () => {
    const valid = generateValidGstin({ stateCode: '29', pan: 'ABCDE1234F' });
    // Corrupt the last character
    const lastChar = valid[14];
    const corruptedChar = lastChar === 'A' ? 'B' : 'A';
    const corruptedGstin = valid.slice(0, 14) + corruptedChar;

    const result = validateGstin(corruptedGstin);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('checksum character');
  });

  it('calculates deterministic checksum for 14-character prefix', () => {
    const prefix = '29ABCDE1234F1Z';
    const checksum = calculateGstinChecksum(prefix);
    expect(checksum).toBeDefined();
    expect(typeof checksum).toBe('string');
    expect(checksum?.length).toBe(1);
  });
});
