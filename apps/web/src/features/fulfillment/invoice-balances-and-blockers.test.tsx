import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  buildInvoiceBalanceRows,
  computeCompletionBlockers,
  pickActionableInvoice,
  sumLiveTdsByInvoice,
  type CompletionBlockerInput,
} from './lib/settlement-state';
import { InvoiceBalancesReview } from './components/InvoiceBalancesReview';
import { CompletionBlockersNotice } from './components/SettlementCta';

const inv1 = {
  id: 'i1', invoiceNumber: 'INV-001', status: 'PARTIALLY_PAID', amount: 118000, paidAmount: 50000, balanceDue: 68000,
  cgstTotal: 9000, sgstTotal: 9000,
};
const inv2 = { id: 'i2', invoiceNumber: 'INV-002', status: 'SUBMITTED', amount: 59000, balanceDue: 59000, taxableTotal: 50000 };
const rejected = { id: 'i3', invoiceNumber: 'INV-003', status: 'REJECTED', amount: 999, balanceDue: 999 };

describe('buildInvoiceBalanceRows (invoice → GST → TDS → paid → outstanding)', () => {
  const tds = sumLiveTdsByInvoice([
    { invoiceId: 'i1', tdsAmount: 2000, status: 'DEDUCTED' },
    { invoiceId: 'i1', tdsAmount: 2000, status: 'VOIDED' },
  ]);

  it('uses stored invoice figures and ignores voided TDS and rejected invoices', () => {
    const { rows, totals } = buildInvoiceBalanceRows([inv1, inv2, rejected], tds, 10000);
    expect(rows.map((r) => r.invoiceNumber)).toEqual(['INV-001', 'INV-002']);
    expect(rows[0]).toMatchObject({ gross: 118000, gst: 18000, tds: 2000, paid: 50000, outstanding: 68000, netPayable: 66000 });
    expect(rows[1]).toMatchObject({ gross: 59000, gst: 9000, tds: 0, paid: 0, outstanding: 59000, netPayable: 59000 });
    expect(totals).toEqual({ gross: 177000, gst: 27000, tds: 2000, paid: 50000, outstanding: 127000, netPayable: 125000, unallocatedAdvances: 10000 });
  });

  it('does not subtract TDS twice when the server balance already nets it', () => {
    const netted = { ...inv1, balanceDue: 66000 };
    const { rows } = buildInvoiceBalanceRows([netted], tds, 0);
    expect(rows[0]).toMatchObject({ paid: 50000, tds: 2000, outstanding: 68000, netPayable: 66000 });
    expect(rows[0]?.netPayable).toBe(netted.balanceDue);
  });

  it('an invoice settled by payment plus TDS shows nothing left to pay', () => {
    const settled = { ...inv1, status: 'PAID', paidAmount: 116000, balanceDue: 0 };
    const { rows } = buildInvoiceBalanceRows([settled], tds, 0);
    expect(rows[0]).toMatchObject({ paid: 116000, tds: 2000, outstanding: 2000, netPayable: 0 });
  });

  it('after the TDS is voided the reopened server balance is what the buyer owes', () => {
    const voidedTds = sumLiveTdsByInvoice([{ invoiceId: 'i1', tdsAmount: 2000, status: 'VOIDED' }]);
    const reopened = { ...inv1, status: 'PARTIALLY_PAID', paidAmount: 116000, balanceDue: 2000 };
    const { rows } = buildInvoiceBalanceRows([reopened], voidedTds, 0);
    expect(rows[0]).toMatchObject({ paid: 116000, tds: 0, outstanding: 2000, netPayable: 2000 });
    expect(rows[0]?.netPayable).toBe(reopened.balanceDue);

    const { paidAmount: _omitted, ...inv1WithoutPaid } = inv1;
    const withoutPaidAmount = { ...inv1WithoutPaid, status: 'PARTIALLY_PAID', balanceDue: 2000 };
    const fallback = buildInvoiceBalanceRows([withoutPaidAmount], voidedTds, 0).rows[0];
    expect(fallback).toMatchObject({ paid: 116000, tds: 0, outstanding: 2000, netPayable: 2000 });
  });

  it('opens the panel on the invoice the buyer must act on, not merely the latest', () => {
    const paidLatest = { id: 'i9', invoiceNumber: 'INV-009', status: 'PAID', amount: 10, balanceDue: 0 };
    expect(pickActionableInvoice([inv2, inv1, paidLatest])?.id).toBe('i1');
    expect(pickActionableInvoice([paidLatest, inv2])?.id).toBe('i2');
    expect(pickActionableInvoice([paidLatest])?.id).toBe('i9');
    expect(pickActionableInvoice([])).toBeNull();
  });
});

