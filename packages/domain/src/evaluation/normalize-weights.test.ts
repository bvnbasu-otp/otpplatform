import { describe, expect, it } from 'vitest';
import {
  InvalidWeightsError,
  normalizeEvaluationWeights,
  previewWeightPercentages,
  weightsSumTo100,
} from './normalize-weights';

describe('normalizeEvaluationWeights', () => {
  it('leaves weights that already total a hundred alone', () => {
    const { weights } = normalizeEvaluationWeights({
      price: 25,
      warranty: 35,
      supplier_rating: 25,
      delivery_time: 15,
    });

    expect(weights).toEqual({
      price: 25,
      warranty: 35,
      supplier_rating: 25,
      delivery_time: 15,
    });
  });

  it('turns a ratio into percentages, so the buyer never does arithmetic', () => {
    const { weights } = normalizeEvaluationWeights({ price: 2, warranty: 1 });

    expect(weights).toEqual({ price: 66.67, warranty: 33.33 });
    expect(weightsSumTo100(weights)).toBe(true);
  });

  it('still totals a hundred when the split does not divide evenly', () => {
    const { weights } = normalizeEvaluationWeights({ a: 1, b: 1, c: 1 });

    expect(weightsSumTo100(weights)).toBe(true);
    // The drift lands on one weight rather than being spread invisibly.
    expect(Object.values(weights).filter((v) => v === 33.33)).toHaveLength(2);
  });

  it('puts rounding drift on the largest weight, where it cannot reorder anything', () => {
    const { weights } = normalizeEvaluationWeights({ price: 7, quality: 3, speed: 3 });

    expect(weightsSumTo100(weights)).toBe(true);
    expect(weights.price!).toBeGreaterThan(weights.quality!);
    expect(weights.quality).toBe(weights.speed);
  });

  it('drops criteria the buyer zeroed out, and reports them', () => {
    const { weights, dropped } = normalizeEvaluationWeights({
      price: 60,
      warranty: 40,
      certification: 0,
    });

    expect(weights).toEqual({ price: 60, warranty: 40 });
    expect(dropped).toEqual(['certification']);
  });

  it('refuses a set with nothing positive in it', () => {
    expect(() => normalizeEvaluationWeights({ price: 0, warranty: 0 })).toThrow(
      InvalidWeightsError,
    );
  });

  it('refuses negative and non-finite weights', () => {
    expect(() => normalizeEvaluationWeights({ price: -10 })).toThrow(InvalidWeightsError);
    expect(() => normalizeEvaluationWeights({ price: Number.NaN })).toThrow(
      InvalidWeightsError,
    );
  });

  it('refuses a criterion the platform does not define', () => {
    expect(() =>
      normalizeEvaluationWeights({ price: 50, vibes: 50 }, ['price', 'warranty']),
    ).toThrow(/Unknown evaluation criterion "vibes"/);
  });
});

describe('previewWeightPercentages', () => {
  it('shows live percentages while the buyer is still deciding', () => {
    expect(previewWeightPercentages({ price: 3, warranty: 1 })).toEqual({
      price: 75,
      warranty: 25,
    });
  });

  it('shows zero rather than throwing on an empty or zeroed editor', () => {
    expect(previewWeightPercentages({ price: 0, warranty: 0 })).toEqual({
      price: 0,
      warranty: 0,
    });
    expect(previewWeightPercentages({})).toEqual({});
  });
});
