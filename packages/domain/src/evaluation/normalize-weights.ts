/**
 * Evaluation weights, normalised to 100.
 *
 * The buyer owns the criteria set for their requirement. They can type "price 2,
 * warranty 1" and mean two-to-one; the platform turns that into 66.67 / 33.33
 * rather than making them do arithmetic to reach a hundred.
 *
 * Mirrors private.normalize_evaluation_weights so the slider in the wizard shows
 * exactly what the server will store. The server remains authoritative.
 */

export interface WeightNormalizationResult {
  weights: Record<string, number>;
  /** Codes dropped because the buyer set them to zero. */
  dropped: string[];
}

export class InvalidWeightsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidWeightsError';
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * @param weights raw buyer input, keyed by evaluation criterion code
 * @param knownCodes when given, every key must name a criterion in this set
 */
export function normalizeEvaluationWeights(
  weights: Record<string, number>,
  knownCodes?: Iterable<string>,
): WeightNormalizationResult {
  const known = knownCodes ? new Set(knownCodes) : null;

  let total = 0;
  for (const [code, raw] of Object.entries(weights)) {
    if (!Number.isFinite(raw) || raw < 0) {
      throw new InvalidWeightsError(
        `Weight for "${code}" must be a non-negative number`,
      );
    }
    if (known && !known.has(code)) {
      throw new InvalidWeightsError(`Unknown evaluation criterion "${code}"`);
    }
    total += raw;
  }

  if (total <= 0) {
    throw new InvalidWeightsError(
      'At least one evaluation criterion must carry a positive weight',
    );
  }

  const positive = Object.entries(weights)
    .filter(([, raw]) => raw > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  const result: Record<string, number> = {};
  let sum = 0;
  let topCode = positive[0]?.[0] ?? '';
  let topValue = -1;

  for (const [code, raw] of positive) {
    const rounded = round2((raw / total) * 100);
    result[code] = rounded;
    sum = round2(sum + rounded);

    if (rounded > topValue) {
      topValue = rounded;
      topCode = code;
    }
  }

  // Rounding drift lands on the largest weight, where it is least visible and
  // cannot flip the ordering of criteria.
  if (sum !== 100) {
    result[topCode] = round2(topValue + (100 - sum));
  }

  return {
    weights: result,
    dropped: Object.entries(weights)
      .filter(([, raw]) => raw <= 0)
      .map(([code]) => code)
      .sort(),
  };
}

/**
 * Live percentages for the editor while the buyer is still typing, including
 * the zero rows they have not decided about yet. Never throws: an editor that
 * blows up mid-keystroke is unusable.
 */
export function previewWeightPercentages(
  weights: Record<string, number>,
): Record<string, number> {
  const total = Object.values(weights)
    .filter((v) => Number.isFinite(v) && v > 0)
    .reduce((a, b) => a + b, 0);

  const preview: Record<string, number> = {};
  for (const [code, raw] of Object.entries(weights)) {
    preview[code] = total > 0 && raw > 0 ? round2((raw / total) * 100) : 0;
  }
  return preview;
}

export function weightsSumTo100(weights: Record<string, number>): boolean {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  return round2(total) === 100;
}
