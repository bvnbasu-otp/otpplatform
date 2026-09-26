import type { DocumentLineInput, ProcurementDocumentInput } from '@/features/reporting/lib/procurement-document';
import type { PurchaseOrderSummary } from '../types/fulfillment';

export interface PoDocumentLine {
  description: string;
  hsnCode?: string | null;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  gstRate: number;
  gstAmount: number;
  total: number;
}

/**
 * Print input for a purchase order. A PO exists only after award, so both parties
 * are shown by name. Only persisted line items are printed; if none were stored the
 * document carries a single line built from the PO's own totals rather than
 * illustrative items.
 */
export function buildPurchaseOrderDocumentInput(
  order: PurchaseOrderSummary,
  lines: PoDocumentLine[],
  options: { viewerRole: 'buyer' | 'supplier'; generatedAt: Date | string; buyerAddress?: string | null; tdsAmount?: number | null },
): ProcurementDocumentInput {
  let docLines: DocumentLineInput[];
  if (lines.length > 0) {
    docLines = lines.map((l) => ({
      description: l.description,
      hsnCode: l.hsnCode ?? null,
      quantity: l.quantity,
      unit: l.unit,
      rate: l.rate,
      taxableAmount: l.amount,
      gstRate: l.gstRate,
      gstAmount: l.gstAmount,
      totalAmount: l.total,
    }));
  } else {
    const gross = Number(order.totalAmount) || 0;
    const taxable = order.taxableTotal != null && order.taxableTotal > 0 ? order.taxableTotal : gross;
    const gst = Math.max(0, Math.round((gross - taxable) * 100) / 100);
    docLines = [
      {
        description: `${order.rfqTitle || 'Scope of work'} — as specified in the awarded RFQ`,
        hsnCode: null,
        quantity: 1,
        unit: 'Lot',
        rate: taxable,
        taxableAmount: taxable,
        gstRate: taxable > 0 ? Math.round((gst / taxable) * 10000) / 100 : 0,
        gstAmount: gst,
        totalAmount: gross,
      },
    ];
  }

  return {
    kind: 'PURCHASE_ORDER',
    phase: 'POST_AWARD',
    viewerRole: options.viewerRole,
    referenceNumber: order.poNumber,
    recordId: order.id,
    title: order.rfqTitle || `Purchase Order ${order.poNumber}`,
    issuedAt: order.issuedAt || order.createdAt,
    generatedAt: options.generatedAt,
    currency: order.currency,
    buyer: { name: order.buyerOrgName || 'Buyer organisation', gstin: order.buyerGstin ?? null, address: options.buyerAddress ?? null },
    suppliers: [{ id: order.supplierId, name: order.supplierLegalName || order.supplierName || 'Awarded supplier', gstin: order.supplierGstin ?? null }],
    lines: docLines,
    tdsAmount: options.tdsAmount ?? null,
    notes: [
      'Direct bilateral contract between the buyer and the supplier. Payment is made by the buyer directly to the supplier.',
    ],
  };
}
