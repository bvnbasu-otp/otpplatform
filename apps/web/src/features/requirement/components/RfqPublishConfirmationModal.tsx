import { useState } from 'react';

interface RfqPublishConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  supplierCount: number;
  deadlineDisplay: string;
  requirementTitle: string;
  isBusy: boolean;
}

export function RfqPublishConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  supplierCount,
  deadlineDisplay,
  requirementTitle,
  isBusy,
}: RfqPublishConfirmationModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-confirmation-title"
    >
      <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-2xl space-y-4 text-foreground animate-in fade-in-50 zoom-in-95">
        <div className="flex items-center justify-between pb-2 border-b">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚀</span>
            <h3 id="publish-confirmation-title" className="text-sm sm:text-base font-bold text-foreground">
              Ready to Publish RFQ?
            </h3>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={onClose}
            className="min-h-[48px] min-w-[48px] inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition mobile-touch-target"
            aria-label="Close confirmation dialog"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2.5 text-xs">
          <p className="text-muted-foreground leading-relaxed">
            You are launching competitive sourcing for:
          </p>
          <div className="rounded-lg bg-muted/40 p-2.5 font-bold text-foreground border">
            {requirementTitle}
          </div>

          <div className="space-y-1.5 pt-1 text-[11px]">
            <div className="flex items-center justify-between py-1 border-b">
              <span className="text-muted-foreground">Selected Suppliers:</span>
              <span className="font-bold text-foreground">
                👥 {supplierCount} Verified Supplier{supplierCount === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b">
              <span className="text-muted-foreground">Quote Response Deadline:</span>
              <span className="font-bold text-foreground">
                ⏰ {deadlineDisplay}
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b">
              <span className="text-muted-foreground">Identity Protection:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                🔒 Protected Aliases Active
              </span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground">Supplier Response SLA:</span>
              <span className="font-bold text-purple-700 dark:text-purple-300">
                ⚡ Expected within 30 minutes
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={onClose}
            className="min-h-[48px] flex-1 rounded-xl border bg-muted/30 px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition mobile-touch-target"
          >
            Back to Review
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void onConfirm()}
            className="min-h-[48px] flex-1 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-md hover:bg-primary/90 disabled:opacity-50 transition flex items-center justify-center gap-1.5 mobile-touch-target"
            data-testid="confirm-publish-button"
          >
            <span>{isBusy ? 'Publishing & Broadcasting…' : '🚀 Confirm & Publish RFQ'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
