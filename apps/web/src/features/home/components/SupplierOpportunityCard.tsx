import React from 'react';
import { Link } from 'react-router-dom';
import type { SupplierOpportunityItem } from '../types';

interface SupplierOpportunityCardProps {
  opportunity: SupplierOpportunityItem;
}

export function SupplierOpportunityCard({ opportunity }: SupplierOpportunityCardProps) {
  const categoryLabel = opportunity.subcategory || opportunity.category;

  return (
    <article
      className={`rounded-2xl border p-3.5 sm:p-4 space-y-3 transition-all ${
        opportunity.isClosingSoon
          ? 'border-amber-400/90 bg-amber-50/30 dark:bg-amber-950/20 ring-1 ring-amber-400/30 shadow-xs'
          : 'border-border/80 bg-card hover:border-primary/40 shadow-2xs'
      }`}
      data-testid={`supplier-opportunity-card-${opportunity.id}`}
    >
      {/* Top Meta Row: Public Ref, Anonymous Tender Tag, Status & Identity Shield */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {opportunity.publicRef && (
              <span className="font-mono text-[10px] text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded font-bold shrink-0">
                {opportunity.publicRef}
              </span>
            )}
            <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[10px] font-bold shrink-0 truncate">
              🛡️ {opportunity.anonymousLabel}
            </span>
            {opportunity.isClosingSoon && (
              <span className="rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800 px-2 py-0.5 text-[10px] font-extrabold shrink-0">
                ⏳ Closing Soon
              </span>
            )}
          </div>

          <h3 className="text-sm sm:text-base font-extrabold text-foreground leading-snug mt-1.5 line-clamp-2">
            {opportunity.title}
          </h3>
        </div>

        {/* Identity Protected Buyer Tag */}
        <span
          title="Identity-Protected sealed sourcing: Buyer identity remains sealed until award reveal"
          className="text-[10px] font-bold text-muted-foreground bg-muted/60 border border-border/80 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1"
        >
          <span>🔒</span>
          <span>Protected</span>
        </span>
      </div>

      {/* Specifications & Location Pills (if available) */}
      {(categoryLabel || opportunity.deliveryCity || opportunity.quantityText) && (
        <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground font-medium">
          {categoryLabel && (
            <span className="rounded-md bg-muted/50 px-2 py-0.5 border border-border/60 shrink-0">
              🏷️ {categoryLabel}
            </span>
          )}
          {opportunity.deliveryCity && (
            <span className="rounded-md bg-muted/50 px-2 py-0.5 border border-border/60 shrink-0">
              📍 {opportunity.deliveryCity}
            </span>
          )}
          {opportunity.quantityText && (
            <span className="rounded-md bg-muted/50 px-2 py-0.5 border border-border/60 shrink-0">
              📦 {opportunity.quantityText}
            </span>
          )}
        </div>
      )}

      {/* Glance Details Strip: Buyer Shield & Response Deadline */}
      <div className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-xl bg-muted/30 border border-border/60">
        <span className="text-muted-foreground font-semibold flex items-center gap-1 truncate">
          <span>🏢</span>
          <span className="truncate">{opportunity.buyerDisplayName}</span>
        </span>
        <span className="font-bold text-amber-700 dark:text-amber-400 shrink-0 flex items-center gap-1">
          <span>⏳</span>
          <span>{opportunity.deadlineCountdown}</span>
        </span>
      </div>

      {/* Direct CTA: Min 48px touch target */}
      <div className="pt-0.5">
        <Link
          to={opportunity.actionUrl}
          className="min-h-[48px] w-full flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 text-xs font-extrabold shadow-sm active:scale-98 transition shadow-primary/20 mobile-touch-target"
        >
          <span>Review RFQ &amp; Quote</span>
          <span>→</span>
        </Link>
      </div>
    </article>
  );
}
