import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SupplierMilestoneStepper } from './components/SupplierMilestoneStepper';
import type { WorkOrderSummary } from './types/fulfillment';

function wo(overrides: Partial<WorkOrderSummary> = {}): WorkOrderSummary {
  return {
    id: 'wo-1',
    purchaseOrderId: 'po-1',
    supplierId: 'sup-1',
    status: 'IN_PROGRESS',
    title: 'Install',
    progressPercent: 0,
    completedAt: null,
    buyerAcceptedAt: null,
    inspectionNotes: null,
    ...overrides,
  };
}

describe('SupplierWorkOrderPage milestone plan wiring', () => {
  it('renders THREE_PART cumulative steps 30,80,100', () => {
    const html = renderToStaticMarkup(
      React.createElement(SupplierMilestoneStepper, {
        workOrder: wo(),
        totalAmount: 100000,
        role: 'supplier',
        onUpdateProgress: async () => {},
        paymentStructure: 'THREE_PART_PAYMENT',
      }),
    );
    expect(html).toContain('data-plan-steps="30,80,100"');
  });

  it('renders CUSTOM_TERMS from persisted schedule', () => {
    const html = renderToStaticMarkup(
      React.createElement(SupplierMilestoneStepper, {
        workOrder: wo(),
        totalAmount: 100000,
        role: 'supplier',
        onUpdateProgress: async () => {},
        paymentStructure: 'CUSTOM_TERMS',
        paymentSchedule: [
          { percentage: 40, label: 'A' },
          { percentage: 60, label: 'B' },
        ] as { percentage: number; label?: string }[],
      }),
    );
    expect(html).toContain('data-payment-structure="CUSTOM_TERMS"');
    expect(html).toContain('data-plan-steps="40,100"');
  });
});
