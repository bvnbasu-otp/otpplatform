import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CONTINUATION_PAGE_ROWS,
  FIRST_PAGE_ROWS,
  PROTECTED_BUYER_LABEL,
  buildProcurementDocumentModel,
  type DocumentLineInput,
  type ProcurementDocumentInput,
} from './lib/procurement-document';
import { PrintableProcurementDocument } from './components/PrintableProcurementDocument';

const IST_TIMESTAMP = /\d{2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} IST/;

const line = (i: number): DocumentLineInput => ({
  description: `Exterior painting — block ${i}`,
  hsnCode: '995473',
  quantity: 2,
  unit: 'Job',
  rate: 50000,
  taxableAmount: 100000,
  gstRate: 18,
  gstAmount: 18000,
  totalAmount: 118000,
});

const poInput: ProcurementDocumentInput = {
  kind: 'PURCHASE_ORDER',
  phase: 'POST_AWARD',
  viewerRole: 'buyer',
  referenceNumber: 'PO-2026-0042',
  recordId: '7d1c2a4e-0000-4000-8000-000000000042',
  title: 'Exterior painting — Tower A',
  issuedAt: '2026-09-10T06:30:00Z',
  generatedAt: '2026-09-26T17:04:00Z',
  buyer: { name: 'Prestige Lakeside RWA', gstin: '29AAAAP1234A1Z5', address: 'Whitefield, Bengaluru' },
  suppliers: [{ id: 's1', name: 'Apex Coatings Pvt Ltd', gstin: '29BBBBA5678B1Z2' }],
  lines: [line(1), line(2)],
  tdsAmount: 4000,
};

function allText(model: ReturnType<typeof buildProcurementDocumentModel>): string {
  return JSON.stringify(model);
}

