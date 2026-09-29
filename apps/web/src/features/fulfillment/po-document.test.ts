import { describe, expect, it } from 'vitest';
import { IssuedProcurementPrintDocument } from '@/features/documents/components/IssuedProcurementPrintDocument';
import { buildPurchaseOrderDocumentInput } from './lib/po-document';
import { buildProcurementDocumentModel } from '@/features/reporting/lib/procurement-document';
import type { PurchaseOrderSummary } from './types/fulfillment';

const order: PurchaseOrderSummary = {
  id: 'po-uuid-1',
  poNumber: 'PO-2026-0042',
  status: 'IN_PROGRESS',
  totalAmount: 236000,
  currency: 'INR',
  supplierId: 's1',
  rfqId: 'rfq-1',
  issuedAt: '2026-09-10T06:30:00Z',
  acknowledgedAt: null,
  createdAt: '2026-09-09T06:30:00Z',
  rfqTitle: 'Exterior painting — Tower A',
  supplierName: 'Apex Coatings',
  supplierLegalName: 'Apex Coatings Private Limited',
  supplierGstin: '29BBBBA5678B1Z2',
  buyerOrgName: 'Prestige Lakeside RWA',
  buyerGstin: '29AAAAP1234A1Z5',
  taxableTotal: 200000,
};

describe('purchase order print input', () => {
  it('R2-31: PO surfaces wire issued snapshot print document', () => {
    expect(typeof IssuedProcurementPrintDocument).toBe('function');
  });

  it('prints persisted line items and names both parties (post-award)', () => {
    const input = buildPurchaseOrderDocumentInput(
      order,
      [{ description: 'Exterior emulsion', hsnCode: '3209', quantity: 1, unit: 'Lot', rate: 200000, amount: 200000, gstRate: 18, gstAmount: 36000, total: 236000 }],
      { viewerRole: 'supplier', generatedAt: '2026-09-26T17:04:00Z' },
    );
    const m = buildProcurementDocumentModel(input);
    expect(input.phase).toBe('POST_AWARD');
    expect(m.parties.from.name).toBe('Prestige Lakeside RWA');
    expect(m.parties.to.name).toBe('Apex Coatings Private Limited');
    expect(m.pages[0]!.rows).toHaveLength(1);
    expect(m.pages[0]!.rows[0]![1]).toBe('Exterior emulsion');
    expect(m.verification.value).toBe('PO-2026-0042 · Record po-uuid-1');
  });

  it('without stored line items it prints one line from the PO totals, not illustrative items', () => {
    const m = buildProcurementDocumentModel(
      buildPurchaseOrderDocumentInput(order, [], { viewerRole: 'buyer', generatedAt: '2026-09-26T17:04:00Z' }),
    );
    expect(m.pages[0]!.rows).toEqual([
      ['1', 'Exterior painting — Tower A — as specified in the awarded RFQ', '—', '1 Lot', '₹2,00,000', '₹2,00,000', '18%', '₹36,000', '₹2,36,000'],
    ]);
    expect(JSON.stringify(m)).not.toMatch(/Premium Exterior Emulsion|Asian Paints/);
  });
});
