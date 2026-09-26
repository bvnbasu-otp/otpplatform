import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  RECORD_OFF_PLATFORM_PAYMENT_LABEL,
  resolveSettlementAction,
  resolveSettlementCtaPlacement,
  type FulfillmentTab,
  type SettlementActionKind,
  type SettlementStateInput,
} from './lib/settlement-state';
import { SettlementCta } from './components/SettlementCta';
import { PoActionButtons } from './components/FulfillmentStatus';
import { InvoicePaymentPanel } from './components/InvoicePaymentPanel';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});

const base: SettlementStateInput = {
  role: 'buyer',
  poStatus: 'IN_PROGRESS',
  hasWorkOrder: true,
  workOrderStatus: 'IN_PROGRESS',
  progressPercent: 100,
  inspectionAccepted: true,
  invoices: [],
  hasPaymentAwaitingVerification: false,
  isFullySettled: false,
};

const approved = { id: 'i1', status: 'APPROVED', amount: 118000, paidAmount: 0, balanceDue: 118000 };
const submitted = { id: 'i2', status: 'SUBMITTED', amount: 50000, balanceDue: 50000 };
const paid = { id: 'i3', status: 'PAID', amount: 118000, paidAmount: 118000, balanceDue: 0 };

const STATES: Array<{ name: string; state: SettlementStateInput; buyer: SettlementActionKind; supplier: SettlementActionKind }> = [
  { name: 'cancelled', state: { ...base, poStatus: 'CANCELLED' }, buyer: 'PO_CANCELLED', supplier: 'PO_CANCELLED' },
  { name: 'completed', state: { ...base, poStatus: 'COMPLETED', invoices: [paid], isFullySettled: true }, buyer: 'PO_CLOSED', supplier: 'PO_CLOSED' },
  { name: 'disputed', state: { ...base, workOrderStatus: 'DISPUTED', invoices: [approved] }, buyer: 'DISPUTE_OPEN', supplier: 'DISPUTE_OPEN' },
  { name: 'no work order', state: { ...base, hasWorkOrder: false, workOrderStatus: null, progressPercent: 0, inspectionAccepted: false }, buyer: 'START_TRACKING', supplier: 'START_TRACKING' },
  { name: 'in delivery', state: { ...base, progressPercent: 40, inspectionAccepted: false }, buyer: 'AWAIT_DELIVERY', supplier: 'REPORT_PROGRESS' },
  { name: 'awaiting sign-off', state: { ...base, progressPercent: 100, inspectionAccepted: false }, buyer: 'SIGN_OFF_DELIVERY', supplier: 'AWAIT_DELIVERY_SIGNOFF' },
  { name: 'accepted, no invoice', state: base, buyer: 'AWAIT_INVOICE', supplier: 'SUBMIT_INVOICE' },
  { name: 'invoice submitted', state: { ...base, invoices: [submitted] }, buyer: 'REVIEW_INVOICE', supplier: 'AWAIT_INVOICE_APPROVAL' },
  { name: 'invoice approved & unpaid', state: { ...base, invoices: [approved] }, buyer: 'RECORD_OFF_PLATFORM_PAYMENT', supplier: 'AWAIT_BUYER_PAYMENT' },
  { name: 'payment recorded', state: { ...base, invoices: [approved], hasPaymentAwaitingVerification: true }, buyer: 'VERIFY_PAYMENT', supplier: 'AWAIT_PAYMENT_VERIFICATION' },
  { name: 'fully settled', state: { ...base, invoices: [paid], isFullySettled: true }, buyer: 'COMPLETE_PO', supplier: 'AWAIT_PO_CLOSURE' },
];

const TABS: FulfillmentTab[] = ['OVERVIEW', 'MILESTONES', 'INVOICE', 'PAYMENT'];

function ctaCount(html: string): number {
  return (html.match(/data-testid="settlement-cta"/g) ?? []).length;
}

describe('resolveSettlementAction truth table', () => {
  for (const row of STATES) {
    it(`${row.name}: buyer → ${row.buyer}, supplier → ${row.supplier}`, () => {
      expect(resolveSettlementAction({ ...row.state, role: 'buyer' }).kind).toBe(row.buyer);
      expect(resolveSettlementAction({ ...row.state, role: 'supplier' }).kind).toBe(row.supplier);
    });
  }

  it('rejected invoices never make a PO payable', () => {
    const action = resolveSettlementAction({ ...base, invoices: [{ id: 'r', status: 'REJECTED', amount: 1000, balanceDue: 1000 }] });
    expect(action.kind).toBe('AWAIT_INVOICE');
  });

  it('pilot wording: settlement is recorded off platform, never paid through OTP', () => {
    const labels = STATES.flatMap((r) => [
      resolveSettlementAction({ ...r.state, role: 'buyer' }),
      resolveSettlementAction({ ...r.state, role: 'supplier' }),
    ]);
    for (const a of labels) {
      expect(`${a.label} ${a.description}`).not.toMatch(/pay now|pay via otp|escrow|release funds|otp wallet/i);
    }
    const record = resolveSettlementAction({ ...base, invoices: [approved] });
    expect(record.label).toBe(RECORD_OFF_PLATFORM_PAYMENT_LABEL);
    expect(record.description).toMatch(/does not collect, hold or settle funds/);
  });

  it('only the owning party gets an actionable CTA', () => {
    for (const row of STATES) {
      const b = resolveSettlementAction({ ...row.state, role: 'buyer' });
      const s = resolveSettlementAction({ ...row.state, role: 'supplier' });
      if (row.buyer !== row.supplier) expect(b.actionable && s.actionable).toBe(false);
    }
  });
});

