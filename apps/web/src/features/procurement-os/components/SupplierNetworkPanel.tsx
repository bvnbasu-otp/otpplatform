import type { SupplierNetworkSummary } from '@otp/domain';

export interface SupplierNetworkPanelProps {
  networks: SupplierNetworkSummary[];
  totalInvited: number;
  isLoading?: boolean;
  error?: string | null;
}

/**
 * Open Supplier Network — discovery adapter breakdown.
 * Shows network sources only; supplier identity stays hidden during identity-protected evaluation.
 */
export function SupplierNetworkPanel({
  networks,
  totalInvited,
  isLoading = false,
  error = null,
}: SupplierNetworkPanelProps) {
  if (isLoading) {
    return (
      <section className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Loading supplier networks…
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error}
      </section>
    );
  }

  return (
    <section className="rounded-lg border bg-card p-3 shadow-2xs" data-testid="supplier-network-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
          <span>🌐</span> Sourcing Channels &amp; Network Reach
        </h3>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary border border-primary/20">
          {totalInvited} Invited
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {totalInvited} regional supplier{totalInvited === 1 ? '' : 's'} invited across {networks.length} channel{networks.length === 1 ? '' : 's'}. Sealed quotes are collected under protected aliases.
      </p>

      <div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {networks.map((n) => (
          <div
            key={n.network}
            className="flex items-center justify-between rounded-lg border bg-muted/20 p-2 text-xs shadow-2xs"
          >
            <div className="min-w-0">
              <span className="font-bold text-foreground text-[11px] truncate block">{n.label}</span>
              <span className="text-[10px] text-muted-foreground">Channel: {n.network}</span>
            </div>
            <div className="text-right shrink-0">
              <span className="inline-flex items-center gap-1 rounded bg-card px-2 py-0.5 text-[10px] font-bold text-foreground border shadow-2xs">
                {n.quotedCount > 0 ? `💬 ${n.quotedCount} Quoted` : '⏳ Awaiting'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
