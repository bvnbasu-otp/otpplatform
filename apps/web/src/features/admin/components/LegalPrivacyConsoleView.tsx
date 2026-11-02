import React, { useState } from 'react';
import { InternalRoleMascot } from './InternalRoleMascots';
import { AdminSupportTicketsPanel } from './AdminSupportTicketsPanel';
import { AdminAuditLogsViewer } from './AdminAuditLogsViewer';
import { AdminUsersActivityPanel } from './AdminUsersActivityPanel';

import type { SystemHealthResponse } from '../types/admin';

export interface LegalPrivacyConsoleViewProps {
  health?: SystemHealthResponse | null;
  onNavigateTab?: (tab: any) => void;
  onRefresh?: () => void;
}

export function LegalPrivacyConsoleView({ onRefresh }: LegalPrivacyConsoleViewProps) {
  const [activeTab, setActiveTab] = useState<'TICKETS' | 'LOGS' | 'APPROVALS'>('TICKETS');

  return (
    <div className="space-y-6">
      {/* Legal & Privacy Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-rose-500/30 bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-900 p-6 shadow-xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-300">
              <span className="h-2 w-2 rounded-full bg-rose-400 animate-pulse" />
              Legal, Privacy, Compliance & Dispute Arbitration
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Legal, Privacy & Compliance Vault
            </h1>
            <p className="text-sm text-slate-300">
              Arbitration of commercial dispute claims, inspection of sealed evaluation trails, regulatory compliance auditing, and verification of tamper-evident SHA-256 cryptographic state transition proofs.
            </p>
          </div>
          <div className="shrink-0">
            <InternalRoleMascot role="LEGAL_PRIVACY" className="w-32 h-32 drop-shadow-md" />
          </div>
        </div>

        {/* Protection / Status Pill */}
        <div className="mt-4 flex flex-wrap items-center justify-between border-t border-rose-500/20 pt-4 text-xs text-rose-200/90">
          <div className="flex items-center gap-3">
            <span>Role Context: <strong className="text-white">Legal & Compliance Officer (Locked View)</strong></span>
            <span>•</span>
            <span>Audit Trail Invariant: <strong className="text-rose-400">INV-071 & INV-072 Enforced</strong></span>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-lg border border-rose-500/40 bg-rose-900/40 px-3 py-1 text-xs text-rose-200 hover:bg-rose-800/50 transition"
            >
              Verify Hashes
            </button>
          )}
        </div>
      </div>

      {/* Legal Sub-Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {[
          { key: 'TICKETS', label: 'Commercial Dispute Arbitration', icon: '⚖️' },
          { key: 'LOGS', label: 'Immutable Cryptographic Audit Vault', icon: '📜' },
          { key: 'APPROVALS', label: 'Legal Terms & KYC Compliance', icon: '🏛️' },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as any)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                isActive
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground border border-border'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Legal Console Content */}
      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
        {activeTab === 'TICKETS' && <AdminSupportTicketsPanel />}
        {activeTab === 'LOGS' && <AdminAuditLogsViewer />}
        {activeTab === 'APPROVALS' && <AdminUsersActivityPanel initialSubTab="REGISTRATIONS" />}
      </div>
    </div>
  );
}
