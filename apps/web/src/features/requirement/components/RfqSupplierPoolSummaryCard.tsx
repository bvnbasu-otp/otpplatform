import { Link } from 'react-router-dom';
import type { MatchedSupplier } from '../types/discovery';

interface RfqSupplierPoolSummaryCardProps {
  requirementId: string;
  selectedSuppliers: MatchedSupplier[];
  minQuotesRequired: number;
}

export function RfqSupplierPoolSummaryCard({
  requirementId,
  selectedSuppliers,
  minQuotesRequired,
}: RfqSupplierPoolSummaryCardProps) {
  const isQuorumMet = selectedSuppliers.length >= minQuotesRequired;
  const count = selectedSuppliers.length;

  return (
    <section
      className="rounded-xl border bg-card p-4 shadow-2xs space-y-3.5 transition-all text-foreground"
      data-testid="rfq-supplier-pool-summary-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="rounded-md bg-blue-100 dark:bg-blue-950/60 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              2. Selected Supplier Pool
            </span>
            {isQuorumMet ? (
              <span className="rounded-md bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                ✓ Quorum Met ({count}/{minQuotesRequired})
              </span>
            ) : (
              <span className="rounded-md bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 border border-amber-300">
                ⚠️ Below Quorum ({count}/{minQuotesRequired})
              </span>
            )}
          </div>
          <h3 className="text-sm sm:text-base font-bold text-foreground">
            {count} Verified Supplier{count === 1 ? '' : 's'} Selected to Compete
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Suppliers submit sealed quotes under protected aliases with zero identity exposure.
          </p>
        </div>

        <Link
          to={`/requirements/${requirementId}/discover`}
          className="min-h-[48px] min-w-[48px] inline-flex items-center justify-center rounded-lg border bg-muted/30 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition mobile-touch-target shrink-0"
          title="Review Supplier Selections"
        >
          <span>Review Pool ✎</span>
        </Link>
      </div>

      {/* Stacked Anonymous Supplier Chips / Rows */}
      {selectedSuppliers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-red-300 bg-red-50/50 dark:bg-red-950/20 p-4 text-center space-y-2">
          <p className="text-xs font-bold text-red-700 dark:text-red-300">
            ⚠️ No suppliers selected for this sourcing event
          </p>
          <p className="text-[11px] text-muted-foreground">
            You must discover and select at least 1 verified supplier before publishing the RFQ.
          </p>
          <Link
            to={`/requirements/${requirementId}/discover`}
            className="inline-flex min-h-[48px] items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition mobile-touch-target"
          >
            Discover Suppliers Now →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {selectedSuppliers.map((supplier) => (
            <div
              key={supplier.invitationId}
              className="flex items-center justify-between rounded-lg border bg-muted/20 p-2.5 text-xs shadow-2xs"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-foreground">{supplier.anonymousLabel}</span>
                  <span className="rounded bg-muted px-1.5 py-0.2 text-[9px] font-semibold text-muted-foreground border">
                    {supplier.networkLabel}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="text-amber-500 font-bold">
                    {'★'.repeat(supplier.matchLevel === 'EXCELLENT' ? 5 : supplier.matchLevel === 'STRONG' ? 4 : 3)}
                  </span>
                  <span>{supplier.matchScore}% Match</span>
                  {supplier.isLocal && <span>• 📍 Local</span>}
                </div>
              </div>

              <span className="rounded-md bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">
                ✓ Ready
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
