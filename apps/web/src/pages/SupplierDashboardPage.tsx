import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SupplierInvitationList } from '@/features/supplier/components/SupplierInvitationList';
import { useSupplierInvitations } from '@/features/supplier/hooks/use-supplier-invitations';
import {
  fetchSupplierPerformance,
  type SupplierPerformanceSummary,
} from '@/features/supplier/api/fetch-supplier-performance';
import { SupplierPerformanceSection } from '@/features/supplier/components/SupplierPerformanceSection';
import { fetchPurchaseOrders } from '@/features/fulfillment/api/purchase-orders';
import { formatMoney, type PurchaseOrderSummary } from '@/features/fulfillment/types/fulfillment';
import { MobileGlanceBar } from '@/components/ui/MobileGlanceBar';
import { RoleModeToggle } from '@/components/ui/RoleModeToggle';
import {
  SupplierCapabilityModal,
  useSupplierRadarCapabilities,
} from '@/features/supplier';

export function SupplierDashboardPage() {
  const { invitations, isLoading, error, refresh } = useSupplierInvitations();
  const { profile } = useSupplierRadarCapabilities();
  const [isCapabilityModalOpen, setIsCapabilityModalOpen] = useState(false);
  const [performance, setPerformance] = useState<SupplierPerformanceSummary | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderSummary[]>([]);
  const [isPerfLoading, setIsPerfLoading] = useState(true);

  type SupplierFilterTab =
    | 'ALL'
    | 'ACTION_REQUIRED'
    | 'QUOTING'
    | 'EVALUATING'
    | 'AWARDED'
    | 'PO_ISSUED'
    | 'SETTLED'
    | 'STALLED'
    | 'CANCELLED_LOST';

  const [filterTab, setFilterTab] = useState<SupplierFilterTab>('ALL');

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setIsPerfLoading(true);
      const [perfRes, poRes] = await Promise.all([
        fetchSupplierPerformance(),
        fetchPurchaseOrders(),
      ]);

      if (!cancelled) {
        if (perfRes.ok) {
          setPerformance(perfRes.performance);
        }
        if (poRes.ok) {
          setPurchaseOrders(poRes.orders);
        }
        setIsPerfLoading(false);
      }
    }
    void loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  const pendingAcceptancePOs = purchaseOrders.filter((po) => po.status === 'ISSUED');

  const openInvitations = invitations.filter(
    (inv) =>
      (inv.status === 'INVITED' || inv.status === 'VIEWED') &&
      inv.rfqStatus !== 'AWARDED' &&
      inv.rfqStatus !== 'CLOSED' &&
      inv.rfqStatus !== 'CANCELLED'
  ).length;

  const activeQuotedCount = invitations.filter(
    (inv) =>
      inv.status === 'QUOTED' &&
      inv.rfqStatus !== 'AWARDED' &&
      inv.rfqStatus !== 'CLOSED' &&
      inv.rfqStatus !== 'CANCELLED'
  ).length;

  const ordersInExecution = purchaseOrders.filter(
    (po) => !po.isSettled && po.status !== 'CANCELLED' && po.status !== 'DRAFT'
  ).length || (performance?.inExecutionCount ?? 0);

  const completedOrders = purchaseOrders.filter(
    (po) => po.isSettled || po.status === 'COMPLETED'
  ).length || (performance?.completedOrdersCount ?? (performance?.completedJobs ?? 0));

  const ratingAvg = performance?.ratingAvg ?? 5.0;

  const isInvitationStalled = (inv: (typeof invitations)[0]) => {
    if (inv.rfqStatus === 'AWARDED' || inv.rfqStatus === 'CLOSED' || inv.rfqStatus === 'CANCELLED') return false;
    const date = inv.invitedAt;
    if (!date) return false;
    return Date.now() - new Date(date).getTime() > 24 * 60 * 60 * 1000;
  };
  const stalledSupplierCount = invitations.filter(isInvitationStalled).length;

  // Active RFQs (all open/quoting/evaluating)
  const totalActiveRfqs = openInvitations + activeQuotedCount;

  // Glance bar mapping
  const glanceFilter = filterTab === 'ACTION_REQUIRED'
    ? 'ACTION_REQUIRED'
    : filterTab === 'SETTLED'
    ? 'COMPLETED'
    : filterTab === 'EVALUATING' || filterTab === 'QUOTING'
    ? 'ACTIVE'
    : 'ALL';

  const handleGlanceSelect = (filter: 'ALL' | 'ACTIVE' | 'ACTION_REQUIRED' | 'COMPLETED') => {
    if (filter === 'ACTIVE') {
      setFilterTab('EVALUATING');
    } else if (filter === 'ACTION_REQUIRED') {
      setFilterTab('ACTION_REQUIRED');
    } else if (filter === 'COMPLETED') {
      setFilterTab('SETTLED');
    } else {
      setFilterTab('ALL');
    }
  };

  const filteredInvitations = invitations.filter((inv) => {
    if (filterTab === 'ACTION_REQUIRED') {
      return (
        (inv.status === 'INVITED' || inv.status === 'VIEWED') &&
        inv.rfqStatus !== 'AWARDED' &&
        inv.rfqStatus !== 'CLOSED' &&
        inv.rfqStatus !== 'CANCELLED'
      );
    }
    if (filterTab === 'QUOTING') {
      return (
        (inv.status === 'INVITED' || inv.status === 'VIEWED') &&
        inv.rfqStatus !== 'AWARDED' &&
        inv.rfqStatus !== 'CLOSED' &&
        inv.rfqStatus !== 'CANCELLED'
      );
    }
    if (filterTab === 'EVALUATING') {
      return (
        inv.status === 'QUOTED' &&
        inv.rfqStatus !== 'AWARDED' &&
        inv.rfqStatus !== 'CLOSED' &&
        inv.rfqStatus !== 'CANCELLED'
      );
    }
    if (filterTab === 'AWARDED') {
      return inv.rfqStatus === 'AWARDED';
    }
    if (filterTab === 'PO_ISSUED') {
      return purchaseOrders.some((po) => po.rfqId === inv.rfqId && !po.isSettled && po.status !== 'CANCELLED');
    }
    if (filterTab === 'SETTLED') {
      return (
        inv.rfqStatus === 'CLOSED' ||
        purchaseOrders.some((po) => po.rfqId === inv.rfqId && (po.isSettled || po.status === 'COMPLETED'))
      );
    }
    if (filterTab === 'STALLED') {
      return isInvitationStalled(inv);
    }
    if (filterTab === 'CANCELLED_LOST') {
      return (
        inv.rfqStatus === 'CANCELLED' ||
        (inv.rfqStatus === 'CLOSED' && inv.status !== 'QUOTED')
      );
    }
    return true;
  });

  return (
    <div
      className="p-3 sm:p-4 max-w-4xl mx-auto w-full space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] overflow-x-hidden min-w-0 max-w-full"
      data-testid="supplier-dashboard"
    >
      {/* 1. Header Bar: Supplier Profile & Verification Status */}
      <header className="rounded-2xl border bg-card p-3.5 shadow-xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black text-sm shrink-0 border border-primary/20">
            🏢
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-foreground truncate">
              Supplier Workspace
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/60 px-2 py-0.2 text-[10px] font-bold text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60">
                ⭐ {ratingAvg.toFixed(1)} Rating
              </span>
              <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.2 text-[9px] font-bold">
                ✓ Verified
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <RoleModeToggle size="sm" />
          <button
            type="button"
            onClick={() => setIsCapabilityModalOpen(true)}
            className="min-h-[44px] rounded-xl bg-purple-600 px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-purple-700 transition flex items-center gap-1 active:scale-98 mobile-touch-target cursor-pointer"
            title="Maximize Business Reach — Update Capabilities"
            data-testid="dashboard-supplier-capabilities-btn"
          >
            <span>+ Add Capabilities</span>
          </button>
          <Link
            to="/supplier/purchase-orders"
            className="hidden sm:inline-flex min-h-[44px] rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition items-center gap-1 active:scale-98 mobile-touch-target"
          >
            <span>Active POs</span>
            <span>→</span>
          </Link>
        </div>
      </header>

      {/* 2. Supplier Discovery Radar Matching Status Banner */}
      <section className="rounded-2xl border bg-gradient-to-br from-purple-900/10 via-card to-card p-3.5 shadow-xs space-y-2 border-purple-500/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-purple-950 dark:text-purple-300">
              Supplier Discovery Radar · Active Scope
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setIsCapabilityModalOpen(true)}
            className="text-[11px] font-bold text-purple-700 dark:text-purple-300 hover:underline flex items-center gap-1 cursor-pointer"
            title="Maximize Business Reach — Update Capabilities"
          >
            <span>⚙️ Edit Capabilities &amp; Radar Scope →</span>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {profile.categories.map((cat) => (
            <span key={cat} className="rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 px-2 py-0.5 text-[10px] font-bold">
              ✓ {cat}
            </span>
          ))}
          <span className="rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 px-2 py-0.5 text-[10px] font-bold">
            📍 {profile.isPanIndia ? 'Pan-India' : `${profile.radiusKm} km radius (${profile.baseCity})`}
          </span>
          {profile.slaBadges.map((sla) => (
            <span key={sla} className="rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 px-2 py-0.5 text-[10px] font-bold">
              ⚡ {sla}
            </span>
          ))}
        </div>
      </section>

      {/* 3. Urgent Action Alert: Purchase Orders Awaiting Acceptance */}
      {pendingAcceptancePOs.length > 0 && (
        <section className="rounded-2xl border-2 border-blue-500 bg-blue-50/80 dark:bg-blue-950/30 p-3.5 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-blue-900 dark:text-blue-200 font-extrabold text-xs">
              <span className="text-sm">⚡</span>
              <span>Action Required: {pendingAcceptancePOs.length} Purchase Order{pendingAcceptancePOs.length === 1 ? '' : 's'} Awaiting Acceptance</span>
            </div>
            <span className="rounded-full bg-blue-200 dark:bg-blue-900/60 px-2 py-0.5 text-[9px] font-black text-blue-900 dark:text-blue-200">
              NEW AWARD
            </span>
          </div>
          <div className="space-y-2">
            {pendingAcceptancePOs.map((po) => (
              <div
                key={po.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border bg-card p-3 text-xs shadow-2xs hover:border-blue-300 transition"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-mono font-bold text-foreground">
                    <span>{po.poNumber}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-black">{formatMoney(po.totalAmount, po.currency)}</span>
                  </div>
                  <p className="font-semibold text-foreground truncate mt-0.5">{po.rfqTitle}</p>
                </div>
                <Link
                  to={`/supplier/purchase-orders/${po.id}`}
                  className="min-h-[44px] rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition flex items-center justify-center gap-1.5 active:scale-98 mobile-touch-target"
                >
                  <span>⚡ Accept Purchase Order →</span>
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. Screen 5 Flagship Component: Mobile 3-State Glance Bar */}
      <section className="space-y-1.5">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-0.5">
          What needs my attention?
        </h2>
        <MobileGlanceBar
          activeCount={totalActiveRfqs}
          actionRequiredCount={openInvitations}
          completedCount={completedOrders}
          selectedFilter={glanceFilter}
          onSelectFilter={handleGlanceSelect}
        />
      </section>

      {/* 5. Filter Chips Row */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none min-w-0 max-w-full">
        <button
          type="button"
          onClick={() => setFilterTab('ALL')}
          className={`min-h-[44px] shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition mobile-touch-target ${
            filterTab === 'ALL'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'bg-card border text-muted-foreground hover:text-foreground'
          }`}
        >
          All ({invitations.length})
        </button>
        <button
          type="button"
          onClick={() => setFilterTab('ACTION_REQUIRED')}
          className={`min-h-[44px] shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition border mobile-touch-target ${
            filterTab === 'ACTION_REQUIRED'
              ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
              : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 text-amber-900 dark:text-amber-200'
          }`}
        >
          <span>🟡 Quotes Due</span>
          <span className="rounded-full bg-amber-700 text-white px-1.5 py-0.2 text-[10px]">
            {openInvitations}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setFilterTab('EVALUATING')}
          className={`min-h-[44px] shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition mobile-touch-target ${
            filterTab === 'EVALUATING'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'bg-card border text-muted-foreground hover:text-foreground'
          }`}
        >
          ⚖️ Under Evaluation ({activeQuotedCount})
        </button>
        <button
          type="button"
          onClick={() => setFilterTab('AWARDED')}
          className={`min-h-[44px] shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition mobile-touch-target ${
            filterTab === 'AWARDED'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'bg-card border text-muted-foreground hover:text-foreground'
          }`}
        >
          🏆 Awarded ({pendingAcceptancePOs.length})
        </button>
        <button
          type="button"
          onClick={() => setFilterTab('PO_ISSUED')}
          className={`min-h-[44px] shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition mobile-touch-target ${
            filterTab === 'PO_ISSUED'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'bg-card border text-muted-foreground hover:text-foreground'
          }`}
        >
          📦 Work Orders ({ordersInExecution})
        </button>
        <button
          type="button"
          onClick={() => setFilterTab('SETTLED')}
          className={`min-h-[44px] shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition mobile-touch-target ${
            filterTab === 'SETTLED'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'bg-card border text-muted-foreground hover:text-foreground'
          }`}
        >
          ⚪ Settled ({completedOrders})
        </button>
        {stalledSupplierCount > 0 && (
          <button
            type="button"
            onClick={() => setFilterTab('STALLED')}
            className={`min-h-[44px] shrink-0 flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition bg-red-50 text-red-700 border border-red-300 dark:bg-red-950/40 dark:text-red-300 mobile-touch-target`}
          >
            <span>⚠️ Stalled ({stalledSupplierCount})</span>
          </button>
        )}
      </div>

      {/* 6. Active Opportunity List with Real-Time Radar Match Scores */}
      <section id="supplier-rfq-invitations" className="space-y-3">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            RFQ Opportunities &amp; Invitations
          </h2>
          <span className="text-xs text-muted-foreground">
            {filteredInvitations.length} {filteredInvitations.length === 1 ? 'Opportunity' : 'Opportunities'}
          </span>
        </div>

        <SupplierInvitationList
          invitations={filteredInvitations}
          purchaseOrders={purchaseOrders}
          isLoading={isLoading}
          error={error}
        />

        {!isLoading && !error && filteredInvitations.length === 0 && (
          <div className="rounded-2xl border border-dashed p-8 text-center text-xs text-muted-foreground bg-card space-y-2">
            <span className="text-2xl block">🎉</span>
            <p className="font-bold text-foreground">
              {filterTab === 'ACTION_REQUIRED'
                ? 'All caught up! No pending RFQs awaiting your quote response.'
                : filterTab === 'EVALUATING'
                ? 'No active quotes currently under evaluation.'
                : 'No RFQ invitations in this filter.'}
            </p>
            <button
              type="button"
              onClick={() => setIsCapabilityModalOpen(true)}
              className="mt-2 inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl font-bold text-purple-700 dark:text-purple-300 hover:underline bg-purple-500/10 border border-purple-500/20 mobile-touch-target cursor-pointer"
            >
              + Add more capabilities and PIN codes to expand your radar reach →
            </button>
          </div>
        )}
      </section>

      {/* 7. Continuous Improvement: Ratings & Performance Scorecard */}
      <SupplierPerformanceSection performance={performance} isLoading={isPerfLoading} />

      {/* Quick Capability Editor Modal */}
      <SupplierCapabilityModal
        open={isCapabilityModalOpen}
        onClose={() => setIsCapabilityModalOpen(false)}
        onSaved={() => refresh()}
      />
    </div>
  );
}