describe('buildProcurementDocumentModel — A4 professional document', () => {
  it('is an A4 portrait document with every required section in order', () => {
    const m = buildProcurementDocumentModel(poInput);
    expect(m.format).toBe('a4');
    expect(m.orientation).toBe('portrait');
    expect(m.sections).toEqual(['header', 'parties', 'line-items', 'totals', 'verification', 'footer']);
    expect(m.brand).toEqual({ name: 'OTP', fullName: 'Open Trade & Procurement' });
    expect(m.documentType).toBe('Purchase Order');
    expect(m.referenceNumber).toBe('PO-2026-0042');
  });

  it('stamps issue and generation times in IST', () => {
    const m = buildProcurementDocumentModel(poInput);
    expect(m.issuedAtLabel).toBe('10 Sep 2026, 12:00 IST');
    expect(m.generatedAtLabel).toBe('26 Sep 2026, 22:34 IST');
    expect(m.generatedAtLabel).toMatch(IST_TIMESTAMP);
    expect(m.footer.join(' ')).toMatch(IST_TIMESTAMP);
  });

  it('shows From (buyer) and To (supplier) for a PO, and the reverse for a tax invoice', () => {
    const po = buildProcurementDocumentModel(poInput);
    expect(po.parties.from).toMatchObject({ heading: 'From', role: 'Buyer', name: 'Prestige Lakeside RWA' });
    expect(po.parties.to).toMatchObject({ heading: 'To', role: 'Supplier', name: 'Apex Coatings Pvt Ltd' });
    expect(po.parties.to.details).toContain('GSTIN: 29BBBBA5678B1Z2');
    const inv = buildProcurementDocumentModel({ ...poInput, kind: 'TAX_INVOICE' });
    expect(inv.parties.from.role).toBe('Supplier');
    expect(inv.parties.to.role).toBe('Buyer');
  });

  it('itemises qty, rate, GST and totals, then TDS and net payable', () => {
    const m = buildProcurementDocumentModel(poInput);
    expect(m.columns).toEqual(['#', 'Description', 'HSN/SAC', 'Qty', 'Rate', 'Taxable value', 'GST %', 'GST', 'Total']);
    expect(m.pages[0]!.rows[0]).toEqual(['1', 'Exterior painting — block 1', '995473', '2 Job', '₹50,000', '₹1,00,000', '18%', '₹18,000', '₹1,18,000']);
    expect(m.totals).toEqual([
      { label: 'Taxable value', value: '₹2,00,000' },
      { label: 'GST', value: '₹36,000' },
      { label: 'Total (incl. GST)', value: '₹2,36,000' },
      { label: 'TDS withheld', value: '− ₹4,000' },
      { label: 'Net payable to supplier', value: '₹2,32,000', emphasis: true },
    ]);
  });

  it('a PO without TDS data says TDS is withheld per invoice rather than printing ₹0', () => {
    const m = buildProcurementDocumentModel({ ...poInput, tdsAmount: null });
    expect(m.totals.map((t) => t.label)).toEqual(['Taxable value', 'GST', 'Total (incl. GST)', 'TDS']);
  });

  it('uses the system reference, not an invented hash, unless a real digest is supplied', () => {
    const m = buildProcurementDocumentModel(poInput);
    expect(m.verification).toEqual({ label: 'Document reference', value: 'PO-2026-0042 · Record 7d1c2a4e-0000-4000-8000-000000000042' });
    expect(allText(m)).not.toMatch(/VERIFIED_COMPLIANT|cryptographically sealed|blockchain/i);
    const receipt = buildProcurementDocumentModel({ ...poInput, kind: 'DECISION_RECEIPT', verification: { label: 'SHA-256 of receipt fields', value: 'ab'.repeat(32) } });
    expect(receipt.verification.label).toBe('SHA-256 of receipt fields');
  });

  it('footer states that OTP does not hold or settle funds', () => {
    const m = buildProcurementDocumentModel(poInput);
    expect(m.footer.join(' ')).toContain('does not collect, hold, settle, or guarantee');
    expect(allText(m)).not.toMatch(/escrow/i);
  });

  it('numbers pages "Page X of Y" and carries totals only on the last page', () => {
    const one = buildProcurementDocumentModel(poInput);
    expect(one.pages.map((p) => p.label)).toEqual(['Page 1 of 1']);

    const count = FIRST_PAGE_ROWS + CONTINUATION_PAGE_ROWS + 3;
    const many = buildProcurementDocumentModel({ ...poInput, lines: Array.from({ length: count }, (_, i) => line(i + 1)) });
    expect(many.pages.map((p) => p.label)).toEqual(['Page 1 of 3', 'Page 2 of 3', 'Page 3 of 3']);
    expect(many.pages.map((p) => p.rows.length)).toEqual([FIRST_PAGE_ROWS, CONTINUATION_PAGE_ROWS, 3]);
    expect(many.pages.map((p) => p.isLast)).toEqual([false, false, true]);
    expect(many.pages[2]!.rows.at(-1)![0]).toBe(String(count));
  });
});

