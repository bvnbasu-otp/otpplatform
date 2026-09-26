import { supabase } from '@/lib/supabase';
import { recomputeEvaluations } from '@/features/evaluation/api/fetch-quote-evaluations';
import { assertSyntheticQuotesAllowed } from './synthetic-quote-guard';

export interface SimulateQuotesResult {
  ok: boolean;
  rfqId?: string;
  quotesSubmitted?: number;
  totalQuotes?: number;
  error?: string;
  message?: string;
}

/**
 * Demo-only: asks the server to seed 3-6 simulated sealed quotes for a demo RFQ.
 *
 * Refuses unless the build is an explicit demo build and the RFQ is `is_demo`.
 * There is deliberately no client-side insert fallback and no call to
 * `auto_submit_pilot_quotes` (that RPC only runs on non-demo RFQs).
 */
export async function simulateQuotesForRfq(
  rfqId: string,
  options?: { count?: number; force?: boolean }
): Promise<SimulateQuotesResult> {
  const targetCount = Math.max(3, Math.min(options?.count ?? 4, 6));

  if (!rfqId) {
    return { ok: false, error: 'Missing RFQ identifier' };
  }

  const gate = await assertSyntheticQuotesAllowed(rfqId);
  if (!gate.allowed) {
    return { ok: false, rfqId, quotesSubmitted: 0, totalQuotes: 0, error: gate.reason };
  }

  try {
    const { data: seedData, error: seedError } = await supabase.rpc(
      'seed_simulated_quotes_for_rfq',
      {
        p_rfq_id: rfqId,
        p_count: targetCount,
      }
    );

    if (seedError) {
      return { ok: false, rfqId, error: seedError.message || 'Failed to simulate quotes' };
    }

    const res = (seedData ?? {}) as {
      ok?: boolean;
      success?: boolean;
      quotes_submitted?: number;
      total_quotes?: number;
      error?: string;
    };
    if (!(res.ok || res.success)) {
      return { ok: false, rfqId, error: res.error || 'Failed to simulate quotes' };
    }

    void recomputeEvaluations(rfqId);

    return {
      ok: true,
      rfqId,
      quotesSubmitted: res.quotes_submitted ?? targetCount,
      totalQuotes: res.total_quotes ?? targetCount,
      message: `Successfully generated ${res.quotes_submitted ?? targetCount} simulated quotes`,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to simulate quotes';
    return { ok: false, rfqId, error: message };
  }
}

/**
 * Demo-only top-up: seeds simulated quotes when a demo RFQ has fewer than 3.
 * Real RFQs (or any ambiguous state) return without touching the database.
 */
export async function ensureSimulatedQuotesForRfq(
  rfqId: string,
  options?: { isDemo?: boolean }
): Promise<SimulateQuotesResult> {
  if (!rfqId) return { ok: false, error: 'Missing RFQ ID' };

  if (options?.isDemo !== true) {
    return { ok: true, rfqId, totalQuotes: 0, quotesSubmitted: 0, message: 'Real Pilot Mode: Synthetic quote generator disabled' };
  }

  const gate = await assertSyntheticQuotesAllowed(rfqId);
  if (!gate.allowed) {
    return { ok: true, rfqId, totalQuotes: 0, quotesSubmitted: 0, message: 'Real Pilot Mode: Synthetic quote generator disabled' };
  }

  try {
    const { data: viewData, error: viewErr } = await supabase
      .from('quotes_identity_protected')
      .select('quote_id')
      .eq('rfq_id', rfqId);

    if (!viewErr && viewData && viewData.length >= 3) {
      return { ok: true, rfqId, totalQuotes: viewData.length, quotesSubmitted: 0 };
    }
  } catch {
    // Proceed to simulate
  }

  return simulateQuotesForRfq(rfqId);
}
