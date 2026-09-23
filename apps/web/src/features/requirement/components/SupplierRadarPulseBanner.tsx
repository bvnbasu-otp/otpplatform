import type { SupplierNetworkSummary } from '@otp/domain';

export type RadarBannerState =
  | 'DISCOVERING'
  | 'MATCHED'
  | 'READY'
  | 'EMPTY'
  | 'FILTERED_EMPTY'
  | 'ERROR';

export interface SupplierRadarPulseBannerProps {
  totalCount: number;
  networks?: SupplierNetworkSummary[];
  isBroadcasting?: boolean;
  state?: RadarBannerState;
  errorMessage?: string | null;
  onRetry?: () => void;
}

export function SupplierRadarPulseBanner({
  totalCount,
  networks = [],
  isBroadcasting = false,
  state,
  errorMessage,
  onRetry,
}: SupplierRadarPulseBannerProps) {
  // Determine computed effective state
  const effectiveState: RadarBannerState =
    state ??
    (errorMessage
      ? 'ERROR'
      : isBroadcasting
      ? 'READY'
      : totalCount > 0
      ? 'MATCHED'
      : 'EMPTY');

  // Channel lookup helpers
  const otpNetwork = networks.find(
    (n) => (n.network as string) === 'OTP_REGISTERED' || (n.network as string) === 'INVITED' || n.network === 'DIRECT'
  );
  const ondcNetwork = networks.find((n) => n.network === 'ONDC');
  const localNetwork = networks.find(
    (n) => n.network === 'LOCAL_REGISTRY' || n.network === 'ASSOCIATION'
  );

  const otpCount = otpNetwork?.invitedCount ?? (totalCount > 0 ? Math.ceil(totalCount * 0.5) : 0);
  const ondcCount = ondcNetwork?.invitedCount ?? (totalCount > 0 ? Math.floor(totalCount * 0.25) : 0);
  const localCount = localNetwork?.invitedCount ?? (totalCount > 0 ? Math.max(1, totalCount - otpCount - ondcCount) : 0);

  // Status configuration per state
  let statusBadge = `${totalCount} Verified Nearby`;
  let descriptionText =
    'Broadcasting anonymous requirement parameters across verified registries and open network protocols.';
  let liveRegionText = `${totalCount} verified suppliers matched across channels.`;
  let pulseColor = 'bg-emerald-500';
  let pingColor = 'bg-emerald-400';

  switch (effectiveState) {
    case 'DISCOVERING':
      statusBadge = 'Scanning Channels…';
      descriptionText =
        'Actively scanning verified registries and open network protocols for matching suppliers...';
      liveRegionText = 'Discovering suppliers across verified networks.';
      pulseColor = 'bg-blue-500';
      pingColor = 'bg-blue-400';
      break;
    case 'READY':
      statusBadge = isBroadcasting ? 'Quoting Active' : 'Ready to Broadcast';
      descriptionText =
        'Enquiries dispatched across active sourcing channels. Sealed quotes will arrive under protected aliases with responses expected within 30 minutes.';
      liveRegionText = 'RFQ active. Sealed quotes incoming under protected aliases.';
      pulseColor = 'bg-emerald-500';
      pingColor = 'bg-emerald-400';
      break;
    case 'EMPTY':
      statusBadge = '0 Discovered';
      descriptionText =
        'No verified suppliers matched yet. Broaden requirement criteria or invite trusted suppliers directly.';
      liveRegionText = 'No matching suppliers found yet.';
      pulseColor = 'bg-amber-500';
      pingColor = 'bg-amber-400';
      break;
    case 'FILTERED_EMPTY':
      statusBadge = '0 In Active Filter';
      descriptionText =
        'No suppliers match the current filter selection. Switch to "All Matched" or invite a vendor directly.';
      liveRegionText = 'No suppliers match the active filter criteria.';
      pulseColor = 'bg-amber-500';
      pingColor = 'bg-amber-400';
      break;
    case 'ERROR':
      statusBadge = 'Discovery Offline';
      descriptionText =
        errorMessage ||
        'Supplier discovery encountered an issue. You can retry or directly invite known vendors.';
      liveRegionText = `Supplier discovery error: ${errorMessage || 'Discovery temporarily unavailable'}.`;
      pulseColor = 'bg-red-500';
      pingColor = 'bg-red-400';
      break;
    case 'MATCHED':
    default:
      statusBadge = `${totalCount} Verified Nearby`;
      descriptionText =
        'Broadcasting anonymous requirement parameters across verified registries and open network protocols.';
      liveRegionText = `${totalCount} verified suppliers matched across sourcing channels.`;
      pulseColor = 'bg-emerald-500';
      pingColor = 'bg-emerald-400';
      break;
  }

  return (
    <section
      className="rounded-xl bg-slate-900 dark:bg-slate-950 text-white p-3.5 space-y-3 relative overflow-hidden border border-slate-800 shadow-md min-h-[140px] flex flex-col justify-between"
      data-testid="supplier-radar-pulse-banner"
      aria-label="Supplier Discovery Radar"
    >
      {/* Accessible Live Region */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveRegionText}
      </div>

      {/* Subtle sweep gradient background effect with motion-reduction */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/5 to-transparent opacity-50 animate-pulse motion-reduce:animate-none"
        aria-hidden="true"
      />

      {/* Top Pulse Row */}
      <div className="flex items-center justify-between gap-2 relative z-10">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3 shrink-0" aria-hidden="true">
            <span
              className={`animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full ${pingColor} opacity-75`}
            />
            <span className={`relative inline-flex rounded-full h-3 w-3 ${pulseColor}`} />
          </span>
          <h2 className="text-xs sm:text-sm font-bold text-white tracking-wide">
            Supplier Discovery Radar
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

      <p className="text-[11px] text-slate-300 leading-relaxed relative z-10">
        {descriptionText}
      </p>

      {/* Sourcing Channel Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 relative z-10">
        {/* WhatsApp Direct Quoting */}
        <div className="rounded-lg border border-slate-800 bg-slate-800/60 p-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm">💬</span>
            <div className="min-w-0">
              <span className="text-[11px] font-bold text-slate-100 block truncate">WhatsApp Direct Quoting</span>
              <span className="text-[9px] text-slate-400">
                {otpCount > 0 ? `${otpCount} Direct Links` : 'Direct Quoting'}
              </span>
            </div>
          </div>
          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40 shrink-0">
            {otpCount > 0 ? `${otpCount} Sent` : '✓ Sent'}
          </span>
        </div>

        {/* ONDC Sourcing Protocol */}
        <div className="rounded-lg border border-slate-800 bg-slate-800/60 p-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm">🌐</span>
            <div className="min-w-0">
              <span className="text-[11px] font-bold text-slate-100 block truncate">ONDC Sourcing Protocol</span>
              <span className="text-[9px] text-slate-400">
                {ondcCount > 0 ? `${ondcCount} Discovered` : 'Open B2B Protocol'}
              </span>
            </div>
          </div>
          <span className="text-[10px] font-bold text-blue-400 bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-800/40 shrink-0">
            {ondcCount > 0 ? `${ondcCount} Synced` : '✓ Synced'}
          </span>
        </div>

        {/* Supplier PWA Instant Alerts */}
        <div className="rounded-lg border border-slate-800 bg-slate-800/60 p-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm">⚡</span>
            <div className="min-w-0">
              <span className="text-[11px] font-bold text-slate-100 block truncate">Supplier PWA Instant Alerts</span>
              <span className="text-[9px] text-slate-400">
                {localCount > 0 ? `${localCount} Active Nearby` : 'Instant Push Alerts'}
              </span>
            </div>
          </div>
          <span className="text-[10px] font-bold text-purple-400 bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-800/40 shrink-0">
            {localCount > 0 ? `${localCount} Pushed` : '✓ Pushed'}
          </span>
        </div>
      </div>
    </section>
  );
}
