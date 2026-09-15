import { describe, expect, it } from 'vitest';
import {
  LINEAR_PROCUREMENT_STEPS,
  PROCUREMENT_STEP_NUMBERS,
  ProcurementStepCode,
  validateLinearStepTransition,
  type ProcurementStepNumber,
} from './linear-pipeline';
import { CANONICAL_PROCUREMENT_LIFECYCLE } from './procurement';

describe('15-Step Strict Linear Procurement Workflow', () => {
  it('contains exactly 15 sequential steps numbered 1 through 15', () => {
    expect(PROCUREMENT_STEP_NUMBERS.length).toBe(15);
    for (let i = 1; i <= 15; i++) {
      expect(PROCUREMENT_STEP_NUMBERS).toContain(i);
      const step = LINEAR_PROCUREMENT_STEPS[i as ProcurementStepNumber];
      expect(step).toBeDefined();
      expect(step.stepNumber).toBe(i);
      expect(step.title).toBeDefined();
      expect(step.shortLabel).toBeDefined();
      expect(step.routePath).toBeDefined();
      expect(step.allowedRoles.length).toBeGreaterThan(0);
    }
  });

  it('guarantees Market Intelligence is flagged single-instance ONLY in Step 3', () => {
    expect(LINEAR_PROCUREMENT_STEPS[3].singleInstanceOnly).toBe(true);
    expect(LINEAR_PROCUREMENT_STEPS[3].code).toBe(ProcurementStepCode.STEP_3_MARKET_INTELLIGENCE);

    // Other steps must NOT be flagged as single-instance market intelligence
    for (let i = 1; i <= 15; i++) {
      if (i !== 3) {
        expect(LINEAR_PROCUREMENT_STEPS[i as ProcurementStepNumber].code).not.toBe(
          ProcurementStepCode.STEP_3_MARKET_INTELLIGENCE
        );
      }
    }
  });

  it('enforces strict monotonic progression and prevents skipping forward', () => {
    // Valid +1 steps
    for (let i = 1; i < 15; i++) {
      const res = validateLinearStepTransition(
        i as ProcurementStepNumber,
        (i + 1) as ProcurementStepNumber
      );
      expect(res.valid).toBe(true);
    }

    // Invalid forward skip (+2 or more)
    expect(validateLinearStepTransition(1, 3).valid).toBe(false);
    expect(validateLinearStepTransition(2, 6).valid).toBe(false);
    expect(validateLinearStepTransition(5, 10).valid).toBe(false);
    expect(validateLinearStepTransition(1, 15).valid).toBe(false);

    // Viewing previous steps (<= current) is valid in read-only mode
    expect(validateLinearStepTransition(6, 3).valid).toBe(true);
    expect(validateLinearStepTransition(12, 1).valid).toBe(true);
  });

  it('defines the canonical 14-stage procurement lifecycle sequence ending at Audit', () => {
    expect(CANONICAL_PROCUREMENT_LIFECYCLE).toEqual([
      'Requirement',
      'Discovery',
      'RFQ',
      'Identity-Protected Evaluation',
      'Market Intelligence',
      'Committee Vote',
      'Award',
      'Reveal',
      'PO',
      'Work Order',
      'Invoice',
      'Payment',
      'Performance',
      'Audit',
    ]);
    expect(CANONICAL_PROCUREMENT_LIFECYCLE).toHaveLength(14);
    expect(CANONICAL_PROCUREMENT_LIFECYCLE[0]).toBe('Requirement');
    expect(CANONICAL_PROCUREMENT_LIFECYCLE[3]).toBe('Identity-Protected Evaluation');
    expect(CANONICAL_PROCUREMENT_LIFECYCLE[4]).toBe('Market Intelligence');
    expect(CANONICAL_PROCUREMENT_LIFECYCLE[5]).toBe('Committee Vote');
    expect(CANONICAL_PROCUREMENT_LIFECYCLE[12]).toBe('Performance');
    expect(CANONICAL_PROCUREMENT_LIFECYCLE[13]).toBe('Audit');
    expect(CANONICAL_PROCUREMENT_LIFECYCLE).not.toContain('End');
  });
});
