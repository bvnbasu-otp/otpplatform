import { describe, expect, it } from 'vitest';
import { lookupGstinBusinessDetails, KNOWN_GSTIN_REGISTRY } from './gstin-lookup';
import { generateValidGstin } from './gstin-validator';

const SAMPLE_GSTIN = '29ABCDE1234F1Z5';

describe('GSTIN format check is not taxpayer verification', () => {
  it('does not treat the sample GSTIN as GST verified or as Apex Painting', async () => {
    const result = await lookupGstinBusinessDetails(SAMPLE_GSTIN);

    expect(result.verified).toBe(false);
    expect(result.source).toBe('FORMAT_ONLY');
    expect(result.source).not.toBe('LIVE_GSTN');
    expect(result.details).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(/Apex Painting/i);
    expect(JSON.stringify(result)).not.toMatch(/REGULAR/);
    expect(JSON.stringify(result)).not.toMatch(/Bengaluru/);
    expect(result.error).toMatch(/not a government registry lookup/i);
  });

  it('does not fabricate a legal identity for any other checksum-valid GSTIN', async () => {
    const syntheticGstin = generateValidGstin({
      stateCode: '27',
      pan: 'AABCM9999C',
      entityNumber: '1',
    });

    const result = await lookupGstinBusinessDetails(syntheticGstin);

    expect(result.verified).toBe(false);
    expect(result.details).toBeUndefined();
    expect(result.details?.legalName).toBeUndefined();
    expect(result.details?.principalAddress).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(/Mumbai/);
    expect(JSON.stringify(KNOWN_GSTIN_REGISTRY)).toBe('{}');
  });

  it('rejects an invalid GSTIN without a taxpayer record', async () => {
    const result = await lookupGstinBusinessDetails('INVALID_GSTIN');

    expect(result.verified).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.details).toBeUndefined();
  });
});
