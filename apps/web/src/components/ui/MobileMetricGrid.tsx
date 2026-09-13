import React from 'react';

export interface MobileMetricGridProps {
  price: string | number;
  deliveryDays?: string | number;
  warrantyMonths?: string | number;
  score?: string | number;
  highlightPrice?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export function MobileMetricGrid({
  price,
  deliveryDays,
  warrantyMonths,
  score,
  highlightPrice = true,
  className = '',
  size = 'md',
}: MobileMetricGridProps) {
  const formattedPrice = typeof price === 'number' ? `₹${price.toLocaleString('en-IN')}` : price.startsWith('₹') ? price : `₹${price}`;
  const formattedDelivery = typeof deliveryDays === 'number' ? `${deliveryDays} Days` : deliveryDays || '—';
  const formattedWarranty = typeof warrantyMonths === 'number' ? `${warrantyMonths} Mo` : warrantyMonths || '—';
  const formattedScore = typeof score === 'number' ? `★ ${score.toFixed(1)}` : score ? (score.startsWith('★') ? score : `★ ${score}`) : '—';

  const isSmall = size === 'sm';

  return (
    <div
      className={`grid grid-cols-4 gap-1 rounded-xl border border-border/80 bg-muted/30 p-2 text-center select-none ${className}`}
      data-testid="mobile-metric-grid"
    >
      <div className="flex flex-col justify-center min-w-0">
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground truncate">
          ₹ Total
        </span>
        <span
          className={`font-mono font-black truncate ${
            isSmall ? 'text-xs' : 'text-sm'
          } ${highlightPrice ? 'text-foreground font-black' : 'text-foreground'}`}
        >
          {formattedPrice}
        </span>
      </div>

      <div className="flex flex-col justify-center min-w-0 border-l border-border/50">
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground truncate">
          Delivery
        </span>
        <span className={`font-bold text-foreground truncate ${isSmall ? 'text-[10px]' : 'text-xs'}`}>
          {formattedDelivery}
        </span>
      </div>

      <div className="flex flex-col justify-center min-w-0 border-l border-border/50">
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground truncate">
          Warranty
        </span>
        <span className={`font-bold text-foreground truncate ${isSmall ? 'text-[10px]' : 'text-xs'}`}>
          {formattedWarranty}
        </span>
      </div>

      <div className="flex flex-col justify-center min-w-0 border-l border-border/50">
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground truncate">
          Score
        </span>
        <span className={`font-mono font-black text-emerald-600 dark:text-emerald-400 truncate ${isSmall ? 'text-xs' : 'text-sm'}`}>
          {formattedScore}
        </span>
      </div>
    </div>
  );
}
