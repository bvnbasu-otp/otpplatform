import { useEffect, useState } from 'react';
import { fetchOrganizationWallet } from '../api/subscription';
import type { WalletPersona } from '@otp/domain';

export interface OtpWalletCreditsWidgetProps {
  organizationId?: string;
  persona?: WalletPersona;
  balanceCredits?: number;
  cashbackCredits?: number;
  referralBonusCredits?: number;
  shareInSuccessCredits?: number;
  successRewardCredits?: number;
  onApplyRenewal?: (balance: number) => void;
  className?: string;
}

export function OtpWalletCreditsWidget({
  organizationId,
  persona = 'BUYER',
  balanceCredits: initialCredits,
  cashbackCredits = 0,
  referralBonusCredits = 0,
  shareInSuccessCredits = 0,
  successRewardCredits = 0,
  onApplyRenewal,
  className = '',
}: OtpWalletCreditsWidgetProps) {
  const [balance, setBalance] = useState<number>(initialCredits ?? 0);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(organizationId && initialCredits === undefined));
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const isSupplier = persona === 'SUPPLIER';
  const successCashbackCredits = shareInSuccessCredits + (isSupplier ? 0 : cashbackCredits);

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

  const title = isSupplier ? 'OTP Supplier Wallet' : 'OTP Buyer Wallet';
  const subtitle = isSupplier
    ? 'Referral and success-reward types are defined. A balance can be applied to an OTP subscription renewal. Not cash, and not a bank transfer.'
    : 'Non-cash wallet balance. Redeemable for an OTP subscription renewal. This pilot does not credit Success Cashback or a referral wallet amount.';

  return (
    <div
      data-testid="otp-wallet-credits-widget"
      data-wallet-persona={persona}
      className={`rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-card to-amber-500/5 p-3.5 sm:p-4 shadow-2xs space-y-3 ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xl font-bold shadow-2xs">
            🎁
          </span>
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <h4 className="font-extrabold text-foreground text-xs sm:text-sm">{title}</h4>
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
              <p className="text-[11px] text-destructive leading-relaxed">Wallet error: {error}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground leading-relaxed">{subtitle}</p>
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
                  ? 'Apply to Renewal'
                  : '0 Credits Available'}
            </span>
          </button>
        </div>
      </div>

      <div
        className={`grid grid-cols-1 gap-2 pt-2 border-t border-amber-500/20 ${
          isSupplier ? 'sm:grid-cols-2' : 'sm:grid-cols-2'
        }`}
      >
        {isSupplier ? (
          <>
            <div className="rounded-xl bg-background/60 p-2.5 border border-border/60">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Referral Bonus</span>
                <span className="text-xs">👥</span>
              </div>
              <p className="text-xs font-black text-foreground mt-0.5">
                ₹{referralBonusCredits.toLocaleString('en-IN')}
              </p>
              <p className="text-[9px] text-muted-foreground">
                Not issued as wallet credit during this pilot.
              </p>
            </div>
            <div className="rounded-xl bg-background/60 p-2.5 border border-border/60">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Success Reward</span>
                <span className="text-xs">🏆</span>
              </div>
              <p className="text-xs font-black text-foreground mt-0.5">
                ₹{successRewardCredits.toLocaleString('en-IN')}
              </p>
              <p className="text-[9px] text-muted-foreground">Defined as ₹100 after a settled platform fee. This pilot does not settle that fee, so it is not credited.</p>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-xl bg-background/60 p-2.5 border border-border/60">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Success Cashback</span>
                <span className="text-xs">🚀</span>
              </div>
              <p className="text-xs font-black text-foreground mt-0.5">
                ₹{successCashbackCredits.toLocaleString('en-IN')}
              </p>
              <p className="text-[9px] text-muted-foreground">Not credited during this pilot.</p>
            </div>
            <div className="rounded-xl bg-background/60 p-2.5 border border-border/60">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Referral Bonus</span>
                <span className="text-xs">👥</span>
              </div>
              <p className="text-xs font-black text-foreground mt-0.5">
                ₹{referralBonusCredits.toLocaleString('en-IN')}
              </p>
              <p className="text-[9px] text-muted-foreground">Not issued as wallet credit during this pilot.</p>
            </div>
          </>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground/80 italic">
        * OTP Wallet balances are non-cash platform credits only. No withdrawal, UPI, or bank transfer.
      </p>
    </div>
  );
}
