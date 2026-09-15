import React from 'react';
import { Link } from 'react-router-dom';
import type { BuyerActionItem } from '../types';

interface BuyerActionCardProps {
  action: BuyerActionItem;
  onInspect?: () => void;
}

export function BuyerActionCard({ action, onInspect }: BuyerActionCardProps) {
  const isHighPriority = action.priority === 'P0';

  return (
    <article
      className={`rounded-2xl border p-3.5 sm:p-4 space-y-3 transition-all ${
        isHighPriority
          ? 'border-amber-400/90 bg-amber-50/40 dark:bg-amber-950/25 ring-1 ring-amber-400/30 shadow-xs'
          : 'border-border/80 bg-card hover:border-primary/40 shadow-2xs'
      }`}
    >
      {/* Top Meta Row: Category, Tag & Sealed Sourcing Shield */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-[10px] text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded font-bold shrink-0">
              REQ-{action.id.slice(0, 6)}
            </span>
            <span className="text-[10px] font-bold text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full truncate max-w-[120px]">
              {action.category}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold border flex items-center gap-1 shrink-0 ${
                isHighPriority
                  ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800'
                  : 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
              }`}
            >
              <span>{action.statusIcon}</span>
              <span>{action.statusLabel}</span>
            </span>
          </div>

          {/* WHAT */}
          <h3 className="text-sm sm:text-base font-extrabold text-foreground leading-snug mt-1.5 line-clamp-2">
            {action.title}
          </h3>
        </div>

        <span
          title="Identity-Protected sealed sourcing"
          className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1"
        >
          <span>🔒</span>
          <span>Sealed</span>
        </span>
      </div>

      {/* WHY: Concise explanation strip */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-100/60 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-300/60 dark:border-amber-800/60 text-xs font-semibold">
        <span className="shrink-0">⚡</span>
        <span className="truncate">{action.whyText}</span>
      </div>

      {/* NEXT ACTION: 48px touch targets */}
      <div className="flex items-center gap-2 pt-0.5">
        {onInspect && (
          <button
            type="button"
            onClick={onInspect}
            className="min-h-[48px] rounded-xl border border-border/80 bg-card px-3.5 py-2.5 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95 transition shadow-2xs shrink-0 flex items-center justify-center gap-1 cursor-pointer"
          >
            <span>ℹ️</span>
            <span>Details</span>
          </button>
        )}

        <Link
          to={action.actionUrl}
          className="min-h-[48px] flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 text-xs font-extrabold shadow-sm active:scale-98 transition shadow-primary/20"
        >
          <span>{action.actionLabel}</span>
        </Link>
      </div>
    </article>
  );
}
