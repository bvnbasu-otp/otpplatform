import { describe, expect, it } from 'vitest';
import {
  canSubmitGstTaxLines,
  normalizeSupplyGstTreatment,
  requiresGstClassificationReview,
  supplyGstTreatmentLabel,
} from './gst-supply-classification';

describe('gst-supply-classification', () => {
  it('normalizes unknown values to REVIEW_REQUIRED', () => {
    expect(normalizeSupplyGstTreatment('')).toBe('REVIEW_REQUIRED');
    expect(normalizeSupplyGstTreatment('bogus')).toBe('REVIEW_REQUIRED');
  });

  it('distinguishes exempt, nil-rated and zero-rated labels', () => {
    expect(supplyGstTreatmentLabel('EXEMPT')).toMatch(/Exempt supply/);
    expect(supplyGstTreatmentLabel('NIL_RATED')).toMatch(/Nil-rated/);
    expect(supplyGstTreatmentLabel('ZERO_RATED')).toMatch(/Zero-rated/);
    expect(supplyGstTreatmentLabel('EXEMPT')).not.toEqual(supplyGstTreatmentLabel('NIL_RATED'));
  });

  it('blocks tax lines for REVIEW_REQUIRED and allows zero tax', () => {
    expect(requiresGstClassificationReview('REVIEW_REQUIRED')).toBe(true);
    expect(canSubmitGstTaxLines('REVIEW_REQUIRED', 0)).toEqual({ ok: true });
    expect(canSubmitGstTaxLines('REVIEW_REQUIRED', 1).ok).toBe(false);
  });

  it('allows tax lines only for REGULAR_TAXABLE when amount > 0', () => {
    expect(canSubmitGstTaxLines('REGULAR_TAXABLE', 180).ok).toBe(true);
    expect(canSubmitGstTaxLines('UNREGISTERED', 1).ok).toBe(false);
    expect(canSubmitGstTaxLines('ZERO_RATED', 1).ok).toBe(false);
  });
});
