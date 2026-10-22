import React from 'react';
import {
  PILOT_ALLOWANCE_PENDING_TEXT,
  PILOT_ALLOWANCE_UNAVAILABLE_TEXT,
} from '@/features/requirement/components/PilotAllowanceText';

export interface HomeRfqBalance {
  status: 'loading' | 'ready' | 'unavailable';
  /** Full sentence from the entitlement result. Null until that result exists. */
  label: string | null;
  /** Short nowrap text built from that same result. Null while loading or unavailable. */
  summary: string | null;
}

interface HomeContextBarProps {
  greeting: string;
  name: string;
  organizationName?: string;
  roleLabel?: string;
  actionCount: number;
  activeCount: number;
  isLoading?: boolean;
  onRefresh: () => void;
  subscriptionExpired?: boolean;
  freeCredits?: number;
  onRenewClick?: () => void;
  rfqBalance?: HomeRfqBalance | null;
}

export function HomeContextBar({
  greeting,
  name,
  organizationName,
  roleLabel,
  actionCount,
  activeCount,
  isLoading,
  onRefresh,
  subscriptionExpired,
  freeCredits,
  onRenewClick,
  rfqBalance,
}: HomeContextBarProps) {
  const balanceReady = rfqBalance?.status === 'ready' && Boolean(rfqBalance.label) && Boolean(rfqBalance.summary);
  const balanceAccessible = !rfqBalance
    ? ''
    : balanceReady && rfqBalance.label
      ? rfqBalance.label
      : rfqBalance.status === 'unavailable' || rfqBalance.status === 'ready'
        ? PILOT_ALLOWANCE_UNAVAILABLE_TEXT
        : PILOT_ALLOWANCE_PENDING_TEXT;
  const balanceVisible = !rfqBalance
    ? ''
    : balanceReady
      ? rfqBalance.summary
      : rfqBalance.status === 'unavailable'
        ? 'RFQs unavailable'
        : 'Checking RFQs';
  return (
    <header className="rounded-2xl border border-border/80 bg-card p-3.5 sm:p-4 shadow-2xs space-y-2.5 overflow-x-hidden">
      <div className="flex items-center justify-between gap-2.5 min-w-0">
        <div className="min-w-0 flex-1">
          {organizationName && (
            <div className="flex items-center gap-1.5 font-bold text-xs text-muted-foreground truncate">
              <span className="truncate max-w-[200px] sm:max-w-md">🏢 {organizationName}</span>
              {roleLabel && roleLabel.toLowerCase() !== 'buyer' && (
                <span className="rounded bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.2 text-[10px] font-extrabold shrink-0">
                  {roleLabel}
                </span>
              )}
            </div>
          )}

          <div className="mt-0.5 flex min-w-0 flex-nowrap items-center gap-2">
            <h1 className="min-w-0 flex-1 truncate whitespace-nowrap text-base sm:text-lg font-black text-foreground tracking-tight">
              {greeting}, {name}
            </h1>
            {rfqBalance && (
              <span
                data-testid="pilot-allowance-label"
                data-balance-status={rfqBalance.status}
                className="inline-block max-w-[7.5rem] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-emerald-600/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold leading-none text-emerald-950 dark:text-emerald-100 sm:max-w-[14rem]"
                title={balanceAccessible}
                aria-label={balanceAccessible}
              >
                {balanceVisible}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {subscriptionExpired && onRenewClick && (
            <button
              type="button"
              onClick={onRenewClick}
              className="min-h-[48px] inline-flex items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-extrabold border bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-800 transition active:scale-95 mobile-touch-target cursor-pointer"
            >
              <span>{freeCredits && freeCredits > 0 ? `🎁 ${freeCredits} Free RFQ` : '⚡ Renew Plan'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="min-h-[48px] min-w-[48px] rounded-xl border border-border/80 bg-card hover:bg-muted p-2.5 text-muted-foreground hover:text-foreground transition flex items-center justify-center active:scale-95 disabled:opacity-50 mobile-touch-target cursor-pointer"
            title="Refresh workspace"
            aria-label="Refresh workspace"
          >
            <span className={`text-base ${isLoading ? 'animate-spin' : ''}`}>↻</span>
          </button>
        </div>
      </div>

      {/* Attention / Cockpit Summary Strip */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          {actionCount > 0 ? (
            <>
              <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <span className="font-extrabold text-amber-700 dark:text-amber-400 truncate">
                {actionCount} {actionCount === 1 ? 'item requires action' : 'items require action'}
              </span>
            </>
          ) : (
            <>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0">✓</span>
              <span className="text-muted-foreground font-semibold truncate">
                All caught up · {activeCount} active {activeCount === 1 ? 'item' : 'items'}
              </span>
            </>
          )}
        </div>

        <span className="text-[10px] font-bold text-muted-foreground shrink-0 uppercase tracking-wider">
          Cockpit
        </span>
      </div>
    </header>
  );
}
