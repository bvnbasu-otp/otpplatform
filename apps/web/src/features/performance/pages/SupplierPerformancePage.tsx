import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FULFILLMENT_RFQ_ID } from '@/lib/supabase';
import { fetchPerformanceRecords } from '../api/fetch-performance';
import { PerformanceSummary } from '../components/PerformanceSummary';
import { BuyerReviewForm, fetchReviewEligibility } from '@/features/review';
import { ProcurementStageNavigator } from '@/features/lifecycle';
import type { PerformanceRecord } from '../types/performance';

interface SupplierPerformancePageProps {
  rfqId?: string;
}

export function SupplierPerformancePage({ rfqId }: SupplierPerformancePageProps) {
  const activeRfqId = rfqId ?? FULFILLMENT_RFQ_ID;
  const [records, setRecords] = useState<PerformanceRecord[]>([]);
  const [eligible, setEligible] = useState(false);
  const [eligibilityReason, setEligibilityReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [perfResult, eligibilityResult] = await Promise.all([
      fetchPerformanceRecords({ rfqId: activeRfqId }),
      fetchReviewEligibility(activeRfqId),
    ]);

    if (!perfResult.ok) {
      setError(perfResult.error);
      setRecords([]);
    } else {
      setError(null);
      setRecords(perfResult.records);
    }

    if (eligibilityResult.ok) {
      setEligible(eligibilityResult.eligibility.eligible);
      setEligibilityReason(eligibilityResult.eligibility.reason ?? null);
    }

    setIsLoading(false);
  }, [activeRfqId]);

  useEffect(() => {
    void load();
  }, [load]);

  const showForm = !isLoading && records.length === 0 && eligible;

  return (
    <div className="zero-scroll-container p-3 max-w-7xl mx-auto w-full">
      <ProcurementStageNavigator
        currentLinearStep={15}
        currentStage="SETTLED"
        orderTitle="Star Rating & Closeout"
        orderReference={activeRfqId ? `RFQ-${activeRfqId.slice(0, 8)}` : 'Performance'}
        rfqId={activeRfqId}
        role="buyer"
        backToUrl="/"
        backToLabel="Buyer Dashboard"
      />

      <header className="rounded-lg border bg-card px-3 py-2 shadow-2xs shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-md bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0">
            Step 15 / 15
          </span>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-foreground truncate">Star Rating with Physical Justification</h1>
            <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
              Quoted vs actual outcomes after requirement completion. Record 1–5 star rating with verified proof.
            </p>
          </div>
        </div>
      </header>

      <div className="zero-scroll-pane mt-2 space-y-2">
        {showForm && (
          <div className="rounded-lg border bg-card p-3 shadow-2xs">
            <BuyerReviewForm rfqId={activeRfqId} onSubmitted={() => void load()} />
          </div>
        )}

        {!isLoading && records.length === 0 && !eligible && eligibilityReason && (
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            {eligibilityReason}
          </p>
        )}

        <PerformanceSummary records={records} isLoading={isLoading} error={error} />
      </div>
    </div>
  );
}
