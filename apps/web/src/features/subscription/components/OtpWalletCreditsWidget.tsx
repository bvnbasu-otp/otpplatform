import { useState } from 'react';

export interface OtpWalletCreditsWidgetProps {
  balanceCredits?: number;
  onApplyRenewal?: () => void;
  className?: string;
}

export function OtpWalletCreditsWidget({
  balanceCredits = 450,
  onApplyRenewal,
  className = '',
}: OtpWalletCreditsWidgetProps) {
  const [applied, setApplied] = useState(false);

  const handleApply = () => {
    setApplied(true);
    if (onApplyRenewal) {
      onApplyRenewal();
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
              <span className="rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 px-2 py-0.2 text-[10px] font-black">
                ₹{balanceCredits} Credits Active
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Complete transactions on OTP to earn OTP Wallet Credits toward subscription renewals and RFQ top-ups.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <button
            type="button"
            onClick={handleApply}
            data-testid="apply-wallet-credits-btn"
            className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold px-3.5 py-2 text-xs shadow-xs transition active:scale-98 flex items-center gap-1.5 cursor-pointer"
          >
            <span>⚡</span>
            <span>{applied ? 'Credits Applied ✓' : 'Apply to Subscription Renewal'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
