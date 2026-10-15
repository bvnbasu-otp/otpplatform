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

  it('correctly matches district Erode when geocode locality is Bhavani (PIN 638301)', () => {
    const erodeComponents = [
      { long_name: '638301', types: ['postal_code'] },
      { long_name: 'Bhavani', types: ['locality', 'political'] },
      { long_name: 'Erode', types: ['administrative_area_level_2', 'political'] },
      { long_name: 'Tamil Nadu', types: ['administrative_area_level_1', 'political'] },
      { long_name: 'India', types: ['country', 'political'] },
    ];

    // Selected city: Erode (district)
    const r1 = assessPinGeographyAlignment({
      pincode: '638301',
      selectedState: 'Tamil Nadu',
      selectedCity: 'Erode',
      geocodeComponents: erodeComponents,
    });
    expect(r1.status).toBe('MATCH');
    expect(r1.allCityCandidates).toContain('Bhavani');
    expect(r1.allCityCandidates).toContain('Erode');

    // Selected city: Bhavani (locality)
    const r2 = assessPinGeographyAlignment({
      pincode: '638301',
      selectedState: 'Tamil Nadu',
      selectedCity: 'Bhavani',
      geocodeComponents: erodeComponents,
    });
    expect(r2.status).toBe('MATCH');

    // Conflicting city: Salem
    const r3 = assessPinGeographyAlignment({
      pincode: '638301',
      selectedState: 'Tamil Nadu',
      selectedCity: 'Salem',
      geocodeComponents: erodeComponents,
    });
    expect(r3.status).toBe('MISMATCH');
  });

  it('correctly matches Bangalore/Bengaluru synonyms and sublocality Mahadevapura (PIN 560048)', () => {
    const bangaloreComponents = [
      { long_name: '560048', types: ['postal_code'] },
      { long_name: 'Mahadevapura', types: ['sublocality_level_1', 'sublocality', 'political'] },
      { long_name: 'Bengaluru', types: ['locality', 'political'] },
      { long_name: 'Bengaluru Urban', types: ['administrative_area_level_2', 'political'] },
      { long_name: 'Karnataka', types: ['administrative_area_level_1', 'political'] },
    ];

    // Synonym: Bangalore vs Bengaluru
    const r1 = assessPinGeographyAlignment({
      pincode: '560048',
      selectedState: 'Karnataka',
      selectedCity: 'Bangalore',
      geocodeComponents: bangaloreComponents,
    });
    expect(r1.status).toBe('MATCH');

    // Sublocality: Mahadevapura
    const r2 = assessPinGeographyAlignment({
      pincode: '560048',
      selectedState: 'Karnataka',
      selectedCity: 'Mahadevapura',
      geocodeComponents: bangaloreComponents,
    });
    expect(r2.status).toBe('MATCH');

    // District with suffix: Bengaluru Urban
    const r3 = assessPinGeographyAlignment({
      pincode: '560048',
      selectedState: 'Karnataka',
      selectedCity: 'Bengaluru',
      geocodeComponents: bangaloreComponents,
    });
    expect(r3.status).toBe('MATCH');
  });
});

