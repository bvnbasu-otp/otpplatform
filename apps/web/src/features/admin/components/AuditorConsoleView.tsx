import React, { useState } from 'react';
import { InternalRoleMascot } from './InternalRoleMascots';
import { AdminAuditLogsViewer } from './AdminAuditLogsViewer';
import { AdminTransactionsTable } from './AdminTransactionsTable';
import { AdminSellerOrdersTable } from './AdminSellerOrdersTable';
import { AdminUsersActivityPanel } from './AdminUsersActivityPanel';
import { NotificationsPage } from '@/features/notifications';
import { maskSensitiveData } from '../types/admin-navigation';
import type { LiveTransactionItem, SellerOrderItem, SystemHealthResponse } from '../types/admin';

export interface AuditorConsoleViewProps {
  health?: SystemHealthResponse | null;
  transactions?: LiveTransactionItem[];
  sellerOrders?: SellerOrderItem[];
  isLoadingTx?: boolean;
  isLoadingOrders?: boolean;
  onRefresh?: () => void;
}

export function AuditorConsoleView({
  transactions = [],
  sellerOrders = [],
  isLoadingTx = false,
  isLoadingOrders = false,
  onRefresh = () => {},
}: AuditorConsoleViewProps) {
  const [activeAuditTab, setActiveAuditTab] = useState<'TRANSACTIONS' | 'SELLER_ORDERS' | 'USERS' | 'LOGS' | 'NOTIFICATIONS'>('TRANSACTIONS');

  // Redacted transactions for auditor view
  const redactedTransactions = transactions.map((tx) => ({
    ...tx,
    buyer_email: maskSensitiveData(tx.buyer_email, 'email'),
  }));

  const redactedSellerOrders = sellerOrders.map((ord) => ({
    ...ord,
    supplier_email: maskSensitiveData(ord.supplier_email, 'email'),
    supplier_phone: maskSensitiveData(ord.supplier_phone, 'phone'),
    supplier_gstin: maskSensitiveData(ord.supplier_gstin, 'id'),
  }));

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-teal-500/30 bg-gradient-to-r from-teal-950/40 via-slate-900 to-slate-900 p-6 shadow-xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/40 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-300">
              <span className="h-2 w-2 rounded-full bg-teal-400 animate-pulse" />
              Independent Platform Auditor — Read-Only Oversight
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Compliance & Audit Oversight Portal
            </h1>
            <p className="text-sm text-slate-300">
              Read-only transparency across all buyer and supplier transactions, user rosters, and cryptographic SHA-256 audit trails. Sensitive PII, bank account information, and contact details are masked automatically.
            </p>
          </div>
          <div className="shrink-0">
            <InternalRoleMascot role="AUDITOR" className="w-32 h-32 drop-shadow-md" />
          </div>
        </div>

        {/* Protection Notice Pill */}
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-teal-500/20 pt-4 text-xs text-teal-200/90">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="text-teal-400">🛡️</span> Sensitive Data Masking: <strong className="text-white">Active (PII Redacted)</strong>
          </div>
          <div className="flex items-center gap-1.5 font-medium">
            <span className="text-teal-400">🔒</span> Mutation Authority: <strong className="text-white">Disabled (Zero Write/Action Scope)</strong>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="ml-auto rounded-lg border border-teal-500/40 bg-teal-900/40 px-3 py-1 text-xs text-teal-200 hover:bg-teal-800/50 transition"
            >
              Sync Telemetry
            </button>
          )}
        </div>
      </div>

      {/* Auditor Sub-Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {[
          { key: 'TRANSACTIONS', label: 'Buyer Orders Radar', icon: '📊' },
          { key: 'SELLER_ORDERS', label: 'Seller Orders & Invoices', icon: '🏪' },
          { key: 'USERS', label: 'Users & Organizations Roster', icon: '👥' },
          { key: 'LOGS', label: 'Immutable SHA-256 Audit Trail', icon: '📜' },
          { key: 'NOTIFICATIONS', label: 'Platform Broadcast Alerts', icon: '🔔' },
        ].map((tab) => {
          const isActive = activeAuditTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveAuditTab(tab.key as any)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                isActive
                  ? 'bg-teal-600 text-white shadow-md'
                  : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground border border-border'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Render Active View in Read-Only Container */}
      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm pointer-events-auto">
        {activeAuditTab === 'TRANSACTIONS' && (
          <AdminTransactionsTable
            transactions={redactedTransactions}
            isLoading={isLoadingTx}
            onRefresh={onRefresh}
            onExecuteAction={async () => {}}
          />
        )}

        {activeAuditTab === 'SELLER_ORDERS' && (
          <AdminSellerOrdersTable
            orders={redactedSellerOrders}
            isLoading={isLoadingOrders}
            onRefresh={onRefresh}
            onExecuteAction={async () => {}}
          />
        )}

        {activeAuditTab === 'USERS' && (
          <AdminUsersActivityPanel />
        )}

        {activeAuditTab === 'LOGS' && (
          <AdminAuditLogsViewer />
        )}

        {activeAuditTab === 'NOTIFICATIONS' && (
          <NotificationsPage />
        )}
      </div>
    </div>
  );
}
