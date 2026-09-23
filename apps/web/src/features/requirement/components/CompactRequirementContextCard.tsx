import type { CompactRequirementContext } from '../types/discovery';

interface CompactRequirementContextCardProps {
  context: CompactRequirementContext;
}

export function CompactRequirementContextCard({ context }: CompactRequirementContextCardProps) {
  const {
    requirementTitle,
    categoryName,
    deliveryCity,
    deliveryPincode,
    requiredByText,
    budgetFormatted,
    quantityText,
    geographicReach,
    minQuotesRequired,
  } = context;

  const locationDisplay = [deliveryCity, deliveryPincode].filter(Boolean).join(' • ') || 'Location flexible';

  return (
    <section
      className="rounded-xl border bg-card p-3.5 shadow-2xs space-y-2.5 transition-all text-foreground"
      data-testid="compact-requirement-context-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="rounded-md bg-purple-100 dark:bg-purple-950/60 px-2 py-0.5 text-[10px] font-bold text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              Procurement Context
            </span>
            {categoryName && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground border">
                {categoryName.replace(/_/g, ' ')}
              </span>
            )}
            <span className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              Target: {minQuotesRequired} Quotes
            </span>
          </div>
          <h1 className="text-sm sm:text-base font-bold text-foreground leading-snug break-words">
            {requirementTitle || 'Procurement Requirement'}
          </h1>
        </div>
      </div>

      {/* Quick Spec Pills */}
      <div className="flex flex-wrap gap-1.5 pt-1 text-xs">
        <div className="inline-flex items-center gap-1 rounded-md bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground border">
          <span>📍</span>
          <span>{locationDisplay}</span>
        </div>

        {requiredByText && (
          <div className="inline-flex items-center gap-1 rounded-md bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground border">
            <span>📅</span>
            <span>{requiredByText}</span>
          </div>
        )}

        {budgetFormatted && (
          <div className="inline-flex items-center gap-1 rounded-md bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <span>🔒 Budget:</span>
            <span>{budgetFormatted} (Private)</span>
          </div>
        )}

        {quantityText && (
          <div className="inline-flex items-center gap-1 rounded-md bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground border">
            <span>📦</span>
            <span>{quantityText}</span>
          </div>
        )}

        {geographicReach && (
          <div className="inline-flex items-center gap-1 rounded-md bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground border">
            <span>🌐</span>
            <span>{geographicReach.replace(/_/g, ' ')} Reach</span>
          </div>
        )}
      </div>
    </section>
  );
}
