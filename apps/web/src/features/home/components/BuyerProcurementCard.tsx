import React from 'react';
import { Link } from 'react-router-dom';
import { formatDateIST } from '@/lib/date-utils';
import type { BuyerProcurementItem } from '../types';

interface BuyerProcurementCardProps {
  procurement: BuyerProcurementItem;
  onInspect?: () => void;
}

export function BuyerProcurementCard({ procurement, onInspect }: BuyerProcurementCardProps) {
  return (
    <article className="rounded-2xl border border-border/80 bg-card p-3.5 sm:p-4 space-y-3 transition-all hover:border-primary/40 shadow-2xs">
      {/* Top Meta Row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-[10px] text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded font-bold shrink-0">
              REQ-{procurement.id.slice(0, 6)}
            </span>
            <span className="text-[10px] font-bold text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full truncate max-w-[120px]">
              {procurement.category}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border flex items-center gap-1 shrink-0 ${procurement.statusClass}`}>
              <span>{procurement.statusIcon}</span>
              <span>{procurement.statusLabel}</span>
            </span>
          </div>

          <h3 className="text-sm sm:text-base font-extrabold text-foreground leading-snug mt-1.5 line-clamp-2">
            {procurement.title}
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

      {/* Metrics Glance Row */}
      <div className="grid grid-cols-3 gap-1.5 py-1.5 px-2.5 rounded-xl bg-muted/30 border border-border/60 text-center select-none text-xs">
        <div className="min-w-0">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">Quotes</span>
          <span className="text-xs font-black text-primary truncate block mt-0.5">
            {procurement.quotesCount > 0 ? `${procurement.quotesCount} Received` : '0 Quotes'}
          </span>
        </div>
        <div className="border-x border-border/60 min-w-0 px-1">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">Quorum Target</span>
          <span className="text-xs font-bold text-foreground truncate block mt-0.5">
            {procurement.minQuotesRequired} Min
          </span>
        </div>
        <div className="min-w-0">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">Created</span>
          <span className="text-xs font-medium text-foreground truncate block mt-0.5">
            {formatDateIST(procurement.createdAt)}
          </span>
        </div>
      </div>

      {/* Action Strip: Min 48px touch targets */}
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
          to={procurement.actionUrl}
          className={`min-h-[48px] flex-1 flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-extrabold shadow-sm active:scale-98 transition ${
            procurement.isActionRequired
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20'
              : 'border border-border/80 bg-card hover:bg-muted text-foreground'
          }`}
        >
          <span>{procurement.actionLabel}</span>
          <span>→</span>
        </Link>
      </div>
    </article>
  );
}
