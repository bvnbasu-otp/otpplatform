import type { RfqMonitoringMetrics } from '../types/rfq-monitoring';

interface ActiveRfqProgressCardProps {
  metrics: RfqMonitoringMetrics;
  minQuotesRequired: number;
}

export function ActiveRfqProgressCard({
  metrics,
  minQuotesRequired,
}: ActiveRfqProgressCardProps) {
  const {
    invitedCount,
    viewedCount,
    quotesCount,
    pendingCount,
    declinedCount,
    responseRatePercent,
    isQuorumMet,
  } = metrics;

  return (
    <section
      className="rounded-xl border bg-card p-4 shadow-2xs space-y-3.5 transition-all text-foreground"
      data-testid="active-rfq-progress-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="rounded-md bg-purple-100 dark:bg-purple-950/60 px-2 py-0.5 text-[10px] font-bold text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            Sourcing Response Progress
          </span>
          <h2 className="text-sm sm:text-base font-bold text-foreground mt-1">
            {quotesCount} of {invitedCount} Suppliers Responded ({responseRatePercent}%)
          </h2>
        </div>

        {isQuorumMet ? (
          <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300">
            ✓ Quorum Met ({quotesCount}/{minQuotesRequired})
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 dark:bg-amber-950/60 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 border border-amber-300">
            ⏳ Quorum: {quotesCount}/{minQuotesRequired} Quotes
          </span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-muted rounded-full h-3 overflow-hidden border">
        <div
          className="bg-primary h-full transition-all duration-500 rounded-full"
          style={{ width: `${Math.min(100, Math.max(8, responseRatePercent))}%` }}
        />
      </div>

      {/* 4-Metric Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center">
        <div className="rounded-lg bg-muted/30 p-2.5 border">
          <span className="text-[10px] uppercase font-bold text-muted-foreground block">
            Invited Pool
          </span>
          <span className="text-base sm:text-lg font-black text-foreground">
            {invitedCount}
          </span>
          <span className="text-[9px] text-muted-foreground block">Verified vendors</span>
        </div>

        <div className="rounded-lg bg-blue-50/50 dark:bg-blue-950/20 p-2.5 border border-blue-200 dark:border-blue-900">
          <span className="text-[10px] uppercase font-bold text-blue-800 dark:text-blue-300 block">
            Viewed RFQ
          </span>
          <span className="text-base sm:text-lg font-black text-blue-900 dark:text-blue-200">
            {viewedCount}
          </span>
          <span className="text-[9px] text-blue-700 dark:text-blue-400 block">Opened spec</span>
        </div>

        <div className="rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5 border border-emerald-200 dark:border-emerald-900">
          <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300 block">
            Quotes In
          </span>
          <span className="text-base sm:text-lg font-black text-emerald-900 dark:text-emerald-200">
            {quotesCount}
          </span>
          <span className="text-[9px] text-emerald-700 dark:text-emerald-400 block">Sealed quotes</span>
        </div>

        <div className="rounded-lg bg-amber-50/50 dark:bg-amber-950/20 p-2.5 border border-amber-200 dark:border-amber-900">
          <span className="text-[10px] uppercase font-bold text-amber-800 dark:text-amber-300 block">
            Pending
          </span>
          <span className="text-base sm:text-lg font-black text-amber-900 dark:text-amber-200">
            {pendingCount}
          </span>
          <span className="text-[9px] text-amber-700 dark:text-amber-400 block">In progress</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground bg-muted/20 p-2 rounded-lg border">
        <span>⚡ Initial responses expected with a <strong>30 Min Target from Supplier</strong></span>
        {declinedCount > 0 && <span>({declinedCount} declined)</span>}
      </div>
    </section>
  );
}
