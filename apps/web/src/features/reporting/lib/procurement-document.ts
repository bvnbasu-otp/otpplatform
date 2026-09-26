/**
 * Pure document model for printable A4 procurement documents (purchase order,
 * tax invoice, quote comparison, decision receipt). The printable component
 * renders this model verbatim, so everything a reader sees on paper — parties,
 * figures, timestamps, page numbering and identity protection — is decided here
 * and can be asserted without a browser.
 */
import { formatMoney } from '@/features/fulfillment/types/fulfillment';
import { formatDateTimeIST } from '@/lib/date-utils';
import { PLATFORM_DISCLAIMER_LINES, PRODUCT_FULL_NAME, PRODUCT_NAME } from '@/lib/brand';

export type ProcurementDocumentKind = 'PURCHASE_ORDER' | 'TAX_INVOICE' | 'QUOTE_COMPARISON' | 'DECISION_RECEIPT';

/** PRE_AWARD documents never carry real supplier names or, for supplier readers, the buyer's identity. */
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

export interface DocumentQuoteInput {
  supplierId: string;
  taxableAmount: number;
  gstAmount: number;
  totalAmount: number;
  deliveryDays?: number | null;
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
  /** One entry for PO / invoice / receipt (the awarded supplier); every quoting supplier for a comparison. */
  suppliers: DocumentPartyInput[];
  lines?: DocumentLineInput[];
  quotes?: DocumentQuoteInput[];
  /** TDS already withheld on the ledger for this document, if any. */
  tdsAmount?: number | null;
  /**
   * A reference or digest the system already computed for this record (e.g. the
   * decision-receipt SHA-256). When absent, the reference number and record id are used.
   */
  verification?: { label: string; value: string } | null;
  recordId?: string | null;
  notes?: string[];
}

export interface DocumentPartyBlock {
  heading: 'From' | 'To';
  role: string;
  name: string;
  details: string[];
}

export interface DocumentTotalRow {
  label: string;
  value: string;
  emphasis?: boolean;
}

export interface DocumentPage {
  pageNumber: number;
  totalPages: number;
  label: string;
  rows: string[][];
  isFirst: boolean;
  isLast: boolean;
}

export interface ProcurementDocumentModel {
  format: 'a4';
  orientation: 'portrait';
  kind: ProcurementDocumentKind;
  identityProtected: boolean;
  brand: { name: string; fullName: string };
  title: string;
  documentType: string;
  referenceNumber: string;
  issuedAtLabel: string;
  generatedAtLabel: string;
  parties: { from: DocumentPartyBlock; to: DocumentPartyBlock };
  columns: string[];
  pages: DocumentPage[];
  totals: DocumentTotalRow[];
  verification: { label: string; value: string };
  notes: string[];
  footer: string[];
  /** Section ids in reading order; used by the renderer and asserted by tests. */
  sections: Array<'header' | 'parties' | 'line-items' | 'totals' | 'verification' | 'footer'>;
}

export const FIRST_PAGE_ROWS = 12;
export const CONTINUATION_PAGE_ROWS = 22;

const DOCUMENT_TYPE_LABELS: Record<ProcurementDocumentKind, string> = {
  PURCHASE_ORDER: 'Purchase Order',
  TAX_INVOICE: 'Tax Invoice',
  QUOTE_COMPARISON: 'Quote Comparison',
  DECISION_RECEIPT: 'Decision Receipt',
};

export function supplierPseudonym(index: number): string {
  return `Supplier #${String(index + 1).padStart(2, '0')}`;
}

export const PROTECTED_BUYER_LABEL = 'Buyer (identity protected until award)';

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function paginateRows<T>(rows: T[], firstPage = FIRST_PAGE_ROWS, perPage = CONTINUATION_PAGE_ROWS): T[][] {
  if (rows.length <= firstPage) return [rows];
  const pages: T[][] = [rows.slice(0, firstPage)];
  for (let i = firstPage; i < rows.length; i += perPage) pages.push(rows.slice(i, i + perPage));
  return pages;
}

