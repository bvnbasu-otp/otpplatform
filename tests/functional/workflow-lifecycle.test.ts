import { describe, it, expect } from 'vitest';
import {
  deriveCoreProcurementState,
  CORE_PROCUREMENT_STATES,
  CHRONOLOGICAL_STAGES,
  isOrderStalled,
} from '../../apps/web/src/features/lifecycle/types/procurement-state';
import { normalizeEvaluationWeights, weightsSumTo100 } from '../../packages/domain/src/evaluation/normalize-weights';
import { computeSmartScores } from '../../packages/domain/src/evaluation/smart-scoring';
import { validateGstin, generateValidGstin } from '../../packages/domain/src/gst/gstin-validator';

describe('Functional User Workflow & Lifecycle Suite', () => {
  it('walks through linear procurement state transitions from DRAFT to SETTLED', () => {
    // 1. Initial Draft Requirement
    let state = deriveCoreProcurementState({
      requirementStatus: 'DRAFT',
      rfqStatus: 'DRAFT',
      revealStatus: 'MASKED',
      poStatus: 'PENDING',
      invoiceStatus: 'PENDING',
      paymentStatus: 'PENDING',
    });
    expect(state).toBe('DRAFT');

    // 2. Published Requirement accepting quotes
    state = deriveCoreProcurementState({
      requirementStatus: 'PUBLISHED',
      rfqStatus: 'OPEN',
      revealStatus: 'MASKED',
      poStatus: 'PENDING',
      invoiceStatus: 'PENDING',
      paymentStatus: 'PENDING',
    });
    expect(state).toBe('QUOTING');

    // 3. Evaluation Phase
    state = deriveCoreProcurementState({
      requirementStatus: 'PUBLISHED',
      rfqStatus: 'EVALUATING',
      revealStatus: 'MASKED',
      poStatus: 'PENDING',
      invoiceStatus: 'PENDING',
      paymentStatus: 'PENDING',
    });
    expect(state).toBe('EVALUATING');

    // 4. Awarded Phase
    state = deriveCoreProcurementState({
      requirementStatus: 'AWARDED',
      rfqStatus: 'AWARDED',
      revealStatus: 'REVEALED',
      poStatus: 'PENDING',
      invoiceStatus: 'PENDING',
      paymentStatus: 'PENDING',
    });
    expect(state).toBe('AWARDED');

    // 5. PO Issued
    state = deriveCoreProcurementState({
      requirementStatus: 'AWARDED',
      rfqStatus: 'AWARDED',
      revealStatus: 'REVEALED',
      poStatus: 'ISSUED',
      invoiceStatus: 'PENDING',
      paymentStatus: 'PENDING',
    });
    expect(state).toBe('PO_ISSUED');

    // 6. Invoiced Phase
    state = deriveCoreProcurementState({
      requirementStatus: 'AWARDED',
      rfqStatus: 'AWARDED',
      revealStatus: 'REVEALED',
      poStatus: 'CONFIRMED',
      invoiceStatus: 'SUBMITTED',
      paymentStatus: 'PENDING',
    });
    expect(state).toBe('INVOICED');

    // 7. Settled Phase
    state = deriveCoreProcurementState({
      requirementStatus: 'COMPLETED',
      rfqStatus: 'AWARDED',
      revealStatus: 'REVEALED',
      poStatus: 'CONFIRMED',
      invoiceStatus: 'PAID',
      paymentStatus: 'VERIFIED',
    });
    expect(state).toBe('SETTLED');
  });

  it('verifies chronological order and completeness of procurement stages', () => {
    expect(CHRONOLOGICAL_STAGES).toEqual([
      'DRAFT',
      'QUOTING',
      'EVALUATING',
      'AWARDED',
      'PO_ISSUED',
      'INVOICED',
      'SETTLED',
    ]);

    for (const stage of CHRONOLOGICAL_STAGES) {
      const descriptor = CORE_PROCUREMENT_STATES[stage];
      expect(descriptor).toBeDefined();
      expect(descriptor.stepNumber).toBeGreaterThanOrEqual(1);
      expect(descriptor.stepNumber).toBeLessThanOrEqual(7);
      expect(descriptor.title).toBeTruthy();
    }
  });

  it('detects stalled orders exceeding 24 hours of inactivity', () => {
    const isStalled = isOrderStalled(
      {
        requirementStatus: 'PUBLISHED',
        rfqStatus: 'OPEN',
        revealStatus: 'MASKED',
        poStatus: 'PENDING',
        invoiceStatus: 'PENDING',
        paymentStatus: 'PENDING',
      },
      null,
      36,
    );
    expect(isStalled).toBe(true);

    const isNotStalled = isOrderStalled(
      {
        requirementStatus: 'PUBLISHED',
        rfqStatus: 'OPEN',
        revealStatus: 'MASKED',
        poStatus: 'PENDING',
        invoiceStatus: 'PENDING',
        paymentStatus: 'PENDING',
      },
      null,
      12,
    );
    expect(isNotStalled).toBe(false);
  });

  it('normalizes evaluation criteria weights and validates sum to 100', () => {
    const rawWeights = {
      commercial: 50,
      speed: 30,
      quality: 20,
    };

    const normalized = normalizeEvaluationWeights(rawWeights);
    expect(weightsSumTo100(normalized.weights)).toBe(true);
    expect(normalized.weights.commercial).toBe(50);
    expect(normalized.weights.speed).toBe(30);
    expect(normalized.weights.quality).toBe(20);
  });

  it('computes multi-factor smart scores across identity-protected quotes', () => {
    const quotes = [
      {
        quoteId: 'q-1',
        totalCost: 100000,
        deliveryDays: 10,
        warrantyMonths: 12,
        ratingAvg: 4.8,
        onTimePercent: 95,
        isGstVerified: true,
      },
      {
        quoteId: 'q-2',
        totalCost: 120000,
        deliveryDays: 5,
        warrantyMonths: 24,
        ratingAvg: 5.0,
        onTimePercent: 100,
        isGstVerified: true,
      },
    ];

    const weights = {
      commercial: 50,
      speed: 20,
      warranty: 15,
      quality: 15,
    };

    const scores = computeSmartScores(quotes, weights);
    expect(scores).toHaveLength(2);
    expect(scores[0].compositeScore).toBeGreaterThan(0);
    expect(scores[1].compositeScore).toBeGreaterThan(0);
    expect(scores[0].gstBonus).toBe(5);
    expect(scores[1].gstBonus).toBe(5);
  });

  it('validates GST compliance for entities during onboarding and intake', () => {
    const validGstin = generateValidGstin({ stateCode: '29', pan: 'ABCFE1234F', entityNumber: '1' });
    const validation = validateGstin(validGstin);
    expect(validation.valid).toBe(true);
    expect(validation.stateCode).toBe('29');

    const invalidGstin = 'INVALID12345';
    const invalidValidation = validateGstin(invalidGstin);
    expect(invalidValidation.valid).toBe(false);
  });
});
