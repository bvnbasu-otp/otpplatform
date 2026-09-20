import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { SellerOrderItem, AdminServiceActionType } from '../types/admin';

interface AdminSellerOrdersTableProps {
  orders: SellerOrderItem[];
  isLoading: boolean;
  onExecuteAction: (action: AdminServiceActionType, entityId: string, reason?: string) => Promise<void>;
  onRefresh: () => void;
}

type ViewMode = 'CARDS' | 'PIPELINE' | 'TABLE';

interface SellerPhaseDef {
  key: string;
  step: number;
  label: string;
  shortLabel: string;
  icon: string;
  colorClass: string;
  badgeClass: string;
  description: string;
}

export const SELLER_ADMIN_PHASES: SellerPhaseDef[] = [
  {
    key: 'PO_PENDING_ACCEPTANCE',
    step: 1,
    label: '1. PO Issued (Pending Acceptance)',
    shortLabel: 'PO Pending',
    icon: '📩',
    colorClass: 'border-amber-300 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/20',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800/60',
    description: 'PO generated · Awaiting supplier acceptance & countersign',
  },
  {
    key: 'PO_ACCEPTED',
    step: 2,
    label: '2. PO Accepted',
    shortLabel: 'PO Accepted',
    icon: '✅',
    colorClass: 'border-blue-300 dark:border-blue-800/60 bg-blue-50/40 dark:bg-blue-950/20',
    badgeClass: 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800/60',
    description: 'Supplier accepted · Work order queued for kickoff',
  },
  {
    key: 'IN_PRODUCTION',
    step: 3,
    label: '3. In Execution / Fulfillment',
    shortLabel: 'In Progress',
    icon: '⚙️',
    colorClass: 'border-purple-300 dark:border-purple-800/60 bg-purple-50/40 dark:bg-purple-950/20',
    badgeClass: 'bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/60 dark:text-purple-200 dark:border-purple-800/60',
    description: 'Manufacturing / delivery / service milestones active',
  },
  {
    key: 'DELIVERED_INSPECTED',
    step: 4,
    label: '4. Delivered & Inspected',
    shortLabel: 'Inspected',
    icon: '📦',
    colorClass: 'border-teal-300 dark:border-teal-800/60 bg-teal-50/40 dark:bg-teal-950/20',
    badgeClass: 'bg-teal-100 text-teal-900 border-teal-300 dark:bg-teal-950/60 dark:text-teal-200 dark:border-teal-800/60',
    description: 'Goods/services delivered · Buyer accepted inspection',
  },
  {
    key: 'INVOICED',
    step: 5,
    label: '5. GST Invoiced',
    shortLabel: 'Invoiced',
    icon: '🧾',
    colorClass: 'border-indigo-300 dark:border-indigo-800/60 bg-indigo-50/40 dark:bg-indigo-950/20',
    badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-800/60',
    description: 'Tax Invoice submitted · Awaiting payment release',
  },
  {
    key: 'SETTLED',
    step: 6,
    label: '6. Completed & Paid',
    shortLabel: 'Paid & Settled',
    icon: '💰',
    colorClass: 'border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800/60',
    description: 'Payment settled & verified · Order fulfilled',
  },
];

