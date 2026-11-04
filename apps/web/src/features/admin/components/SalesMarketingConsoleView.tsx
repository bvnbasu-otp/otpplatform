import React, { useState } from 'react';
import { InternalRoleMascot } from './InternalRoleMascots';
import { AdminSupplierNetworkConsole } from './AdminSupplierNetworkConsole';
import { AdminTaxonomyManager } from './AdminTaxonomyManager';
import { StaffReferralLedgerPanel } from './StaffReferralLedgerPanel';
import { AdminUsersActivityPanel } from './AdminUsersActivityPanel';
import { BulkWhatsAppCampaignPanel } from './BulkWhatsAppCampaignPanel';

import type { SystemHealthResponse } from '../types/admin';

export interface SalesMarketingConsoleViewProps {
  health?: SystemHealthResponse | null;
  onNavigateTab?: (tab: any) => void;
  onRefresh?: () => void;
}

export function SalesMarketingConsoleView({ onRefresh }: SalesMarketingConsoleViewProps) {
  const [activeTab, setActiveTab] = useState<'SUPPLIER_NETWORK' | 'TAXONOMY' | 'APPROVALS' | 'STAFF_REFERRALS' | 'ORGS_SUPPLIERS' | 'WHATSAPP_CAMPAIGNS'>('SUPPLIER_NETWORK');

  return (
    <div className="space-y-6">
      {/* Sales & Marketing Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-purple-500/30 bg-gradient-to-r from-purple-950/40 via-slate-900 to-slate-900 p-6 shadow-xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/40 bg-purple-500/10 px-3 py-1 text-xs font-semibold text-purple-300">
              <span className="h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
              Growth, Network Liquidity & Taxonomy Architecture
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Sales, Marketing & SNE Engine
            </h1>
            <p className="text-sm text-slate-300">
              Calibration of 5 concentric geographic rings, 30-day location pre-warming, procurement taxonomy hierarchy (Services, Projects, Consumables, Capital Equipment), buyer/supplier vetting, and staff referral incentives.
            </p>
          </div>
          <div className="shrink-0">
            <InternalRoleMascot role="SALES_MARKETING" className="w-32 h-32 drop-shadow-md" />
          </div>
        </div>

        {/* Protection / Status Pill */}
        <div className="mt-4 flex flex-wrap items-center justify-between border-t border-purple-500/20 pt-4 text-xs text-purple-200/90">
          <div className="flex items-center gap-3">
            <span>Role Context: <strong className="text-white">Growth & Category Specialist (Locked View)</strong></span>
            <span>•</span>
            <span>SNE Ring Calibration: <strong className="text-purple-400">100% Active</strong></span>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-lg border border-purple-500/40 bg-purple-900/40 px-3 py-1 text-xs text-purple-200 hover:bg-purple-800/50 transition"
            >
              Refresh SNE
            </button>
          )}
        </div>
      </div>

      {/* Sales & Marketing Sub-Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {[
          { key: 'SUPPLIER_NETWORK', label: 'SNE Discovery & Pre-Warm Console', icon: '🌐' },
          { key: 'WHATSAPP_CAMPAIGNS', label: 'Bulk WhatsApp Outreach & Campaigns', icon: '📲' },
          { key: 'TAXONOMY', label: '17-Category Taxonomy & Clusters', icon: '🏷️' },
          { key: 'APPROVALS', label: 'Onboarding Registrations Queue', icon: '⏳' },
          { key: 'STAFF_REFERRALS', label: 'Staff Referral Ledger', icon: '💼' },
          { key: 'ORGS_SUPPLIERS', label: 'Supplier & Organization Registry', icon: '🏢' },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as any)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                isActive
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground border border-border'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Sales & Marketing Content */}
      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
        {activeTab === 'SUPPLIER_NETWORK' && <AdminSupplierNetworkConsole />}
        {activeTab === 'WHATSAPP_CAMPAIGNS' && <BulkWhatsAppCampaignPanel />}
        {activeTab === 'TAXONOMY' && <AdminTaxonomyManager />}
        {activeTab === 'APPROVALS' && <AdminUsersActivityPanel initialSubTab="REGISTRATIONS" />}
        {activeTab === 'STAFF_REFERRALS' && <StaffReferralLedgerPanel />}
        {activeTab === 'ORGS_SUPPLIERS' && <AdminUsersActivityPanel initialSubTab="ORGANIZATIONS" />}
      </div>
    </div>
  );
}
