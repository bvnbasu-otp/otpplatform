import type { MatchedSupplier } from '../types/discovery';
import { invitationStatusPresentation } from '../lib/supplier-truth';

export interface SelectedSuppliersReviewPanelProps {
  suppliers: MatchedSupplier[];
  selectedIds: Set<string>;
}

export function SelectedSuppliersReviewPanel({ suppliers, selectedIds }: SelectedSuppliersReviewPanelProps) {
  const selected = suppliers.filter((s) => selectedIds.has(s.invitationId));
  if (selected.length === 0) return null;

  return (
    <section
      className="rounded-xl border border-primary/25 bg-primary/5 p-3 space-y-2"
      data-testid="selected-suppliers-review-panel"
      aria-label="Selected suppliers for this RFQ"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-extrabold text-foreground">
          Review selection ({selected.length})
        </h3>
        <span className="text-[10px] text-muted-foreground font-medium">Review only — invitations are server-wide</span>
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug">
        Highlighted rows are your shortlist for review. Discovery already created invitation records for matched suppliers; this UI does not add or remove server invitations yet.
      </p>
      <ul className="space-y-1.5 max-h-40 overflow-y-auto overscroll-contain">
        {selected.map((s) => {
          const invite = invitationStatusPresentation(s);
          return (
            <li
              key={s.invitationId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-card/80 px-2.5 py-1.5 text-[11px]"
              data-testid={`selected-supplier-row-${s.invitationId}`}
            >
              <span className="font-bold text-foreground truncate min-w-0">{s.anonymousLabel}</span>
              <span className="text-muted-foreground truncate">{s.networkLabel}</span>
              <span
                className={`font-semibold shrink-0 ${
                  invite.tone === 'positive'
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : invite.tone === 'negative'
                      ? 'text-rose-700 dark:text-rose-300'
                      : invite.tone === 'warning'
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-muted-foreground'
                }`}
              >
                {invite.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
