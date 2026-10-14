import { describe, expect, it } from 'vitest';
import { normalizeUnit, unitsMatch } from './units';

describe('Canonical Units Dictionary & Normalization Engine', () => {
  it('normalizes bulk agricultural commodity units', () => {
    expect(normalizeUnit('quintal')).toBe('QUINTAL');
    expect(normalizeUnit('quintals')).toBe('QUINTAL');
    expect(normalizeUnit('qtl')).toBe('QUINTAL');
    expect(normalizeUnit('qtls')).toBe('QUINTAL');
    expect(normalizeUnit('कुंतल')).toBe('QUINTAL');
    expect(normalizeUnit('क्विंटल')).toBe('QUINTAL');
  });

  it('normalizes industrial packaging and container units', () => {
    expect(normalizeUnit('drum')).toBe('DRUM');
    expect(normalizeUnit('drums')).toBe('DRUM');
    expect(normalizeUnit('barrel')).toBe('BARREL');
    expect(normalizeUnit('barrels')).toBe('BARREL');
    expect(normalizeUnit('bbl')).toBe('BARREL');
    expect(normalizeUnit('carton')).toBe('CARTON');
    expect(normalizeUnit('cartons')).toBe('CARTON');
    expect(normalizeUnit('ctn')).toBe('CARTON');
    expect(normalizeUnit('pack')).toBe('PACK');
    expect(normalizeUnit('packets')).toBe('PACK');
  });

  it('correctly matches unit equivalents', () => {
    expect(unitsMatch('quintals', 'QTL')).toBe(true);
    expect(unitsMatch('drums', 'DRUM')).toBe(true);
    expect(unitsMatch('cartons', 'ctn')).toBe(true);
    expect(unitsMatch('kgs', 'kg')).toBe(true);
    expect(unitsMatch('kg', 'MT')).toBe(false);
  });
});