describe('SettlementCta renders exactly one CTA per state per viewport', () => {
  for (const row of STATES) {
    for (const role of ['buyer', 'supplier'] as const) {
      for (const tab of TABS) {
        const action = resolveSettlementAction({ ...row.state, role });
        const placement = resolveSettlementCtaPlacement(action, tab);
        it(`${row.name} / ${role} / ${tab} → ${placement}`, () => {
          const html = renderToStaticMarkup(
            React.createElement(SettlementCta, { action, placement, onActivate: () => {} }),
          );
          if (placement === 'INLINE') {
            // The tab's own control (payment form, verify, approve, sign-off, stepper) is the CTA.
            expect(action.actionable).toBe(true);
            expect(action.targetTab).toBe(tab);
            expect(ctaCount(html)).toBe(0);
          } else {
            expect(ctaCount(html)).toBe(1);
            // One element serves mobile and desktop: no hidden/visible responsive twin.
            const cls = html.match(/<button[^>]*class="([^"]*)"/)?.[1] ?? '';
            expect(cls).toContain('w-full sm:w-auto');
            expect(cls.split(/\s+/).some((c) => c === 'hidden' || c.endsWith(':hidden'))).toBe(false);
            expect(html).toContain(`data-settlement-kind="${action.kind}"`);
            if (!action.actionable) expect(html).toContain('disabled=""');
          }
        });
      }
    }
  }
});

describe('PurchaseOrderDetailPage wires one settlement CTA', () => {
  const page = readFileSync(resolve(__dirname, 'pages/PurchaseOrderDetailPage.tsx'), 'utf8');
  const panel = readFileSync(resolve(__dirname, 'components/InvoicePaymentPanel.tsx'), 'utf8');

  it('renders SettlementCta once, driven by resolveSettlementAction', () => {
    expect(page.match(/<SettlementCta\b/g)).toHaveLength(1);
    expect(page).toMatch(/resolveSettlementAction\(\{/);
    expect(page).toMatch(/placement=\{resolveSettlementCtaPlacement\(settlementAction, activeTab\)\}/);
  });

  it('removes the duplicated per-tab settlement buttons', () => {
    expect(page).not.toContain('continue-to-payment-btn');
    expect(page).not.toContain('continue-to-invoice-btn');
    expect(page).not.toContain('Review Invoices &amp; Settle');
    expect(page).not.toContain('onGoToInvoices=');
    expect(page).not.toMatch(/Complete Purchase Order →/);
  });

  it('the payment panel no longer presents OTP as a settlement destination', () => {
    expect(panel).not.toMatch(/otp\.settle@|HDFC0000001|Virtual Settlement Account|upi:\/\/pay/);
    expect(panel).not.toContain('Record Direct Payment');
    expect(panel).toContain('RECORD_OFF_PLATFORM_PAYMENT_LABEL');
  });

  it('buyer header actions do not offer a second "Mark completed" button', () => {
    const html = renderToStaticMarkup(
      React.createElement(PoActionButtons, { status: 'IN_PROGRESS', role: 'buyer', onAction: () => {} }),
    );
    expect(html).not.toContain('Mark completed');
  });

  it('supplier PO acceptance shows the pilot fee waiver, not a settlement deduction', () => {
    const html = renderToStaticMarkup(
      React.createElement(PoActionButtons, { status: 'ISSUED', role: 'supplier', onAction: () => {}, poTotalAmount: 100000 }),
    );
    expect(html).toContain('₹0 · Waived');
    expect(html).not.toMatch(/0\.5%|deducted only upon settlement payout|Net Payout/);
  });
});

describe('InvoicePaymentPanel views', () => {
  const render = (view: 'INVOICE' | 'SETTLEMENT') =>
    renderToStaticMarkup(
      React.createElement(InvoicePaymentPanel, { workOrderId: 'wo-1', supplierId: 's-1', supplierName: 'Apex Coatings Pvt Ltd', role: 'buyer', poAmount: 118000, view }),
    );

  it('Invoice tab shows invoicing, not the payment record', () => {
    const html = render('INVOICE');
    expect(html).toContain('Progressive Invoicing');
    expect(html).not.toContain('Off-Platform Payment Record');
    expect(html).not.toContain('invoice-balances');
  });

  it('Settlement tab shows balances and the off-platform notice, not the invoicing ledger', () => {
    const html = render('SETTLEMENT');
    expect(html).toContain('data-testid="invoice-balances-empty"');
    expect(html).toContain('data-testid="off-platform-settlement-notice"');
    expect(html).toContain('Off-Platform Payment Record');
    expect(html).not.toContain('Progressive Invoicing');
  });
});
