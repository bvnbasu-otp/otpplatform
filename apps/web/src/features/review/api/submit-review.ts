import { supabase } from '@/lib/supabase';
import { fetchLifecycleSignals } from '@/features/lifecycle/api/fetch-lifecycle';
import { fetchPerformanceRecords } from '@/features/performance/api/fetch-performance';

export interface ReviewEligibility {
  eligible: boolean;
  reason?: string;
  rfqId: string;
}

export interface SubmitReviewInput {
  rfqId: string;
  qualityRating: number;
  actualDeliveryDays: number;
  notes?: string;
}

export async function fetchReviewEligibility(rfqId: string): Promise<
  { ok: true; eligibility: ReviewEligibility } | { ok: false; error: string }
> {
  const [lifecycle, performance] = await Promise.all([
    fetchLifecycleSignals(rfqId),
    fetchPerformanceRecords({ rfqId }),
  ]);

  if (!lifecycle.ok) return lifecycle;

  if (performance.ok && performance.records.length > 0) {
    return {
      ok: true,
      eligibility: { eligible: false, reason: 'Review already submitted', rfqId },
    };
  }

  const { signals } = lifecycle;

  if (signals.revealStatus !== 'REVEALED' && signals.rfqStatus !== 'AWARDED') {
    return {
      ok: true,
      eligibility: { eligible: false, reason: 'Award must be revealed first', rfqId },
    };
  }

  if (signals.workOrderStatus !== 'COMPLETED') {
    return {
      ok: true,
      eligibility: {
        eligible: false,
        reason: 'Work order must be completed before review',
        rfqId,
      },
    };
  }

  if (signals.paymentStatus !== 'VERIFIED') {
    return {
      ok: true,
      eligibility: {
        eligible: false,
        reason: 'Payment must be verified before review',
        rfqId,
      },
    };
  }

  return {
    ok: true,
    eligibility: { eligible: true, rfqId },
  };
}

export async function submitBuyerReview(
  input: SubmitReviewInput,
): Promise<{ ok: true; recordId: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('record_buyer_performance_review', {
    p_rfq_id: input.rfqId,
    p_quality_rating: input.qualityRating,
    p_actual_delivery_days: input.actualDeliveryDays,
    p_notes: input.notes ?? null,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, recordId: data as string };
}
