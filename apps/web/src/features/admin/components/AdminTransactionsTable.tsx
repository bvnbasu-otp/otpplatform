import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { LiveTransactionItem, AdminServiceActionType } from '../types/admin';

import {
  CORE_PROCUREMENT_STATES,
  deriveCoreProcurementState,
  type CoreProcurementState,
} from '../../lifecycle';

interface AdminTransactionsTableProps {
  transactions: LiveTransactionItem[];
  isLoading: boolean;
  onExecuteAction: (action: AdminServiceActionType, entityId: string, reason?: string) => Promise<void>;
  onRefresh: () => void;
}

type ViewMode = 'PIPELINE' | 'TABLE';

interface PhaseDef {
  key: CoreProcurementState;
  step: number;
  label: string;
  shortLabel: string;
  icon: string;
  colorClass: string;
  badgeClass: string;
  description: string;
}

export const ADMIN_PHASES: PhaseDef[] = [
  {
    key: 'DRAFT',
    step: 1,
    label: CORE_PROCUREMENT_STATES.DRAFT.title,
    shortLabel: CORE_PROCUREMENT_STATES.DRAFT.shortLabel,
    icon: CORE_PROCUREMENT_STATES.DRAFT.icon,
    colorClass: 'border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30',
    badgeClass: CORE_PROCUREMENT_STATES.DRAFT.badgeClass,
    description: CORE_PROCUREMENT_STATES.DRAFT.tagline,
  },
  {
    key: 'QUOTING',
    step: 2,
    label: CORE_PROCUREMENT_STATES.QUOTING.title,
    shortLabel: CORE_PROCUREMENT_STATES.QUOTING.shortLabel,
    icon: CORE_PROCUREMENT_STATES.QUOTING.icon,
    colorClass: 'border-purple-300 dark:border-purple-800/60 bg-purple-50/40 dark:bg-purple-950/20',
    badgeClass: CORE_PROCUREMENT_STATES.QUOTING.badgeClass,
    description: CORE_PROCUREMENT_STATES.QUOTING.tagline,
  },
  {
    key: 'EVALUATING',
    step: 3,
    label: CORE_PROCUREMENT_STATES.EVALUATING.title,
    shortLabel: CORE_PROCUREMENT_STATES.EVALUATING.shortLabel,
    icon: CORE_PROCUREMENT_STATES.EVALUATING.icon,
    colorClass: 'border-amber-300 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/20',
    badgeClass: CORE_PROCUREMENT_STATES.EVALUATING.badgeClass,
    description: CORE_PROCUREMENT_STATES.EVALUATING.tagline,
  },
  {
    key: 'AWARDED',
    step: 4,
    label: CORE_PROCUREMENT_STATES.AWARDED.title,
    shortLabel: CORE_PROCUREMENT_STATES.AWARDED.shortLabel,
    icon: CORE_PROCUREMENT_STATES.AWARDED.icon,
    colorClass: 'border-teal-300 dark:border-teal-800/60 bg-teal-50/40 dark:bg-teal-950/20',
    badgeClass: CORE_PROCUREMENT_STATES.AWARDED.badgeClass,
    description: CORE_PROCUREMENT_STATES.AWARDED.tagline,
  },
  {
    key: 'PO_ISSUED',
    step: 5,
    label: CORE_PROCUREMENT_STATES.PO_ISSUED.title,
    shortLabel: CORE_PROCUREMENT_STATES.PO_ISSUED.shortLabel,
    icon: CORE_PROCUREMENT_STATES.PO_ISSUED.icon,
    colorClass: 'border-blue-300 dark:border-blue-800/60 bg-blue-50/40 dark:bg-blue-950/20',
    badgeClass: CORE_PROCUREMENT_STATES.PO_ISSUED.badgeClass,
    description: CORE_PROCUREMENT_STATES.PO_ISSUED.tagline,
  },
  {
    key: 'INVOICED',
    step: 6,
    label: CORE_PROCUREMENT_STATES.INVOICED.title,
    shortLabel: CORE_PROCUREMENT_STATES.INVOICED.shortLabel,
    icon: CORE_PROCUREMENT_STATES.INVOICED.icon,
    colorClass: 'border-indigo-300 dark:border-indigo-800/60 bg-indigo-50/40 dark:bg-indigo-950/20',
    badgeClass: CORE_PROCUREMENT_STATES.INVOICED.badgeClass,
    description: CORE_PROCUREMENT_STATES.INVOICED.tagline,
  },
  {
    key: 'SETTLED',
    step: 7,
    label: CORE_PROCUREMENT_STATES.SETTLED.title,
    shortLabel: CORE_PROCUREMENT_STATES.SETTLED.shortLabel,
    icon: CORE_PROCUREMENT_STATES.SETTLED.icon,
    colorClass: 'border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20',
    badgeClass: CORE_PROCUREMENT_STATES.SETTLED.badgeClass,
    description: CORE_PROCUREMENT_STATES.SETTLED.tagline,
  },
];

