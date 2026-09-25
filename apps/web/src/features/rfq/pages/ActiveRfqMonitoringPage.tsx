import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ProcurementStageNavigator } from '@/features/lifecycle';
import { fetchActiveRfqMonitoringData } from '../api/fetch-active-rfq-monitoring';
import type { ActiveRfqMonitoringData } from '../types/rfq-monitoring';
import { ActiveRfqHeaderBanner } from '../components/ActiveRfqHeaderBanner';
import { ActiveRfqActionRequiredCard } from '../components/ActiveRfqActionRequiredCard';
import { ActiveRfqProgressCard } from '../components/ActiveRfqProgressCard';
import { ActiveRfqSupplierResponsesList } from '../components/ActiveRfqSupplierResponsesList';
import { ActiveRfqExtendDeadlineModal } from '../components/ActiveRfqExtendDeadlineModal';
import { ActiveRfqScopeAccordion } from '../components/ActiveRfqScopeAccordion';
import { CancelRfqModal } from '../components/CancelRfqModal';

interface ActiveRfqMonitoringPageProps {
  rfqId?: string;
  requirementId?: string;
}

export function ActiveRfqMonitoringPage({
  rfqId: propRfqId,
  requirementId: propRequirementId,
}: ActiveRfqMonitoringPageProps) {
  const navigate = useNavigate();
  const routeParams = useParams<{ rfqId?: string; requirementId?: string }>();
  const effectiveId = propRfqId || propRequirementId || routeParams.rfqId || routeParams.requirementId;

  const [data, setData] = useState<ActiveRfqMonitoringData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async (showRefreshing = false) => {
    if (!effectiveId) {
      setError('Missing RFQ or Requirement identifier');
      setIsLoading(false);
      return;
    }

    if (showRefreshing) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    const res = await fetchActiveRfqMonitoringData(effectiveId);
    setIsLoading(false);
    setIsRefreshing(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    setData(res.data);
  }, [effectiveId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function handleDeadlineUpdated(newDeadlineIso: string) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            rfq: { ...prev.rfq, quoteDeadline: newDeadlineIso },
          }
        : null
    );
    void loadData(true);
  }

  function handleRfqCancelled() {
    navigate('/dashboard');
  }

  if (isLoading) {
    return (
      <div className="zero-scroll-container p-4 max-w-5xl mx-auto w-full space-y-4 text-foreground">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-muted/60 rounded-lg w-1/3" />
          <div className="h-28 bg-muted/40 rounded-xl" />
          <div className="h-36 bg-slate-900/40 rounded-xl" />
          <div className="h-44 bg-muted/20 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="zero-scroll-container p-4 max-w-5xl mx-auto w-full space-y-4 text-foreground">
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/40 p-4 text-center space-y-3">
          <span className="text-3xl">⚠️</span>
          <h2 className="text-sm font-bold text-red-800 dark:text-red-300">Unable to load Active RFQ</h2>
          <p className="text-xs text-red-700 dark:text-red-200">{error || 'RFQ record not found'}</p>
          <div className="flex justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => void loadData()}
              className="min-h-[48px] px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold shadow-2xs hover:bg-primary/90 transition mobile-touch-target"
            >
              Retry Loading
            </button>
            <Link
              to="/dashboard"
              className="min-h-[48px] px-4 py-2 rounded-lg border bg-card text-foreground text-xs font-semibold hover:bg-muted transition inline-flex items-center mobile-touch-target"
            >
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { rfq, requirement, metrics, actionRequired, supplierResponses, governance, attachmentsCount } = data;
  const isLive = rfq.status === 'OPEN' || rfq.status === 'CLARIFICATION' || rfq.status === 'QUOTING';

  return (
    <div
      className="zero-scroll-container p-3 sm:p-4 max-w-5xl mx-auto w-full overflow-x-hidden space-y-3.5 pb-40 sm:pb-36 pb-[calc(10rem+env(safe-area-inset-bottom,0px))] text-foreground relative"
      data-testid="active-rfq-monitoring-page"
    >
      {/* 15-Stage Linear Pipeline Navigator */}
      <ProcurementStageNavigator
        currentLinearStep={2}
        currentStage="QUOTING"
        orderTitle={requirement.title || rfq.title}
        orderReference={`RFQ-${rfq.id.slice(0, 8)}`}
        requirementId={requirement.id}
        rfqId={rfq.id}
        role="buyer"
        backToUrl="/dashboard"
        backToLabel="Dashboard"
      />

      {/* 1. Header Banner */}
      <ActiveRfqHeaderBanner
        rfq={rfq}
        metrics={metrics}
        onOpenExtendDeadline={() => setIsExtendModalOpen(true)}
      />

      {/* 2. Action Required Card */}
      {actionRequired.type !== 'NONE' && (
        <ActiveRfqActionRequiredCard
          actionRequired={actionRequired}
          onOpenExtendDeadline={() => setIsExtendModalOpen(true)}
        />
      )}

      {/* 3. Response Progress Card */}
      <ActiveRfqProgressCard
        metrics={metrics}
        minQuotesRequired={rfq.minQuotesRequired}
      />

      {/* 4. Supplier Responses & Inbound Quotes List */}
      <ActiveRfqSupplierResponsesList
        rfqId={rfq.id}
        responses={supplierResponses}
      />

      {/* 5. Specifications & Scope (Accordion) */}
      <ActiveRfqScopeAccordion
        requirement={requirement}
        governance={governance}
        attachmentsCount={attachmentsCount}
      />

      {/* Extend Deadline Modal */}
      <ActiveRfqExtendDeadlineModal
        rfqId={rfq.id}
        isOpen={isExtendModalOpen}
        onClose={() => setIsExtendModalOpen(false)}
        currentDeadlineIso={rfq.quoteDeadline}
        onSuccess={handleDeadlineUpdated}
      />

      {/* Cancel RFQ Modal */}
      <CancelRfqModal
        rfqId={rfq.id}
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onCancelled={handleRfqCancelled}
      />

      {/* Sticky Bottom Action Bar with Single Dominant Primary CTA */}
      <div className="fixed sm:absolute bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t p-3 sm:p-4 shadow-lg pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center justify-between w-full sm:w-auto gap-2">
            <div className="text-left">
              <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-purple-500'}`} />
                <span>
                  {metrics.quotesCount} of {metrics.invitedCount} Quotes Received
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground block">
                {metrics.isQuorumMet
                  ? '✓ Target quorum met — Evaluation unlocked'
                  : `Quorum target: ${rfq.minQuotesRequired} quotes`}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Link
                to={`/rfq/${rfq.id}/clarification`}
                className="min-h-[44px] inline-flex items-center gap-1 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition mobile-touch-target"
                title="Open Clarification Q&A"
              >
                <span>💬 Q&amp;A</span>
              </Link>
              <button
                type="button"
                onClick={() => void loadData(true)}
                disabled={isRefreshing}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border bg-muted/40 p-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition mobile-touch-target"
                title="Refresh live quote feed"
                aria-label="Refresh live quote feed"
              >
                <span>{isRefreshing ? '🔄…' : '🔄'}</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Single Dominant Primary Action */}
            {metrics.quotesCount > 0 ? (
              <Link
                to={`/rfq/${rfq.id}/evaluation`}
                className="min-h-[48px] w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-6 py-3 text-xs sm:text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition mobile-touch-target"
                data-testid="evaluate-quotes-primary-cta"
              >
                <span>⚖️ Evaluate Quotes ({metrics.quotesCount}) →</span>
              </Link>
            ) : (
              <Link
                to={`/rfq/${rfq.id}/market-intelligence`}
                className="min-h-[48px] w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-6 py-3 text-xs sm:text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition mobile-touch-target"
                data-testid="market-intelligence-primary-cta"
              >
                <span>Market Intelligence →</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
