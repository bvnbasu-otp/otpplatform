import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEMO } from '../../scripts/demo/constants';

const root = resolve(__dirname, '../..');

describe('E2E demo walkthrough — seed completeness', () => {
  const completeSql = readFileSync(
    resolve(root, 'supabase/seed_demo_complete.sql'),
    'utf8',
  );

  it('complete seed includes full golden-path entities', () => {
    expect(completeSql).toContain(DEMO.awardId);
    expect(completeSql).toContain(DEMO.purchaseOrderId);
    expect(completeSql).toContain(DEMO.workOrderId);
    expect(completeSql).toContain(DEMO.invoiceId);
    expect(completeSql).toContain(DEMO.paymentId);
    expect(completeSql).toContain(DEMO.performanceId);
  });

  it('complete seed includes audit trail through completion', () => {
    expect(completeSql).toContain('payment.verified');
    expect(completeSql).toContain('performance.recorded');
    expect(completeSql).toContain('requirement.completed');
  });

  it('walkthrough steps file references audit and performance routes', () => {
    const steps = readFileSync(
      resolve(root, 'apps/web/src/features/demo/walkthrough-steps.ts'),
      'utf8',
    );
    expect(steps).toContain('/audit');
    expect(steps).toContain('/performance');
    // Routes come from the active pilot now, not a single fixed demo RFQ id.
    expect(steps).toContain('buildWalkthroughSteps');
    expect(steps).toContain('${rfqId}');
  });
});