const PHASE_COMPAT_MAP: Record<string, CoreProcurementState> = {
  DRAFT_REQUESTED: 'DRAFT',
  DRAFT: 'DRAFT',
  QUOTING: 'QUOTING',
  EVALUATION: 'EVALUATING',
  EVALUATING: 'EVALUATING',
  AWARDED: 'AWARDED',
  PO_EXECUTION: 'PO_ISSUED',
  PO_ISSUED: 'PO_ISSUED',
  INVOICING_PAYMENT: 'INVOICED',
  INVOICED: 'INVOICED',
  COMPLETED: 'SETTLED',
  SETTLED: 'SETTLED',
  STALLED: 'STALLED',
};

export function AdminTransactionsTable({
  transactions,
  isLoading,
  onExecuteAction,
  onRefresh,
}: AdminTransactionsTableProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('TABLE');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [stalledFilter, setStalledFilter] = useState(false);
  const [inspectingTx, setInspectingTx] = useState<LiveTransactionItem | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const resolvePhase = (tx: LiveTransactionItem): CoreProcurementState | 'CANCELLED' => {
    if (tx.rfq_status === 'CANCELLED' || tx.requirement_status === 'CANCELLED' || tx.po_status === 'CANCELLED') {
      return 'CANCELLED';
    }
    if (tx.computed_phase && PHASE_COMPAT_MAP[tx.computed_phase]) {
      return PHASE_COMPAT_MAP[tx.computed_phase]!;
    }
    return deriveCoreProcurementState(
      {
        requirementStatus: tx.requirement_status as any,
        rfqStatus: tx.rfq_status as any,
        revealStatus: tx.revealed_at ? 'REVEALED' : undefined,
        poStatus: tx.po_status as any,
        workOrderStatus: tx.work_order_status as any,
        workOrderProgressPercent: tx.progress_percent,
        invoiceStatus: tx.invoice_status as any,
        paymentStatus: tx.payment_status as any,
      },
      {
        idleHours: tx.idle_hours,
      }
    );
  };

  const filtered = transactions.filter((tx) => {
    if (stalledFilter && tx.idle_hours < 24) return false;
    const phase = resolvePhase(tx);
    if (statusFilter !== 'ALL') {
      const matchStatus =
        phase === statusFilter ||
        tx.rfq_status === statusFilter ||
        tx.requirement_status === statusFilter ||
        tx.po_status === statusFilter;
      if (!matchStatus) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchText =
        tx.requirement_title.toLowerCase().includes(q) ||
        tx.organization_name.toLowerCase().includes(q) ||
        (tx.organization_city && tx.organization_city.toLowerCase().includes(q)) ||
        (tx.buyer_name && tx.buyer_name.toLowerCase().includes(q)) ||
        (tx.buyer_email && tx.buyer_email.toLowerCase().includes(q)) ||
        (tx.po_number && tx.po_number.toLowerCase().includes(q)) ||
        (tx.rfq_public_ref && tx.rfq_public_ref.toLowerCase().includes(q)) ||
        (tx.awarded_supplier_name && tx.awarded_supplier_name.toLowerCase().includes(q)) ||
        tx.requirement_id.toLowerCase().includes(q);
      if (!matchText) return false;
    }
    return true;
  });

  const getPhaseCounts = () => {
    const counts: Record<string, number> = {};
    for (const p of ADMIN_PHASES) counts[p.key] = 0;
    for (const tx of transactions) {
      const p = resolvePhase(tx);
      if (counts[p] !== undefined) counts[p]++;
    }
    return counts;
  };

  const phaseCounts = getPhaseCounts();

  const handleQuickAction = async (action: AdminServiceActionType, id: string, label: string) => {
    if (!window.confirm(`Execute action "${label}" on this order?`)) return;
    setActionInProgress(id);
    try {
      await onExecuteAction(action, id, `Triggered from Admin Buyer Orders console: ${label}`);
      onRefresh();
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-4 rounded-xl border shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex rounded-lg border bg-muted/50 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('PIPELINE')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${
                viewMode === 'PIPELINE'
                  ? 'bg-background text-foreground shadow-xs font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>📊</span> Kanban Pipeline
            </button>
            <button
              type="button"
              onClick={() => setViewMode('TABLE')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${
                viewMode === 'TABLE'
                  ? 'bg-background text-foreground shadow-xs font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>📋</span> Data Table
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search buyer org, requirement, PO#, city..."
              className="w-72 rounded-lg border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border bg-background px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="ALL">All Buyer Phases ({transactions.length})</option>
            {ADMIN_PHASES.map((p) => (
              <option key={p.key} value={p.key}>
                {p.icon} {p.label} ({phaseCounts[p.key] || 0})
              </option>
            ))}
          </select>

          {/* Stalled Orders Toggle */}
          <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer text-muted-foreground hover:text-foreground select-none">
            <input
              type="checkbox"
              checked={stalledFilter}
              onChange={(e) => setStalledFilter(e.target.checked)}
              className="rounded border text-primary focus:ring-primary"
            />
            <span className="text-amber-900 font-bold">⚠️ Stalled Orders (&gt;24h)</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Showing <strong>{filtered.length}</strong> of <strong>{transactions.length}</strong> Buyer Orders
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="rounded-lg border bg-background p-2 text-xs text-foreground hover:bg-muted transition disabled:opacity-50"
            title="Refresh Orders"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Phase Summary Metric Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
        {ADMIN_PHASES.map((p) => {
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
            >
              <div className="flex items-center justify-between">
                <span className="text-base">{p.icon}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-black ${p.badgeClass}`}>
                  {count}
                </span>
              </div>
              <div className="mt-1 text-xs font-bold text-foreground truncate">{p.shortLabel}</div>
              <div className="text-[10px] text-muted-foreground truncate">{p.description}</div>
            </button>
          );
        })}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="p-8 text-center text-xs text-muted-foreground">
          <span className="inline-block animate-spin mr-2">⏳</span> Loading live buyer orders...
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filtered.length === 0 && (
        <div className="rounded-xl border bg-card p-12 text-center space-y-3">
          <span className="text-4xl">📊</span>
          <h3 className="text-base font-bold text-foreground">No Buyer Orders Found</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {search || statusFilter !== 'ALL' || stalledFilter
              ? 'No buyer orders match your current filters. Try resetting the search or filter.'
              : 'When buyers post procurement requirements and initiate RFQs, orders will appear here in real time.'}
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

      {/* 1. PIPELINE KANBAN VIEW */}
      {!isLoading && viewMode === 'PIPELINE' && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-3 items-start overflow-x-auto pb-4">
          {ADMIN_PHASES.map((phase) => {
            const columnOrders = filtered.filter((tx) => resolvePhase(tx) === phase.key);
            return (
              <div
                key={phase.key}
                className="flex flex-col rounded-xl border bg-muted/20 p-2.5 space-y-2.5 min-w-[240px]"
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
                  {columnOrders.map((tx) => {
                    const isStalled = tx.idle_hours > 24 && tx.rfq_status !== 'COMPLETED' && tx.rfq_status !== 'CANCELLED';

                    return (
                      <div
                        key={tx.requirement_id}
                        onClick={() => setInspectingTx(tx)}
                        className={`group cursor-pointer rounded-lg border bg-card p-3 shadow-2xs hover:shadow-md hover:border-primary/50 transition space-y-2 text-left ${
                          isStalled ? 'border-amber-400 bg-amber-500/5' : ''
                        }`}
                      >
                        {/* Buyer Org & City */}
                        <div className="flex items-start justify-between gap-1.5">
                          <div>
                            <div className="text-xs font-bold text-foreground group-hover:text-primary transition line-clamp-1">
                              {tx.organization_name}
                            </div>
                            <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-1 mt-0.5">
                              <span>{tx.rfq_public_ref || tx.po_number || 'RFQ-PENDING'}</span>
                              {tx.organization_city && (
                                <span className="text-[10px] text-muted-foreground">· {tx.organization_city}</span>
                              )}
                              {tx.is_demo ? (
                                <span className="ml-1 rounded bg-purple-500/10 px-1 py-0.2 text-[9px] font-bold text-purple-700 dark:text-purple-300 border border-purple-500/30">
                                  🧪 DEMO
                                </span>
                              ) : (
                                <span className="ml-1 rounded bg-emerald-500/10 px-1 py-0.2 text-[9px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                  🚀 PROD
                                </span>
                              )}
                            </div>
                          </div>
                          {tx.idle_hours > 24 && (
                            <span
                              className="rounded-full bg-amber-500/10 text-amber-900 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-bold shrink-0"
                              title={`Idle for ${tx.idle_hours} hours`}
                            >
                              ⏳ {Math.round(tx.idle_hours)}h
                            </span>
                          )}
                        </div>

                        {/* Placed by User Email & Name */}
                        {(tx.buyer_name || tx.buyer_email) && (
                          <div className="rounded bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground flex items-center justify-between">
                            <span className="font-medium text-foreground truncate max-w-[130px]">
                              👤 {tx.buyer_name || 'Buyer'}
                            </span>
                            <span className="text-[10px] opacity-80 truncate max-w-[110px]">
                              {tx.buyer_email}
                            </span>
                          </div>
                        )}

                        {/* Requirement Title */}
                        <div className="rounded bg-muted/30 p-1.5 text-[11px] space-y-0.5">
                          <div className="text-foreground font-medium line-clamp-2">
                            {tx.requirement_title}
                          </div>
                          {tx.category_name && (
                            <div className="text-[10px] text-muted-foreground truncate">
                              🏷️ {tx.category_name} {tx.subcategory_name ? `· ${tx.subcategory_name}` : ''}
                            </div>
                          )}
                        </div>

                        {/* Step Progress Bar */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                            <span>Step {phase.step} of 7</span>
                            <span>{tx.quotes_count > 0 ? `${tx.quotes_count} Quotes` : 'Discovery'}</span>
                          </div>
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-300"
                              style={{ width: `${(phase.step / 7) * 100}%` }}
                            />
                          </div>
                        </div>

                        {/* Order Value & Phase Badge */}
                        <div className="flex items-center justify-between border-t pt-1.5 text-[11px]">
                          <span className="font-extrabold text-foreground">
                            {tx.po_amount ? (
                              `₹${tx.po_amount.toLocaleString('en-IN')}`
                            ) : tx.quotes_count > 0 ? (
                              <span className="text-purple-700 dark:text-purple-400 font-bold">{tx.quotes_count} Quotes</span>
                            ) : (
                              <span className="text-muted-foreground text-[10px]">Sourcing</span>
                            )}
                          </span>
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${phase.badgeClass}`}>
                            {tx.po_status || tx.rfq_status || tx.requirement_status}
                          </span>
                        </div>
                      </div>
                    );
                  })}

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
      )}

      {/* 2. TABULAR VIEW */}
      {!isLoading && viewMode === 'TABLE' && filtered.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b bg-muted/40 font-bold text-muted-foreground text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4">Requirement &amp; Date</th>
                <th className="py-3 px-4">Buyer Organization</th>
                <th className="py-3 px-4">Category &amp; Specs</th>
                <th className="py-3 px-4">Awarded Supplier</th>
                <th className="py-3 px-4">Order Value</th>
                <th className="py-3 px-4">Procurement Phase</th>
                <th className="py-3 px-4">Quotes / Votes</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-foreground">
              {filtered.map((tx) => {
                const phaseKey = resolvePhase(tx);
                const defaultPhase = ADMIN_PHASES[0]!;
                const phaseDef = ADMIN_PHASES.find((p) => p.key === phaseKey) ?? defaultPhase;

                return (
                  <tr
                    key={tx.requirement_id}
                    className="hover:bg-muted/30 transition cursor-pointer"
                    onClick={() => setInspectingTx(tx)}
                  >
                    <td className="py-3 px-4">
                      <div className="font-bold text-foreground line-clamp-1 max-w-xs">{tx.requirement_title}</div>
                      <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                        {tx.rfq_public_ref || tx.po_number || 'REQ-PENDING'} · {new Date(tx.requirement_created_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground line-clamp-1">{tx.organization_name}</span>
                        {tx.is_demo ? (
                          <span className="rounded bg-purple-500/10 px-1 py-0.2 text-[9px] font-bold text-purple-700 dark:text-purple-300 border border-purple-500/30">
                            DEMO
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-500/10 px-1 py-0.2 text-[9px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                            PROD
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {tx.buyer_name || tx.buyer_email || tx.organization_city || 'India'}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-medium text-foreground line-clamp-1">{tx.category_name || 'Goods/Services'}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {tx.quantity ? `${tx.quantity} ${tx.unit || ''}` : 'As specified'} · {tx.delivery_city || 'India'}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      {tx.awarded_supplier_name ? (
                        <div>
                          <div className="font-bold text-primary line-clamp-1">{tx.awarded_supplier_name}</div>
                          <div className="text-[10px] text-emerald-950 font-semibold">✓ Award Confirmed</div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">Pending Evaluation</span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-extrabold text-foreground">
                      {tx.po_amount ? (
                        `₹${tx.po_amount.toLocaleString('en-IN')}`
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${phaseDef.badgeClass}`}>
                        <span>{phaseDef.icon}</span>
                        <span>{phaseDef.shortLabel}</span>
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <span className="rounded bg-purple-100 text-purple-800 px-1.5 py-0.2 text-[10px]">
                          {tx.quotes_count} quotes
                        </span>
                        <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.2 text-[10px]">
                          {tx.votes_count} votes
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setInspectingTx(tx)}
                        className="rounded-lg border bg-background px-2.5 py-1 text-xs font-bold text-primary hover:bg-muted transition"
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
      )}

      {/* 3. BUYER ORDER INSPECTION DRAWER / MODAL */}
      {inspectingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-3xl rounded-2xl bg-card border shadow-2xl p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">📊</span>
                  <h3 className="text-lg font-black text-foreground">
                    Buyer Procurement Order Inspector
                  </h3>
                  <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-bold font-mono">
                    {inspectingTx.rfq_public_ref || inspectingTx.po_number || inspectingTx.requirement_id.slice(0, 8)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Full lifecycle visibility across Sourcing Request, Identity-Protected Quoting, Committee Evaluation, PO, and Settlement.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setInspectingTx(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition text-lg"
              >
                ✕
              </button>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Buyer Organization Info */}
              <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <span>🏛️</span> Buyer Organization &amp; Account
                </div>
                <div className="text-sm font-bold text-foreground">{inspectingTx.organization_name}</div>
                <div className="text-[11px] text-muted-foreground">Type: {inspectingTx.organization_type || 'INDIVIDUAL'}</div>
                <div className="space-y-1 font-mono text-[11px] text-muted-foreground pt-1">
                  <div>Placed By: <strong className="text-foreground">{inspectingTx.buyer_name || 'N/A'} ({inspectingTx.buyer_email || 'N/A'})</strong></div>
                  <div>Delivery City: <strong className="text-foreground">{inspectingTx.delivery_city || inspectingTx.organization_city || 'India'}</strong></div>
                  <div>Requirement Ref: <strong className="text-foreground">{inspectingTx.requirement_id}</strong></div>
                  <div>Status: <strong className="text-primary">{inspectingTx.requirement_status}</strong></div>
                </div>
              </div>

              {/* Requirement & Supplier Info */}
              <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <span>🏷️</span> Item Specs &amp; Awardee
                </div>
                <div className="text-sm font-bold text-foreground">{inspectingTx.requirement_title}</div>
                <div className="text-[11px] text-muted-foreground">{inspectingTx.category_name} {inspectingTx.subcategory_name ? `· ${inspectingTx.subcategory_name}` : ''}</div>
                <div className="space-y-1 font-mono text-[11px] text-muted-foreground pt-1">
                  <div>Quantity: <strong className="text-foreground">{inspectingTx.quantity ? `${inspectingTx.quantity} ${inspectingTx.unit || ''}` : 'As specified'}</strong></div>
                  <div>Awarded Supplier: <strong className="text-primary">{inspectingTx.awarded_supplier_name || 'Not yet awarded'}</strong></div>
                  <div>PO Number: <strong className="text-foreground">{inspectingTx.po_number || 'N/A'}</strong></div>
                  <div>Received Quotes: <strong className="text-foreground">{inspectingTx.quotes_count} Received</strong></div>
                </div>
              </div>
            </div>

            {/* Commercials & Milestones */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl border bg-card p-4 space-y-1">
                <div className="text-[10px] font-bold uppercase text-muted-foreground">PO Total Value</div>
                <div className="text-lg font-black text-foreground">
                  {inspectingTx.po_amount ? `₹${inspectingTx.po_amount.toLocaleString('en-IN')}` : 'Sourcing / Quoting'}
                </div>
                <div className="text-[10px] text-muted-foreground">Status: <strong className="text-primary">{inspectingTx.po_status || inspectingTx.rfq_status}</strong></div>
              </div>

              <div className="rounded-xl border bg-card p-4 space-y-1">
                <div className="text-[10px] font-bold uppercase text-muted-foreground">Fulfillment Progress</div>
                <div className="text-lg font-black text-foreground">
                  {inspectingTx.progress_percent !== null && inspectingTx.progress_percent !== undefined ? `${inspectingTx.progress_percent}%` : 'N/A'}
                </div>
                <div className="text-[10px] text-muted-foreground">Work Order: <strong className="text-primary">{inspectingTx.work_order_status || 'NOT_STARTED'}</strong></div>
              </div>

              <div className="rounded-xl border bg-card p-4 space-y-1">
                <div className="text-[10px] font-bold uppercase text-muted-foreground">Invoice &amp; Settlement</div>
                <div className="text-lg font-black text-foreground">
                  {inspectingTx.payment_status === 'VERIFIED' ? 'PAID & SETTLED' : inspectingTx.invoice_status || 'PENDING'}
                </div>
                <div className="text-[10px] text-muted-foreground">Ref: <strong className="font-mono">{inspectingTx.payment_reference || inspectingTx.invoice_number || 'N/A'}</strong></div>
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
                  disabled={actionInProgress === inspectingTx.requirement_id}
                  onClick={() => handleQuickAction('SYSTEM_SOFT_RESTART', inspectingTx.requirement_id, 'Flush & Sync Realtime Telemetry')}
                  className="rounded-lg bg-background border px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted transition disabled:opacity-50"
                >
                  🔄 Sync Telemetry
                </button>

                <Link
                  to={`/admin?tab=buyer_debug&id=${inspectingTx.requirement_id}`}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition ml-auto"
                >
                  Open in Buyer Troubleshooter ➔
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
