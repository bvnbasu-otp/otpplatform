import { describe, expect, it } from 'vitest';
import {
  GoogleMapsLocationAdapter,
  MapboxLocationAdapter,
  validateCoordinates,
  sanitizeGisLocationDescriptor,
} from './google-maps-location-adapter';
import { GisExecutionMode } from '@otp/domain';

describe('GIS Provider Adapters & Spatial Resilience', () => {
  describe('Coordinate Validation', () => {
    it('validates correct latitude and longitude ranges', () => {
      expect(validateCoordinates(12.9716, 77.5946)).toBe(true);
      expect(validateCoordinates(0, 0)).toBe(true);
      expect(validateCoordinates(-90, -180)).toBe(true);
      expect(validateCoordinates(90, 180)).toBe(true);
    });

    it('rejects invalid or out-of-range coordinates', () => {
      expect(validateCoordinates(91, 77)).toBe(false);
      expect(validateCoordinates(-91, 77)).toBe(false);
      expect(validateCoordinates(12, 181)).toBe(false);
      expect(validateCoordinates(12, -181)).toBe(false);
      expect(validateCoordinates(NaN, 77)).toBe(false);
      expect(validateCoordinates(undefined, null)).toBe(false);
    });
  });

  describe('PII Sanitization on GIS Descriptors', () => {
    it('strips PII fields from input descriptors', () => {
      const sanitized = sanitizeGisLocationDescriptor({
        city: 'Bengaluru',
        pinCode: '560001',
        ...({
          legalName: 'Secret Supplier Pvt Ltd',
          gstin: '29ABCDE1234F1Z5',
          email: 'contact@supplier.com',
          phone: '+919876543210',
        } as any),
      });

      expect(sanitized.city).toBe('Bengaluru');
      expect(sanitized.pinCode).toBe('560001');
      expect((sanitized as any).legalName).toBeUndefined();
      expect((sanitized as any).gstin).toBeUndefined();
      expect((sanitized as any).email).toBeUndefined();
      expect((sanitized as any).phone).toBeUndefined();
    });
  });

  describe('GoogleMapsLocationAdapter', () => {
    it('defaults to OFFLINE_PROVIDER_NEUTRAL mode when API key is missing', () => {
      delete process.env.GOOGLE_MAPS_API_KEY;
      const adapter = new GoogleMapsLocationAdapter();
      expect(adapter.executionMode).toBe(GisExecutionMode.OFFLINE_PROVIDER_NEUTRAL);
    });

    it('computes offline Haversine distance without errors in offline mode', async () => {
      const adapter = new GoogleMapsLocationAdapter();
      const res = await adapter.calculateDistance(
        { coordinates: { lat: 12.9716, lng: 77.5946 } },
        { coordinates: { lat: 12.9698, lng: 77.7500 } },
      );

      expect(res.distanceKm).toBeGreaterThan(15);
      expect(res.isLocal).toBe(true);
      expect(res.calculationMethod).toBe('HAVERSINE_COORDINATES');
    });

    it('initializes to EXTERNAL_PROVIDER_READY when API key is provided', () => {
      const adapter = new GoogleMapsLocationAdapter({ apiKey: 'gmaps-test-key-1234' });
      expect(adapter.executionMode).toBe(GisExecutionMode.EXTERNAL_PROVIDER_READY);
    });
  });

  describe('MapboxLocationAdapter', () => {
    it('defaults to OFFLINE_PROVIDER_NEUTRAL mode when token is missing', () => {
      delete process.env.MAPBOX_ACCESS_TOKEN;
      const adapter = new MapboxLocationAdapter();
      expect(adapter.executionMode).toBe(GisExecutionMode.OFFLINE_PROVIDER_NEUTRAL);
    });

    it('validates coverage correctly in provider-neutral fallback', async () => {
      const adapter = new MapboxLocationAdapter();
      const cov = await adapter.validateCoverage(
        { city: 'Mumbai', radiusKm: 30, coordinates: { lat: 19.076, lng: 72.8777 } },
        { city: 'Mumbai', coordinates: { lat: 19.080, lng: 72.8800 } },
      );

      expect(cov.isCovered).toBe(true);
      expect(cov.matchedOn).toBe('COORDINATES_RADIUS');
    });
  });
});
