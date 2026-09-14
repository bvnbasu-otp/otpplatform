import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { MarketIntelligencePanel } from '../components/MarketIntelligencePanel';
import { fetchMarketIntelligence } from '../api/fetch-market-intelligence';
import type { MarketIntelligenceSummary } from '@otp/domain';
import { ProcurementStageNavigator } from '@/features/lifecycle';
import { ensureRfqForRequirement, fetchRequirementRfqContext } from '@/features/requirement/api/rfq-lifecycle';

export function MarketIntelligenceStepPage() {
  const { requirementId, rfqId: routeRfqId } = useParams<{
    requirementId?: string;
    rfqId?: string;
  }>();
  const navigate = useNavigate();

  const [rfqId, setRfqId] = useState<string | null>(routeRfqId || null);
  const [resolvedReqId, setResolvedReqId] = useState<string | null>(requirementId || null);
  const [requirementTitle, setRequirementTitle] = useState('Procurement Requirement');
  const [intelligence, setIntelligence] = useState<MarketIntelligenceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      let targetRfqId = routeRfqId;

      if (requirementId && !targetRfqId) {
        const rfqRes = await ensureRfqForRequirement(requirementId);
        if (rfqRes.ok) {
          targetRfqId = rfqRes.rfqId;
          setRfqId(rfqRes.rfqId);
        }
        const ctxRes = await fetchRequirementRfqContext(requirementId);
        if (ctxRes.ok) {
          setRequirementTitle(ctxRes.context.requirementTitle);
        }
      }

      if (targetRfqId) {
        setRfqId(targetRfqId);
        const intelRes = await fetchMarketIntelligence(targetRfqId);
        if (cancelled) return;
        if (intelRes.ok) {
          setIntelligence(intelRes.intelligence);
        } else {
          setError(intelRes.error);
        }
      }

      setLoading(false);
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [requirementId, routeRfqId]);

  return (
    <div className="zero-scroll-container p-3 max-w-7xl mx-auto w-full overflow-x-hidden" data-testid="market-intelligence-step-page">
      {/* 15-Step Navigator pinned strictly to Step 3 */}
      <ProcurementStageNavigator
        currentLinearStep={3}
        currentStage="QUOTING"
        orderTitle={requirementTitle}
        orderReference={rfqId ? `RFQ-${rfqId.slice(0, 8)}` : resolvedReqId || undefined}
        requirementId={resolvedReqId}
        rfqId={rfqId}
        role="buyer"
        backToUrl={resolvedReqId ? `/requirements/${resolvedReqId}/discover` : '/dashboard'}
        backToLabel="Step 2: Sourcing Enquiry"
      />

      {/* Header Description - High Density Bar */}
      <div className="rounded-lg border bg-card px-3 py-2.5 shadow-2xs shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-md bg-indigo-100 dark:bg-indigo-950/60 px-2 py-0.5 text-[10px] font-bold text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
            Step 3 / 15
          </span>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-foreground truncate">
              Real-World Market Intelligence &amp; Pricing Benchmarks
            </h1>
            <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
              Audited historical baseline from regional industrial clusters to evaluate fair pricing, turnaround, and warranty SLAs.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
          {rfqId ? (
            <Link
              to={`/rfq/${rfqId}/clarification`}
              className="min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-1 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition mobile-touch-target"
              data-testid="proceed-to-negotiation-btn"
            >
              <span>Step 4: Negotiation &amp; Q&amp;A</span>
              <span>→</span>
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="min-h-[44px] rounded-lg bg-primary px-3 py-1 text-xs font-bold text-primary-foreground opacity-50"
            >
              Generating Context…
            </button>
          )}
        </div>
      </div>

      {/* Dedicated Market Intelligence Display */}
      <div className="zero-scroll-pane mt-2">
        {loading ? (
          <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">
            Loading verified market intelligence data…
          </div>
        ) : (
          <MarketIntelligencePanel intelligence={intelligence} error={error} />
        )}
      </div>
    </div>
  );
}
