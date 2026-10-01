import { describe, it, expect } from 'vitest';
import { assessPinGeographyAlignment } from './pin-geography-alignment';

const karnatakaBengaluruComponents = [
  { long_name: '560048', types: ['postal_code'] },
  { long_name: 'Bengaluru', types: ['locality', 'political'] },
  { long_name: 'Karnataka', types: ['administrative_area_level_1', 'political'] },
];

describe('assessPinGeographyAlignment', () => {
  it('returns MATCH when selected state/city align with geocode components', () => {
    const r = assessPinGeographyAlignment({
      pincode: '560048',
      selectedState: 'Karnataka',
      selectedCity: 'Bengaluru',
      geocodeComponents: karnatakaBengaluruComponents,
    });
    expect(r.status).toBe('MATCH');
  });

  it('blocks MISMATCH when selected city conflicts with PIN geography', () => {
    const r = assessPinGeographyAlignment({
      pincode: '560048',
      selectedState: 'Karnataka',
      selectedCity: 'Mumbai',
      geocodeComponents: karnatakaBengaluruComponents,
    });
    expect(r.status).toBe('MISMATCH');
  });

  it('returns UNRESOLVED when city is required but absent from geocode payload', () => {
    const r = assessPinGeographyAlignment({
      pincode: '560048',
      selectedCity: 'Bengaluru',
      geocodeComponents: [{ long_name: 'Karnataka', types: ['administrative_area_level_1'] }],
    });
    expect(r.status).toBe('UNRESOLVED');
  });

  it('MATCH when only PIN is provided (no conflicting selectors)', () => {
    const r = assessPinGeographyAlignment({
      pincode: '560048',
      geocodeComponents: karnatakaBengaluruComponents,
    });
    expect(r.status).toBe('MATCH');
  });
});
