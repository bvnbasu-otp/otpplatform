import type { MatchedSupplier } from '../types/discovery';

interface SupplierCardProps {
  supplier: MatchedSupplier;
  isSelected: boolean;
  onToggleSelect: (supplierId: string) => void;
  disabled?: boolean;
}

export function SupplierCard({
  supplier,
  isSelected,
  onToggleSelect,
  disabled = false,
}: SupplierCardProps) {
  const {
    invitationId,
    anonymousLabel,
    matchScore,
    matchLevel,
    matchReasons,
    networkLabel,
    gstVerified,
    isLocal,
    distanceKm,
    availabilityText,
    status,
  } = supplier;

  // Human-readable stars
  const starCount = matchLevel === 'EXCELLENT' ? 5 : matchLevel === 'STRONG' ? 4 : 3;
  const starsDisplay = '★'.repeat(starCount) + '☆'.repeat(5 - starCount);

  const matchLevelText =
    matchLevel === 'EXCELLENT'
      ? 'Excellent Match'
      : matchLevel === 'STRONG'
      ? 'Strong Match'
      : matchLevel === 'RELEVANT'
      ? 'Relevant Match'
      : 'Candidate Match';

  return (
    <article
      className={`rounded-xl border p-3.5 shadow-2xs transition-all ${
        isSelected
          ? 'border-primary/50 bg-primary/5 dark:bg-primary/10 shadow-xs ring-1 ring-primary/20'
          : 'bg-card border-border hover:border-border/80'
      }`}
      data-testid={`supplier-card-${invitationId}`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left Info Column */}
        <div className="min-w-0 flex-1 space-y-2">
          {/* Header Row: Anonymous Label & Network */}
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-black text-foreground tracking-tight">
              {anonymousLabel}
            </h3>
            <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground border">
              {networkLabel}
            </span>
            {status === 'QUOTED' && (
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                💬 Quoted
              </span>
            )}
          </div>

          {/* Match Score & Stars */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-500 tracking-wider">
              {starsDisplay}
            </span>
            <span className="text-xs font-bold text-foreground">
              {matchLevelText}
            </span>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-extrabold text-primary">
              {matchScore}%
            </span>
          </div>

          {/* Evidence Badges Grid */}
          <div className="flex flex-wrap gap-1.5 pt-0.5 text-[11px]">
            {gstVerified && (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                ✓ GST Verified
              </span>
            )}

            <span className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-0.5 font-medium text-foreground border">
              ✓ Category &amp; Domain Match
            </span>

            {isLocal && (
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 font-medium text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                📍 Local Radius {distanceKm ? `(${distanceKm} km)` : ''}
              </span>
            )}

            {availabilityText && (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted/40 px-2 py-0.5 font-medium text-muted-foreground border">
                ⏱️ {availabilityText}
              </span>
            )}

            {matchReasons
              .filter((r) => !['category_match', 'verified_active', 'location_match', 'ondc', 'local'].includes(r))
              .map((reason, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded-md bg-muted/30 px-2 py-0.5 font-medium text-muted-foreground border"
                >
                  ✓ {reason.replace(/_/g, ' ')}
                </span>
              ))}
          </div>
        </div>

        {/* Right Action: 48px Touch Target Select Button */}
        <div className="shrink-0 flex flex-col items-end">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onToggleSelect(invitationId)}
            className={`min-h-[48px] min-w-[48px] px-3.5 py-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 mobile-touch-target ${
              isSelected
                ? 'bg-primary text-primary-foreground shadow-2xs hover:bg-primary/90'
                : 'border border-input bg-background text-foreground hover:bg-muted'
            } disabled:opacity-50`}
            aria-label={`${isSelected ? 'Deselect' : 'Select'} ${anonymousLabel}`}
            data-testid={`select-supplier-button-${invitationId}`}
          >
            <span className="text-sm font-black">{isSelected ? '✓' : '+'}</span>
            <span>{isSelected ? 'Selected' : 'Select'}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
