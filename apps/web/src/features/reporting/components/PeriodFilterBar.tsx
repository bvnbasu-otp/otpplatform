import { useState } from 'react';
import type { PeriodType, UserReportingRole } from '../types/reporting';

interface PeriodFilterBarProps {
  periodType: PeriodType;
  onPeriodChange: (type: PeriodType) => void;
  customStartDate: string;
  customEndDate: string;
  onCustomStartChange: (date: string) => void;
  onCustomEndChange: (date: string) => void;
  periodLabel: string;
  role: UserReportingRole;
  onRoleChange?: (role: UserReportingRole) => void;
  selectedCategory: string;
  onCategoryChange: (cat: string) => void;
  categories: string[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onExportPdf: () => void;
}

export function PeriodFilterBar({
  periodType,
  onPeriodChange,
  customStartDate,
  customEndDate,
  onCustomStartChange,
  onCustomEndChange,
  periodLabel,
  role,
  onRoleChange,
  selectedCategory,
  onCategoryChange,
  categories,
  searchQuery,
  onSearchChange,
  onExportPdf,
}: PeriodFilterBarProps) {
  const [showRoleSelector, setShowRoleSelector] = useState(false);

  const periods: { id: PeriodType; label: string; icon: string }[] = [
    { id: 'DAILY', label: 'Daily', icon: '📅' },
    { id: 'WEEKLY', label: 'Weekly', icon: '📊' },
    { id: 'MONTHLY', label: 'Monthly', icon: '🗓️' },
    { id: 'QUARTERLY', label: 'Quarterly', icon: '📈' },
    { id: 'YEARLY', label: 'Yearly (FY)', icon: '🏛️' },
    { id: 'CUSTOM', label: 'Custom Period', icon: '⚡' },
  ];

  return (
    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm space-y-4 no-print">
      {/* Top Row: Period Tabs + Export PDF Action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Period Selector Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 p-1">
          {periods.map((p) => {
            const isActive = periodType === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPeriodChange(p.id)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <span>{p.icon}</span>
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>

        {/* Action Controls: Role Perspective + PDF Export */}
        <div className="flex items-center gap-2">
          {onRoleChange && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowRoleSelector(!showRoleSelector)}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted transition"
              >
                <span>👤 Perspective:</span>
                <span className="capitalize font-bold text-primary">{role}</span>
                <span>▾</span>
              </button>
              {showRoleSelector && (
                <div className="absolute right-0 mt-1 w-44 rounded-lg border border-border bg-card p-1 shadow-lg z-20">
                  {(['buyer', 'supplier', 'approver', 'auditor'] as UserReportingRole[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        onRoleChange(r);
                        setShowRoleSelector(false);
                      }}
                      className={`w-full text-left rounded px-2.5 py-1.5 text-xs font-medium capitalize transition ${
                        role === r ? 'bg-primary text-primary-foreground font-semibold' : 'hover:bg-muted'
                      }`}
                    >
                      {r === 'buyer' && '🛒 Buyer Spend'}
                      {r === 'supplier' && '🏪 Supplier Revenue'}
                      {r === 'approver' && '🗳️ Approver Governance'}
                      {r === 'auditor' && '🛡️ Auditor Compliance'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onExportPdf}
            className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-800 active:scale-95 transition"
            title="Download or print official procurement report in PDF"
          >
            <span>📄</span>
            <span>Export as PDF</span>
          </button>
        </div>
      </div>

      {/* Period Indicator & Custom Date Pickers */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/40 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="font-semibold text-foreground">Active Window:</span>
          <span className="rounded bg-primary/10 px-2 py-0.5 font-bold text-primary">
            {periodLabel}
          </span>
        </div>

        {/* Custom Range Inputs (shown when CUSTOM period is active) */}
        {periodType === 'CUSTOM' && (
          <div className="flex flex-wrap items-center gap-2 animate-in fade-in duration-200">
            <span className="font-medium text-muted-foreground">From:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => onCustomStartChange(e.target.value)}
              className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="font-medium text-muted-foreground">To:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => onCustomEndChange(e.target.value)}
              className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        )}
      </div>

      {/* Bottom Row: Search & Category Filter */}
      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/40">
        <form
          onSubmit={(e) => e.preventDefault()}
          className="flex flex-1 items-center gap-2 min-w-[240px]"
        >
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">🔍</span>
            <input
              type="text"
              placeholder="Search by PO number, requirement title, amount, or vendor..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full rounded-lg border border-border bg-card pl-8 pr-8 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground p-0.5 rounded-full hover:bg-muted"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition shrink-0"
          >
            <span>Search</span>
          </button>
        </form>

        {categories.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => onCategoryChange(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="ALL">All Categories ({categories.length})</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
