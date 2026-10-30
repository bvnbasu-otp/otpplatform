import React from 'react';
import { Icon } from '@/components/ui/Icon';

export interface QuorumExpiryDecisionCardProps {
  quotesCount: number;
  minQuotesRequired?: number;
  deadlineDays?: number | null;
  onProceedWithCurrentQuotes: () => void;
  onExtendDeadline: (additionalDays: number) => void;
  onCancelRequest: () => void;
  isBusy?: boolean;
}

export function QuorumExpiryDecisionCard({
  quotesCount,
  minQuotesRequired = 3,
  deadlineDays = 7,
  onProceedWithCurrentQuotes,
  onExtendDeadline,
  onCancelRequest,
  isBusy = false,
}: QuorumExpiryDecisionCardProps) {
  if (quotesCount === 0 || quotesCount >= minQuotesRequired) {
    return null;
  }

  return (
    <div
      className="rounded-3xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-50/80 to-amber-100/30 dark:from-amber-950/30 dark:to-amber-900/10 p-4 sm:p-5 shadow-sm space-y-4 animate-in fade-in-50"
      data-testid="quorum-expiry-decision-card"
    >
      {/* Header with status */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 border border-amber-500/20">
            <Icon name="timer" size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">
                Quorum Status Check
              </span>
              <span className="rounded-full bg-amber-200/70 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 px-2 py-0.5 text-[10px] font-black">
                {quotesCount} of {minQuotesRequired} Quotes Received
              </span>
            </div>
            <h3 className="text-sm sm:text-base font-black text-foreground mt-0.5">
              Ready to decide or give suppliers more time?
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
              Standard {deadlineDays}-day window reached with {quotesCount} verified quote. As the buyer, you are in full control. You can proceed with the current quotation, extend the timeline by 3 days with wider discovery, or cancel without penalty.
            </p>
          </div>
        </div>
      </div>

      {/* 3-Way Action Decision Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
        {/* Option 1: Proceed with 1 Quote */}
        <button
          type="button"
          disabled={isBusy}
          onClick={onProceedWithCurrentQuotes}
          data-testid="btn-proceed-with-quotes"
          className="rounded-2xl border-2 border-emerald-600/40 bg-emerald-500/10 dark:bg-emerald-950/40 p-3.5 text-left transition hover:border-emerald-600 hover:bg-emerald-500/20 active:scale-[0.98] cursor-pointer disabled:opacity-50 flex flex-col justify-between space-y-2 min-h-[90px]"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs sm:text-sm font-black text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5">
              <Icon name="check_circle" size={18} className="text-emerald-600" />
              Proceed with {quotesCount === 1 ? '1 Quote' : `${quotesCount} Quotes`}
            </span>
            <span className="text-xs text-emerald-700 dark:text-emerald-400 font-bold">Fast-track →</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Unlock evaluation now and award directly to this verified quotation.
          </p>
        </button>

        {/* Option 2: Extend 3 Days (+3D) */}
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onExtendDeadline(3)}
          data-testid="btn-extend-deadline"
          className="rounded-2xl border-2 border-amber-500/40 bg-amber-500/10 dark:bg-amber-950/40 p-3.5 text-left transition hover:border-amber-500 hover:bg-amber-500/20 active:scale-[0.98] cursor-pointer disabled:opacity-50 flex flex-col justify-between space-y-2 min-h-[90px]"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs sm:text-sm font-black text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
              <Icon name="more_time" size={18} className="text-amber-600" />
              Extend 3 Days (+3D)
            </span>
            <span className="text-xs text-amber-700 dark:text-amber-400 font-bold">+3 Days</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Expand search to 10–50 km radius, ONDC &amp; Google Places to gather more quotes.
          </p>
        </button>

        {/* Option 3: Cancel Request */}
        <button
          type="button"
          disabled={isBusy}
          onClick={onCancelRequest}
          data-testid="btn-cancel-request"
          className="rounded-2xl border border-rose-300 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/30 p-3.5 text-left transition hover:border-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 active:scale-[0.98] cursor-pointer disabled:opacity-50 flex flex-col justify-between space-y-2 min-h-[90px]"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs sm:text-sm font-black text-rose-950 dark:text-rose-200 flex items-center gap-1.5">
              <Icon name="cancel" size={18} className="text-rose-600" />
              Cancel Request
            </span>
            <span className="text-xs text-rose-700 dark:text-rose-400 font-bold">No Penalty</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Close requirement cleanly if participation was insufficient for your needs.
          </p>
        </button>
      </div>

      {/* Concentric Cascade Status */}
      <div className="rounded-2xl border border-amber-500/20 bg-background/60 p-3 space-y-2">
        <div className="flex items-center justify-between text-[11px] font-bold">
          <span className="flex items-center gap-1.5 text-foreground">
            <Icon name="radar" size={16} className="text-amber-600" />
            <span>Concentric Discovery Reach:</span>
          </span>
          <span className="text-muted-foreground text-[10px]">Pincode → Corridor → Open Network</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-1.5 text-center text-emerald-800 dark:text-emerald-300 font-semibold">
            ✓ PIN Code (0–5 km)
          </div>
          <div className="rounded-lg bg-muted/60 border border-border p-1.5 text-center text-muted-foreground">
            {quotesCount < minQuotesRequired ? '⚡ Expanding to 10–50 km' : '✓ 10–50 km City'}
          </div>
          <div className="rounded-lg bg-muted/60 border border-border p-1.5 text-center text-muted-foreground">
            ONDC &amp; Google Places
          </div>
          <div className="rounded-lg bg-muted/60 border border-border p-1.5 text-center text-muted-foreground">
            State &amp; Pan-India
          </div>
        </div>
      </div>
    </div>
  );
}
