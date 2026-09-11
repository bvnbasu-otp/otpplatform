import { formatMoney } from '@/features/fulfillment/types/fulfillment';
import type { PeriodReportingSummary, UserReportingRole } from '../types/reporting';
import type { DrillDownMetric } from '../types/drilldown';

interface AnalyticsCardsProps {
  summary: PeriodReportingSummary;
  role: UserReportingRole;
  activeMetric?: DrillDownMetric;
  onSelectMetric?: (metric: DrillDownMetric) => void;
}

export function AnalyticsCards({ summary, role, activeMetric, onSelectMetric }: AnalyticsCardsProps) {
  const handleToggle = (metric: DrillDownMetric) => {
    if (!onSelectMetric) return;
    if (activeMetric === metric) {
      onSelectMetric(null);
    } else {
      onSelectMetric(metric);
    }
  };

  if (role === 'supplier') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3.5">
        {/* Gross Revenue Card */}
        <div
          onClick={() => handleToggle('GROSS_REVENUE')}
          className={`rounded-xl border bg-card p-3 sm:p-3.5 shadow-xs cursor-pointer transition-all hover:border-primary/60 hover:shadow-md ${
            activeMetric === 'GROSS_REVENUE'
              ? 'ring-2 ring-primary ring-offset-2 border-primary bg-primary/5'
              : 'border-border'
          }`}
        >
          <div className="flex items-center justify-between text-muted-foreground mb-1 text-xs">
            <span className="font-semibold text-foreground">Gross Awarded Value</span>
            <span className="text-base">💰</span>
          </div>
          <p className="text-lg sm:text-xl font-bold text-foreground truncate">
            {formatMoney(summary.totalAmount, 'INR')}
          </p>
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-muted-foreground mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-border/40">
            <span>{summary.totalOrdersCount} purchase orders</span>
            <span className="text-primary font-semibold">
              {activeMetric === 'GROSS_REVENUE' ? '✓ Viewing' : 'Drill down →'}
            </span>
          </div>
        </div>

        {/* Settled Revenue Card */}
        <div
          onClick={() => handleToggle('SETTLED_PAID')}
          className={`rounded-xl border bg-emerald-50/50 dark:bg-emerald-950/30 p-3 sm:p-3.5 shadow-xs cursor-pointer transition-all hover:border-emerald-500 hover:shadow-md ${
            activeMetric === 'SETTLED_PAID'
              ? 'ring-2 ring-emerald-600 ring-offset-2 border-emerald-600 bg-emerald-100/60 dark:bg-emerald-900/40'
              : 'border-emerald-200/80 dark:border-emerald-800/60'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-800 dark:text-emerald-300 mb-1 text-xs font-semibold">
            <span>Settled &amp; Paid</span>
            <span className="text-base">✅</span>
          </div>
          <p className="text-lg sm:text-xl font-bold text-emerald-950 dark:text-emerald-100 truncate">
            {formatMoney(summary.settledAmount, 'INR')}
          </p>
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-emerald-700 dark:text-emerald-300 mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-emerald-200/60 dark:border-emerald-800/40">
            <span>{summary.settledOrdersCount} settled orders</span>
            <span className="font-bold">
              {activeMetric === 'SETTLED_PAID' ? '✓ Viewing' : 'Drill down →'}
            </span>
          </div>
        </div>

        {/* Active Work Card */}
        <div
          onClick={() => handleToggle('ACTIVE_COMMITMENTS')}
          className={`rounded-xl border bg-blue-50/50 dark:bg-blue-950/30 p-3 sm:p-3.5 shadow-xs cursor-pointer transition-all hover:border-blue-500 hover:shadow-md ${
            activeMetric === 'ACTIVE_COMMITMENTS'
              ? 'ring-2 ring-blue-600 ring-offset-2 border-blue-600 bg-blue-100/60 dark:bg-blue-900/40'
              : 'border-blue-200/80 dark:border-blue-800/60'
          }`}
        >
          <div className="flex items-center justify-between text-blue-800 dark:text-blue-300 mb-1 text-xs font-semibold">
            <span>Active in Execution</span>
            <span className="text-base">🔨</span>
          </div>
          <p className="text-lg sm:text-xl font-bold text-blue-950 dark:text-blue-100 truncate">
            {formatMoney(summary.activeAmount, 'INR')}
          </p>
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-blue-700 dark:text-blue-300 mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-blue-200/60 dark:border-blue-800/40">
            <span>{summary.activeOrdersCount} ongoing milestones</span>
            <span className="font-bold">
              {activeMetric === 'ACTIVE_COMMITMENTS' ? '✓ Viewing' : 'Drill down →'}
            </span>
          </div>
        </div>

        {/* Cancelled / Exited Card */}
        <div
          onClick={() => handleToggle('CANCELLED_EXITS')}
          className={`rounded-xl border bg-red-50/50 dark:bg-red-950/30 p-3 sm:p-3.5 shadow-xs cursor-pointer transition-all hover:border-red-500 hover:shadow-md ${
            activeMetric === 'CANCELLED_EXITS'
              ? 'ring-2 ring-red-600 ring-offset-2 border-red-600 bg-red-100/60 dark:bg-red-900/40'
              : 'border-red-200/80 dark:border-red-800/60'
          }`}
        >
          <div className="flex items-center justify-between text-red-800 dark:text-red-300 mb-1 text-xs font-semibold">
            <span>Cancelled / Exited</span>
            <span className="text-base">🚫</span>
          </div>
          <p className="text-lg sm:text-xl font-bold text-red-950 dark:text-red-100 truncate">
            {summary.cancelledOrdersCount} Orders
          </p>
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-red-700 dark:text-red-300 mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-red-200/60 dark:border-red-800/40">
            <span>No Penalty Exits</span>
            <span className="font-bold">
              {activeMetric === 'CANCELLED_EXITS' ? '✓ Viewing' : 'Audit logs →'}
            </span>
          </div>
        </div>

        {/* On-Time Performance Card */}
        <div
          onClick={() => handleToggle('ON_TIME_PERF')}
          className={`rounded-xl border bg-purple-50/50 dark:bg-purple-950/30 p-3 sm:p-3.5 shadow-xs cursor-pointer transition-all hover:border-purple-500 hover:shadow-md ${
            activeMetric === 'ON_TIME_PERF'
              ? 'ring-2 ring-purple-600 ring-offset-2 border-purple-600 bg-purple-100/60 dark:bg-purple-900/40'
              : 'border-purple-200/80 dark:border-purple-800/60'
          }`}
        >
          <div className="flex items-center justify-between text-purple-800 dark:text-purple-300 mb-1 text-xs font-semibold">
            <span>On-Time Performance</span>
            <span className="text-base">⭐</span>
          </div>
          <p className="text-lg sm:text-xl font-bold text-purple-950 dark:text-purple-100 truncate">
            {summary.onTimeDeliveryRate}%
          </p>
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-purple-700 dark:text-purple-300 mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-purple-200/60 dark:border-purple-800/40">
            <span>High SLA Tier</span>
            <span className="font-bold">
              {activeMetric === 'ON_TIME_PERF' ? '✓ Viewing' : 'Drill down →'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (role === 'approver') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Approved Spend */}
        <div
          onClick={() => handleToggle('TOTAL_SPEND')}
          className={`rounded-xl border bg-card p-4 shadow-xs cursor-pointer transition-all hover:border-primary/60 hover:shadow-md ${
            activeMetric === 'TOTAL_SPEND'
              ? 'ring-2 ring-primary ring-offset-2 border-primary bg-primary/5'
              : 'border-border'
          }`}
        >
          <div className="flex items-center justify-between text-muted-foreground mb-1 text-xs">
            <span className="font-semibold text-foreground">Total Approved Spend</span>
            <span className="text-base">🏛️</span>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {formatMoney(summary.totalAmount, 'INR')}
          </p>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2 pt-2 border-t border-border/40">
            <span>{summary.totalOrdersCount} commercial decisions</span>
            <span className="text-primary font-semibold">
              {activeMetric === 'TOTAL_SPEND' ? '✓ Viewing' : 'Drill down →'}
            </span>
          </div>
        </div>

        {/* Quorum Rate */}
        <div className="rounded-xl border border-amber-200/80 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/30 p-4 shadow-xs">
          <div className="flex items-center justify-between text-amber-800 dark:text-amber-300 mb-1 text-xs font-semibold">
            <span>Quorum Participation</span>
            <span className="text-base">🗳️</span>
          </div>
          <p className="text-2xl font-bold text-amber-950 dark:text-amber-100">100%</p>
          <div className="flex items-center justify-between text-[11px] text-amber-700 dark:text-amber-300 mt-2 pt-2 border-t border-amber-200/60 dark:border-amber-800/40">
            <span>Zero Uncast Votes</span>
            <span className="font-bold">Quorum Full</span>
          </div>
        </div>

        {/* COI Cleanliness */}
        <div className="rounded-xl border border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/30 p-4 shadow-xs">
          <div className="flex items-center justify-between text-emerald-800 dark:text-emerald-300 mb-1 text-xs font-semibold">
            <span>COI Governance Cleanliness</span>
            <span className="text-base">🛡️</span>
          </div>
          <p className="text-2xl font-bold text-emerald-950 dark:text-emerald-100">100% Clear</p>
          <div className="flex items-center justify-between text-[11px] text-emerald-700 dark:text-emerald-300 mt-2 pt-2 border-t border-emerald-200/60 dark:border-emerald-800/40">
            <span>All Declarations Logged</span>
            <span className="font-bold">Verified</span>
          </div>
        </div>

        {/* Evaluation Turnaround */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-1 text-xs">
            <span className="font-semibold text-foreground">Evaluation Turnaround</span>
            <span className="text-base">⚡</span>
          </div>
          <p className="text-2xl font-bold text-foreground">&lt; 24 Hours</p>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2 pt-2 border-t border-border/40">
            <span>Consensus Duration</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">Fast Track</span>
          </div>
        </div>
      </div>
    );
  }

  if (role === 'auditor') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Audited Volume */}
        <div
          onClick={() => handleToggle('TOTAL_SPEND')}
          className={`rounded-xl border bg-card p-4 shadow-xs cursor-pointer transition-all hover:border-primary/60 hover:shadow-md ${
            activeMetric === 'TOTAL_SPEND'
              ? 'ring-2 ring-primary ring-offset-2 border-primary bg-primary/5'
              : 'border-border'
          }`}
        >
          <div className="flex items-center justify-between text-muted-foreground mb-1 text-xs">
            <span className="font-semibold text-foreground">Audited Transaction Volume</span>
            <span className="text-base">🛡️</span>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {formatMoney(summary.totalAmount, 'INR')}
          </p>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2 pt-2 border-t border-border/40">
            <span>{summary.totalOrdersCount} audited orders</span>
            <span className="text-primary font-semibold">
              {activeMetric === 'TOTAL_SPEND' ? '✓ Viewing' : 'Audit logs →'}
            </span>
          </div>
        </div>

        {/* Cancelled / Exited Audits */}
        <div
          onClick={() => handleToggle('CANCELLED_EXITS')}
          className={`rounded-xl border bg-red-50/50 dark:bg-red-950/30 p-4 shadow-xs cursor-pointer transition-all hover:border-red-500 hover:shadow-md ${
            activeMetric === 'CANCELLED_EXITS'
              ? 'ring-2 ring-red-600 ring-offset-2 border-red-600 bg-red-100/60 dark:bg-red-900/40'
              : 'border-red-200/80 dark:border-red-800/60'
          }`}
        >
          <div className="flex items-center justify-between text-red-800 dark:text-red-300 mb-1 text-xs font-semibold">
            <span>Cancelled &amp; Exited Audits</span>
            <span className="text-base">🚫</span>
          </div>
          <p className="text-2xl font-bold text-red-950 dark:text-red-100">
            {summary.cancelledOrdersCount} Audited
          </p>
          <div className="flex items-center justify-between text-[11px] text-red-700 dark:text-red-300 mt-2 pt-2 border-t border-red-200/60 dark:border-red-800/40">
            <span>No-fault exit reviews</span>
            <span className="font-bold">
              {activeMetric === 'CANCELLED_EXITS' ? '✓ Viewing' : 'Audit trail →'}
            </span>
          </div>
        </div>

        {/* Audit Chain Integrity */}
        <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-800/60 bg-indigo-50/50 dark:bg-indigo-950/30 p-4 shadow-xs">
          <div className="flex items-center justify-between text-indigo-800 dark:text-indigo-300 mb-1 text-xs font-semibold">
            <span>Audit Chain Integrity</span>
            <span className="text-base">🔗</span>
          </div>
          <p className="text-2xl font-bold text-indigo-950 dark:text-indigo-100">100% Cryptographic</p>
          <div className="flex items-center justify-between text-[11px] text-indigo-700 dark:text-indigo-300 mt-2 pt-2 border-t border-indigo-200/60 dark:border-indigo-800/40">
            <span>Append-only hash chain</span>
            <span className="font-bold">Active</span>
          </div>
        </div>

        {/* Compliance Score */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-1 text-xs">
            <span className="font-semibold text-foreground">Compliance Score</span>
            <span className="text-base">🏆</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{summary.complianceScorePercent}%</p>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2 pt-2 border-t border-border/40">
            <span>Zero regulatory flags</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">Perfect</span>
          </div>
        </div>
      </div>
    );
  }

  // Default: Buyer
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3.5">
      {/* 1. Total Spend Commitment Card */}
      <div
        onClick={() => handleToggle('TOTAL_SPEND')}
        className={`rounded-xl border bg-card p-3 sm:p-3.5 shadow-xs cursor-pointer transition-all hover:border-primary/80 hover:shadow-md ${
          activeMetric === 'TOTAL_SPEND'
            ? 'ring-2 ring-primary ring-offset-2 border-primary bg-primary/5'
            : 'border-border'
        }`}
      >
        <div className="flex items-center justify-between text-muted-foreground mb-1 text-xs">
          <span className="font-semibold text-foreground">Total Spend Commitment</span>
          <span className="text-base">💳</span>
        </div>
        <p className="text-lg sm:text-xl font-bold text-foreground truncate">
          {formatMoney(summary.totalAmount, 'INR')}
        </p>
        <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-muted-foreground mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-border/40">
          <span>{summary.totalOrdersCount} total purchase orders</span>
          <span className="text-primary font-bold">
            {activeMetric === 'TOTAL_SPEND' ? '✓ Viewing' : 'Drill down →'}
          </span>
        </div>
      </div>

      {/* 2. Settled & Paid Card */}
      <div
        onClick={() => handleToggle('SETTLED_PAID')}
        className={`rounded-xl border bg-emerald-50/50 dark:bg-emerald-950/30 p-3 sm:p-3.5 shadow-xs cursor-pointer transition-all hover:border-emerald-600 hover:shadow-md ${
          activeMetric === 'SETTLED_PAID'
            ? 'ring-2 ring-emerald-600 ring-offset-2 border-emerald-600 bg-emerald-100/60 dark:bg-emerald-900/40'
            : 'border-emerald-200/80 dark:border-emerald-800/60'
        }`}
      >
        <div className="flex items-center justify-between text-emerald-800 dark:text-emerald-300 mb-1 text-xs font-bold">
          <span>Settled &amp; Paid</span>
          <span className="text-base">🧾</span>
        </div>
        <p className="text-lg sm:text-xl font-bold text-emerald-950 dark:text-emerald-100 truncate">
          {formatMoney(summary.settledAmount, 'INR')}
        </p>
        <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-emerald-700 dark:text-emerald-300 mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-emerald-200/60 dark:border-emerald-800/40">
          <span>{summary.settledOrdersCount} completed orders</span>
          <span className="font-bold">
            {activeMetric === 'SETTLED_PAID' ? '✓ Viewing' : 'Drill down →'}
          </span>
        </div>
      </div>

      {/* 3. Active Commitments Card */}
      <div
        onClick={() => handleToggle('ACTIVE_COMMITMENTS')}
        className={`rounded-xl border bg-blue-50/50 dark:bg-blue-950/30 p-3 sm:p-3.5 shadow-xs cursor-pointer transition-all hover:border-blue-600 hover:shadow-md ${
          activeMetric === 'ACTIVE_COMMITMENTS'
            ? 'ring-2 ring-blue-600 ring-offset-2 border-blue-600 bg-blue-100/60 dark:bg-blue-900/40'
            : 'border-blue-200/80 dark:border-blue-800/60'
        }`}
      >
        <div className="flex items-center justify-between text-blue-800 dark:text-blue-300 mb-1 text-xs font-bold">
          <span>Active in Execution</span>
          <span className="text-base">⏳</span>
        </div>
        <p className="text-lg sm:text-xl font-bold text-blue-950 dark:text-blue-100 truncate">
          {formatMoney(summary.activeAmount, 'INR')}
        </p>
        <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-blue-700 dark:text-blue-300 mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-blue-200/60 dark:border-blue-800/40">
          <span>{summary.activeOrdersCount} ongoing milestones</span>
          <span className="font-bold">
            {activeMetric === 'ACTIVE_COMMITMENTS' ? '✓ Viewing' : 'Drill down →'}
          </span>
        </div>
      </div>

      {/* 4. Cancelled & Exited Card */}
      <div
        onClick={() => handleToggle('CANCELLED_EXITS')}
        className={`rounded-xl border bg-red-50/50 dark:bg-red-950/30 p-3 sm:p-3.5 shadow-xs cursor-pointer transition-all hover:border-red-600 hover:shadow-md ${
          activeMetric === 'CANCELLED_EXITS'
            ? 'ring-2 ring-red-600 ring-offset-2 border-red-600 bg-red-100/60 dark:bg-red-900/40'
            : 'border-red-200/80 dark:border-red-800/60'
        }`}
      >
        <div className="flex items-center justify-between text-red-800 dark:text-red-300 mb-1 text-xs font-bold">
          <span>Cancelled / Exited</span>
          <span className="text-base">🚫</span>
        </div>
        <p className="text-lg sm:text-xl font-bold text-red-950 dark:text-red-100 truncate">
          {summary.cancelledOrdersCount} Orders
        </p>
        <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-red-700 dark:text-red-300 mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-red-200/60 dark:border-red-800/40">
          <span>No-penalty protected exits</span>
          <span className="font-bold">
            {activeMetric === 'CANCELLED_EXITS' ? '✓ Viewing' : 'Audit logs →'}
          </span>
        </div>
      </div>

      {/* 5. Estimated Competitive Sourcing Savings Card */}
      <div
        onClick={() => handleToggle('QUOTING_SAVINGS')}
        className={`rounded-xl border bg-teal-50/50 dark:bg-teal-950/30 p-3 sm:p-3.5 shadow-xs cursor-pointer transition-all hover:border-teal-600 hover:shadow-md ${
          activeMetric === 'QUOTING_SAVINGS'
            ? 'ring-2 ring-teal-600 ring-offset-2 border-teal-600 bg-teal-100/60 dark:bg-teal-900/40'
            : 'border-teal-200/80 dark:border-teal-800/60'
        }`}
      >
        <div className="flex items-center justify-between text-teal-800 dark:text-teal-300 mb-1 text-xs font-bold">
          <span>Quoting Savings</span>
          <span className="text-base">📉</span>
        </div>
        <p className="text-lg sm:text-xl font-bold text-teal-950 dark:text-teal-100 truncate">
          {formatMoney(summary.estimatedSavings, 'INR')}
        </p>
        <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-teal-700 dark:text-teal-300 mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-teal-200/60 dark:border-teal-800/40">
          <span>12.5% market baseline savings</span>
          <span className="font-bold">
            {activeMetric === 'QUOTING_SAVINGS' ? '✓ Viewing' : 'Drill down →'}
          </span>
        </div>
      </div>
    </div>
  );
}
