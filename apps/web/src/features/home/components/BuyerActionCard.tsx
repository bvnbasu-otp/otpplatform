import React from 'react';
import { Link } from 'react-router-dom';
import type { BuyerActionItem } from '../types';

interface BuyerActionCardProps {
  action: BuyerActionItem;
  onInspect?: () => void;
}

export function BuyerActionCard({ action, onInspect }: BuyerActionCardProps) {
  const isHighPriority = action.priority === 'P0';
  const rfqCode = action.requirement?.rfqId
    ? `RFQ #${action.requirement.rfqId.slice(-4)}`
    : `REQ #${action.id.slice(0, 6)}`;
  const quotesText = action.requirement?.quotesCount
    ? `${action.requirement.quotesCount} Sealed Quotes`
    : '3 Sealed Quotes';

  return (
    <article
      className="rounded-2xl border border-border/80 bg-card p-3 sm:p-4 space-y-2.5 shadow-xs transition hover:border-primary/40"
    >
      {/* Top Header Row (Screen 06) */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full">
          {action.statusLabel || 'Voting in Progress'}
        </span>
        <span className="text-[11px] text-muted-foreground font-mono">{rfqCode}</span>
      </div>

      {/* Title */}
      <h5 className="text-xs sm:text-sm font-bold text-foreground leading-snug line-clamp-2">
        {action.title}
      </h5>

      {/* Summary Row */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/50">
        <span>{quotesText}</span>
        <span className="font-bold text-emerald-600 dark:text-emerald-400">L1: ₹8,200</span>
      </div>

      {/* Single Primary Action: Min 48px touch target */}
      <div className="pt-0.5">
        <Link
          to={action.actionUrl}
          className="w-full min-h-[48px] rounded-xl bg-primary py-2.5 text-xs font-extrabold text-primary-foreground shadow-xs hover:bg-primary/90 transition text-center flex items-center justify-center gap-1.5 active:scale-98"
        >
          <span>{action.actionLabel.toLowerCase().includes('vote') ? '🗳️ Review & Cast Vote →' : `${action.actionLabel} →`}</span>
        </Link>
      </div>
    </article>
  );
}
