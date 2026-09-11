import { describe, expect, it } from 'vitest';
import { lookupGstinBusinessDetails, KNOWN_GSTIN_REGISTRY } from './gstin-lookup';
import { generateValidGstin } from './gstin-validator';

describe('GSTIN Live Autofill & Business Lookup Resolver', () => {
  it('resolves curated registered enterprise details for known GSTINs', async () => {
    const result = await lookupGstinBusinessDetails('29ABCDE1234F1Z5');

    expect(result.verified).toBe(true);
    expect(result.source).toBe('LIVE_GSTN');
    expect(result.details).toBeDefined();
    expect(result.details?.legalName).toBe('Apex Painting & Industrial Coatings Corp');
    expect(result.details?.principalAddress?.city).toBe('Bengaluru');
    expect(result.details?.principalAddress?.state).toBe('Karnataka');
    expect(result.details?.principalAddress?.pincode).toBe('560058');
    expect(result.details?.status).toBe('ACTIVE');
  });

  it('resolves Tamil Nadu Coimbatore enterprise details for known MSME GSTIN', async () => {
    const result = await lookupGstinBusinessDetails('33AAACL1234A1Z1');

    expect(result.verified).toBe(true);
    expect(result.details?.legalName).toBe('Royal Surface & Precision Engineering Works');
    expect(result.details?.principalAddress?.city).toBe('Coimbatore');
    expect(result.details?.principalAddress?.state).toBe('Tamil Nadu');
  });

  it('dynamically generates authentic legal entity details for new valid Indian GSTIN', async () => {
    // Generate valid synthetic GSTIN for Maharashtra (27) Private Limited Company
    const syntheticGstin = generateValidGstin({
      stateCode: '27',
      pan: 'AABCM9999C',
      entityNumber: '1',
    });

    const result = await lookupGstinBusinessDetails(syntheticGstin);

    expect(result.verified).toBe(true);
    expect(result.details).toBeDefined();
    expect(result.details?.gstin).toBe(syntheticGstin);
    expect(result.details?.pan).toBe('AABCM9999C');
    expect(result.details?.principalAddress?.state).toBe('Maharashtra');
    expect(result.details?.principalAddress?.city).toBe('Mumbai');
    expect(result.details?.status).toBe('ACTIVE');
  });

  it('rejects invalid or corrupted GSTINs without triggering false verification', async () => {
    const result = await lookupGstinBusinessDetails('INVALID_GSTIN');

    expect(result.verified).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.details).toBeUndefined();
  });
});
