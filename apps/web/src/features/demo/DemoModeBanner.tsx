import { Link } from 'react-router-dom';
import { useDemoMode } from './hooks/use-demo-mode';
import { formatVotingPower } from './types/demo';
import { DemoResetButton } from './DemoResetButton';

/**
 * The standing reminder that none of this is real.
 *
 * It says demo mode, and it says which buyer type the viewer is standing in —
 * because the single most confusing thing about this product in a live
 * demonstration is that the same screen behaves differently for a household
 * and for a procurement committee, and the reason is the buyer type.
 */
export function DemoModeBanner() {
  const { status, identity } = useDemoMode();

  if (!status.enabled) return null;

  return (
    <div
      role="banner"
      className="fixed inset-x-0 top-0 z-50 bg-amber-500 px-4 py-1.5 text-amber-950 shadow-md"
      data-testid="demo-mode-banner"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold uppercase tracking-wide">Demo Mode</span>
          {identity?.organizationName && (
            <span>
              {identity.organizationName}
              {identity.buyerTypeLabel && ` · ${identity.buyerTypeLabel}`}
              {identity.side === 'BUYER' &&
                ` · your vote counts ${formatVotingPower(identity.votingPower)}`}
            </span>
          )}
          {identity?.side === 'SUPPLIER' && <span>Supplier view</span>}
        </div>
        <div className="flex items-center gap-3">
          <Link to="/demo" className="text-xs font-medium underline">
            Demo dashboard
          </Link>
          <DemoResetButton />
        </div>
      </div>
    </div>
  );
}
