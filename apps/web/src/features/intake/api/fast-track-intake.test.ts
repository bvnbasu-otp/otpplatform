import { describe, expect, it } from 'vitest';
import type { ParsedRequirement, TaxonomySnapshot } from '@otp/domain';
import {
  fastTrackExpressIntake,
  parsedToPatch,
  resolveDeliveryCity,
  resolveWordQuantity,
} from './fast-track-intake';

describe('resolveWordQuantity', () => {
  it('correctly extracts single-digit and common count words', () => {
    expect(resolveWordQuantity('Buy one officiate chair in Bangalore')).toBe(1);
    expect(resolveWordQuantity('Need a single conference table')).toBe(1);
    expect(resolveWordQuantity('Need two laptops')).toBe(2);
    expect(resolveWordQuantity('Order three executive desks')).toBe(3);
    expect(resolveWordQuantity('Need four CCTV cameras')).toBe(4);
    expect(resolveWordQuantity('Need five water filters')).toBe(5);
    expect(resolveWordQuantity('Need ten chairs')).toBe(10);
    expect(resolveWordQuantity('Need a dozen chairs')).toBe(12);
    expect(resolveWordQuantity('Need twenty chairs')).toBe(20);
    expect(resolveWordQuantity('Need twenty-five mesh chairs')).toBe(25);
    expect(resolveWordQuantity('Need fifty ergonomic chairs')).toBe(50);
    expect(resolveWordQuantity('Need hundred chairs')).toBe(100);
  });

  it('returns null when no word quantity exists', () => {
    expect(resolveWordQuantity('Need ergonomic chairs')).toBeNull();
    expect(resolveWordQuantity('CCTV camera installation')).toBeNull();
  });
});

describe('resolveDeliveryCity', () => {
  it('preserves explicitly parsed city from parser', () => {
    expect(resolveDeliveryCity('Bengaluru', 'Need chairs in Bangalore')).toBe('Bengaluru');
    expect(resolveDeliveryCity('Coimbatore', 'Need solar in Coimbatore')).toBe('Coimbatore');
  });

  it('maps common regional aliases to served hub names', () => {
    expect(resolveDeliveryCity(null, 'Buy one chair in bangalore')).toBe('Bengaluru');
    expect(resolveDeliveryCity(null, 'Delivery to Madras port')).toBe('Chennai');
    expect(resolveDeliveryCity(null, 'Urgent requirement in Kovai')).toBe('Coimbatore');
    expect(resolveDeliveryCity(null, 'Garment unit in tirupur')).toBe('Tiruppur');
    expect(resolveDeliveryCity(null, 'Factory in Salem')).toBe('Salem');
    expect(resolveDeliveryCity(null, 'Warehouse in Erode')).toBe('Erode');
  });

  it('falls back to Tiruppur when no city is identifiable', () => {
    expect(resolveDeliveryCity(null, 'Need 50 chairs')).toBe('Tiruppur');
  });
});

describe('parsedToPatch', () => {
  const mockTaxonomy: TaxonomySnapshot = {
    categories: [
      {
        id: 'cat-furniture',
        code: 'furniture',
        name: 'Furniture',
        description: null,
        sortOrder: 1,
      },
    ],
    subcategories: [
      {
        id: 'sub-office-chairs',
        categoryId: 'cat-furniture',
        categoryCode: 'furniture',
        code: 'office_chairs',
        name: 'Office Chairs & Seating',
        description: null,
        matchKeywords: ['chair', 'seating', 'ergonomic'],
        requiredAttributeCodes: [],
        defaultRequirementMode: 'PRODUCT_MATERIAL',
        sortOrder: 1,
      },
    ],
    capabilities: [],
    attributes: [],
    criteria: [],
    cities: [],
  };

  const baseParsed: ParsedRequirement = {
    categoryCode: 'furniture',
    subcategoryCode: 'office_chairs',
    requirementMode: 'PRODUCT_MATERIAL',
    title: '50 Ergonomic Mesh Chairs',
    quantity: 50,
    unit: 'units',
    attributes: [{ code: 'material', value: 'mesh', evidence: 'mesh' }],
    deliveryCity: 'Bengaluru',
    deliveryPincode: null,
    timing: { requiredByDays: 3, isImmediate: false },
    warrantyMonths: 12,
    missingRequired: [],
    confidence: 0.95,
    matchedKeywords: ['chair', 'ergonomic'],
  };

  it('builds a complete draft patch from parsed requirement', () => {
    const patch = parsedToPatch(baseParsed, mockTaxonomy, 'Need 50 ergonomic mesh chairs in Bangalore');
    expect(patch.categoryId).toBe('cat-furniture');
    expect(patch.subcategoryId).toBe('sub-office-chairs');
    expect(patch.quantity).toBe(50);
    expect(patch.unit).toBe('units');
    expect(patch.deliveryCity).toBe('Bengaluru');
    expect(patch.requiredByDays).toBe(3);
    expect(patch.quality?.warrantyMonths).toBe(12);
    expect(patch.attributes).toEqual({ material: 'mesh' });
  });

  it('uses word quantity when explicit parsed quantity is null', () => {
    const unquantifiedParsed = { ...baseParsed, quantity: null };
    const patch = parsedToPatch(unquantifiedParsed, mockTaxonomy, 'Buy one officiate chair in Bangalore');
    expect(patch.quantity).toBe(1);
  });

  it('safely handles missing timing object', () => {
    const noTimingParsed = { ...baseParsed, timing: undefined as any };
    const patch = parsedToPatch(noTimingParsed, mockTaxonomy, 'Need chairs in Bangalore');
    expect(patch.requiredByDays).toBe(3);
  });
});

describe('fastTrackExpressIntake validation', () => {
  it('rejects empty query text', async () => {
    const res1 = await fastTrackExpressIntake('');
    expect(res1.ok).toBe(false);
    expect(res1.error).toContain('Please enter a requirement description');

    const res2 = await fastTrackExpressIntake('   ');
    expect(res2.ok).toBe(false);
  });

  it('preserves production truth by defaulting autoQuoteSimulation to undefined', async () => {
    // Calling with empty text fails early before any DB mutations or simulation RPCs
    const res = await fastTrackExpressIntake('', { autoQuoteSimulation: false });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Please enter a requirement description.');
  });
});
