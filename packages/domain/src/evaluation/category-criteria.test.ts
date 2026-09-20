import { describe, expect, it } from 'vitest';
import {
  EvaluationPreset,
  applyEvaluationPreset,
  getCategoryEvaluationProfile,
  getSuggestedWeightsForCategory,
  isEssentialCriterion,
  EVALUATION_PRESET_OPTIONS,
} from './category-criteria';
import { weightsSumTo100 } from './normalize-weights';

describe('Category-Specific Evaluation Criteria & Presets Engine (Phase C.6)', () => {
  describe('1. Category Evaluation Profiles & Taxonomies', () => {
    it('provides specialized criteria and 100% normalized weights for Electrical', () => {
      const profile = getCategoryEvaluationProfile('ELECTRICAL');
      expect(profile.categoryCode).toBe('ELECTRICAL');
      expect(profile.recommendedCriteriaCodes).toContain('price');
      expect(profile.recommendedCriteriaCodes).toContain('delivery_time');
      expect(profile.recommendedCriteriaCodes).toContain('warranty');
      expect(profile.recommendedCriteriaCodes).toContain('technical_fit');
      expect(profile.recommendedCriteriaCodes).toContain('certification');

      const weights = getSuggestedWeightsForCategory('ELECTRICAL');
      expect(weightsSumTo100(weights)).toBe(true);
      expect(weights.price).toBe(40);
      expect(weights.delivery_time).toBe(20);
      expect(weights.warranty).toBe(20);
      expect(weights.technical_fit).toBe(10);
      expect(weights.certification).toBe(10);
    });

    it('provides specialized criteria and 100% normalized weights for Civil & Construction', () => {
      const profile = getCategoryEvaluationProfile('CIVIL');
      expect(profile.categoryCode).toBe('CIVIL');
      expect(profile.recommendedCriteriaCodes).toContain('technical_fit');
      expect(profile.recommendedCriteriaCodes).toContain('experience');

      const weights = getSuggestedWeightsForCategory('CIVIL');
      expect(weightsSumTo100(weights)).toBe(true);
      expect(weights.price).toBe(35);
      expect(weights.technical_fit).toBe(25);
    });

    it('provides specialized criteria and 100% normalized weights for Services & AMC', () => {
      const profile = getCategoryEvaluationProfile('SERVICE_AMC');
      expect(profile.categoryCode).toBe('SERVICES');
      expect(profile.recommendedCriteriaCodes).toContain('response_time');
      expect(profile.recommendedCriteriaCodes).toContain('supplier_rating');

      const weights = getSuggestedWeightsForCategory('SERVICE_AMC');
      expect(weightsSumTo100(weights)).toBe(true);
      expect(weights.response_time).toBe(25);
      expect(weights.supplier_rating).toBe(20);
    });

    it('provides specialized criteria for Logistics & Transport', () => {
      const profile = getCategoryEvaluationProfile('LOGISTICS_FTL');
      expect(profile.categoryCode).toBe('LOGISTICS');
      expect(profile.recommendedCriteriaCodes).toContain('on_time_record');

      const weights = getSuggestedWeightsForCategory('LOGISTICS');
      expect(weightsSumTo100(weights)).toBe(true);
      expect(weights.price).toBe(40);
      expect(weights.delivery_time).toBe(30);
      expect(weights.on_time_record).toBe(20);
    });

    it('falls back to General Goods profile for unknown/generic categories', () => {
      const profile = getCategoryEvaluationProfile('UNKNOWN_XYZ');
      expect(profile.categoryCode).toBe('GENERAL');

      const weights = getSuggestedWeightsForCategory('UNKNOWN_XYZ');
      expect(weightsSumTo100(weights)).toBe(true);
    });
  });

  describe('2. Evaluation Strategy Presets', () => {
    it('defines 5 canonical evaluation preset options with icons and descriptions', () => {
      expect(EVALUATION_PRESET_OPTIONS.length).toBe(5);
      const keys = EVALUATION_PRESET_OPTIONS.map((o) => o.key);
      expect(keys).toContain(EvaluationPreset.BALANCED);
      expect(keys).toContain(EvaluationPreset.PRICE_DOMINANT);
      expect(keys).toContain(EvaluationPreset.QUALITY_AND_SLA);
      expect(keys).toContain(EvaluationPreset.RAPID_FULFILLMENT);
      expect(keys).toContain(EvaluationPreset.CATEGORY_DEFAULT);
    });

    it('applies PRICE_DOMINANT preset strictly normalized to 100%', () => {
      const weights = applyEvaluationPreset(EvaluationPreset.PRICE_DOMINANT);
      expect(weightsSumTo100(weights)).toBe(true);
      expect(weights.price).toBe(65);
      expect(weights.delivery_time).toBe(20);
      expect(weights.warranty).toBe(15);
    });

    it('applies RAPID_FULFILLMENT preset with high speed priority', () => {
      const weights = applyEvaluationPreset(EvaluationPreset.RAPID_FULFILLMENT);
      expect(weightsSumTo100(weights)).toBe(true);
      expect(weights.delivery_time).toBe(50);
      expect(weights.price).toBe(30);
      expect(weights.supplier_rating).toBe(20);
    });

    it('applies QUALITY_AND_SLA preset with category-specific technical or response weighting', () => {
      const electricalProfile = getCategoryEvaluationProfile('ELECTRICAL');
      const electricalWeights = applyEvaluationPreset(EvaluationPreset.QUALITY_AND_SLA, electricalProfile);
      expect(weightsSumTo100(electricalWeights)).toBe(true);
      expect(electricalWeights.technical_fit).toBe(35);
      expect(electricalWeights.warranty).toBe(25);

      const serviceProfile = getCategoryEvaluationProfile('SERVICES');
      const serviceWeights = applyEvaluationPreset(EvaluationPreset.QUALITY_AND_SLA, serviceProfile);
      expect(weightsSumTo100(serviceWeights)).toBe(true);
      expect(serviceWeights.response_time).toBe(30);
      expect(serviceWeights.supplier_rating).toBe(25);
    });
  });

  describe('3. Progressive Disclosure Distinction', () => {
    it('correctly classifies essential vs advanced criteria', () => {
      expect(isEssentialCriterion('price')).toBe(true);
      expect(isEssentialCriterion('delivery_time')).toBe(true);
      expect(isEssentialCriterion('warranty')).toBe(true);
      expect(isEssentialCriterion('PRICE')).toBe(true);

      expect(isEssentialCriterion('technical_fit')).toBe(false);
      expect(isEssentialCriterion('certification')).toBe(false);
      expect(isEssentialCriterion('response_time')).toBe(false);
      expect(isEssentialCriterion('experience')).toBe(false);
      expect(isEssentialCriterion('supplier_rating')).toBe(false);
    });
  });
});
