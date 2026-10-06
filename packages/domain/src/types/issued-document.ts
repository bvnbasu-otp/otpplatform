import type { CanonicalDecisionReceipt } from './decision-receipt';
import type { ProcurementDocumentInput } from './procurement-document-input';
import { computeDeterministicHmac } from './procurement-communications';

export const ISSUED_PROCUREMENT_A4_SALT = 'OTP-ISSUED-PROCUREMENT-A4-V1';

export interface IssuedDocumentPayloadJson {
  schemaVersion: '1';
  canonicalDecisionReceipt: CanonicalDecisionReceipt | null;
  reputationAppendix: unknown;
  procurementDocumentInput: ProcurementDocumentInput;
  sourceAuditRefs: {
    awardId: string | null;
    purchaseOrderId: string | null;
    invoiceId: string | null;
    rfqId: string | null;
    quoteId: string | null;
    quoteVersion: number | null;
  };
}

/** Stable JSON for OTP_PROCUREMENT_A4_V1 — excludes verification field. */
export function stableProcurementDocumentInputForDigest(
  input: ProcurementDocumentInput,
): string {
  const { verification: _omit, ...rest } = input;
  return JSON.stringify(rest);
}

export function computeProcurementA4DigestV1(input: ProcurementDocumentInput): string {
  return computeDeterministicHmac(stableProcurementDocumentInputForDigest(input), ISSUED_PROCUREMENT_A4_SALT);
}

export function buildDecisionReceiptProcurementDocumentInput(
  receipt: CanonicalDecisionReceipt,
  options: { viewerRole: 'buyer' | 'supplier'; phase: 'PRE_AWARD' | 'POST_AWARD'; generatedAt: string },
): ProcurementDocumentInput {
  const offer = receipt.selectedOffer;
  const lineDesc = `${receipt.rfqTitle} — awarded offer ${offer.maskedSupplierLabel}`;
  return {
    kind: 'DECISION_RECEIPT',
    phase: options.phase,
    viewerRole: options.viewerRole,
    referenceNumber: receipt.receiptId,
    recordId: receipt.rfqId,
    title: receipt.rfqTitle,
    issuedAt: receipt.timestamps.awardedAt,
    generatedAt: options.generatedAt,
    currency: 'INR',
    buyer: {
      name: receipt.buyerContext.organizationName || receipt.buyerContext.buyerName,
      gstin: receipt.buyerContext.buyerGstin ?? null,
      address: receipt.buyerContext.deliveryAddressSnapshot
        ? [
            receipt.buyerContext.deliveryAddressSnapshot.line1,
            receipt.buyerContext.deliveryAddressSnapshot.city,
            receipt.buyerContext.deliveryAddressSnapshot.pincode,
          ]
            .filter(Boolean)
            .join(', ')
        : null,
    },
    suppliers: [
      {
        id: offer.supplierId ?? undefined,
        name: offer.businessName || offer.maskedSupplierLabel,
        gstin: offer.supplierGstin ?? null,
      },
    ],
    lines: [
      {
        description: lineDesc,
        quantity: 1,
        unit: 'Lot',
        rate: offer.baseAmount,
        taxableAmount: offer.baseAmount,
        gstRate: offer.gstRate ?? 0,
        gstAmount: offer.gstAmount ?? 0,
        totalAmount: offer.totalLandedCost,
      },
    ],
    verification: {
      label: 'Document Integrity Reference',
      value: receipt.cryptographicAuditHash,
    },
    notes: [
      'Integrity digest (OTP internal algorithm). Not a statutory digital signature under IT Act eSign/DSC.',
    ],
  };
}

export function parseIssuedDocumentPayload(raw: unknown): IssuedDocumentPayloadJson | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== '1') return null;
  if (!o.procurementDocumentInput || typeof o.procurementDocumentInput !== 'object') return null;
  return o as unknown as IssuedDocumentPayloadJson;
}
