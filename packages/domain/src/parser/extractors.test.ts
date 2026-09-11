import { describe, expect, it } from 'vitest';
import {
  extractCity,
  extractDeliveryWindow,
  extractDimensionMm,
  extractMoisturePercent,
  extractPincode,
  extractQuantity,
  extractToleranceMm,
  extractWarrantyMonths,
  extractYarnCount,
} from './extractors';
import { DEMO_CITIES } from './taxonomy.fixture';

describe('extractQuantity', () => {
  it('reads a number and its unit, however the buyer spells it', () => {
    expect(extractQuantity('2000 kg of yarn')?.value).toEqual({
      quantity: 2000,
      unit: 'KG',
    });
    expect(extractQuantity('5,000 kgs turmeric')?.value).toEqual({
      quantity: 5000,
      unit: 'KG',
    });
    expect(extractQuantity('500 pieces')?.value).toEqual({
      quantity: 500,
      unit: 'PCS',
    });
    expect(extractQuantity('12 tonnes')?.value).toEqual({
      quantity: 12,
      unit: 'MT',
    });
  });

  it('refuses ratings, because they describe the thing and not the order', () => {
    expect(extractQuantity('12.5 HP submersible motor')).toBeNull();
    expect(extractQuantity('415 V, 30 kW panel')).toBeNull();
    expect(extractQuantity('tolerance 0.05 mm')).toBeNull();
  });

  it('skips past a rating to find the real quantity', () => {
    expect(extractQuantity('10 HP motors, 4 nos required')?.value).toEqual({
      quantity: 4,
      unit: 'PCS',
    });
  });

  it('returns nothing rather than inventing a number', () => {
    expect(extractQuantity('need this repaired quickly')).toBeNull();
  });
});

describe('extractDimensionMm and extractToleranceMm', () => {
  it('reads a plain dimension', () => {
    expect(extractDimensionMm('25mm dia shaft')?.value).toBe(25);
    expect(extractDimensionMm('150 mm bore')?.value).toBe(150);
  });

  it('reads a tolerance however it is written', () => {
    expect(extractToleranceMm('±0.05mm')?.value).toBe(0.05);
    expect(extractToleranceMm('+/- 0.02 mm')?.value).toBe(0.02);
    expect(extractToleranceMm('tolerance of 0.1 mm')?.value).toBe(0.1);
  });

  it('does not read a dimension as a tolerance', () => {
    expect(extractToleranceMm('25mm dia shaft')).toBeNull();
  });
});

describe('extractYarnCount', () => {
  it('reads the counts a spinner would recognise', () => {
    expect(extractYarnCount('30s carded')?.value).toBe(30);
    expect(extractYarnCount('40s combed compact')?.value).toBe(40);
    expect(extractYarnCount('count 60 hosiery')?.value).toBe(60);
  });

  it('ignores numbers that are plainly not counts', () => {
    expect(extractYarnCount('8% moisture')).toBeNull();
  });
});

describe('extractMoisturePercent', () => {
  it('reads the cap the buyer put on moisture', () => {
    expect(extractMoisturePercent('below 8% moisture')?.value).toBe(8);
    expect(extractMoisturePercent('moisture under 10 percent')?.value).toBe(10);
    expect(extractMoisturePercent('max 12% mc')?.value).toBe(12);
  });
});

describe('extractDeliveryWindow', () => {
  it('treats urgency as zero days rather than as no answer', () => {
    expect(extractDeliveryWindow('needed urgently')?.value).toEqual({
      days: 0,
      immediate: true,
    });
    expect(extractDeliveryWindow('ASAP please')?.value.immediate).toBe(true);
  });

  it('converts every window it understands into days', () => {
    expect(extractDeliveryWindow('in 4 days')?.value.days).toBe(4);
    expect(extractDeliveryWindow('next week')?.value.days).toBe(7);
    expect(extractDeliveryWindow('within 3 weeks')?.value.days).toBe(21);
    expect(extractDeliveryWindow('in 3 months')?.value.days).toBe(90);
  });

  it('says nothing when the buyer gave no date', () => {
    expect(extractDeliveryWindow('need 2000 kg cotton yarn')).toBeNull();
  });
});

describe('extractWarrantyMonths', () => {
  it('normalises warranty to months', () => {
    expect(extractWarrantyMonths('6 month warranty')?.value).toBe(6);
    expect(extractWarrantyMonths('1 year guarantee')?.value).toBe(12);
    expect(extractWarrantyMonths('warranty of 24 months')?.value).toBe(24);
    expect(extractWarrantyMonths('2 years warranty')?.value).toBe(24);
  });
});

describe('extractCity and extractPincode', () => {
  it('only recognises cities the platform actually serves', () => {
    expect(extractCity('deliver to Tiruppur', DEMO_CITIES)?.value).toBe('Tiruppur');
    expect(extractCity('deliver to Ludhiana', DEMO_CITIES)).toBeNull();
  });

  it('reads an Indian PIN code', () => {
    expect(extractPincode('Bengaluru 560076')?.value).toBe('560076');
    expect(extractPincode('order 12345')).toBeNull();
  });
});
