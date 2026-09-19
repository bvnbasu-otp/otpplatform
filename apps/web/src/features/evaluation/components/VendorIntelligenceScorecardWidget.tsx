import React from 'react';
import type { AnonymizedPerformanceBadge } from '@otp/domain';

export interface VendorIntelligenceScorecardWidgetProps {
  badge: AnonymizedPerformanceBadge;
  className?: string;
}

export function VendorIntelligenceScorecardWidget({
  badge,
  className = '',
}: VendorIntelligenceScorecardWidgetProps) {
  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'PLATINUM':
        return 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800';
      case 'GOLD':
        return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
      case 'SILVER':
        return 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700';
      case 'BRONZE':
        return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';
    }
  };

  return (
    <div
      data-testid="vmi-scorecard-widget"
      className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {badge.supplierAlias}
          </span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${getTierColor(
              badge.tier
            )}`}
          >
            {badge.tier}
          </span>
        </div>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {badge.coarseScoreBand}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-2">
          <span className="block text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Quality
          </span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {badge.qualityRatingBand}
          </span>
        </div>

        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-2">
          <span className="block text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            On-Time
          </span>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            {badge.onTimeDeliveryBand}
          </span>
        </div>

        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-2">
          <span className="block text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Experience
          </span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {badge.completedJobsCountRange}
          </span>
        </div>
      </div>

      <p className="mt-2.5 text-[11px] text-slate-400 dark:text-slate-500 italic text-center">
        🔒 Performance scorecard identity-protected prior to winner reveal.
      </p>
    </div>
  );
}
