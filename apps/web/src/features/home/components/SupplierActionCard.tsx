import React from 'react';
import { Link } from 'react-router-dom';
import type { SupplierActionItem } from '../types';

interface SupplierActionCardProps {
  action: SupplierActionItem;
}

export function SupplierActionCard({ action }: SupplierActionCardProps) {
  const isP0 = action.priority === 'P0';

  return (
    <article
      className={`rounded-2xl border p-3.5 sm:p-4 space-y-3 transition-all ${
        isP0
          ? 'border-blue-500/90 bg-blue-50/40 dark:bg-blue-950/25 ring-1 ring-blue-400/30 shadow-xs'
          : 'border-amber-400/90 bg-amber-50/40 dark:bg-amber-950/25 ring-1 ring-amber-400/30 shadow-xs'
      }`}
      data-testid={`supplier-action-card-${action.id}`}
    >
      {/* Top Meta Row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold border shrink-0 ${
                isP0
                  ? 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/80 dark:text-blue-300 dark:border-blue-800'
                  : 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800'
              }`}
            >
              <span>{isP0 ? '⚡' : '⏳'}</span>
              <span className="ml-1">{action.statusLabel}</span>
            </span>
            {action.publicRef && (
              <span className="font-mono text-[10px] text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded font-bold shrink-0">
                {action.publicRef}
              </span>
            )}
          </div>

          <h3 className="text-sm sm:text-base font-extrabold text-foreground leading-snug mt-1.5 line-clamp-2">
            {action.title}
          </h3>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{action.subtitle}</p>
        </div>
      </div>

      {/* WHY: Concise explanation strip */}
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold ${
          isP0
            ? 'bg-blue-100/60 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200 border-blue-300/60 dark:border-blue-800/60'
            : 'bg-amber-100/60 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border-amber-300/60 dark:border-amber-800/60'
        }`}
      >
        <span className="shrink-0">{isP0 ? '🚚' : '⚡'}</span>
        <span className="truncate">{action.whyText}</span>
      </div>

      {/* NEXT ACTION: 48px touch target */}
      <div className="pt-0.5">
        <Link
          to={action.actionUrl}
          className={`min-h-[48px] w-full flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-extrabold shadow-sm active:scale-98 transition mobile-touch-target ${
            isP0
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/20'
              : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20'
          }`}
        >
          <span>{action.actionLabel}</span>
        </Link>
      </div>
    </article>
  );
}
