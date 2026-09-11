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
    <section className="rounded-lg border bg-card p-4" data-testid="supplier-network-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">🌐 Supplier Networks</h3>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
          {totalInvited} Invited
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Breakdown of invited supplier channels for this requirement. {totalInvited} supplier{totalInvited === 1 ? '' : 's'} invited across {networks.length} network{networks.length === 1 ? '' : 's'}.
      </p>
      <ul className="mt-3 space-y-2">
        {networks.map((n) => (
          <li
            key={n.network}
            className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
          >
            <span className="font-medium">{n.label}</span>
            <span className="text-muted-foreground">
              {n.quotedCount}/{n.invitedCount} quoted
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Networks: ONDC · BNI · Associations · Direct · Local registry
      </p>
    </section>
  );
}
