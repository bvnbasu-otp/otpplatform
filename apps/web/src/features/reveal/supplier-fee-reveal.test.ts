import { describe, expect, it, vi } from 'vitest';
import {
  fetchSupplierFeeDetails,
  acceptSupplierFeeTerms,
  paySupplierFeeSimulated,
  requestSupplierFeeRefund,
} from './api/reveal';

const rpcMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

describe('Supplier Platform Fee & Identity Reveal API Client', () => {
  const sampleRfqId = 'f2000000-0000-4000-8000-000000000001';

  it('fetches supplier platform fee details correctly', async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        ok: true,
        rfq_id: sampleRfqId,
        award_id: 'a2000001-0000-4000-8000-000000000002',
        quote_id: 'q1000000-0000-4000-8000-000000000001',
        supplier_id: 's0000000-0000-4000-8000-000000000001',
        agreed_transaction_value: 100000,
        fee_rate_percent: 0.5,
        fee_amount: 500,
        gst_rate_percent: 18,
        gst_amount: 90,
        total_fee_payable: 590,
        currency: 'INR',
        status: 'PENDING',
        non_refund_terms_accepted: false,
        terms_version: null,
        paid_at: null,
        non_refund_policy_summary: 'Non-refundable once revealed',
      },
      error: null,
    });

    const res = await fetchSupplierFeeDetails(sampleRfqId);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.feeDetails.agreedTransactionValue).toBe(100000);
      expect(res.feeDetails.feeAmount).toBe(500);
      expect(res.feeDetails.gstAmount).toBe(90);
      expect(res.feeDetails.totalFeePayable).toBe(590);
      expect(res.feeDetails.status).toBe('PENDING');
      expect(res.feeDetails.nonRefundTermsAccepted).toBe(false);
    }
  });

  it('records terms acceptance for supplier platform fee', async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        ok: true,
        rfq_id: sampleRfqId,
        terms_accepted: true,
        terms_version: '2026-10-V1',
        accepted_at: '2026-10-29T18:00:00.000Z',
      },
      error: null,
    });

    const res = await acceptSupplierFeeTerms(sampleRfqId, '2026-10-V1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.termsVersion).toBe('2026-10-V1');
      expect(res.acceptedAt).toBe('2026-10-29T18:00:00.000Z');
    }
  });

  it('processes simulated fee payment and returns succeeded transaction', async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        ok: true,
        fee_order_id: 'fee-order-123',
        status: 'SUCCEEDED',
        total_fee_paid: 590,
      },
      error: null,
    });

    const res = await paySupplierFeeSimulated(sampleRfqId, 'key-123', 'REF-999');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.feeOrderId).toBe('fee-order-123');
      expect(res.status).toBe('SUCCEEDED');
      expect(res.totalPaid).toBe(590);
    }
  });

  it('submits refund exception request under valid policy categories', async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        ok: true,
        rfq_id: sampleRfqId,
        status: 'DISPUTED',
        exception_category: 'DUPLICATE_PAYMENT',
        message: 'Refund dispute submitted for admin adjudication under exception policy.',
      },
      error: null,
    });

    const res = await requestSupplierFeeRefund(sampleRfqId, 'Double debited', 'DUPLICATE_PAYMENT');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.status).toBe('DISPUTED');
      expect(res.message).toContain('exception policy');
    }
  });

  it('handles backend error during fee retrieval', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'Database connection error' },
    });

    const res = await fetchSupplierFeeDetails(sampleRfqId);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('Database connection error');
    }
  });
});
