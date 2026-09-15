import type { SupplierNetworkSummary } from '@otp/domain';

interface SupplierRadarPulseBannerProps {
  totalCount: number;
  networks: SupplierNetworkSummary[];
  isBroadcasting?: boolean;
}

export function SupplierRadarPulseBanner({
  totalCount,
  networks,
  isBroadcasting = false,
}: SupplierRadarPulseBannerProps) {
  return (
    <section
      className="rounded-xl bg-slate-900 dark:bg-slate-950 text-white p-3.5 space-y-3 relative overflow-hidden border border-slate-800 shadow-md"
      data-testid="supplier-radar-pulse-banner"
    >
      {/* Top Pulse Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
          </span>
          <h2 className="text-xs sm:text-sm font-bold text-white tracking-wide">
            Supplier Discovery Radar
          </h2>
        </div>

        <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-full shrink-0">
          {totalCount} Verified Nearby
        </span>
      </div>

      <p className="text-[11px] text-slate-300 leading-relaxed">
        {isBroadcasting
          ? 'Enquiries dispatched across active sourcing channels. Sealed quotes will arrive under protected aliases with responses expected within 30 minutes.'
          : 'Broadcasting anonymous requirement parameters across verified registries and open network protocols.'}
      </p>

      {/* Sourcing Channel Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
        <div className="rounded-lg border border-slate-800 bg-slate-800/60 p-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm">🏢</span>
            <div className="min-w-0">
              <span className="text-[11px] font-bold text-slate-100 block truncate">OTP Network</span>
              <span className="text-[9px] text-slate-400">Verified Vendors</span>
            </div>
          </div>
          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40 shrink-0">
            ✓ Active
          </span>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-800/60 p-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm">🌐</span>
            <div className="min-w-0">
              <span className="text-[11px] font-bold text-slate-100 block truncate">ONDC Protocol</span>
              <span className="text-[9px] text-slate-400">Open B2B Network</span>
            </div>
          </div>
          <span className="text-[10px] font-bold text-blue-400 bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-800/40 shrink-0">
            ✓ Connected
          </span>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-800/60 p-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm">📍</span>
            <div className="min-w-0">
              <span className="text-[11px] font-bold text-slate-100 block truncate">Local Registry</span>
              <span className="text-[9px] text-slate-400">Direct &amp; Regional</span>
            </div>
          </div>
          <span className="text-[10px] font-bold text-purple-400 bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-800/40 shrink-0">
            ✓ Matched
          </span>
        </div>
      </div>
    </section>
  );
}
