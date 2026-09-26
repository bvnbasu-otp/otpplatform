import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { supabase } from '@/lib/supabase';
import { TdsWithholdingPanel } from './components/TdsWithholdingPanel';
import { applyTdsWithholdingRpc, type TdsDeductionRecord } from './api/payments';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});

const baseProps = {
  organizationId: 'org-1',
  invoiceId: 'inv-1',
  invoiceNumber: 'INV-1',
  invoiceAmount: 118000,
  gstAmount: 18000,
  supplierName: 'Supplier',
  supplierPan: 'AAACB1234C',
  isBuyerUser: true,
};

function render(props: Partial<React.ComponentProps<typeof TdsWithholdingPanel>> = {}) {
  return renderToStaticMarkup(React.createElement(TdsWithholdingPanel, { ...baseProps, ...props }));
}

describe('TDS withholding panel (GST-exclusive base, single deduction)', () => {
  it('previews TDS on the value excluding GST: ₹2,000 on ₹1,18,000 incl. ₹18,000 GST', () => {
    const html = render();
    expect(html).toContain('data-testid="tds-base-breakdown"');
    expect(html).toContain('₹1,18,000');
    expect(html).toContain('₹18,000');
    expect(html).toContain('₹1,00,000');
    expect(html).toContain('₹2,000');
    expect(html).toContain('Net Payable: ₹1,16,000');
    expect(html).not.toContain('₹2,360');
  });

  it('hides the apply form once a live deduction exists (no double deduction)', () => {
    const existing: TdsDeductionRecord = {
      id: 'd1',
      section: '194C',
      status: 'DEDUCTED',
      taxableAmount: 100000,
      tdsRate: 2,
      tdsAmount: 2000,
      financialYear: '2026-2027',
      deducteePan: 'AAACB1234C',
      panStatus: 'VALID',
    } as TdsDeductionRecord;
    const html = render({ existingDeductions: [existing] });
    expect(html).toContain('data-testid="tds-already-recorded"');
    expect(html).not.toContain('data-testid="tds-apply-form"');
  });

  it('allows a new deduction when the only previous one was voided', () => {
    const voided = { id: 'd0', section: '194C', status: 'VOIDED', taxableAmount: 100000, tdsRate: 2, tdsAmount: 2000, financialYear: '2026-2027', panStatus: 'VALID' } as TdsDeductionRecord;
    expect(render({ existingDeductions: [voided] })).toContain('data-testid="tds-apply-form"');
  });

  it('sends the GST-exclusive taxable base to the ledger RPC and surfaces the server-recorded amount', () => {
    const src = readFileSync(resolve(__dirname, 'components/TdsWithholdingPanel.tsx'), 'utf8');
    expect(src).toMatch(/taxableAmount: preview\.taxableAmount/);
    expect(src).toMatch(/gstAmount,\s*\n\s*section,/);
    expect(src).toMatch(/res\.tdsAmount \?\? preview\.statutoryTdsAmount/);
  });

  it('applyTdsWithholdingRpc returns the tds_amount persisted by apply_tds_withholding_atomic', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: { ok: true, tds_deduction_id: 'd9', tds_deduction: { tds_amount: 2000 } },
      error: null,
    } as any);
    const res = await applyTdsWithholdingRpc({
      organizationId: 'org-1', invoiceId: 'inv-1', section: '194C', taxableAmount: 100000, tdsRate: 2,
    });
    expect(res).toEqual({ ok: true, deductionId: 'd9', tdsAmount: 2000, idempotentReplay: false });
    expect(vi.mocked(supabase.rpc).mock.calls.at(-1)?.[1]).toMatchObject({ p_taxable_amount: 100000, p_tds_rate: 2 });
  });

  it('applyTdsWithholdingRpc reports the server-derived base and an idempotent replay', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        ok: true,
        idempotent_replay: true,
        tds_deduction_id: 'd1',
        taxable_amount: 100000,
        tds_deduction: { tds_amount: 2000, taxable_amount: 100000 },
      },
      error: null,
    } as any);
    const res = await applyTdsWithholdingRpc({
      organizationId: 'org-1', invoiceId: 'inv-1', section: '194C', taxableAmount: 118000, tdsRate: 2,
    });
    expect(res).toEqual({ ok: true, deductionId: 'd1', tdsAmount: 2000, taxableAmount: 100000, idempotentReplay: true });
  });

  it('the panel tells the buyer when TDS was already recorded instead of claiming a new deduction', () => {
    const src = readFileSync(resolve(__dirname, 'components/TdsWithholdingPanel.tsx'), 'utf8');
    expect(src).toMatch(/res\.idempotentReplay/);
    expect(src).toMatch(/already recorded/);
  });

  it('InvoicePaymentPanel passes the stored GST split to the TDS panel', () => {
    const src = readFileSync(resolve(__dirname, 'components/InvoicePaymentPanel.tsx'), 'utf8');
    expect(src).toMatch(/gstAmount=\{deriveInvoiceTdsBase\(activeInvoice\)\.gstAmount\}/);
  });
});
