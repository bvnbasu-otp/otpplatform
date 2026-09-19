import React from 'react';

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
}

export function HomeContextBar({
  greeting,
  name,
  organizationName,
  roleLabel: _roleLabel,
  actionCount,
  activeCount,
  isLoading,
  onRefresh,
  subscriptionExpired,
  freeCredits,
  onRenewClick,
}: HomeContextBarProps) {
  return (
    <header className="rounded-2xl border border-border/80 bg-card p-3.5 sm:p-4 shadow-2xs space-y-2.5">
      <div className="flex items-center justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          {organizationName && (
            <div className="flex items-center gap-1.5 font-bold text-xs text-muted-foreground truncate">
              <span className="truncate max-w-[200px] sm:max-w-md">🏢 {organizationName}</span>
            </div>
          )}

          <h1 className="text-base sm:text-lg font-black text-foreground tracking-tight truncate mt-0.5">
            {greeting}, {name}
          </h1>
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
