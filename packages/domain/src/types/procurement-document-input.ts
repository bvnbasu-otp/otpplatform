/**
 * Shared procurement document input shape (mirrors apps/web reporting input).
 * Kept in domain for digest helpers and issued snapshot typing.
 */
export type ProcurementDocumentKind = 'PURCHASE_ORDER' | 'TAX_INVOICE' | 'QUOTE_COMPARISON' | 'DECISION_RECEIPT';
export type ProcurementDocumentPhase = 'PRE_AWARD' | 'POST_AWARD';

export interface DocumentPartyInput {
  id?: string;
  name: string;
  gstin?: string | null;
  address?: string | null;
}

export interface DocumentLineInput {
  description: string;
  hsnCode?: string | null;
  quantity: number;
  unit?: string | null;
  rate: number;
  taxableAmount: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
}

export interface ProcurementDocumentInput {
  kind: ProcurementDocumentKind;
  phase: ProcurementDocumentPhase;
  viewerRole: 'buyer' | 'supplier' | 'admin';
  referenceNumber: string;
  title: string;
  issuedAt: string | Date | null;
  generatedAt: string | Date;
  currency?: string;
  buyer: DocumentPartyInput;
  suppliers: DocumentPartyInput[];
  lines?: DocumentLineInput[];
  quotes?: Array<{
    supplierId: string;
    taxableAmount: number;
    gstAmount: number;
    totalAmount: number;
    deliveryDays?: number | null;
  }>;
  tdsAmount?: number | null;
  verification?: { label: string; value: string } | null;
  recordId?: string | null;
  notes?: string[];
}
