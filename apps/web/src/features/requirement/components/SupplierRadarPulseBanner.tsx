import type { SupplierNetworkSummary } from '@otp/domain';

export type RadarBannerState =
  | 'DISCOVERING'
  | 'MATCHED'
  | 'READY'
  | 'EMPTY'
  | 'FILTERED_EMPTY'
  | 'ERROR';

export interface SupplierDiscoveryBuyerCounts {
  otpVerified: number;
  network: number;
  local: number;
  total: number;
}

export interface SupplierRadarPulseBannerProps {
  totalCount: number;
  networks?: SupplierNetworkSummary[];
  buyerCounts?: SupplierDiscoveryBuyerCounts;
  isBroadcasting?: boolean;
  state?: RadarBannerState;
  errorMessage?: string | null;
  onRetry?: () => void;
}

export function SupplierRadarPulseBanner({
  totalCount,
  networks = [],
  buyerCounts,
  isBroadcasting = false,
  state,
  errorMessage,
  onRetry,
}: SupplierRadarPulseBannerProps) {
  const effectiveState: RadarBannerState =
    state ??
    (errorMessage
      ? 'ERROR'
      : isBroadcasting
      ? 'READY'
      : totalCount > 0
      ? 'MATCHED'
      : 'EMPTY');

  const otpCount = buyerCounts?.otpVerified ?? networks.find(
    (n) => (n.network as string) === 'OTP_REGISTERED' || n.network === 'DIRECT',
  )?.invitedCount ?? 0;
  const networkCount = buyerCounts?.network ?? networks.find((n) => n.network === 'ONDC')?.invitedCount ?? 0;
  const localCount = buyerCounts?.local ?? networks.find(
    (n) => n.network === 'LOCAL_REGISTRY' || n.network === 'GOOGLE_PLACES',
  )?.invitedCount ?? 0;

  const displayTotal = buyerCounts?.total ?? totalCount;

  let statusBadge = displayTotal > 0 ? `${displayTotal} Suppliers found` : 'Discovery in progress';
  let descriptionText =
    displayTotal > 0
      ? 'Suppliers found across OTP suppliers, network partners, and local businesses.'
      : 'Searching OTP suppliers, network partners, and local businesses near your delivery PIN.';
  let liveRegionText =
    displayTotal > 0
      ? `${displayTotal} suppliers found.`
      : 'Supplier discovery in progress.';
  let pulseColor = 'bg-emerald-500';
  let pingColor = 'bg-emerald-400';

  switch (effectiveState) {
    case 'DISCOVERING':
      statusBadge = 'Scanning…';
      descriptionText =
        'Searching OTP suppliers, network partners, and local businesses near your delivery PIN.';
      liveRegionText = 'Discovering suppliers.';
      pulseColor = 'bg-blue-500';
      pingColor = 'bg-blue-400';
      break;
    case 'READY':
      statusBadge = isBroadcasting ? 'Quoting active' : 'Ready to broadcast';
      descriptionText =
        'Invitations are out. Sealed quotes arrive under protected aliases; responses are expected within 30 minutes.';
      liveRegionText = 'RFQ active. Sealed quotes incoming under protected aliases.';
      break;
    case 'EMPTY':
      statusBadge = 'No matches yet';
      descriptionText =
        'No suppliers matched this requirement yet. Broaden criteria or invite a trusted supplier directly.';
      liveRegionText = 'No matching suppliers found yet.';
      pulseColor = 'bg-amber-500';
      pingColor = 'bg-amber-400';
      break;
    case 'FILTERED_EMPTY':
      statusBadge = '0 in active filter';
      descriptionText = 'No suppliers match the current filter. Switch to All Matched or invite directly.';
      liveRegionText = 'No suppliers match the active filter.';
      pulseColor = 'bg-amber-500';
      pingColor = 'bg-amber-400';
      break;
    case 'ERROR':
      statusBadge = 'Discovery temporarily unavailable';
      descriptionText =
        errorMessage ||
        'Supplier discovery is temporarily unavailable. Retry or invite a known vendor directly.';
      liveRegionText = `Supplier discovery error: ${errorMessage || 'temporarily unavailable'}.`;
      pulseColor = 'bg-red-500';
      pingColor = 'bg-red-400';
      break;
    case 'MATCHED':
    default:
      break;
  }

  return (
    <section
      className="rounded-xl bg-slate-900 dark:bg-slate-950 text-white p-3.5 space-y-3 relative overflow-hidden border border-slate-800 shadow-md min-h-[140px] flex flex-col justify-between"
      data-testid="supplier-radar-pulse-banner"
      aria-label="Supplier discovery summary"
    >
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveRegionText}
      </div>

      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/5 to-transparent opacity-50 animate-pulse motion-reduce:animate-none"
        aria-hidden="true"
      />

      <div className="flex items-center justify-between gap-2 relative z-10">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3 shrink-0" aria-hidden="true">
            <span
              className={`animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full ${pingColor} opacity-75`}
            />
            <span className={`relative inline-flex rounded-full h-3 w-3 ${pulseColor}`} />
          </span>
          <h2 className="text-xs sm:text-sm font-bold text-white tracking-wide">
            {effectiveState === 'EMPTY'
              ? 'No suppliers matched'
              : effectiveState === 'ERROR'
                ? 'Discovery unavailable'
                : effectiveState === 'FILTERED_EMPTY'
                  ? 'No suppliers in this filter'
                  : 'Suppliers found'}
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full shrink-0 border ${
              effectiveState === 'ERROR'
                ? 'bg-red-500/20 text-red-300 border-red-500/40'
                : effectiveState === 'EMPTY' || effectiveState === 'FILTERED_EMPTY'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
            }`}
            data-testid="radar-status-badge"
          >
            {statusBadge}
          </span>
          {effectiveState === 'ERROR' && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="text-[10px] font-bold bg-white/10 hover:bg-white/20 text-white px-2 py-0.5 rounded transition"
            >
              Retry
            </button>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-300 leading-relaxed relative z-10">{descriptionText}</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 relative z-10" data-testid="supplier-discovery-counts">
        <div className="rounded-lg border border-slate-800 bg-slate-800/60 p-2 flex items-center justify-between text-xs">
          <span className="text-[11px] font-bold text-slate-100">OTP suppliers</span>
          <span className="text-[10px] font-bold text-emerald-400">{otpCount}</span>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-800/60 p-2 flex items-center justify-between text-xs">
          <span className="text-[11px] font-bold text-slate-100">Network suppliers</span>
          <span className="text-[10px] font-bold text-blue-400">{networkCount}</span>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-800/60 p-2 flex items-center justify-between text-xs">
          <span className="text-[11px] font-bold text-slate-100">Local businesses</span>
          <span className="text-[10px] font-bold text-purple-400">{localCount}</span>
        </div>
      </div>
    </section>
  );
}
