import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchReviewEligibility, submitBuyerReview } from './api/submit-review';
import { supabase } from '@/lib/supabase';
import { fetchLifecycleSignals } from '@/features/lifecycle/api/fetch-lifecycle';
import { fetchPerformanceRecords } from '@/features/performance/api/fetch-performance';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});

vi.mock('@/features/lifecycle/api/fetch-lifecycle', () => ({
  fetchLifecycleSignals: vi.fn(),
}));

vi.mock('@/features/performance/api/fetch-performance', () => ({
  fetchPerformanceRecords: vi.fn(),
}));

describe('Review Feature Module Tests', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
  });

  afterEach(() => {
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
  });

  it('rejects review eligibility if review has already been submitted', async () => {
    vi.mocked(fetchLifecycleSignals).mockResolvedValue({
      ok: true,
      signals: {
        rfqId: 'rfq-1',
        requirementStatus: 'SETTLED',
        rfqStatus: 'AWARDED',
        revealStatus: 'REVEALED',
        poStatus: 'CONFIRMED',
        workOrderStatus: 'COMPLETED',
        paymentStatus: 'VERIFIED',
      },
    } as any);

    vi.mocked(fetchPerformanceRecords).mockResolvedValue({
      ok: true,
      records: [{ id: 'perf-1' }],
    } as any);

    const res = await fetchReviewEligibility('rfq-1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.eligibility.eligible).toBe(false);
      expect(res.eligibility.reason).toContain('already submitted');
    }
  });

  it('rejects review eligibility if work order is not yet completed', async () => {
    vi.mocked(fetchLifecycleSignals).mockResolvedValue({
      ok: true,
      signals: {
        rfqId: 'rfq-2',
        requirementStatus: 'FULFILLMENT',
        rfqStatus: 'AWARDED',
        revealStatus: 'REVEALED',
        poStatus: 'ISSUED',
        workOrderStatus: 'IN_PROGRESS',
        paymentStatus: 'PENDING',
      },
    } as any);

    vi.mocked(fetchPerformanceRecords).mockResolvedValue({
      ok: true,
      records: [],
    } as any);

    const res = await fetchReviewEligibility('rfq-2');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.eligibility.eligible).toBe(false);
      expect(res.eligibility.reason).toContain('Work order must be completed');
    }
  });

  it('approves review eligibility when work order completed, payment verified, and revealed', async () => {
    vi.mocked(fetchLifecycleSignals).mockResolvedValue({
      ok: true,
      signals: {
        rfqId: 'rfq-3',
        requirementStatus: 'SETTLED',
        rfqStatus: 'AWARDED',
        revealStatus: 'REVEALED',
        poStatus: 'CONFIRMED',
        workOrderStatus: 'COMPLETED',
        paymentStatus: 'VERIFIED',
      },
    } as any);

    vi.mocked(fetchPerformanceRecords).mockResolvedValue({
      ok: true,
      records: [],
    } as any);

    const res = await fetchReviewEligibility('rfq-3');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.eligibility.eligible).toBe(true);
    }
  });

  it('submits buyer review through supabase rpc', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { success: true },
      error: null,
    } as any);

    const res = await submitBuyerReview({
      rfqId: 'rfq-3',
      qualityRating: 5,
      actualDeliveryDays: 10,
      notes: 'Exceptional dimensional accuracy and on-time delivery.',
    });

    expect(res.ok).toBe(true);
  });
});
