import React, { useState } from 'react';
import { InternalRoleMascot } from './InternalRoleMascots';
import { AdminSupportTicketsPanel } from './AdminSupportTicketsPanel';
import { AdminBuyerTroubleshooter } from './AdminBuyerTroubleshooter';
import { AdminSellerTroubleshooter } from './AdminSellerTroubleshooter';
import { NotificationsPage } from '@/features/notifications';
import { AdminAuditLogsViewer } from './AdminAuditLogsViewer';

import type { LiveTransactionItem, SystemAlertItem, SystemHealthResponse } from '../types/admin';

export interface GeneralSupportConsoleViewProps {
  health?: SystemHealthResponse | null;
  alerts?: SystemAlertItem[];
  transactions?: LiveTransactionItem[];
  onNavigateTab?: (tab: any) => void;
  onRefresh?: () => void;
}

export function GeneralSupportConsoleView({
  transactions = [],
  onRefresh = () => {},
}: GeneralSupportConsoleViewProps) {
  const [activeTab, setActiveTab] = useState<'TICKETS' | 'BUYER_DEBUG' | 'SELLER_DEBUG' | 'NOTIFICATIONS' | 'LOGS'>('TICKETS');

  return (
    <div className="space-y-6">
      {/* Support Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-r from-blue-950/40 via-slate-900 to-slate-900 p-6 shadow-xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
              <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              General Customer Support & Issue Resolution
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Support & Diagnostics Desk
            </h1>
            <p className="text-sm text-slate-300">
              Direct ticket escalation, buyer intake inspection, supplier quote troubleshooting, and dispute intake. Dedicated to unblocking buyer requirements and resolving supplier order concerns.
            </p>
          </div>
          <div className="shrink-0">
            <InternalRoleMascot role="GENERAL_SUPPORT" className="w-32 h-32 drop-shadow-md" />
          </div>
        </div>

        {/* Protection / Status Pill */}
        <div className="mt-4 flex flex-wrap items-center justify-between border-t border-blue-500/20 pt-4 text-xs text-blue-200/90">
          <div className="flex items-center gap-3">
            <span>Role Context: <strong className="text-white">Support Specialist (Locked View)</strong></span>
            <span>•</span>
            <span>Ticket Response SLA: <strong className="text-blue-400">&lt; 15 mins</strong></span>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-lg border border-blue-500/40 bg-blue-900/40 px-3 py-1 text-xs text-blue-200 hover:bg-blue-800/50 transition"
            >
              Refresh Tickets
            </button>
          )}
        </div>
      </div>

      {/* Support Sub-Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {[
          { key: 'TICKETS', label: 'Support Tickets & Disputes', icon: '🎫' },
          { key: 'BUYER_DEBUG', label: 'Buyer Intake Diagnostics', icon: '🏛️' },
          { key: 'SELLER_DEBUG', label: 'Seller & Quote Diagnostics', icon: '🏭' },
          { key: 'NOTIFICATIONS', label: 'Alerts & Broadcast Notices', icon: '🔔' },
          { key: 'LOGS', label: 'Activity Logs', icon: '📜' },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as any)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground border border-border'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Support Console Content */}
      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
        {activeTab === 'TICKETS' && <AdminSupportTicketsPanel />}
        {activeTab === 'BUYER_DEBUG' && <AdminBuyerTroubleshooter transactions={transactions} onRefreshTelemetry={onRefresh} />}
        {activeTab === 'SELLER_DEBUG' && <AdminSellerTroubleshooter onRefreshTelemetry={onRefresh} />}
        {activeTab === 'NOTIFICATIONS' && <NotificationsPage />}
        {activeTab === 'LOGS' && <AdminAuditLogsViewer />}
      </div>
    </div>
  );
}
