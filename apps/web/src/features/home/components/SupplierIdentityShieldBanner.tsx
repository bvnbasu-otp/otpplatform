import { Link } from 'react-router-dom';
import type { SupplierCapabilityProfile } from '@/features/supplier/types/capability-profile';

interface SupplierIdentityShieldBannerProps {
  profile?: SupplierCapabilityProfile;
  opportunitiesCount?: number;
  actionCount?: number;
  activeQuotesCount?: number;
  activeOrdersCount?: number;
  onEditScope?: () => void;
}

const SUPPLIER_COMMERCIAL_STAGES = [
  { num: '01', name: 'Opportunity Radar', icon: '📡' },
  { num: '02', name: '30-Min Quoting', icon: '⚡' },
  { num: '03', name: 'Sealed Matrix', icon: '⚖️' },
  { num: '04', name: 'Committee Review', icon: '🗳️' },
  { num: '05', name: 'Award & Reveal', icon: '🏆' },
  { num: '06', name: 'PO & Execution', icon: '📦' },
];

export function SupplierIdentityShieldBanner({
  profile,
  opportunitiesCount = 0,
  actionCount = 0,
  activeQuotesCount = 0,
  activeOrdersCount = 0,
  onEditScope,
}: SupplierIdentityShieldBannerProps) {
  const categoryCount = profile?.categories?.length || 0;
  const radiusText = profile?.isPanIndia
    ? 'Pan-India Reach'
    : `${profile?.radiusKm || 50} km Radius (${profile?.baseCity || 'Local'})`;

  return (
    <section
      className="rounded-2xl border-2 border-purple-500/30 bg-gradient-to-b from-card via-card to-purple-500/5 p-4 sm:p-5 shadow-sm space-y-4 text-left"
      data-testid="supplier-identity-shield-banner"
    >
      {/* Top Banner Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 text-purple-700 dark:text-purple-300 text-base font-bold shadow-2xs">
            🛡️
          </span>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-sm sm:text-base font-black text-foreground tracking-tight">
                Supplier Sourcing Hub
              </h2>
              <span className="rounded-full bg-purple-100 dark:bg-purple-950/80 text-purple-900 dark:text-purple-300 border border-purple-300 dark:border-purple-800 px-2 py-0.5 text-[10px] font-extrabold shrink-0">
                Identity-Protected Guarantee
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Quote competitively without identity exposure. All proposals remain cryptographically sealed until buyer award lock.
            </p>
          </div>
        </div>

        {/* Cryptographic Seal Badge */}
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 px-2.5 py-1 text-[10px] font-bold shrink-0 shadow-2xs">
          <span>🔒</span>
          <span>SHA-256 Sealed Sourcing</span>
        </span>
      </div>

      {/* Sourcing Radar KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-xl bg-card border border-border/80 p-2.5 text-center shadow-2xs">
          <span className="text-[9px] uppercase font-bold text-purple-700 dark:text-purple-300 block">
            Radar Opportunities
          </span>
          <span className="text-base sm:text-lg font-black text-purple-900 dark:text-purple-200 block mt-0.5">
            {opportunitiesCount}
          </span>
          <span className="text-[9px] text-muted-foreground block">Matching Your Scope</span>
        </div>

        <div className="rounded-xl bg-card border border-border/80 p-2.5 text-center shadow-2xs">
          <span className="text-[9px] uppercase font-bold text-amber-700 dark:text-amber-400 block">
            Action Required
          </span>
          <span className="text-base sm:text-lg font-black text-amber-700 dark:text-amber-400 block mt-0.5">
            {actionCount}
          </span>
          <span className="text-[9px] text-muted-foreground block">PO &amp; Closing Soon</span>
        </div>

        <div className="rounded-xl bg-card border border-border/80 p-2.5 text-center shadow-2xs">
          <span className="text-[9px] uppercase font-bold text-blue-700 dark:text-blue-300 block">
            Active Quotes
          </span>
          <span className="text-base sm:text-lg font-black text-blue-900 dark:text-blue-200 block mt-0.5">
            {activeQuotesCount}
          </span>
          <span className="text-[9px] text-muted-foreground block">Under Evaluation</span>
        </div>

        <div className="rounded-xl bg-card border border-border/80 p-2.5 text-center shadow-2xs">
          <span className="text-[9px] uppercase font-bold text-emerald-700 dark:text-emerald-400 block">
            Active Orders
          </span>
          <span className="text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-400 block mt-0.5">
            {activeOrdersCount}
          </span>
          <span className="text-[9px] text-muted-foreground block">Direct Settlement</span>
        </div>
      </div>

      {/* Sourcing Radar Scope Quick Bar */}
      <div className="flex items-center justify-between gap-2 bg-purple-500/10 border border-purple-500/25 rounded-xl p-3">
        <div className="min-w-0 flex-1">
          <span className="text-xs font-bold text-purple-950 dark:text-purple-200 block truncate">
            📡 Active Radar Scope · {categoryCount} {categoryCount === 1 ? 'Category' : 'Categories'}
          </span>
          <span className="text-[11px] text-muted-foreground block truncate">
            📍 {radiusText} · Instant 30-minute mobile quoting active
          </span>
        </div>
        {onEditScope && (
          <button
            type="button"
            onClick={onEditScope}
            className="min-h-[44px] inline-flex items-center justify-center gap-1 rounded-xl bg-card border border-purple-300 dark:border-purple-800 hover:bg-muted text-purple-900 dark:text-purple-300 px-3.5 py-2 text-xs font-bold shadow-2xs active:scale-95 transition shrink-0 cursor-pointer mobile-touch-target"
          >
            <span>⚙️ Edit Scope</span>
          </button>
        )}
      </div>

      {/* Canonical 6-Stage Supplier Workflow */}
      <div className="pt-1 border-t border-border/60">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-2">
          <span>Supplier Commercial Lifecycle:</span>
          <Link to="/faqs#supplier" className="text-purple-600 dark:text-purple-400 hover:underline">
            Supplier Guide →
          </Link>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-center">
          {SUPPLIER_COMMERCIAL_STAGES.map((stage) => (
            <div
              key={stage.num}
              className="rounded-lg border border-border/60 bg-muted/20 p-1.5 space-y-0.5"
            >
              <div className="text-xs">{stage.icon}</div>
              <div className="font-mono text-[9px] font-extrabold text-muted-foreground">
                {stage.num}
              </div>
              <div className="text-[10px] font-bold text-foreground truncate">
                {stage.name}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