export function buildProcurementDocumentModel(input: ProcurementDocumentInput): ProcurementDocumentModel {
  const currency = input.currency || 'INR';
  const money = (n: number) => formatMoney(r2(n), currency);
  const preAward = input.phase === 'PRE_AWARD';
  const hideBuyer = preAward && input.viewerRole === 'supplier';

  const supplierLabels = input.suppliers.map((s, i) => (preAward ? supplierPseudonym(i) : s.name));
  const supplierLabelById = new Map(input.suppliers.map((s, i) => [s.id ?? `#${i}`, supplierLabels[i]!]));

  const redactions: Array<[RegExp, string]> = [];
  if (preAward) {
    input.suppliers.forEach((s, i) => {
      if (s.name.trim()) redactions.push([new RegExp(escapeRegExp(s.name.trim()), 'gi'), supplierPseudonym(i)]);
      if (s.gstin?.trim()) redactions.push([new RegExp(escapeRegExp(s.gstin.trim()), 'gi'), '[GSTIN withheld]']);
    });
    if (hideBuyer && input.buyer.name.trim()) {
      redactions.push([new RegExp(escapeRegExp(input.buyer.name.trim()), 'gi'), PROTECTED_BUYER_LABEL]);
    }
  }
  const scrub = (text: string) => redactions.reduce((t, [re, repl]) => t.replace(re, repl), text);

  const partyDetails = (p: DocumentPartyInput, protectedIdentity: boolean): string[] => {
    if (protectedIdentity) return ['Identity, GSTIN and address are disclosed only after award.'];
    const d: string[] = [];
    d.push(p.gstin ? `GSTIN: ${p.gstin}` : 'GSTIN: Unregistered / not on record');
    if (p.address) d.push(p.address);
    return d;
  };

  const buyerBlock = {
    role: 'Buyer',
    name: hideBuyer ? PROTECTED_BUYER_LABEL : input.buyer.name,
    details: partyDetails(input.buyer, hideBuyer),
  };
  const primarySupplier = input.suppliers[0];
  const supplierBlock = {
    role: input.kind === 'QUOTE_COMPARISON' ? 'Quoting suppliers' : 'Supplier',
    name:
      input.kind === 'QUOTE_COMPARISON'
        ? `${input.suppliers.length} supplier${input.suppliers.length === 1 ? '' : 's'}${preAward ? ' (pseudonymised)' : ''}`
        : supplierLabels[0] ?? 'Supplier',
    details:
      input.kind === 'QUOTE_COMPARISON'
        ? supplierLabels
        : primarySupplier
          ? partyDetails(primarySupplier, preAward)
          : [],
  };

  // Invoices run supplier → buyer; every other document is issued by the buyer.
  const supplierIssues = input.kind === 'TAX_INVOICE';
  const parties = {
    from: { heading: 'From' as const, ...(supplierIssues ? supplierBlock : buyerBlock) },
    to: { heading: 'To' as const, ...(supplierIssues ? buyerBlock : supplierBlock) },
  };

  let columns: string[];
  let rows: string[][];
  let taxable = 0;
  let gst = 0;
  let gross = 0;

  if (input.kind === 'QUOTE_COMPARISON') {
    columns = ['#', 'Supplier', 'Taxable value', 'GST', 'Total', 'Delivery'];
    const quotes = [...(input.quotes ?? [])].sort((a, b) => a.totalAmount - b.totalAmount);
    rows = quotes.map((q, i) => [
      String(i + 1),
      supplierLabelById.get(q.supplierId) ?? (preAward ? 'Supplier (unlisted)' : q.supplierId),
      money(q.taxableAmount),
      money(q.gstAmount),
      money(q.totalAmount),
      q.deliveryDays != null ? `${q.deliveryDays} days` : '—',
    ]);
  } else {
    columns = ['#', 'Description', 'HSN/SAC', 'Qty', 'Rate', 'Taxable value', 'GST %', 'GST', 'Total'];
    const lines = input.lines ?? [];
    rows = lines.map((l, i) => [
      String(i + 1),
      scrub(l.description),
      l.hsnCode || '—',
      `${l.quantity}${l.unit ? ` ${l.unit}` : ''}`,
      money(l.rate),
      money(l.taxableAmount),
      `${r2(l.gstRate)}%`,
      money(l.gstAmount),
      money(l.totalAmount),
    ]);
    taxable = r2(lines.reduce((s, l) => s + l.taxableAmount, 0));
    gst = r2(lines.reduce((s, l) => s + l.gstAmount, 0));
    gross = r2(lines.reduce((s, l) => s + l.totalAmount, 0));
  }

  const chunks = paginateRows(rows);
  const totalPages = chunks.length;
  const pages: DocumentPage[] = chunks.map((chunk, i) => ({
    pageNumber: i + 1,
    totalPages,
    label: `Page ${i + 1} of ${totalPages}`,
    rows: chunk,
    isFirst: i === 0,
    isLast: i === totalPages - 1,
  }));

  const totals: DocumentTotalRow[] = [];
  if (input.kind !== 'QUOTE_COMPARISON') {
    totals.push({ label: 'Taxable value', value: money(taxable) });
    totals.push({ label: 'GST', value: money(gst) });
    if (input.tdsAmount == null) {
      totals.push({ label: 'Total (incl. GST)', value: money(gross), emphasis: true });
      totals.push({ label: 'TDS', value: 'Withheld by the buyer on each invoice, where applicable' });
    } else {
      const tds = r2(Math.max(0, input.tdsAmount));
      totals.push({ label: 'Total (incl. GST)', value: money(gross) });
      totals.push({ label: 'TDS withheld', value: tds > 0 ? `− ${money(tds)}` : money(0) });
      totals.push({ label: 'Net payable to supplier', value: money(Math.max(0, gross - tds)), emphasis: true });
    }
  }

  const verification = input.verification ?? {
    label: 'Document reference',
    value: input.recordId ? `${input.referenceNumber} · Record ${input.recordId}` : input.referenceNumber,
  };

  const generatedAtLabel = formatDateTimeIST(input.generatedAt);
  const footer = [
    ...PLATFORM_DISCLAIMER_LINES,
    `Generated ${generatedAtLabel} by ${PRODUCT_NAME} (${PRODUCT_FULL_NAME}). ${verification.label}: ${verification.value}.`,
  ];
  if (preAward) {
    footer.unshift('Identity-protected document: supplier names are pseudonymised and identities are disclosed only after award.');
  }

  return {
    format: 'a4',
    orientation: 'portrait',
    kind: input.kind,
    identityProtected: preAward,
    brand: { name: PRODUCT_NAME, fullName: PRODUCT_FULL_NAME },
    title: scrub(input.title),
    documentType: DOCUMENT_TYPE_LABELS[input.kind],
    referenceNumber: input.referenceNumber,
    issuedAtLabel: formatDateTimeIST(input.issuedAt) || 'Not yet issued',
    generatedAtLabel,
    parties,
    columns,
    pages,
    totals,
    verification,
    notes: (input.notes ?? []).map(scrub),
    footer,
    sections: ['header', 'parties', 'line-items', ...(totals.length > 0 ? (['totals'] as const) : []), 'verification', 'footer'],
  };
}
