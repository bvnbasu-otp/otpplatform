import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ProcurementStageNavigator } from '@/features/lifecycle';
import {
  fetchRfqReviewData,
  publishRfq,
  updateRfqDeadline,
  updateRfqInstructions,
} from '../api/rfq-lifecycle';
import type { RfqReviewData } from '../types/rfq-review';
import { RfqScopeSummaryCard } from '../components/RfqScopeSummaryCard';
import { RfqSupplierPoolSummaryCard } from '../components/RfqSupplierPoolSummaryCard';
import { RfqDeadlineCard } from '../components/RfqDeadlineCard';
import { RfqAttachmentsCard } from '../components/RfqAttachmentsCard';
import { RfqSupplierInstructionsCard } from '../components/RfqSupplierInstructionsCard';
import { RfqGovernanceCard } from '../components/RfqGovernanceCard';
import { RfqValidationBanner } from '../components/RfqValidationBanner';
import { RfqPublishConfirmationModal } from '../components/RfqPublishConfirmationModal';

interface RfqReviewPublishPageProps {
  requirementId?: string;
  rfqId?: string;
}

export function RfqReviewPublishPage({
  requirementId: propRequirementId,
  rfqId: propRfqId,
}: RfqReviewPublishPageProps) {
  const navigate = useNavigate();
  const [data, setData] = useState<RfqReviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  // Local state for live deadline / instruction edits
  const [currentDeadline, setCurrentDeadline] = useState<string>('');
  const [currentInstructions, setCurrentInstructions] = useState<string>('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const reqId = propRequirementId || '';
    const res = await fetchRfqReviewData(reqId, propRfqId);
    setIsLoading(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    setData(res.data);
    setCurrentDeadline(res.data.rfq.quoteDeadline);
    setCurrentInstructions(res.data.rfq.buyerInstructions);
  }, [propRequirementId, propRfqId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDeadlineChange(newDeadlineIso: string) {
    setCurrentDeadline(newDeadlineIso);
    if (data?.rfq.id) {
      await updateRfqDeadline(data.rfq.id, newDeadlineIso);
    }
  }

  async function handleInstructionsChange(newInstructions: string) {
    setCurrentInstructions(newInstructions);
    if (data?.requirement.id) {
      await updateRfqInstructions(data.requirement.id, newInstructions);
    }
  }

  async function handleConfirmPublish() {
    if (!data) return;
    setIsBusy(true);
    setError(null);

    const res = await publishRfq({
      rfqId: data.rfq.id,
      requirementId: data.requirement.id,
      quoteDeadline: currentDeadline,
      instructions: currentInstructions,
    });

    setIsBusy(false);
    setIsConfirmModalOpen(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    setSuccess(
      `🎉 RFQ successfully published! Broadcast dispatched to ${res.invitedCount || data.selectedSuppliers.length} verified supplier(s). Quoting is now live with responses expected within 30 minutes.`
    );

    // Update local RFQ status to OPEN
    setData((prev) =>
      prev
        ? {
            ...prev,
            rfq: { ...prev.rfq, status: 'OPEN' },
            requirement: { ...prev.requirement, status: 'QUOTING' },
          }
        : null
    );
  }

  if (isLoading) {
    return (
      <div className="zero-scroll-container p-4 max-w-5xl mx-auto w-full space-y-4 text-foreground">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-muted/60 rounded-lg w-1/3" />
          <div className="h-32 bg-muted/40 rounded-xl" />
          <div className="h-44 bg-muted/30 rounded-xl" />
          <div className="h-36 bg-muted/20 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="zero-scroll-container p-4 max-w-5xl mx-auto w-full space-y-4 text-foreground">
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/40 p-4 text-center space-y-3">
          <span className="text-3xl">⚠️</span>
          <h2 className="text-sm font-bold text-red-800 dark:text-red-300">Unable to load RFQ Review</h2>
          <p className="text-xs text-red-700 dark:text-red-200">{error}</p>
          <div className="flex justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => void load()}
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

  if (!data) return null;

  const { requirement, rfq, selectedSuppliers, attachments, governance, validation } = data;
  const isQuotingLive = rfq.status === 'OPEN' || rfq.status === 'CLARIFICATION' || requirement.status === 'QUOTING';
  const supplierCount = selectedSuppliers.length;
  const isQuorumMet = supplierCount >= governance.minQuotesRequired;

  const deadlineDisplay = new Date(currentDeadline || rfq.quoteDeadline).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <div
      className="zero-scroll-container p-3 sm:p-4 max-w-5xl mx-auto w-full overflow-x-hidden space-y-3.5 pb-36 text-foreground relative"
      data-testid="rfq-review-publish-page"
    >
      {/* 15-Stage Linear Pipeline Navigator */}
      <ProcurementStageNavigator
        currentLinearStep={2}
        currentStage="QUOTING"
        orderTitle={requirement.title || 'RFQ Review & Publish'}
        orderReference={`RFQ-${rfq.id.slice(0, 8)}`}
        requirementId={requirement.id}
        rfqId={rfq.id}
        role="buyer"
        backToUrl={`/requirements/${requirement.id}/discover`}
        backToLabel="Supplier Discovery"
      />

      {/* Header Banner */}
      <div className="rounded-xl border bg-card px-4 py-3 shadow-2xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-md bg-purple-100 dark:bg-purple-950/60 px-2 py-0.5 text-[10px] font-bold text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0">
            Final Checkpoint
          </span>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-black text-foreground truncate">
              {isQuotingLive ? 'RFQ Published & Quoting Live' : 'RFQ Ready to Publish'}
            </h1>
            <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
              Review specifications, supplier pool, and response deadline before launching competitive sourcing.
            </p>
          </div>
        </div>

        {isQuotingLive && (
          <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-3 py-0.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300 shrink-0">
            ✓ Quoting Live ({supplierCount} Invited)
          </span>
        )}
      </div>

      {/* Notifications */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/40 p-3.5 text-xs font-semibold text-red-700 dark:text-red-300">
          ⚠️ {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 p-3.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
          {success}
        </div>
      )}

      {/* Validation Banner Checklist */}
      <RfqValidationBanner validation={validation} requirementId={requirement.id} />

      {/* 1. Scope Summary Card */}
      <RfqScopeSummaryCard requirement={requirement} />

      {/* 2. Supplier Pool Summary Card */}
      <RfqSupplierPoolSummaryCard
        requirementId={requirement.id}
        selectedSuppliers={selectedSuppliers}
        minQuotesRequired={governance.minQuotesRequired}
      />

      {/* 3. Quote Response Deadline Card */}
      <RfqDeadlineCard
        currentDeadlineIso={currentDeadline || rfq.quoteDeadline}
        onDeadlineChange={handleDeadlineChange}
      />

      {/* 4. Attachments Card */}
      <RfqAttachmentsCard
        requirementId={requirement.id}
        attachments={attachments}
      />

      {/* 5. Supplier Instructions Card */}
      <RfqSupplierInstructionsCard
        initialInstructions={currentInstructions || rfq.buyerInstructions}
        onInstructionsChange={handleInstructionsChange}
      />

      {/* 6. Governance Protocol Card */}
      <RfqGovernanceCard governance={governance} />

      {/* Publish Confirmation Modal */}
      <RfqPublishConfirmationModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={handleConfirmPublish}
        supplierCount={supplierCount}
        deadlineDisplay={deadlineDisplay}
        requirementTitle={requirement.title}
        isBusy={isBusy}
      />

      {/* Sticky Bottom Action Bar */}
      <div className="fixed sm:absolute bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t p-3 sm:p-4 shadow-lg pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center justify-between w-full sm:w-auto gap-2">
            <div className="text-left">
              <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>
                  {supplierCount} Supplier{supplierCount === 1 ? '' : 's'} in Pool
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground block">
                {isQuotingLive
                  ? 'Quoting is active • Sealed quotes incoming'
                  : 'Ready to launch identity-protected sourcing'}
              </span>
            </div>

            {isQuorumMet ? (
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                ✓ Quorum Met
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 dark:bg-amber-950/60 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 border border-amber-300">
                Min {governance.minQuotesRequired} Recommended
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {isQuotingLive ? (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Link
                  to={`/rfq/${rfq.id}/monitoring`}
                  className="min-h-[48px] flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition mobile-touch-target"
                  data-testid="active-rfq-monitoring-button"
                >
                  <span>Monitor Live RFQ →</span>
                </Link>
                <Link
                  to={`/rfq/${rfq.id}/market-intelligence`}
                  className="min-h-[48px] flex-1 sm:flex-initial inline-flex items-center justify-center rounded-xl border bg-muted/40 px-3.5 py-2.5 text-xs font-semibold text-foreground hover:bg-muted transition mobile-touch-target"
                  data-testid="market-intelligence-button"
                >
                  Market Intelligence
                </Link>
              </div>
            ) : (
              <button
                type="button"
                disabled={isBusy || !validation.isValid || supplierCount === 0}
                onClick={() => setIsConfirmModalOpen(true)}
                className="min-h-[48px] w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-xs sm:text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 disabled:opacity-50 transition mobile-touch-target"
                data-testid="publish-rfq-primary-button"
              >
                <span>{isBusy ? 'Publishing RFQ…' : '🚀 Publish RFQ →'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