describe('InvoiceBalancesReview', () => {
  it('renders real invoice #, gross, GST, TDS, paid, outstanding, advances and status', () => {
    const { rows, totals } = buildInvoiceBalanceRows([inv1, inv2], { i1: 2000 }, 10000);
    const html = renderToStaticMarkup(
      React.createElement(InvoiceBalancesReview, { rows, totals, poAmount: 236000, role: 'buyer' }),
    );
    expect(html).toContain('data-testid="invoice-balances-review"');
    expect((html.match(/data-testid="invoice-balance-row"/g) ?? []).length).toBe(2);
    for (const s of ['INV-001', 'INV-002', '₹1,18,000', '₹18,000', '−₹2,000', '₹50,000', '₹68,000', 'Partially paid', 'Awaiting approval']) {
      expect(html).toContain(s);
    }
    expect(html).toMatch(/data-testid="balances-net-payable">₹1,25,000/);
    expect(html).toMatch(/data-testid="balances-advances">₹10,000/);
    expect(html).not.toMatch(/placeholder|lorem|Assigned Supplier/i);
  });

  it('shows a meaningful empty state with the PO value when nothing is invoiced', () => {
    const { rows, totals } = buildInvoiceBalanceRows([], {}, 0);
    const html = renderToStaticMarkup(
      React.createElement(InvoiceBalancesReview, { rows, totals, poAmount: 236000, role: 'supplier' }),
    );
    expect(html).toContain('data-testid="invoice-balances-empty"');
    expect(html).toContain('You have not submitted an invoice');
    expect(html).toContain('₹2,36,000');
    expect(html).not.toContain('invoice-balance-row');
  });

  it('the TDS / Form 16A panel receives the real supplier name, not a placeholder', () => {
    const panel = readFileSync(resolve(__dirname, 'components/InvoicePaymentPanel.tsx'), 'utf8');
    const page = readFileSync(resolve(__dirname, 'pages/PurchaseOrderDetailPage.tsx'), 'utf8');
    expect(panel).not.toContain('supplierName="Assigned Supplier"');
    expect(panel).toMatch(/supplierName=\{supplierName\?\.trim\(\)/);
    expect(page.match(/supplierName=\{order\.supplierLegalName \|\| order\.supplierName\}/g)).toHaveLength(2);
    expect(page).not.toContain("'+91 98450 12345'");
  });

  it('Invoice and Settlement tabs render different panel views', () => {
    const page = readFileSync(resolve(__dirname, 'pages/PurchaseOrderDetailPage.tsx'), 'utf8');
    expect(page).toContain('view="INVOICE"');
    expect(page).toContain('view="SETTLEMENT"');
  });
});

describe('computeCompletionBlockers names the actual blockers', () => {
  const ready: CompletionBlockerInput = {
    hasWorkOrder: true,
    workOrderStatus: 'COMPLETED',
    progressPercent: 100,
    inspectionAccepted: true,
    invoices: [{ id: 'p', invoiceNumber: 'INV-010', status: 'PAID', amount: 118000, paidAmount: 118000, balanceDue: 0 }],
    hasPaymentAwaitingVerification: false,
    poTotal: 118000,
    allocatedTotal: 118000,
  };
  const codes = (i: Partial<CompletionBlockerInput>) => computeCompletionBlockers({ ...ready, ...i }).map((b) => b.code);

  it('no blockers when fully delivered, inspected, invoiced and paid', () => {
    expect(computeCompletionBlockers(ready)).toEqual([]);
  });

  it('milestones below 100% plus pending inspection', () => {
    expect(codes({ progressPercent: 60, inspectionAccepted: false })).toEqual(['MILESTONES_INCOMPLETE', 'INSPECTION_PENDING']);
    const msg = computeCompletionBlockers({ ...ready, progressPercent: 60, inspectionAccepted: false })[0]!.message;
    expect(msg).toContain('60%');
  });

  it('inspection pending at 100% progress', () => {
    expect(codes({ inspectionAccepted: false })).toEqual(['INSPECTION_PENDING']);
  });

  it('no invoice submitted', () => {
    expect(codes({ invoices: [], allocatedTotal: 0 })).toEqual(['NO_INVOICE', 'ALLOCATED_BELOW_PO_TOTAL']);
  });

  it('invoice awaiting approval and an unpaid approved invoice, with references and amounts', () => {
    const blockers = computeCompletionBlockers({
      ...ready,
      invoices: [
        { id: 'a', invoiceNumber: 'INV-011', status: 'SUBMITTED', amount: 50000, balanceDue: 50000 },
        { id: 'b', invoiceNumber: 'INV-012', status: 'APPROVED', amount: 68000, balanceDue: 68000 },
      ],
      allocatedTotal: 0,
    });
    expect(blockers.map((b) => b.code)).toEqual(['INVOICE_AWAITING_APPROVAL', 'INVOICE_UNPAID', 'ALLOCATED_BELOW_PO_TOTAL']);
    expect(blockers[0]!.message).toContain('INV-011');
    expect(blockers[1]!.message).toContain('INV-012');
    expect(blockers[1]!.message).toContain('₹68,000');
  });

  it('open dispute and unverified payment', () => {
    expect(codes({ workOrderStatus: 'DISPUTED', hasPaymentAwaitingVerification: true })).toEqual(['DISPUTE_OPEN', 'PAYMENT_UNVERIFIED']);
  });

  it('labels which checks the server enforces (migration 00171 trigger) and which are UI workflow only', () => {
    const all = computeCompletionBlockers({
      ...ready,
      workOrderStatus: 'DISPUTED',
      progressPercent: 50,
      inspectionAccepted: false,
      invoices: [{ id: 'b', invoiceNumber: 'INV-012', status: 'APPROVED', amount: 68000, balanceDue: 68000 }],
      hasPaymentAwaitingVerification: true,
      allocatedTotal: 0,
    });
    const by = Object.fromEntries(all.map((b) => [b.code, b.enforcedBy]));
    expect(by).toEqual({
      DISPUTE_OPEN: 'WORKFLOW',
      MILESTONES_INCOMPLETE: 'WORKFLOW',
      INSPECTION_PENDING: 'WORKFLOW',
      INVOICE_UNPAID: 'SERVER',
      PAYMENT_UNVERIFIED: 'WORKFLOW',
      ALLOCATED_BELOW_PO_TOTAL: 'SERVER',
    });
  });

  it('notice lists each blocker instead of a generic message', () => {
    const blockers = computeCompletionBlockers({ ...ready, inspectionAccepted: false, invoices: [], allocatedTotal: 0 });
    const html = renderToStaticMarkup(React.createElement(CompletionBlockersNotice, { blockers }));
    expect(html).toContain('3 items outstanding');
    expect(html).toContain('Buyer delivery inspection has not been signed off.');
    expect(html).toContain('No invoice has been submitted by the supplier.');
    expect(html).toContain('(rejected by the server until resolved)');
    expect(html).toContain('(workflow check on this screen)');
    expect(renderToStaticMarkup(React.createElement(CompletionBlockersNotice, { blockers: [] }))).toBe('');
  });

  it('the page no longer shows the generic settlement-incomplete message', () => {
    const page = readFileSync(resolve(__dirname, 'pages/PurchaseOrderDetailPage.tsx'), 'utf8');
    expect(page).not.toContain('Cannot Complete Purchase Order (Settlement Incomplete)');
    expect(page).not.toContain('Pending invoices and settlements must be 100% verified');
    expect(page).toContain('<CompletionBlockersNotice blockers={completionBlockers} />');
  });
});