export function AdminSellerOrdersTable({
  orders,
  isLoading,
  onExecuteAction,
  onRefresh,
}: AdminSellerOrdersTableProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('CARDS');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [stalledFilter, setStalledFilter] = useState(false);
  const [inspectingOrder, setInspectingOrder] = useState<SellerOrderItem | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const resolveSellerPhase = (o: SellerOrderItem): string => {
    if (o.seller_phase) return o.seller_phase;
    if (o.payment_status === 'VERIFIED' || o.po_status === 'COMPLETED' || o.work_order_status === 'COMPLETED') return 'SETTLED';
    if (o.invoice_id) return 'INVOICED';
    if (o.buyer_accepted_at || o.progress_percent === 100) return 'DELIVERED_INSPECTED';
    if (o.work_order_status === 'IN_PROGRESS') return 'IN_PRODUCTION';
    if (o.po_acknowledged_at) return 'PO_ACCEPTED';
    return 'PO_PENDING_ACCEPTANCE';
  };

  const filtered = orders.filter((o) => {
    if (stalledFilter && o.idle_hours < 24) return false;
    const phase = resolveSellerPhase(o);
    if (statusFilter !== 'ALL') {
      const matchStatus =
        phase === statusFilter ||
        o.po_status === statusFilter ||
        o.work_order_status === statusFilter ||
        o.invoice_status === statusFilter;
      if (!matchStatus) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchText =
        o.supplier_name.toLowerCase().includes(q) ||
        (o.supplier_legal_name && o.supplier_legal_name.toLowerCase().includes(q)) ||
        (o.supplier_gstin && o.supplier_gstin.toLowerCase().includes(q)) ||
        (o.supplier_city && o.supplier_city.toLowerCase().includes(q)) ||
        (o.po_number && o.po_number.toLowerCase().includes(q)) ||
        (o.rfq_public_ref && o.rfq_public_ref.toLowerCase().includes(q)) ||
        o.organization_name.toLowerCase().includes(q) ||
        o.requirement_title.toLowerCase().includes(q);
      if (!matchText) return false;
    }
    return true;
  });

  const getPhaseCounts = () => {
    const counts: Record<string, number> = {};
    for (const p of SELLER_ADMIN_PHASES) counts[p.key] = 0;
    for (const o of orders) {
      const p = resolveSellerPhase(o);
      if (counts[p] !== undefined) counts[p]++;
    }
    return counts;
  };

  const phaseCounts = getPhaseCounts();

  const handleQuickAction = async (action: AdminServiceActionType, id: string, label: string) => {
    if (!window.confirm(`Execute action "${label}" on this order?`)) return;
    setActionInProgress(id);
    try {
      await onExecuteAction(action, id, `Triggered from Admin Seller Orders console: ${label}`);
      onRefresh();
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] w-full max-w-full">
      {/* Top Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-card p-3.5 sm:p-4 rounded-2xl border shadow-2xs">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* View Mode Toggle */}
          <div className="flex rounded-xl border bg-muted/50 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('CARDS')}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 transition active:scale-98 ${
                viewMode === 'CARDS'
                  ? 'bg-background text-foreground shadow-xs font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>🃏</span> Cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode('PIPELINE')}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 transition active:scale-98 ${
                viewMode === 'PIPELINE'
                  ? 'bg-background text-foreground shadow-xs font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>📊</span> Radar
            </button>
            <button
              type="button"
              onClick={() => setViewMode('TABLE')}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 transition active:scale-98 ${
                viewMode === 'TABLE'
                  ? 'bg-background text-foreground shadow-xs font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>📋</span> Table
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search supplier, GSTIN, PO#, Buyer..."
              className="w-full rounded-xl border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground font-bold p-1"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border bg-background px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer min-h-[36px]"
          >
            <option value="ALL">All Supplier Phases ({orders.length})</option>
            {SELLER_ADMIN_PHASES.map((p) => (
              <option key={p.key} value={p.key}>
                {p.icon} {p.label} ({phaseCounts[p.key] || 0})
              </option>
            ))}
          </select>

          {/* Stalled Orders Toggle */}
          <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer text-muted-foreground hover:text-foreground select-none min-h-[36px]">
            <input
              type="checkbox"
              checked={stalledFilter}
              onChange={(e) => setStalledFilter(e.target.checked)}
              className="rounded border text-primary focus:ring-primary h-4 w-4"
            />
            <span className="text-amber-900 dark:text-amber-300 font-bold">⚠️ Stalled (&gt;24h)</span>
          </label>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 md:pt-0 border-t md:border-t-0">
          <span className="text-xs text-muted-foreground">
            <strong>{filtered.length}</strong> of <strong>{orders.length}</strong> Supplier Orders
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border bg-background p-2 text-xs text-foreground hover:bg-muted active:scale-98 transition disabled:opacity-50 shadow-2xs"
            title="Refresh Orders"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Phase Summary Metric Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {SELLER_ADMIN_PHASES.map((p) => {
          const count = phaseCounts[p.key] || 0;
          const isSelected = statusFilter === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setStatusFilter(isSelected ? 'ALL' : p.key)}
              className={`rounded-xl border p-3 text-left transition ${p.colorClass} ${
                isSelected ? 'ring-2 ring-primary ring-offset-1 shadow-sm' : 'hover:opacity-90'
              }`}
              title={`${p.label}: ${p.description}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-base">{p.icon}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-black ${p.badgeClass}`}>
                  {count}
                </span>
              </div>
              <div className="mt-1 text-xs font-bold text-foreground truncate" title={p.label}>{p.shortLabel}</div>
              <div className="text-[10px] text-muted-foreground truncate" title={p.description}>{p.description}</div>
            </button>
          );
        })}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="p-8 text-center text-xs text-muted-foreground">
          <span className="inline-block animate-spin mr-2">⏳</span> Loading live seller orders...
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filtered.length === 0 && (
        <div className="rounded-xl border bg-card p-12 text-center space-y-3">
          <span className="text-4xl">🏪</span>
          <h3 className="text-base font-bold text-foreground">No Seller Orders Found</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {search || statusFilter !== 'ALL' || stalledFilter
              ? 'No seller orders match your current filters. Try resetting the search or filter.'
              : 'When buyers award tenders and issue Purchase Orders, supplier fulfillment orders will appear here.'}
          </p>
          {(search || statusFilter !== 'ALL' || stalledFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatusFilter('ALL');
                setStalledFilter(false);
              }}
              className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground shadow"
            >
              Reset Filters
            </button>
          )}
        </div>
      )}

      {/* 1. MOBILE-FIRST RESPONSIVE CARDS VIEW */}
      {!isLoading && viewMode === 'CARDS' && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 w-full max-w-full">
          {filtered.map((order) => {
            const phaseKey = resolveSellerPhase(order);
            const defaultPhase = SELLER_ADMIN_PHASES[0]!;
            const phaseDef = SELLER_ADMIN_PHASES.find((p) => p.key === phaseKey) ?? defaultPhase;
            const isStalled = order.idle_hours >= 24;

            return (
              <article
                key={order.po_id}
                className={`rounded-2xl border bg-card p-4 shadow-2xs space-y-3.5 transition hover:shadow-md flex flex-col justify-between ${
                  isStalled ? 'border-amber-500/50 dark:border-amber-500/40' : ''
                }`}
              >
                {/* Card Header: PO Ref, Prod/Demo, Date, Phase Badge */}
                <div className="space-y-2 border-b border-border/50 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs font-black text-primary truncate">
                          {order.po_number || 'PO-PENDING'}
                        </span>
                        {order.is_demo ? (
                          <span className="rounded bg-purple-500/10 px-1.5 py-0.2 text-[9px] font-bold text-purple-700 dark:text-purple-300 border border-purple-500/30">
                            DEMO
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                            PROD
                          </span>
                        )}
                        {isStalled && (
                          <span className="rounded bg-amber-500/10 px-1.5 py-0.2 text-[9px] font-black text-amber-950 dark:text-amber-200 border border-amber-500/30">
                            ⚠️ {order.idle_hours}h IDLE
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
                        <span>{new Date(order.po_created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        {order.rfq_public_ref && (
                          <span className="font-mono">RFQ: {order.rfq_public_ref}</span>
                        )}
                      </div>
                    </div>

                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black border shrink-0 ${phaseDef.badgeClass}`}>
                      <span>{phaseDef.icon}</span>
                      <span>{phaseDef.shortLabel}</span>
                    </span>
                  </div>

                  {/* Fulfillment Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-muted-foreground uppercase">Fulfillment Progress</span>
                      <span className="font-mono font-black text-foreground">{order.progress_percent || 0}%</span>
                    </div>
                    <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${order.progress_percent || 0}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Card Body: Supplier, Buyer, Requirement, Commercials */}
                <div className="space-y-2.5 text-xs flex-1">
                  {/* Supplier Box */}
                  <div className="rounded-xl border bg-muted/20 p-2.5 space-y-1">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground flex items-center justify-between">
                      <span>🏪 Supplier / Seller</span>
                      {order.supplier_gst_verified && (
                        <span className="text-emerald-950 dark:text-emerald-300 font-bold text-[9px]">✓ GST Verified</span>
                      )}
                    </div>
                    <div className="font-extrabold text-foreground truncate" title={order.supplier_legal_name || order.supplier_name}>
                      {order.supplier_legal_name || order.supplier_name}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono flex-wrap">
                      {order.supplier_gstin && <span>GSTIN: {order.supplier_gstin}</span>}
                      {order.supplier_city && <span>📍 {order.supplier_city}</span>}
                    </div>
                  </div>

                  {/* Requirement & Buyer */}
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">Buyer Requirement:</div>
                    <div className="font-bold text-foreground text-xs line-clamp-2" title={order.requirement_title}>
                      {order.requirement_title}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <span>🏛️</span>
                      <span className="font-semibold text-foreground truncate">{order.organization_name}</span>
                    </div>
                  </div>

                  {/* Commercials Grid */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">Order Value:</span>
                      <span className="font-black text-foreground font-mono text-sm">
                        ₹{(order.po_amount || order.invoice_amount || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">PO Status:</span>
                      <span className="font-bold text-foreground capitalize block truncate">
                        {order.po_status.replace(/_/g, ' ').toLowerCase()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Action Footer: 44px+ touch targets */}
                <div className="pt-2 border-t border-border/50 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setInspectingOrder(order)}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold transition active:scale-98 shadow-xs hover:bg-primary/90 mobile-touch-target"
                  >
                    <span>🔍</span>
                    <span>Inspect PO</span>
                  </button>

                  <Link
                    to={`/admin?tab=seller_troubleshooter&id=${order.po_id || order.po_number || ''}`}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border bg-muted/40 hover:bg-muted text-foreground text-xs font-bold transition active:scale-98 mobile-touch-target text-center"
                  >
                    <span>🩺</span>
                    <span>Diagnostics</span>
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* 2. PIPELINE KANBAN VIEW WITH HORIZONTAL OVERFLOW CONTROLS */}
      {!isLoading && viewMode === 'PIPELINE' && filtered.length > 0 && (
        <div className="overflow-x-auto w-full max-w-full scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-muted/20 pb-4">
          <div className="flex gap-3 items-start min-w-[1100px]">
            {SELLER_ADMIN_PHASES.map((phase) => {
              const columnOrders = filtered.filter((o) => resolveSellerPhase(o) === phase.key);
              return (
                <div
                  key={phase.key}
                  className="flex flex-col rounded-xl border bg-muted/20 p-2.5 space-y-2.5 w-[280px] shrink-0"
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between border-b pb-2 px-1">
                    <div className="flex items-center gap-1.5">
                      <span>{phase.icon}</span>
                      <span className="text-xs font-black text-foreground">{phase.shortLabel}</span>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${phase.badgeClass}`}>
                      {columnOrders.length}
                    </span>
                  </div>

                  {/* Cards List */}
                  <div className="space-y-2">
                    {columnOrders.map((order) => (
                      <div
                        key={order.po_id}
                        onClick={() => setInspectingOrder(order)}
                        className="group cursor-pointer rounded-lg border bg-card p-3 shadow-2xs hover:shadow-md hover:border-primary/50 transition space-y-2 text-left"
                      >
                        {/* Supplier & Badge */}
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="min-w-0">
                            <div
                              className="text-xs font-bold text-foreground group-hover:text-primary transition truncate"
                              title={order.supplier_name}
                            >
                              {order.supplier_name}
                            </div>
                            <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-1 mt-0.5 flex-wrap">
                              <span title={order.po_number || order.po_id}>{order.po_number || 'PO-PENDING'}</span>
                              {order.supplier_gst_verified && (
                                <span className="text-[10px] text-emerald-950 dark:text-emerald-300 font-bold" title="GST Verified">✓ GST</span>
                              )}
                              {order.is_demo ? (
                                <span className="ml-1 rounded bg-purple-500/10 px-1 py-0.2 text-[9px] font-bold text-purple-700 dark:text-purple-300 border border-purple-500/30">
                                  DEMO
                                </span>
                              ) : (
                                <span className="ml-1 rounded bg-emerald-500/10 px-1 py-0.2 text-[9px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                  PROD
                                </span>
                              )}
                            </div>
                          </div>
                          {order.idle_hours > 24 && (
                            <span
                              className="rounded-full bg-amber-500/10 text-amber-900 dark:text-amber-200 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-bold shrink-0"
                              title={`Idle for ${Math.round(order.idle_hours)} hours`}
                            >
                              ⏳ {Math.round(order.idle_hours)}h
                            </span>
                          )}
                        </div>

                        {/* Requirement & Buyer */}
                        <div className="rounded bg-muted/40 p-1.5 text-[11px] space-y-0.5">
                          <div
                            className="text-foreground font-medium line-clamp-1"
                            title={order.requirement_title}
                          >
                            {order.requirement_title}
                          </div>
                          <div
                            className="text-[10px] text-muted-foreground truncate"
                            title={`Buyer: ${order.organization_name} · ${order.delivery_city || 'India'}`}
                          >
                            Buyer: <strong>{order.organization_name}</strong> · {order.delivery_city || 'India'}
                          </div>
                        </div>

                        {/* Progress Bar if In Production */}
                        {order.progress_percent !== null && order.progress_percent !== undefined && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                              <span>Milestone Fulfillment</span>
                              <span>{order.progress_percent}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary transition-all duration-300"
                                style={{ width: `${order.progress_percent}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Order Value & Phase Badge */}
                        <div className="flex items-center justify-between border-t pt-1.5 text-[11px]">
                          <span className="font-extrabold text-foreground">
                            ₹{(order.po_amount || order.invoice_amount || 0).toLocaleString('en-IN')}
                          </span>
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${phase.badgeClass}`}>
                            {order.po_status}
                          </span>
                        </div>
                      </div>
                    ))}

                    {columnOrders.length === 0 && (
                      <div className="py-6 text-center text-[11px] text-muted-foreground">
                        No orders in this phase
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. TABULAR VIEW (Responsive Desktop Table -> Mobile Card Transformation) */}
      {!isLoading && viewMode === 'TABLE' && filtered.length > 0 && (
        <div className="space-y-3 w-full max-w-full">
          {/* Mobile Stacked Cards (Visible < md) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filtered.map((order) => {
              const phaseKey = resolveSellerPhase(order);
              const defaultPhase = SELLER_ADMIN_PHASES[0]!;
              const phaseDef = SELLER_ADMIN_PHASES.find((p) => p.key === phaseKey) ?? defaultPhase;

              return (
                <article
                  key={order.po_id}
                  onClick={() => setInspectingOrder(order)}
                  className="rounded-2xl border bg-card p-3.5 shadow-xs space-y-2.5 transition active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-border/50 pb-2">
                    <div className="min-w-0">
                      <span className="font-mono text-[10px] font-bold text-primary block truncate">
                        {order.po_number || 'PO-PENDING'}
                      </span>
                      <h4
                        className="font-extrabold text-xs text-foreground truncate mt-0.5"
                        title={order.supplier_name}
                      >
                        {order.supplier_name}
                      </h4>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold border shrink-0 ${phaseDef.badgeClass}`}>
                      <span>{phaseDef.icon}</span>
                      <span>{phaseDef.shortLabel}</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">Buyer Org:</span>
                      <span className="font-semibold text-foreground truncate block" title={order.organization_name}>
                        {order.organization_name}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">Order Value:</span>
                      <span className="font-black text-foreground block font-mono">
                        ₹{(order.po_amount || order.invoice_amount || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px] gap-2">
                    <span className="text-muted-foreground font-mono">
                      Progress: {order.progress_percent || 0}%
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInspectingOrder(order);
                      }}
                      className="min-h-[44px] px-3.5 rounded-xl border bg-primary/10 text-primary font-bold hover:bg-primary/20 transition flex items-center justify-center mobile-touch-target"
                    >
                      Inspect 🔍
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Desktop Table with Custom Scrollbars & Column Min-Widths */}
          <div className="hidden md:block overflow-x-auto w-full max-w-full scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-muted/20 rounded-xl border bg-card shadow-xs">
            <table className="w-full text-left text-xs border-collapse min-w-[1000px]">
              <thead className="sticky top-0 z-10 border-b bg-muted/90 backdrop-blur-xs font-bold text-muted-foreground text-[11px] uppercase tracking-wider shadow-2xs">
                <tr>
                  <th className="py-3 px-4 min-w-[160px]">PO Number &amp; Date</th>
                  <th className="py-3 px-4 min-w-[180px]">Supplier / Seller</th>
                  <th className="py-3 px-4 min-w-[180px]">Buyer Organization</th>
                  <th className="py-3 px-4 min-w-[200px]">Requirement Title</th>
                  <th className="py-3 px-4 min-w-[120px]">Order Value</th>
                  <th className="py-3 px-4 min-w-[140px]">Fulfillment Phase</th>
                  <th className="py-3 px-4 min-w-[120px]">Progress</th>
                  <th className="py-3 px-4 min-w-[140px] text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-foreground">
                {filtered.map((order) => {
                  const phaseKey = resolveSellerPhase(order);
                  const defaultPhase = SELLER_ADMIN_PHASES[0]!;
                  const phaseDef = SELLER_ADMIN_PHASES.find((p) => p.key === phaseKey) ?? defaultPhase;

                  return (
                    <tr
                      key={order.po_id}
                      className="hover:bg-muted/30 transition cursor-pointer"
                      onClick={() => setInspectingOrder(order)}
                    >
                      <td className="py-3 px-4 min-w-[160px]">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-primary">{order.po_number || 'PO-PENDING'}</span>
                          {order.is_demo ? (
                            <span className="rounded bg-purple-500/10 px-1 py-0.2 text-[9px] font-bold text-purple-700 dark:text-purple-300 border border-purple-500/30">
                              DEMO
                            </span>
                          ) : (
                            <span className="rounded bg-emerald-500/10 px-1 py-0.2 text-[9px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                              PROD
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(order.po_created_at).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                      </td>

                      <td className="py-3 px-4 min-w-[180px]">
                        <div className="font-bold text-foreground line-clamp-1" title={order.supplier_name}>
                          {order.supplier_name}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground">
                          {order.supplier_gstin || 'Unregistered'} · {order.supplier_city || 'India'}
                        </div>
                      </td>

                      <td className="py-3 px-4 min-w-[180px]">
                        <div className="font-semibold text-foreground line-clamp-1" title={order.organization_name}>
                          {order.organization_name}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{order.organization_type || 'INDIVIDUAL'}</div>
                      </td>

                      <td className="py-3 px-4 min-w-[200px]">
                        <div className="font-medium text-foreground line-clamp-1 max-w-xs" title={order.requirement_title}>
                          {order.requirement_title}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {order.category_name || 'Goods/Services'} · {order.quantity ? `${order.quantity} ${order.unit || ''}` : ''}
                        </div>
                      </td>

                      <td className="py-3 px-4 min-w-[120px] font-extrabold text-foreground">
                        ₹{(order.po_amount || order.invoice_amount || 0).toLocaleString('en-IN')}
                      </td>

                      <td className="py-3 px-4 min-w-[140px]">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${phaseDef.badgeClass}`}>
                          <span>{phaseDef.icon}</span>
                          <span>{phaseDef.shortLabel}</span>
                        </span>
                      </td>

                      <td className="py-3 px-4 min-w-[120px]">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${order.progress_percent || 0}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono font-bold text-muted-foreground">
                            {order.progress_percent || 0}%
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 min-w-[140px] text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setInspectingOrder(order)}
                          className="rounded-lg border bg-background px-3 py-1.5 text-xs font-bold text-primary hover:bg-muted transition min-h-[44px] mobile-touch-target"
                        >
                          Inspect 🔍
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. ORDER INSPECTION MODAL */}
      {inspectingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-3xl rounded-2xl bg-card border shadow-2xl p-6 space-y-6 max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-muted/20">
            {/* Header */}
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🏪</span>
                  <h3 className="text-lg font-black text-foreground">
                    Seller Fulfillment Order Inspector
                  </h3>
                  <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-bold font-mono">
                    {inspectingOrder.po_number || 'PO-PENDING'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Full lifecycle visibility across Supplier fulfillment, Purchase Order, Work Order milestones, and Settlement.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setInspectingOrder(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition text-lg"
              >
                ✕
              </button>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Supplier Info */}
              <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <span>🏪</span> Supplier / Seller Entity
                </div>
                <div className="text-sm font-bold text-foreground">{inspectingOrder.supplier_name}</div>
                {inspectingOrder.supplier_legal_name && (
                  <div className="text-[11px] text-muted-foreground">Legal: {inspectingOrder.supplier_legal_name}</div>
                )}
                <div className="space-y-1 font-mono text-[11px] text-muted-foreground pt-1">
                  <div>GSTIN: <strong className="text-foreground">{inspectingOrder.supplier_gstin || 'Not registered'}</strong></div>
                  <div>Email: <strong className="text-foreground">{inspectingOrder.supplier_email || 'N/A'}</strong></div>
                  <div>Phone: <strong className="text-foreground">{inspectingOrder.supplier_phone || 'N/A'}</strong></div>
                  <div>Location: <strong className="text-foreground">{inspectingOrder.supplier_city || 'India'}</strong></div>
                </div>
              </div>

              {/* Buyer Info */}
              <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <span>🏛️</span> Buyer Organization
                </div>
                <div className="text-sm font-bold text-foreground">{inspectingOrder.organization_name}</div>
                <div className="text-[11px] text-muted-foreground">Type: {inspectingOrder.organization_type || 'INDIVIDUAL'}</div>
                <div className="space-y-1 font-mono text-[11px] text-muted-foreground pt-1">
                  <div>Requirement: <strong className="text-foreground">{inspectingOrder.requirement_title}</strong></div>
                  <div>Delivery Location: <strong className="text-foreground">{inspectingOrder.delivery_city || 'India'}</strong></div>
                  <div>Quantity: <strong className="text-foreground">{inspectingOrder.quantity ? `${inspectingOrder.quantity} ${inspectingOrder.unit || ''}` : 'As specified'}</strong></div>
                  <div>Public Ref: <strong className="text-foreground">{inspectingOrder.rfq_public_ref || 'N/A'}</strong></div>
                </div>
              </div>
            </div>

            {/* Commercials & Milestones */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl border bg-card p-4 space-y-1">
                <div className="text-[10px] font-bold uppercase text-muted-foreground">PO Total Value</div>
                <div className="text-lg font-black text-foreground">
                  ₹{(inspectingOrder.po_amount || 0).toLocaleString('en-IN')}
                </div>
                <div className="text-[10px] text-muted-foreground">Status: <strong className="text-primary">{inspectingOrder.po_status}</strong></div>
              </div>

              <div className="rounded-xl border bg-card p-4 space-y-1">
                <div className="text-[10px] font-bold uppercase text-muted-foreground">Milestone Progress</div>
                <div className="text-lg font-black text-foreground">
                  {inspectingOrder.progress_percent || 0}%
                </div>
                <div className="text-[10px] text-muted-foreground">Work Order: <strong className="text-primary">{inspectingOrder.work_order_status || 'NOT_STARTED'}</strong></div>
              </div>

              <div className="rounded-xl border bg-card p-4 space-y-1">
                <div className="text-[10px] font-bold uppercase text-muted-foreground">Invoice &amp; Settlement</div>
                <div className="text-lg font-black text-foreground">
                  {inspectingOrder.payment_status === 'VERIFIED' ? 'PAID & SETTLED' : inspectingOrder.invoice_status || 'PENDING'}
                </div>
                <div className="text-[10px] text-muted-foreground">Ref: <strong className="font-mono">{inspectingOrder.payment_reference || inspectingOrder.invoice_number || 'N/A'}</strong></div>
              </div>
            </div>

            {/* Admin Override Action Bar */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span>⚡</span> Super Admin Operations &amp; Interventions
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={actionInProgress === inspectingOrder.po_id}
                  onClick={() => handleQuickAction('SYSTEM_SOFT_RESTART', inspectingOrder.po_id, 'Flush & Sync Realtime Telemetry')}
                  className="rounded-lg bg-background border px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted transition disabled:opacity-50 min-h-[44px] mobile-touch-target"
                >
                  🔄 Sync Telemetry
                </button>

                {inspectingOrder.supplier_gst_verified === false && (
                  <button
                    type="button"
                    disabled={actionInProgress === inspectingOrder.supplier_id}
                    onClick={() => handleQuickAction('REVERIFY_GSTIN', inspectingOrder.supplier_id, 'Verify Supplier GSTIN')}
                    className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-700 transition disabled:opacity-50 min-h-[44px] mobile-touch-target"
                  >
                    🛡️ Force Verify GSTIN
                  </button>
                )}

                <Link
                  to={`/admin?tab=supplier-debug&id=${inspectingOrder.supplier_id}`}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition ml-auto min-h-[44px] inline-flex items-center mobile-touch-target"
                >
                  Open in Seller Troubleshooter ➔
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
