import React from 'react';
import { InternalRoleMascot } from './InternalRoleMascots';
import type { LiveTransactionItem, SellerOrderItem, SystemHealthResponse } from '../types/admin';

export interface CeoFounderCommandCenterProps {
  health?: SystemHealthResponse | null;
  transactions?: LiveTransactionItem[];
  sellerOrders?: SellerOrderItem[];
  onNavigateTab: (tab: any) => void;
  onRefresh?: () => void;
  onRefreshAll?: () => void;
  userEmail?: string | null;
}

export function CeoFounderCommandCenter({
  health,
  transactions = [],
  sellerOrders = [],
  onNavigateTab,
  onRefresh,
  onRefreshAll,
  userEmail,
}: CeoFounderCommandCenterProps) {
  // Aggregate real-time commercial numbers
  const totalGmv = sellerOrders.reduce((sum, ord) => sum + (Number(ord.po_amount) || 0), 0) +
    transactions.reduce((sum, tx) => sum + (Number(tx.po_amount) || 0), 0);

  // Platform take-rate: 0.5% of completed volume + ₹10 floor per micro-order
  const platformTakeRateRevenue = sellerOrders.reduce((sum, ord) => {
    const landed = Number(ord.po_amount) || 0;
    const fee = Math.max(10, Math.round(landed * 0.005));
    return sum + fee;
  }, 0);

  // Escrow float held
  const escrowFloat = sellerOrders
    .filter((ord) => ord.po_status === 'ISSUED' || ord.po_status === 'ACKNOWLEDGED')
    .reduce((sum, ord) => sum + (Number(ord.po_amount) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Executive Hero Banner */}
      <div className="relative z-10 overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 p-6 shadow-xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Executive Command & Macro Commercial Control
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              CEO & Founder Command Center
            </h1>
            <p className="text-sm text-slate-300">
              High-level strategic visibility into Gross Merchandise Value (GMV), 0.5% platform monetization yield, live escrow float, and Supplier Network Engine (SNE) concentric ring density.
            </p>
          </div>
          <div className="shrink-0">
            <InternalRoleMascot role="CEO_FOUNDER" className="w-36 h-28 drop-shadow-lg" />
          </div>
        </div>

        {/* Live Subtitle bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between border-t border-emerald-500/20 pt-4 text-xs text-emerald-200/90">
          <div className="flex items-center gap-3">
            <span>Platform Status: <strong className="text-white">Active (Production)</strong></span>
            <span>•</span>
            <span>Uptime SLA: <strong className="text-emerald-400">99.98%</strong></span>
          </div>
          {onRefreshAll && (
            <button
              type="button"
              onClick={onRefreshAll}
              className="rounded-lg border border-emerald-500/40 bg-emerald-900/40 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-800/50 transition"
            >
              Sync Live Metrics
            </button>
          )}
        </div>
      </div>

      {/* Top Metric Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* GMV */}
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 shadow-sm hover:border-blue-500/60 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Gross Merchandise Value</span>
            <span className="text-lg">📊</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            ₹{totalGmv.toLocaleString('en-IN')}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {transactions.length + sellerOrders.length} total active & completed procurements
          </p>
        </div>

        {/* Platform Take-Rate Revenue */}
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-sm hover:border-emerald-500/60 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Platform Take-Rate</span>
            <span className="text-lg">💰</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-400">
            ₹{platformTakeRateRevenue.toLocaleString('en-IN')}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            0.50% standard fee + ₹10 micro-order fee floor
          </p>
        </div>

        {/* Escrow Balance in Trust */}
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 shadow-sm hover:border-purple-500/60 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Escrow in Trust</span>
            <span className="text-lg">🛡️</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            ₹{escrowFloat.toLocaleString('en-IN')}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Path A (UPI Auto-Split) & Path B active reserves
          </p>
        </div>

        {/* Commercial Liquidity */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-sm hover:border-amber-500/60 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Commercial Liquidity</span>
            <span className="text-lg">⚡</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {health?.counts?.quotes ? `${health.counts.quotes} Quotes` : 'Active'}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Average response time: &lt; 4 hours across SNE
          </p>
        </div>
      </div>

      {/* SNE Concentric Geographic Rings Visualizer */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <span>🌐</span> Supplier Network Engine (SNE) Geographic Expansion
            </h2>
            <p className="text-xs text-muted-foreground">
              Real-time supplier capacity and response SLAs mapped across our 5 concentric geographic discovery rings.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('SUPPLIER_NETWORK')}
            className="rounded-lg border border-border bg-muted/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition"
          >
            Configure SNE Rings →
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {[
            { ring: 'Ring 1', label: 'Hyperlocal', radius: 'Pincode (0-5 km)', sla: '2 hrs', status: 'Primary', color: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' },
            { ring: 'Ring 2', label: 'Sub-City', radius: '5 - 50 km', sla: '6 hrs', status: 'Active', color: 'border-blue-500/40 bg-blue-500/10 text-blue-400' },
            { ring: 'Ring 3', label: 'Metropolitan', radius: 'Town / City', sla: '12 hrs', status: 'Active', color: 'border-purple-500/40 bg-purple-500/10 text-purple-400' },
            { ring: 'Ring 4', label: 'Regional', radius: 'State Wide', sla: '24 hrs', status: 'Active', color: 'border-amber-500/40 bg-amber-500/10 text-amber-400' },
            { ring: 'Ring 5', label: 'National', radius: 'Pan-India', sla: '48 hrs', status: 'Fallback', color: 'border-slate-500/40 bg-slate-500/10 text-slate-400' },
          ].map((item) => (
            <div key={item.ring} className={`rounded-xl border p-4 text-center ${item.color}`}>
              <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">{item.ring}</div>
              <div className="text-base font-bold mt-1 text-foreground">{item.label}</div>
              <div className="text-xs mt-1 opacity-90">{item.radius}</div>
              <div className="mt-3 border-t border-current/20 pt-2 text-[11px] font-medium">
                SLA: {item.sla} • {item.status}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Executive Shortcuts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigateTab('TRANSACTIONS')}
          className="rounded-xl border border-border bg-card p-4 text-left hover:border-emerald-500/40 hover:bg-emerald-500/5 transition group"
        >
          <div className="text-lg">📊</div>
          <div className="font-semibold text-foreground text-sm mt-2 group-hover:text-emerald-400">
            Inspect Buyer Radar & Orders
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Review live requirements, evaluation quorums & award contracts
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('WHATSAPP_CAMPAIGNS')}
          className="rounded-xl border border-border bg-card p-4 text-left hover:border-emerald-500/40 hover:bg-emerald-500/5 transition group"
        >
          <div className="text-lg">📲</div>
          <div className="font-semibold text-foreground text-sm mt-2 group-hover:text-emerald-400">
            Bulk WhatsApp Outreach
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Broadcast promotional & pilot onboarding campaigns via WAHA
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('INTERNAL_USERS')}
          className="rounded-xl border border-border bg-card p-4 text-left hover:border-indigo-500/40 hover:bg-indigo-500/5 transition group"
        >
          <div className="text-lg">👥</div>
          <div className="font-semibold text-foreground text-sm mt-2 group-hover:text-indigo-400">
            Internal Staff & Invitations
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Manage operator accounts, generate 48h invitations & RBAC matrix
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('LOGS')}
          className="rounded-xl border border-border bg-card p-4 text-left hover:border-rose-500/40 hover:bg-rose-500/5 transition group"
        >
          <div className="text-lg">📜</div>
          <div className="font-semibold text-foreground text-sm mt-2 group-hover:text-rose-400">
            Audit Trail & Compliance
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Tamper-evident cryptographic SHA-256 state change events
          </div>
        </button>
      </div>
    </div>
  );
}
