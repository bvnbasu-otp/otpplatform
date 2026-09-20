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
    telemetry,
  } = metrics;

  const quorumPercent = Math.min(
    100,
    Math.round((quotesCount / Math.max(1, minQuotesRequired)) * 100)
  );

  const responseVelocityText =
    telemetry?.responseVelocityText ||
    (isQuorumMet
      ? `Quorum achieved (${quotesCount} quotes received · ${responseRatePercent}% response rate)`
      : quotesCount > 0
      ? `Inbound activity (${quotesCount} quotes received · ${responseRatePercent}% response rate)`
      : 'Broadcasting enquiry · Monitoring 30-min supplier initial target');

  return (
    <section
      className="rounded-xl border bg-card p-4 shadow-2xs space-y-3.5 transition-all text-foreground"
      data-testid="active-rfq-progress-card"
      aria-labelledby="progress-card-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="rounded-md bg-purple-100 dark:bg-purple-950/60 px-2 py-0.5 text-[10px] font-bold text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            Sourcing Telemetry &amp; Response Progress
          </span>
          <h2 id="progress-card-title" className="text-sm sm:text-base font-bold text-foreground mt-1">
            {quotesCount} of {invitedCount} Suppliers Responded ({responseRatePercent}%)
          </h2>
        </div>

        {isQuorumMet ? (
          <span
            className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300"
            data-testid="quorum-status-pill"
          >
            ✓ Quorum Met ({quotesCount}/{minQuotesRequired})
          </span>
        ) : (
          <span
            className="rounded-full bg-amber-100 dark:bg-amber-950/60 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 border border-amber-300"
            data-testid="quorum-status-pill"
          >
            ⏳ Quorum: {quotesCount}/{minQuotesRequired} Quotes ({quorumPercent}%)
          </span>
        )}
      </div>

      {/* Quorum Threshold Progress Meter */}
      <div className="space-y-1">
        <div className="flex justify-between items-center text-[11px] text-muted-foreground font-medium">
          <span>Quorum Threshold Meter</span>
          <span>
            {quotesCount} of {minQuotesRequired} minimum quotes received
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-3 overflow-hidden border">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              isQuorumMet ? 'bg-emerald-600 dark:bg-emerald-500' : 'bg-primary'
            }`}
            style={{ width: `${Math.min(100, Math.max(6, quorumPercent))}%` }}
            role="progressbar"
            aria-valuenow={quotesCount}
            aria-valuemin={0}
            aria-valuemax={minQuotesRequired}
            aria-label="Quorum progress"
          />
        </div>
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

      {/* Telemetry & SLA Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[11px] text-muted-foreground bg-muted/20 p-2.5 rounded-lg border">
        <div className="flex items-center gap-1.5">
          <span>🚀</span>
          <span className="font-semibold text-foreground">{responseVelocityText}</span>
        </div>
        <div className="flex items-center gap-2">
          <span>⚡ Initial responses expected with a <strong>30 Min Target from Supplier</strong></span>
          {declinedCount > 0 && <span className="text-rose-600 dark:text-rose-400">({declinedCount} declined)</span>}
        </div>
      </div>
    </section>
  );
}
