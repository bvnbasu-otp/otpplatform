import { describe, expect, it } from 'vitest';
import {
  fulfillmentChip,
  hasOffPlatformPaymentEvidence,
  isPurchaseOrderComplete,
  listExecutionLabel,
  paymentEvidenceLabel,
  purchaseOrderCoreStage,
  purchaseOrderLinearStep,
} from './po-lifecycle-present';

const paidOpen = {
  status: 'IN_PROGRESS',
  progressPercent: 100,
  buyerAcceptedAt: null,
  invoiceStatus: 'PAID',
  paymentStatus: 'VERIFIED',
};

describe('purchase order lifecycle presentation', () => {
  it('does not treat a paid invoice as delivery or completion', () => {
    expect(isPurchaseOrderComplete(paidOpen.status)).toBe(false);
    expect(hasOffPlatformPaymentEvidence(paidOpen)).toBe(true);
    expect(fulfillmentChip(paidOpen).label).toBe('In Transit / Staged');
    expect(fulfillmentChip(paidOpen).label).not.toMatch(/Delivered/);
    expect(purchaseOrderLinearStep(paidOpen)).toBe(14);
    expect(purchaseOrderCoreStage(paidOpen)).toBe('INVOICED');
    expect(paymentEvidenceLabel(paidOpen)).toBe('Off-platform payment recorded');
    expect(listExecutionLabel(paidOpen)).toBe('In execution · payment recorded');
  });

  it('keeps a verified payment on an issued PO out of closeout', () => {
    const issued = { status: 'ISSUED', progressPercent: 0, paymentStatus: 'VERIFIED', invoiceStatus: 'PAID' };
    expect(purchaseOrderLinearStep(issued)).toBe(13);
    expect(fulfillmentChip(issued).label).toBe('Order Issued');
    expect(purchaseOrderCoreStage(issued)).toBe('INVOICED');
  });

  it('shows inspection as sign-off, not acceptance of the purchase order', () => {
    const inspected = { status: 'IN_PROGRESS', progressPercent: 100, buyerAcceptedAt: '2026-10-01T00:00:00.000Z', invoiceStatus: null };
    expect(fulfillmentChip(inspected).label).toBe('Inspection signed off');
    expect(purchaseOrderLinearStep(inspected)).toBe(14);
    expect(isPurchaseOrderComplete(inspected.status)).toBe(false);
  });

  it('shows an unpaid in-progress order as execution, not closeout', () => {
    const unpaid = { status: 'IN_PROGRESS', progressPercent: 40, invoiceStatus: 'APPROVED', paymentStatus: null };
    expect(purchaseOrderCoreStage(unpaid)).toBe('INVOICED');
    expect(purchaseOrderLinearStep(unpaid)).toBe(14);
    expect(listExecutionLabel(unpaid)).toBe('In execution');
    expect(paymentEvidenceLabel(unpaid)).toBe('Invoice open');
  });

  it('shows a completed purchase order as delivered and step 15', () => {
    const done = { status: 'COMPLETED', progressPercent: 100, buyerAcceptedAt: '2026-10-02T00:00:00.000Z', invoiceStatus: 'PAID', paymentStatus: 'VERIFIED' };
    expect(isPurchaseOrderComplete(done.status)).toBe(true);
    expect(fulfillmentChip(done).label).toBe('Delivered & Accepted');
    expect(purchaseOrderLinearStep(done)).toBe(15);
    expect(purchaseOrderCoreStage(done)).toBe('SETTLED');
    expect(paymentEvidenceLabel(done)).toBeNull();
    expect(listExecutionLabel(done)).toBe('Completed');
  });
});
