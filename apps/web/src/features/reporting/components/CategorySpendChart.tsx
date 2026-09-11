import { formatMoney } from '@/features/fulfillment/types/fulfillment';
import type { CategorySpendSummary } from '../types/reporting';

interface CategorySpendChartProps {
  categories: CategorySpendSummary[];
  title?: string;
}

const BAR_COLORS = [
  'bg-blue-600',
  'bg-emerald-600',
  'bg-purple-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-indigo-600',
  'bg-teal-600',
  'bg-cyan-600',
];

export function CategorySpendChart({ categories, title = 'Spend Distribution by Category' }: CategorySpendChartProps) {
  if (categories.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground text-xs shadow-xs">
        No category transactions recorded for this period.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
          <span>🏷️</span>
          <span>{title}</span>
        </h3>
        <span className="text-xs text-muted-foreground">
          {categories.length} {categories.length === 1 ? 'Category' : 'Categories'}
        </span>
      </div>

      <div className="space-y-3.5">
        {categories.map((cat, idx) => {
          const color = BAR_COLORS[idx % BAR_COLORS.length];
          return (
            <div key={cat.category} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground truncate max-w-[60%]">
                  {cat.category}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-[11px]">
                    ({cat.count} {cat.count === 1 ? 'order' : 'orders'})
                  </span>
                  <span className="font-bold text-foreground">
                    {formatMoney(cat.totalAmount, 'INR')}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-bold text-muted-foreground min-w-8 text-right">
                    {cat.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Progress Track */}
              <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${color}`}
                  style={{ width: `${Math.min(100, Math.max(1, cat.percentage))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
