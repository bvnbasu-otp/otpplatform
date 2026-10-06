import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/lib/supabase';
import { createSupabaseQueryMock } from '@/lib/supabase-query-mock';
import { cancelPurchaseOrder, fetchPurchaseOrder } from './purchase-orders';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});

const PO_NUMBER = 'PO-PAY-100';

function poRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'po-1',
    po_number: PO_NUMBER,
    status: 'ISSUED',
    total_amount: 118000,
    currency: 'INR',
    supplier_id: 'sup-1',
    rfq_id: 'rfq-1',
    organization_id: 'org-1',
    issued_at: '2026-09-01T00:00:00.000Z',
    acknowledged_at: null,
    created_at: '2026-09-01T00:00:00.000Z',
    payment_structure: 'MILESTONE',
    payment_terms_text: '40/60 milestone',
    payment_schedule: [
      { index: 1, label: 'Advance', percentage: 40, amount: 47200 },
      { index: 2, label: 'On delivery', percentage: 60, amount: 70800 },
    ],
    ...overrides,
  };
}

describe('purchase order client payment mapping and cancel errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null });
  });

  it('maps payment structure and passes a schedule array through', async () => {
    vi.mocked(supabase.from).mockImplementation(() => createSupabaseQueryMock(poRow()));

    const result = await fetchPurchaseOrder(PO_NUMBER);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.paymentStructure).toBe('MILESTONE');
    expect(result.order.paymentSchedule).toEqual([
      { index: 1, label: 'Advance', percentage: 40, amount: 47200 },
      { index: 2, label: 'On delivery', percentage: 60, amount: 70800 },
    ]);
  });

  it('normalises a missing structure and a non-array schedule to null', async () => {
    vi.mocked(supabase.from).mockImplementation(() =>
      createSupabaseQueryMock(poRow({ payment_structure: undefined, payment_schedule: { label: 'not-a-list' } })),
    );

    const objectSchedule = await fetchPurchaseOrder(PO_NUMBER);
    expect(objectSchedule.ok).toBe(true);
    if (!objectSchedule.ok) return;
    expect(objectSchedule.order.paymentStructure).toBeNull();
    expect(objectSchedule.order.paymentSchedule).toBeNull();

    vi.mocked(supabase.from).mockImplementation(() =>
      createSupabaseQueryMock(poRow({ payment_structure: null, payment_schedule: '40-60' })),
    );
    const stringSchedule = await fetchPurchaseOrder(PO_NUMBER);
    expect(stringSchedule.ok).toBe(true);
    if (!stringSchedule.ok) return;
    expect(stringSchedule.order.paymentStructure).toBeNull();
    expect(stringSchedule.order.paymentSchedule).toBeNull();
  });

  it('maps PO-CANCEL-STATE and PO-CANCEL-UNAUTHORIZED to the fixed client sentences', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'PO-CANCEL-STATE: supplier already accepted' },
    });

    const stateResult = await cancelPurchaseOrder('po-1', 'scope was revised');
    expect(stateResult).toEqual({
      ok: false,
      error: 'Purchase order cannot be cancelled after supplier acceptance.',
    });
    expect(supabase.rpc).toHaveBeenCalledWith('cancel_purchase_order_atomic', {
      p_po_id: 'po-1',
      p_reason: 'scope was revised',
    });

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'PO-CANCEL-UNAUTHORIZED' },
    });
    const unauthorized = await cancelPurchaseOrder('po-1', 'scope was revised');
    expect(unauthorized).toEqual({
      ok: false,
      error: 'You are not authorised to cancel this purchase order.',
    });

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'PO-CANCEL-OTHER' },
    });
    const passthrough = await cancelPurchaseOrder('po-1', 'scope was revised');
    expect(passthrough).toEqual({ ok: false, error: 'PO-CANCEL-OTHER' });
  });
});