describe('pre-award pseudonymisation', () => {
  const comparison: ProcurementDocumentInput = {
    kind: 'QUOTE_COMPARISON',
    phase: 'PRE_AWARD',
    viewerRole: 'buyer',
    referenceNumber: 'RFQ-2026-BLR-0049',
    title: 'Exterior painting — Apex Coatings Pvt Ltd lowest so far',
    issuedAt: '2026-09-20T04:30:00Z',
    generatedAt: '2026-09-26T17:04:00Z',
    buyer: { name: 'Prestige Lakeside RWA', gstin: '29AAAAP1234A1Z5' },
    suppliers: [
      { id: 's1', name: 'Apex Coatings Pvt Ltd', gstin: '29BBBBA5678B1Z2' },
      { id: 's2', name: 'Berger Pro Applicators', gstin: '29CCCCB1111C1Z9' },
      { id: 's3', name: 'Colour Craft Services' },
    ],
    quotes: [
      { supplierId: 's2', taxableAmount: 90000, gstAmount: 16200, totalAmount: 106200, deliveryDays: 21 },
      { supplierId: 's1', taxableAmount: 100000, gstAmount: 18000, totalAmount: 118000, deliveryDays: 14 },
      { supplierId: 's3', taxableAmount: 95000, gstAmount: 17100, totalAmount: 112100 },
    ],
    notes: ['Berger Pro Applicators asked for a site visit.'],
  };

  it('replaces every supplier name and GSTIN with Supplier #NN', () => {
    const m = buildProcurementDocumentModel(comparison);
    const text = allText(m);
    for (const real of ['Apex Coatings', 'Berger Pro', 'Colour Craft', '29BBBBA5678B1Z2', '29CCCCB1111C1Z9']) {
      expect(text).not.toContain(real);
    }
    expect(m.identityProtected).toBe(true);
    expect(m.parties.to.details).toEqual(['Supplier #01', 'Supplier #02', 'Supplier #03']);
    expect(m.pages[0]!.rows.map((r) => r[1])).toEqual(['Supplier #02', 'Supplier #03', 'Supplier #01']);
    expect(m.title).toBe('Exterior painting — Supplier #01 lowest so far');
    expect(m.notes).toEqual(['Supplier #02 asked for a site visit.']);
    expect(m.footer[0]).toMatch(/pseudonymised/);
  });

  it('hides the buyer identity from a supplier reader before award', () => {
    const m = buildProcurementDocumentModel({ ...comparison, viewerRole: 'supplier' });
    expect(m.parties.from.name).toBe(PROTECTED_BUYER_LABEL);
    expect(allText(m)).not.toContain('Prestige Lakeside');
    expect(allText(m)).not.toContain('29AAAAP1234A1Z5');
  });

  it('the buyer still sees their own organisation before award', () => {
    const m = buildProcurementDocumentModel(comparison);
    expect(m.parties.from.name).toBe('Prestige Lakeside RWA');
  });

  it('after award, the awarded supplier is named', () => {
    const m = buildProcurementDocumentModel({ ...poInput, phase: 'POST_AWARD' });
    expect(m.identityProtected).toBe(false);
    expect(allText(m)).toContain('Apex Coatings Pvt Ltd');
  });
});

describe('PrintableProcurementDocument', () => {
  it('renders the model: A4 marker, sections, IST time, page labels and totals', () => {
    const model = buildProcurementDocumentModel({ ...poInput, lines: Array.from({ length: FIRST_PAGE_ROWS + 1 }, (_, i) => line(i + 1)) });
    const html = renderToStaticMarkup(React.createElement(PrintableProcurementDocument, { model }));
    expect(html).toContain('data-format="a4"');
    expect(html).toContain('hidden print:block');
    for (const s of ['header', 'parties', 'line-items', 'totals', 'verification', 'footer']) {
      expect(html).toContain(`data-section="${s}"`);
    }
    expect(html).toMatch(IST_TIMESTAMP);
    expect(html).toContain('Page 1 of 2');
    expect(html).toContain('Page 2 of 2');
    expect((html.match(/data-section="totals"/g) ?? []).length).toBe(1);
    expect(html).toContain('Net payable to supplier');
    expect(html).toContain('Document reference: PO-2026-0042');
  });

  it('the orders report no longer prints a fabricated hash or a non-IST timestamp', () => {
    const src = readFileSync(resolve(__dirname, 'components/PrintableProcurementReport.tsx'), 'utf8');
    expect(src).not.toMatch(/VERIFIED_COMPLIANT|AUDIT SEALED|SHA256:/);
    expect(src).toContain('formatDateTimeIST(generatedAt)');
  });

  it('the purchase order page prints the A4 document built from the model', () => {
    const page = readFileSync(resolve(__dirname, '../fulfillment/pages/PurchaseOrderDetailPage.tsx'), 'utf8');
    expect(page).toContain('<PrintableProcurementDocument model={printModel} />');
    expect(page).toContain('buildProcurementDocumentModel(');
  });
});
