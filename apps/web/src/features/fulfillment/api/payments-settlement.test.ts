import { describe, expect, it, vi, beforeEach } from 'vitest';
import { verifyPayment } from './payments';
import { supabase } from '@/lib/supabase';

vi.mock('@/features/auth/user-role', () => ({
  fetchCurrentProfile: vi.fn().mockResolvedValue({
    profileId: 'user-prof-1',
    organizationId: 'org-1',
  }),
}));

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

  it('RED-H2-01 (API): recordInvoicePayment invokes atomic RPC and falls back to atomic application transaction', async () => {
    const { recordInvoicePayment } = await import('./payments');

    // 1. Successful RPC invocation
    (supabase as any).rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        payment_id: 'pay-atomic-rpc-1',
        allocation_id: 'alloc-atomic-rpc-1',
      },
      error: null,
    });

    const rpcRes = await recordInvoicePayment('inv-rpc-1', 5000, 'UPI', 'UTR-RPC-1');
    expect(rpcRes.ok).toBe(true);
    if (rpcRes.ok) {
      expect(rpcRes.paymentId).toBe('pay-atomic-rpc-1');
      expect(rpcRes.allocationId).toBe('alloc-atomic-rpc-1');
    }

    // 2. Fallback transaction rollback when allocation fails in mock mode
    (supabase as any).rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'function public.record_invoice_payment_atomic does not exist' },
    });

    const mockInvoice = {
      id: 'inv-atomic-1',
      amount: 5000,
      paid_amount: 0,
      balance_due: 5000,
      purchase_order_id: 'po-1',
      status: 'APPROVED',
    };

    const mockDelete = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    let paymentInserted = false;
    let allocationAttempted = false;

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'invoices') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: mockInvoice, error: null }),
            }),
          }),
        };
      }
      if (table === 'payments') {
        return {
          insert: () => ({
            select: () => ({
              single: () => {
                paymentInserted = true;
                return Promise.resolve({ data: { id: 'pay-atomic-1' }, error: null });
              },
            }),
          }),
          delete: () => ({
            eq: mockDelete,
          }),
        };
      }
      if (table === 'payment_allocations') {
        return {
          insert: () => ({
            select: () => ({
              single: () => {
                allocationAttempted = true;
                // Simulate allocation DB failure
                return Promise.resolve({ data: null, error: { message: 'Over-allocation DB Trigger Error' } });
              },
            }),
          }),
        };
      }
      return {};
    });

    const res = await recordInvoicePayment('inv-atomic-1', 5000, 'UPI', 'UTR-FAIL-1');
    expect(res.ok).toBe(false);
    expect(paymentInserted).toBe(true);
    expect(allocationAttempted).toBe(true);
    expect(mockDelete).toHaveBeenCalled(); // Payment deletion rollback called
  });

  it('H2-FINAL-02: Production environment fails closed when atomic RPC fails (zero non-atomic writes)', async () => {
    const { recordInvoicePayment } = await import('./payments');

    const originalNodeEnv = process.env.NODE_ENV;
    const originalVitest = process.env.VITEST;

    try {
      // Temporarily simulate production environment
      (process.env as any).NODE_ENV = 'production';
      delete (process.env as any).VITEST;

      (supabase as any).rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database RPC connection timeout' },
      });

      const prodRes = await recordInvoicePayment('inv-prod-1', 5000, 'UPI', 'UTR-PROD-1');
      expect(prodRes.ok).toBe(false);
      if (!prodRes.ok) {
        expect(prodRes.error).toContain('FAIL-CLOSED');
      }
    } finally {
      (process.env as any).NODE_ENV = originalNodeEnv;
      if (originalVitest !== undefined) {
        (process.env as any).VITEST = originalVitest;
      }
    }
  });

  it('H2-FINAL-01: Handles idempotent replay cleanly from atomic RPC', async () => {
    const { recordInvoicePayment } = await import('./payments');

    (supabase as any).rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        idempotent_replay: true,
        payment_id: 'pay-existing-1',
        allocation_id: 'alloc-existing-1',
      },
      error: null,
    });

    const replayRes = await recordInvoicePayment('inv-1', 5000, 'UPI', 'UTR-REPLAY', 'INR', 'po-1', 'IDEMP-KEY-999');
    expect(replayRes.ok).toBe(true);
    if (replayRes.ok) {
      expect(replayRes.paymentId).toBe('pay-existing-1');
      expect(replayRes.allocationId).toBe('alloc-existing-1');
    }
  });
});
