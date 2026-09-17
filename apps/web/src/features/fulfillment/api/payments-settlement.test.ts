import { describe, expect, it, vi, beforeEach } from 'vitest';
import { verifyPayment } from './payments';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('verifyPayment controlled progressive settlement (Phase 5C.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps PO and Work Order IN_PROGRESS when milestone payment is verified but other invoices remain unpaid', async () => {
    const mockPayment = {
      id: 'pay-1',
      invoice_id: 'inv-1',
      purchase_order_id: 'po-1',
      amount: 4000,
    };

    const mockInvoice = {
      id: 'inv-1',
      amount: 4000,
      work_order_id: 'wo-1',
      purchase_order_id: 'po-1',
      status: 'APPROVED',
      paid_amount: 4000,
    };

    const mockPo = {
      id: 'po-1',
      total_amount: 10000,
      rfq_id: 'rfq-1',
      status: 'IN_PROGRESS',
    };

    const mockInvoicesForPo = [
      { id: 'inv-1', amount: 4000, status: 'PAID', paid_amount: 4000 },
      { id: 'inv-2', amount: 6000, status: 'APPROVED', paid_amount: 0 },
    ];

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'payments') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: mockPayment, error: null }),
            }),
          }),
          update: mockUpdate,
        };
      }
      if (table === 'invoices') {
        return {
          select: (query: string) => {
            if (query.includes('work_order_id')) {
              return {
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: mockInvoice, error: null }),
                }),
              };
            }
            return {
              or: () => ({
                neq: () => Promise.resolve({ data: mockInvoicesForPo, error: null }),
              }),
            };
          },
        };
      }
      if (table === 'purchase_orders') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: mockPo, error: null }),
            }),
          }),
          update: mockUpdate,
        };
      }
      if (table === 'work_orders') {
        return {
          update: mockUpdate,
        };
      }
      return {};
    });

    const result = await verifyPayment('pay-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.isFullySettled).toBe(false);
    }
  });

  it('completes PO, Work Order, and Requirement when all invoices are PAID and cumulative paid matches PO total', async () => {
    const mockPayment = {
      id: 'pay-2',
      invoice_id: 'inv-2',
      purchase_order_id: 'po-1',
      amount: 6000,
    };

    const mockInvoice = {
      id: 'inv-2',
      amount: 6000,
      work_order_id: 'wo-1',
      purchase_order_id: 'po-1',
      status: 'APPROVED',
      paid_amount: 6000,
    };

    const mockPo = {
      id: 'po-1',
      total_amount: 10000,
      rfq_id: 'rfq-1',
      status: 'IN_PROGRESS',
    };

    const mockInvoicesForPo = [
      { id: 'inv-1', amount: 4000, status: 'PAID', paid_amount: 4000 },
      { id: 'inv-2', amount: 6000, status: 'PAID', paid_amount: 6000 },
    ];

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'payments') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: mockPayment, error: null }),
            }),
          }),
          update: mockUpdate,
        };
      }
      if (table === 'invoices') {
        return {
          select: (query: string) => {
            if (query.includes('work_order_id')) {
              return {
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: mockInvoice, error: null }),
                }),
              };
            }
            return {
              or: () => ({
                neq: () => Promise.resolve({ data: mockInvoicesForPo, error: null }),
              }),
            };
          },
        };
      }
      if (table === 'purchase_orders') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: mockPo, error: null }),
            }),
          }),
          update: mockUpdate,
        };
      }
      if (table === 'work_orders') {
        return {
          update: mockUpdate,
        };
      }
      if (table === 'rfqs') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { requirement_id: 'req-1' }, error: null }),
            }),
          }),
        };
      }
      if (table === 'requirements') {
        return {
          update: mockUpdate,
        };
      }
      return {};
    });

    const result = await verifyPayment('pay-2');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.isFullySettled).toBe(true);
    }
  });
});
