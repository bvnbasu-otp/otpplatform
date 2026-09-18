import { useEffect, useState } from 'react';
import { fetchOrganizationWallet } from '../api/subscription';

export interface OtpWalletCreditsWidgetProps {
  organizationId?: string;
  balanceCredits?: number;
  onApplyRenewal?: (balance: number) => void;
  className?: string;
}

export function OtpWalletCreditsWidget({
  organizationId,
  balanceCredits: initialCredits,
  onApplyRenewal,
  className = '',
}: OtpWalletCreditsWidgetProps) {
  const [balance, setBalance] = useState<number>(initialCredits ?? 0);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(organizationId && initialCredits === undefined));
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (initialCredits !== undefined) {
      setBalance(initialCredits);
      setIsLoading(false);
      return;
    }

    if (!organizationId) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetchOrganizationWallet(organizationId)
      .then((res) => {
        if (!isMounted) return;
        if (res.ok) {
          setBalance(res.wallet.balanceCredits);
        } else {
          setError(res.error);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err?.message || 'Failed to load wallet');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [organizationId, initialCredits]);

  const handleApply = () => {
    setApplied(true);
    if (onApplyRenewal) {
      onApplyRenewal(balance);
    }
  };

  return (
    <div
      data-testid="otp-wallet-credits-widget"
      className={`rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-card to-amber-500/5 p-3.5 sm:p-4 shadow-2xs ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xl font-bold shadow-2xs">
            🎁
          </span>
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <h4 className="font-extrabold text-foreground text-xs sm:text-sm">
                OTP Wallet &amp; Credits
              </h4>
              {isLoading ? (
                <span className="rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-2 py-0.2 text-[10px] font-medium animate-pulse">
                  Loading balance...
                </span>
              ) : (
                <span
                  data-testid="wallet-balance-badge"
                  className="rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 px-2 py-0.2 text-[10px] font-black"
                >
                  ₹{balance.toLocaleString('en-IN')} Credits Active
                </span>
              )}
            </div>
            {error ? (
              <p className="text-[11px] text-destructive leading-relaxed">
                Wallet error: {error}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Complete transactions on OTP to earn sourcing rewards into your OTP Wallet toward subscription renewals and RFQ top-ups.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <button
            type="button"
            onClick={handleApply}
            disabled={isLoading || balance <= 0}
            data-testid="apply-wallet-credits-btn"
            className={`rounded-xl font-bold px-3.5 py-2 text-xs shadow-xs transition active:scale-98 flex items-center gap-1.5 cursor-pointer ${
              balance > 0
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-muted text-muted-foreground opacity-60 cursor-not-allowed'
            }`}
          >
            <span>⚡</span>
            <span>
              {applied
                ? 'Credits Applied ✓'
                : balance > 0
                ? 'Apply to Subscription Renewal'
                : '0 Credits Available'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
