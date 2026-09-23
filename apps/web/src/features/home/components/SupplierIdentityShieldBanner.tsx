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
      className="rounded-2xl border border-border/80 bg-card p-3.5 sm:p-4 shadow-sm space-y-3 text-left"
      data-testid="supplier-identity-shield-banner"
    >
      {/* 1. Verified Supplier Header (Screen 05) */}
      <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold text-sm shrink-0">
            ⚡
          </div>
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-bold text-foreground truncate">
              Sri Vinayaka Works
            </h4>
            <span className="text-[10px] text-muted-foreground block truncate">
              Whitefield · Rewinding &amp; Pumps
            </span>
          </div>
        </div>
        <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold shrink-0 flex items-center gap-1">
          <span>⭐</span>
          <span>4.9 Verified</span>
        </span>
      </div>

      {/* 2. Quick Filter Chips (Screen 05) */}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <span className="rounded-lg bg-primary text-primary-foreground px-2.5 py-1 text-[11px] font-bold shadow-2xs">
          📍 &lt; 10 km
        </span>
        <span className="rounded-lg bg-card border border-border/80 text-foreground px-2.5 py-1 text-[11px] font-semibold">
          ⚡ 5-25 HP
        </span>
        <span className="rounded-lg bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-300 px-2.5 py-1 text-[11px] font-bold">
          🟢 Live RFQs ({opportunitiesCount || 2})
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
