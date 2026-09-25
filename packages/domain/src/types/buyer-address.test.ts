import { describe, it, expect } from 'vitest';
import {
  isAddressValid,
  isPincodeValid,
  isCoordinatesValid,
  createAddressSnapshot,
  createDeliveryAddressSnapshot,
  createBillingAddressSnapshot,
  createOperationalLocation,
  formatAddressSingleLine,
  formatAddressMultiline,
  getAllowedLocationTypes,
  getDefaultLocationType,
  isLocationTypeAllowedForPersona,
  buildOperationalDiscoveryGeographicInput,
  maskAddressForDiscovery,
  resolveProcurementPlaceOfSupply,
  assertSnapshotDecoupled,
  type BuyerAddress,
  type OperationalLocation,
  type AddressSnapshot,
} from './buyer-address';

describe('BuyerAddress Domain Model & Historical Snapshotting', () => {
  const sampleAddress: BuyerAddress = {
    id: 'addr-001',
    organizationId: 'org-123',
    profileId: 'prof-456',
    label: 'Durga Rainbow Block A - Main Site',
    locationType: 'SOCIETY_PREMISES',
    addressType: 'DELIVERY',
    recipientName: 'Durga Rainbow RWA Committee',
    line1: 'Flat 402, Durga Rainbow Apartments',
    line2: 'Outer Ring Road, Mahadevapura',
    locality: 'Mahadevapura',
    landmark: 'Opposite EMC2 Tech Park',
    city: 'Bengaluru',
    district: 'Bengaluru Urban',
    state: 'Karnataka',
    stateCode: '29',
    pincode: '560048',
    country: 'India',
    latitude: 12.9716,
    longitude: 77.5946,
    contactPerson: 'Senthil Kumar (Estate Manager)',
    contactPhone: '+919888877777',
    isPrimary: true,
    gstinStateCode: '29',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  };

  describe('1. Location Types & Persona Boundaries', () => {
    it('returns allowed location types for INDIVIDUAL persona', () => {
      const types = getAllowedLocationTypes('INDIVIDUAL');
      expect(types).toContain('HOME');
      expect(types).toContain('OFFICE');
      expect(types).toContain('OTHER');
      expect(getDefaultLocationType('INDIVIDUAL')).toBe('HOME');
      expect(isLocationTypeAllowedForPersona('HOME', 'INDIVIDUAL')).toBe(true);
      expect(isLocationTypeAllowedForPersona('FACTORY' as any, 'INDIVIDUAL')).toBe(false);
    });

    it('returns allowed location types for RWA persona', () => {
      const types = getAllowedLocationTypes('RWA');
      expect(types).toContain('SOCIETY_PREMISES');
      expect(types).toContain('OFFICE');
      expect(types).toContain('PROJECT_SITE');
      expect(types).toContain('SERVICE_SITE');
      expect(getDefaultLocationType('RWA')).toBe('SOCIETY_PREMISES');
      expect(isLocationTypeAllowedForPersona('SOCIETY_PREMISES', 'RWA')).toBe(true);
      expect(isLocationTypeAllowedForPersona('REGISTERED_OFFICE' as any, 'RWA')).toBe(false);
    });

    it('returns allowed location types for MSME persona', () => {
      const types = getAllowedLocationTypes('MSME');
      expect(types).toContain('REGISTERED_OFFICE');
      expect(types).toContain('OPERATIONAL_OFFICE');
      expect(types).toContain('FACTORY');
      expect(types).toContain('WAREHOUSE');
      expect(types).toContain('SITE');
      expect(types).toContain('DELIVERY_LOCATION');
      expect(getDefaultLocationType('MSME')).toBe('OPERATIONAL_OFFICE');
      expect(isLocationTypeAllowedForPersona('FACTORY', 'MSME')).toBe(true);
      expect(isLocationTypeAllowedForPersona('WAREHOUSE', 'MSME')).toBe(true);
    });
  });

  describe('2. Validation Rules', () => {
    it('validates a complete, structurally valid address', () => {
      const res = isAddressValid(sampleAddress);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('validates strict Indian PIN codes (6 digits, non-zero start)', () => {
      expect(isPincodeValid('560048')).toBe(true);
      expect(isPincodeValid('638001')).toBe(true);
      expect(isPincodeValid('012345')).toBe(false); // starts with 0
      expect(isPincodeValid('56004')).toBe(false); // 5 digits
      expect(isPincodeValid('5600489')).toBe(false); // 7 digits
      expect(isPincodeValid('56004A')).toBe(false); // non-numeric
      expect(isPincodeValid('')).toBe(false);
    });

    it('validates geographic coordinates', () => {
      expect(isCoordinatesValid(12.9716, 77.5946)).toBe(true);
      expect(isCoordinatesValid(null, null)).toBe(true);
      expect(isCoordinatesValid(95.0, 77.5946)).toBe(false); // Lat > 90
      expect(isCoordinatesValid(12.9716, 190.0)).toBe(false); // Lng > 180
    });

    it('flags missing required address fields (line1, city, state, PIN)', () => {
      const invalid = isAddressValid({
        label: 'Site Office',
        line1: '',
        city: '',
        state: '',
        pincode: '123',
      });
      expect(invalid.valid).toBe(false);
      expect(invalid.errors).toContain('Address line 1 is mandatory.');
      expect(invalid.errors).toContain('City is mandatory.');
      expect(invalid.errors).toContain('State is mandatory.');
      expect(invalid.errors).toContain('PIN code must be a valid 6-digit Indian postal code (starting 1-9).');
    });
  });

  describe('3. Operational Location Model', () => {
    it('creates an OperationalLocation from a BuyerAddress with operationalType', () => {
      const opLoc = createOperationalLocation(sampleAddress, 'SERVICE_SITE', 'Gate 2 entry for heavy vehicles');
      expect(opLoc.operationalType).toBe('SERVICE_SITE');
      expect(opLoc.sourceAddressId).toBe('addr-001');
      expect(opLoc.specialAccessInstructions).toBe('Gate 2 entry for heavy vehicles');
      expect(opLoc.city).toBe('Bengaluru');
      expect(opLoc.pincode).toBe('560048');
      expect(opLoc.stateCode).toBe('29');
    });
  });

  describe('4. Immutable Transaction Snapshotting (Rules 1, 2, 3)', () => {
    it('creates an immutable frozen address snapshot preserving all statutory and contact details', () => {
      const capturedAt = '2026-09-24T12:00:00.000Z';
      const snapshot = createAddressSnapshot(sampleAddress, capturedAt);

      expect(snapshot.addressId).toBe('addr-001');
      expect(snapshot.label).toBe('Durga Rainbow Block A - Main Site');
      expect(snapshot.line1).toBe('Flat 402, Durga Rainbow Apartments');
      expect(snapshot.line2).toBe('Outer Ring Road, Mahadevapura');
      expect(snapshot.locality).toBe('Mahadevapura');
      expect(snapshot.landmark).toBe('Opposite EMC2 Tech Park');
      expect(snapshot.city).toBe('Bengaluru');
      expect(snapshot.district).toBe('Bengaluru Urban');
      expect(snapshot.state).toBe('Karnataka');
      expect(snapshot.pincode).toBe('560048');
      expect(snapshot.gstinStateCode).toBe('29');
      expect(snapshot.contactPerson).toBe('Senthil Kumar (Estate Manager)');
      expect(snapshot.contactPhone).toBe('+919888877777');
      expect(snapshot.capturedAt).toBe(capturedAt);
      expect(snapshot.isFrozen).toBe(true);

      // Verify Object.freeze immutability
      expect(Object.isFrozen(snapshot)).toBe(true);
    });

    it('creates distinct delivery and billing snapshots', () => {
      const delSnap = createDeliveryAddressSnapshot(sampleAddress);
      const billSnap = createBillingAddressSnapshot({
        ...sampleAddress,
        label: 'Registered Office',
        line1: '123 MG Road, Corporate Towers',
        city: 'Bengaluru',
        pincode: '560001',
      });

      expect(delSnap.addressType).toBe('DELIVERY');
      expect(billSnap.addressType).toBe('BILLING');
      expect(delSnap.line1).toBe('Flat 402, Durga Rainbow Apartments');
      expect(billSnap.line1).toBe('123 MG Road, Corporate Towers');
    });

    it('verifies snapshot decoupling when address book is mutated (Rule 1, 2, 3)', () => {
      const snapshot = createAddressSnapshot(sampleAddress);

      // Mutated live address in address book
      const mutatedAddress: BuyerAddress = {
        ...sampleAddress,
        label: 'Completely Renamed Warehouse',
        line1: '999 New Highway Road',
        city: 'Mysuru',
        pincode: '570001',
      };

      // Snapshot remains intact with original values
      expect(snapshot.label).toBe('Durga Rainbow Block A - Main Site');
      expect(snapshot.line1).toBe('Flat 402, Durga Rainbow Apartments');
      expect(snapshot.city).toBe('Bengaluru');
      expect(snapshot.pincode).toBe('560048');
      expect(assertSnapshotDecoupled(snapshot, mutatedAddress)).toBe(true);
    });
  });

  describe('5. Formatting & Presentation', () => {
    it('formats address to a clean single line', () => {
      const singleLine = formatAddressSingleLine(sampleAddress);
      expect(singleLine).toContain('Durga Rainbow RWA Committee');
      expect(singleLine).toContain('Flat 402, Durga Rainbow Apartments');
      expect(singleLine).toContain('Mahadevapura');
      expect(singleLine).toContain('Near Opposite EMC2 Tech Park');
      expect(singleLine).toContain('Bengaluru');
      expect(singleLine).toContain('560048');
    });

    it('formats address to multiline array for PDF invoices', () => {
      const lines = formatAddressMultiline(sampleAddress);
      expect(lines).toBeInstanceOf(Array);
      expect(lines[0]).toBe('Durga Rainbow RWA Committee');
      expect(lines[1]).toBe('Flat 402, Durga Rainbow Apartments');
      expect(lines.some((l) => l.includes('560048'))).toBe(true);
      expect(lines.some((l) => l.includes('Phone: +919888877777'))).toBe(true);
    });
  });

  describe('6. SNE (R2-07) and Taxonomy (R2-13) Integration', () => {
    it('builds operational discovery geographic input for SNE engine', () => {
      const geoInput = buildOperationalDiscoveryGeographicInput(sampleAddress);
      expect(geoInput.city).toBe('Bengaluru');
      expect(geoInput.pinCode).toBe('560048');
      expect(geoInput.state).toBe('Karnataka');
      expect(geoInput.country).toBe('India');
      expect(geoInput.coordinates).toEqual({ lat: 12.9716, lng: 77.5946 });
    });

    it('masks exact buyer PII for supplier discovery while preserving geographic matching fields', () => {
      const masked = maskAddressForDiscovery(sampleAddress, 25);
      expect(masked.city).toBe('Bengaluru');
      expect(masked.district).toBe('Bengaluru Urban');
      expect(masked.state).toBe('Karnataka');
      expect(masked.pincode).toBe('560048');
      expect(masked.generalArea).toBe('Mahadevapura');
      expect(masked.serviceRadiusKm).toBe(25);

      // Assert zero leak of exact building/unit/contact PII in masked payload
      expect((masked as any).line1).toBeUndefined();
      expect((masked as any).contactPerson).toBeUndefined();
      expect((masked as any).contactPhone).toBeUndefined();
    });
  });

  describe('7. Bilateral GST Engine (PA-06) Integration', () => {
    it('resolves intra-state GST place of supply for Karnataka delivery and Karnataka supplier', () => {
      const pos = resolveProcurementPlaceOfSupply({
        supplierStateCode: '29', // Karnataka
        deliveryAddress: sampleAddress, // Karnataka (29)
        billingAddress: sampleAddress,
        supplyType: 'PRODUCT_GOODS',
      });

      expect(pos.placeOfSupplyStateCode).toBe('29');
      expect(pos.placeOfSupplyStateName).toBe('Karnataka');
      expect(pos.isInterState).toBe(false);
      expect(pos.isUnionTerritory).toBe(false);
    });

    it('resolves inter-state GST place of supply when supplier is in Tamil Nadu (33) and delivery is Karnataka (29)', () => {
      const pos = resolveProcurementPlaceOfSupply({
        supplierStateCode: '33', // Tamil Nadu
        deliveryAddress: sampleAddress, // Karnataka (29)
        billingAddress: sampleAddress,
        supplyType: 'PRODUCT_GOODS',
      });

      expect(pos.placeOfSupplyStateCode).toBe('29');
      expect(pos.isInterState).toBe(true);
    });

    it('resolves immovable property place of supply at project site for civil works', () => {
      const pos = resolveProcurementPlaceOfSupply({
        supplierStateCode: '33', // Tamil Nadu
        billingAddress: {
          ...sampleAddress,
          state: 'Maharashtra',
          stateCode: '27',
        },
        projectSiteAddress: sampleAddress, // Karnataka (29)
        supplyType: 'WORKS_CONTRACT_PROJECT',
      });

      expect(pos.placeOfSupplyStateCode).toBe('29'); // Project site location governs works contracts
      expect(pos.placeOfSupplyBasis).toBe('IMMOVABLE_PROPERTY_LOCATION');
      expect(pos.isInterState).toBe(true);
    });
  });
});
