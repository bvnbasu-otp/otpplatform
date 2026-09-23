import React from 'react';
import { Link } from 'react-router-dom';
import type { SupplierOpportunityItem } from '../types';

interface SupplierOpportunityCardProps {
  opportunity: SupplierOpportunityItem;
}

export function SupplierOpportunityCard({ opportunity }: SupplierOpportunityCardProps) {
  const buyerName = opportunity.buyerDisplayName || 'Palm Meadows RWA';

  return (
    <article
      className="rounded-2xl border border-primary/20 bg-card p-3.5 sm:p-4 space-y-2.5 shadow-xs transition hover:border-primary/40"
      data-testid={`supplier-opportunity-card-${opportunity.id}`}
    >
      {/* Top Header Row (Screen 05) */}
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-[10px] font-bold">
          ⚡ New Sealed Opportunity
        </span>
        <span className="text-[11px] text-muted-foreground font-medium">
          4.2 km away
        </span>
      </div>

      {/* Title & Subtitle */}
      <div>
        <h4 className="text-xs sm:text-sm font-bold text-foreground">
          {opportunity.title}
        </h4>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {buyerName} · Requires 6-month warranty
        </p>
      </div>

      {/* Submission Window & Identity Sealed Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs py-1.5 px-2.5 rounded-xl bg-muted/25 border border-border/60">
        <div>
          <span className="text-[9px] uppercase font-bold text-muted-foreground block">Submission Window:</span>
          <span className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1 mt-0.5">
            <span>⏳</span>
            <span>{opportunity.deadlineCountdown || 'Closes in 4 hrs'}</span>
          </span>
        </div>
        <div>
          <span className="text-[9px] uppercase font-bold text-muted-foreground block">Protection:</span>
          <span className="text-xs font-bold text-primary flex items-center gap-1 mt-0.5">
            <span>🔒</span>
            <span>Identity Sealed</span>
          </span>
        </div>
      </div>

      {/* Primary 30-Min Quote CTA */}
      <div className="pt-0.5">
        <Link
          to={opportunity.actionUrl}
          className="min-h-[48px] w-full flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 text-xs font-extrabold shadow-sm active:scale-98 transition shadow-primary/20 mobile-touch-target"
        >
          <span>⚡ Quote Now (30 Min) →</span>
        </Link>
      </div>
    </article>
  );
}
