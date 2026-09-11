import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SupplierInvitationList } from '@/features/supplier/components/SupplierInvitationList';
import { useSupplierInvitations } from '@/features/supplier/hooks/use-supplier-invitations';
import { RoleWorkspaceCard } from '@/features/roles';
import {
  fetchSupplierPerformance,
  type SupplierPerformanceSummary,
} from '@/features/supplier/api/fetch-supplier-performance';
import { SupplierPerformanceSection } from '@/features/supplier/components/SupplierPerformanceSection';
import { fetchPurchaseOrders } from '@/features/fulfillment/api/purchase-orders';
import { formatMoney, type PurchaseOrderSummary } from '@/features/fulfillment/types/fulfillment';

export function SupplierDashboardPage() {
  const { invitations, isLoading, error, refresh } = useSupplierInvitations();
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
  const cancelledLostCount = invitations.filter(
    (inv) =>
      inv.rfqStatus === 'CANCELLED' ||
      (inv.rfqStatus === 'CLOSED' && inv.status !== 'QUOTED')
  ).length;
  const ordersInExecution = purchaseOrders.filter((po) => !po.isSettled && po.status !== 'CANCELLED' && po.status !== 'DRAFT').length || (performance?.inExecutionCount ?? 0);
  const completedOrders = purchaseOrders.filter((po) => po.isSettled || po.status === 'COMPLETED').length || (performance?.completedOrdersCount ?? (performance?.completedJobs ?? 0));
  const ratingAvg = performance?.ratingAvg ?? 5.0;
  const totalReviews = performance?.totalReviews ?? 0;

  const isInvitationStalled = (inv: (typeof invitations)[0]) => {
    if (inv.rfqStatus === 'AWARDED' || inv.rfqStatus === 'CLOSED' || inv.rfqStatus === 'CANCELLED') return false;
    const date = inv.invitedAt;
    if (!date) return false;
    return Date.now() - new Date(date).getTime() > 24 * 60 * 60 * 1000;
  };
  const stalledSupplierCount = invitations.filter(isInvitationStalled).length;

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
    <div className="zero-scroll-container p-2 sm:p-3 max-w-7xl mx-auto w-full" data-testid="supplier-dashboard">
      {/* Header - High Density Single Row */}
      <header className="rounded-lg border bg-card px-2.5 sm:px-3 py-1.5 sm:py-2 shadow-2xs shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <h1 className="text-xs sm:text-sm font-bold tracking-tight text-foreground truncate">Supplier Workspace</h1>
          {performance && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60 shadow-2xs shrink-0">
              ⭐ {ratingAvg.toFixed(1)} / 5.0 Rating
            </span>
          )}
          <span className="hidden md:inline-flex rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[9px] font-semibold border border-primary/20">
            Neutral Anonymity Active
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Link
            to="/supplier/purchase-orders"
            className="rounded bg-primary px-2 sm:px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition"
          >
            Active POs →
          </Link>
          <Link
            to="/supplier/capabilities"
            className="hidden sm:inline-flex rounded border bg-card px-2 py-1 text-xs font-medium hover:bg-muted transition"
          >
            Capabilities →
          </Link>
        </div>
      </header>

      {/* Action Required Alert: Purchase Orders Awaiting Acceptance (Compact) */}
      {pendingAcceptancePOs.length > 0 && (
        <div className="mt-1.5 rounded-lg border-2 border-blue-500 bg-blue-50/80 dark:bg-blue-950/30 p-2.5 shadow-2xs shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-blue-900 dark:text-blue-200 font-bold text-xs">
              <span>⚡</span>
              <span>Action Required: {pendingAcceptancePOs.length} Purchase Order{pendingAcceptancePOs.length === 1 ? '' : 's'} Awaiting Acceptance</span>
            </div>
            <span className="rounded-full bg-blue-200 dark:bg-blue-900/60 px-2 py-0.2 text-[9px] font-bold text-blue-900 dark:text-blue-200">
              NEW AWARD
            </span>
          </div>
          <div className="mt-2 space-y-1.5">
            {pendingAcceptancePOs.map((po) => (
              <div
                key={po.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border bg-card p-2 text-xs shadow-2xs hover:border-blue-300 transition"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-foreground">{po.poNumber}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-semibold text-foreground truncate">{po.rfqTitle}</span>
                  <span className="text-muted-foreground">·</span>
                  <span>Value: <strong className="text-foreground">{formatMoney(po.totalAmount, po.currency)}</strong></span>
                </div>
                <Link
                  to={`/supplier/purchase-orders/${po.id}`}
                  className="rounded bg-blue-600 px-2.5 py-0.5 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 transition flex items-center gap-1"
                >
                  <span>⚡ Accept PO →</span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Seller KPI Stat Ribbon (Compact 4-column) */}
      <section className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
        {/* Box 1: New RFQ Invitations */}
        <button
          type="button"
          onClick={() => {
            setFilterTab('ACTION_REQUIRED');
          }}
          className={`group rounded-lg border p-2 text-left shadow-2xs transition hover:border-amber-400 ${
            filterTab === 'ACTION_REQUIRED' ? 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-400 ring-1 ring-amber-300' : 'bg-card'
          }`}
          data-testid="stat-new-invitations"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">New RFQ Invites</p>
            <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 opacity-80">Quote →</span>
          </div>
          <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
            {openInvitations}
          </p>
        </button>

        {/* Box 2: Active Quotes Submitted */}
        <button
          type="button"
          onClick={() => {
            setFilterTab('EVALUATING');
          }}
          className={`group rounded-lg border p-2 text-left shadow-2xs transition hover:border-primary/50 ${
            filterTab === 'EVALUATING' ? 'bg-primary/5 border-primary ring-1 ring-primary/20' : 'bg-card'
          }`}
          data-testid="stat-active-quotes"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-primary">Active Quotes</p>
            <span className="text-[10px] font-semibold text-primary opacity-80">Review →</span>
          </div>
          <p className="text-lg font-bold text-primary">
            {activeQuotedCount}
          </p>
        </button>

        {/* Box 3: Orders in Execution */}
        <Link
          to="/supplier/purchase-orders"
          className="group rounded-lg border bg-card p-2 text-left shadow-2xs transition hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-950/30"
          data-testid="stat-orders-execution"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-blue-800 dark:text-blue-300">In Execution</p>
            <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 opacity-80">Work →</span>
          </div>
          <p className="text-lg font-bold text-blue-700 dark:text-blue-400">
            {ordersInExecution}
          </p>
        </Link>

        {/* Box 4: Completed & Settled */}
        <Link
          to="/supplier/purchase-orders"
          className="group rounded-lg border bg-card p-2 text-left shadow-2xs transition hover:border-emerald-400 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/30"
          data-testid="stat-completed-settled"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">Completed</p>
            <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 opacity-80">Invoices →</span>
          </div>
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
            {completedOrders}
          </p>
        </Link>
      </section>

      {/* Main Internal Scroll Content Area */}
      <div className="zero-scroll-pane mt-2 space-y-2">
        {/* Supplier RFQ Invitations List */}
        <section id="supplier-rfq-invitations" className="rounded-lg border bg-card p-3 shadow-2xs">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Invited Enquiries &amp; Active RFQs
              </h2>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1 rounded bg-muted/40 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setFilterTab('ALL')}
                className={`rounded px-2 py-0.5 font-semibold transition ${
                  filterTab === 'ALL'
                    ? 'bg-card text-foreground shadow-2xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All ({invitations.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('ACTION_REQUIRED')}
                className={`flex items-center gap-1 rounded px-2 py-0.5 font-bold transition ${
                  filterTab === 'ACTION_REQUIRED'
                    ? 'bg-amber-500 text-white shadow-2xs'
                    : 'text-amber-900 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200'
                }`}
              >
                <span>⚡ Quote</span>
                <span
                  className={`rounded-full px-1 text-[9px] ${
                    filterTab === 'ACTION_REQUIRED'
                      ? 'bg-amber-700 text-white'
                      : 'bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200'
                  }`}
                >
                  {openInvitations}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('EVALUATING')}
                className={`rounded px-1.5 py-0.5 font-semibold transition ${
                  filterTab === 'EVALUATING'
                    ? 'bg-card text-primary shadow-2xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                ⚖️ Submitted ({activeQuotedCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('AWARDED')}
                className={`rounded px-1.5 py-0.5 font-semibold transition ${
                  filterTab === 'AWARDED'
                    ? 'bg-card text-teal-700 dark:text-teal-300 shadow-2xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                🏆 Awarded ({pendingAcceptancePOs.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('PO_ISSUED')}
                className={`rounded px-1.5 py-0.5 font-semibold transition ${
                  filterTab === 'PO_ISSUED'
                    ? 'bg-card text-blue-700 dark:text-blue-300 shadow-2xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                📦 Work Orders ({ordersInExecution})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('SETTLED')}
                className={`rounded px-1.5 py-0.5 font-semibold transition ${
                  filterTab === 'SETTLED'
                    ? 'bg-card text-emerald-800 dark:text-emerald-300 shadow-2xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                🏁 Settled ({completedOrders})
              </button>
              {stalledSupplierCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterTab('STALLED')}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-bold transition ${
                    filterTab === 'STALLED'
                      ? 'bg-red-600 text-white shadow-2xs'
                      : 'text-red-900 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300'
                  }`}
                >
                  <span>⚠️ Stalled</span>
                  <span className="rounded-full bg-red-800 text-white px-1 text-[9px]">{stalledSupplierCount}</span>
                </button>
              )}
            </div>
          </div>

          <SupplierInvitationList
            invitations={filteredInvitations}
            purchaseOrders={purchaseOrders}
            isLoading={isLoading}
            error={error}
          />
          {!isLoading && !error && filteredInvitations.length === 0 && (
            <div className="py-6 text-center text-xs text-muted-foreground">
              <p>
                {filterTab === 'ACTION_REQUIRED'
                  ? '✓ All Caught Up! No pending RFQs awaiting your quote response.'
                  : filterTab === 'EVALUATING'
                  ? 'No active quotes currently under evaluation.'
                  : 'No RFQ invitations in this filter.'}
              </p>
              <Link to="/supplier/capabilities" className="mt-1.5 inline-block font-semibold text-primary hover:underline">
                Add more capabilities and PIN codes to receive more enquiries →
              </Link>
            </div>
          )}
        </section>

        {/* Buyer Ratings, Reviews & Continuous Improvement Section */}
        <div className="rounded-lg border bg-card p-3 shadow-2xs">
          <SupplierPerformanceSection performance={performance} isLoading={isPerfLoading} />
        </div>
      </div>
    </div>
  );
}

