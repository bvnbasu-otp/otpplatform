import type { RfqMonitoringRfqSummary, RfqMonitoringMetrics } from '../types/rfq-monitoring';

interface ActiveRfqHeaderBannerProps {
  rfq: RfqMonitoringRfqSummary;
  metrics: RfqMonitoringMetrics;
  onOpenExtendDeadline: () => void;
}

export function ActiveRfqHeaderBanner({
  rfq,
  metrics,
  onOpenExtendDeadline,
}: ActiveRfqHeaderBannerProps) {
  const isLive = rfq.status === 'OPEN' || rfq.status === 'CLARIFICATION' || rfq.status === 'QUOTING';
  const isClosed = rfq.status === 'CLOSED' || rfq.status === 'EVALUATING' || rfq.status === 'AWARDED';

  const health = metrics.health || {
    status: metrics.isQuorumMet ? 'READY FOR EVALUATION' : 'HEALTHY',
    label: metrics.isQuorumMet ? 'Ready for Evaluation' : 'Active Sourcing',
    badgeLabel: metrics.isQuorumMet ? 'READY FOR EVALUATION' : 'HEALTHY',
    description: '',
    tone: metrics.isQuorumMet ? 'ready' : 'healthy',
  };

  const lifecycleStage = metrics.lifecycleStage || (metrics.isQuorumMet ? 'READY FOR EVALUATION' : isClosed ? 'CLOSED' : 'ACTIVE SOURCING');

  const deadlineDisplay = new Date(rfq.quoteDeadline).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  let healthBadgeClass = 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300';
  if (health.tone === 'ready') {
    healthBadgeClass = 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300';
  } else if (health.tone === 'attention') {
    healthBadgeClass = 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300';
  } else if (health.tone === 'stalled') {
    healthBadgeClass = 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300';
  }

  return (
    <div
      className="rounded-xl border bg-card p-4 shadow-2xs space-y-3 transition-all text-foreground"
      data-testid="active-rfq-header-banner"
    >
      <div role="status" aria-live="polite" className="sr-only">
        RFQ status: {lifecycleStage}, Sourcing health: {health.label}, {metrics.quotesCount} of {rfq.minQuotesRequired} quotes received.
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {isLive && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 text-xs font-black text-emerald-800 dark:text-emerald-300 border border-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>LIVE · {lifecycleStage}</span>
            </span>
          )}
          {isClosed && (
            <span className="rounded-full bg-purple-100 dark:bg-purple-950/60 px-2.5 py-0.5 text-xs font-bold text-purple-800 dark:text-purple-300 border border-purple-300">
              🔒 {lifecycleStage === 'READY FOR EVALUATION' ? 'READY FOR EVALUATION' : 'QUOTING SEALED'}
            </span>
          )}

          {/* Sourcing Health Indicator Pill */}
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold border uppercase tracking-wider ${healthBadgeClass}`}
            data-testid="sourcing-health-badge"
            title={health.description || health.label}
          >
            ● {health.badgeLabel}
          </span>

          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted px-2 py-0.5 rounded border">
            RFQ-{rfq.id.slice(0, 8)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {metrics.isDeadlineApproaching && !metrics.isDeadlineExpired && (
            <span className="rounded-md bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 border border-amber-300">
              ⚠️ Approaching
            </span>
          )}
          {metrics.isDeadlineExpired && (
            <span className="rounded-md bg-red-100 dark:bg-red-950/60 px-2 py-0.5 text-[10px] font-bold text-red-800 dark:text-red-300 border border-red-300">
              Closed
            </span>
          )}
          <button
            type="button"
            onClick={onOpenExtendDeadline}
            className="min-h-[48px] inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline px-2 mobile-touch-target"
            title="Extend Quote Deadline"
            data-testid="extend-deadline-header-btn"
          >
            <span>⏰ {metrics.timeRemainingText}</span>
            <span>✎</span>
          </button>
        </div>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h1 className="text-base sm:text-lg font-black text-foreground leading-snug break-words">
            {rfq.title}
          </h1>
          <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2">
            <span>Deadline: <strong>{deadlineDisplay}</strong></span>
            <span>•</span>
            <span>Quorum Target: <strong>{rfq.minQuotesRequired} Quotes</strong></span>
          </p>
        </div>
      </div>
    </div>
  );
}
