import { useEffect, useMemo, useState } from 'react';
import {
  SUBSCRIPTION_TIERS,
  computeSubscriptionFee,
  generateSubscriptionPaymentRef,
  resolveTierForOrgType,
  calculateGst,
  type BillingCycle,
  type SubscriptionTierId,
} from '../types';
import {
  applyWalletCreditsToSubscription,
  fetchOrganizationWallet,
  processSubscriptionPayment,
} from '../api/subscription';

interface SubscriptionPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  organizationName: string;
  orgType?: string;
  initialTierId?: SubscriptionTierId;
  initialCycle?: BillingCycle;
  onSuccess?: (newExpiresAt: string) => void;
}

const AVAILABLE_TIERS: { id: SubscriptionTierId; label: string; priceMonthly: number }[] = [
  { id: 'INDIVIDUAL', label: 'Individual (₹99)', priceMonthly: 99 },
  { id: 'RWA', label: 'RWA / Society (₹499)', priceMonthly: 499 },
  { id: 'MSME', label: 'MSME (₹999)', priceMonthly: 999 },
  { id: 'ENTERPRISE', label: 'Enterprise (₹4,999)', priceMonthly: 4999 },
];

export function SubscriptionPaymentModal({
  isOpen,
  onClose,
  organizationId,
  organizationName,
  orgType,
  initialTierId,
  initialCycle = 'MONTHLY',
  onSuccess,
}: SubscriptionPaymentModalProps) {
  const defaultTier = initialTierId || resolveTierForOrgType(orgType);
  const [selectedTier, setSelectedTier] = useState<SubscriptionTierId>(defaultTier);
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>(initialCycle);
  const [isVerifying, setIsVerifying] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successExpiresAt, setSuccessExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Wallet credits state
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [applyCredits, setApplyCredits] = useState<boolean>(true);
  const [, setIsLoadingWallet] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !organizationId) return;

    let isMounted = true;
    setIsLoadingWallet(true);

    fetchOrganizationWallet(organizationId)
      .then((res) => {
        if (!isMounted) return;
        if (res.ok) {
          setWalletBalance(res.wallet.balanceCredits);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoadingWallet(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, organizationId]);

  if (!isOpen) return null;

  const plan = SUBSCRIPTION_TIERS[selectedTier] || SUBSCRIPTION_TIERS.INDIVIDUAL;
  const fee = computeSubscriptionFee(selectedTier, selectedCycle);
  const gstBreakdown = calculateGst(fee.amount);
  const totalPayableWithGst = gstBreakdown.totalAmount;
  const dummyUpiId = 'pay@otp';
  const paymentRef = useMemo(() => generateSubscriptionPaymentRef(), [isOpen]);

  // Wallet discount calculations applied against total payable with GST
  const creditsToApply = applyCredits ? Math.min(totalPayableWithGst, walletBalance) : 0;
  const cashPayable = Math.max(0, Math.round((totalPayableWithGst - creditsToApply) * 100) / 100);
  const isFullyCoveredByWallet = creditsToApply >= totalPayableWithGst;

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(dummyUpiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2500);
  };

  const handleSimulatePayment = async () => {
    setIsVerifying(true);
    setError(null);

    try {
      let finalExpiresAt: string | null = null;

      // 1. If applying wallet credits
      if (creditsToApply > 0) {
        const walletResult = await applyWalletCreditsToSubscription({
          organizationId,
          tierId: selectedTier,
          cycle: selectedCycle,
          creditsToApply,
          idempotencyKey: `SUB-WALLET-${paymentRef}`,
        });

        if (!walletResult.ok) {
          setIsVerifying(false);
          setError(walletResult.error || 'Failed to apply wallet credits');
          return;
        }

        finalExpiresAt = walletResult.newExpiresAt || null;
      }

      // 2. If remaining cash payable exists
      if (cashPayable > 0) {
        await new Promise((resolve) => setTimeout(resolve, 800));

        const paymentResult = await processSubscriptionPayment({
          organizationId,
          tierId: selectedTier,
          cycle: selectedCycle,
          amount: cashPayable,
          paymentRef,
          upiId: dummyUpiId,
        });

        if (!paymentResult.ok) {
          setIsVerifying(false);
          setError(paymentResult.error || 'UPI Payment processing failed');
          return;
        }

        finalExpiresAt = paymentResult.newExpiresAt;
      }

      setIsVerifying(false);
      setIsSuccess(true);
      setSuccessExpiresAt(finalExpiresAt);
      if (onSuccess && finalExpiresAt) onSuccess(finalExpiresAt);
    } catch (err: any) {
      setIsVerifying(false);
      setError(err?.message || 'Payment simulation error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-2xl border bg-card p-6 shadow-2xl space-y-5 text-foreground max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-2.5 py-0.5 text-xs font-bold border border-emerald-300 dark:border-emerald-700">
                ⚡ Prepaid Subscription
              </span>
              <span className="text-xs text-muted-foreground font-mono">Calendar Month Entitlement</span>
            </div>
            <h2 className="text-xl font-bold mt-1 text-foreground">
              {isSuccess ? 'Payment Verified & Plan Activated!' : 'Recharge / Renew Platform Plan'}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Buyer Org: <strong className="text-foreground">{organizationName}</strong> · Standard UPI &amp; Wallet Redemption
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {isSuccess ? (
          /* Success Screen */
          <div className="text-center py-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-300 text-3xl border-2 border-emerald-400 shadow-md">
              ✓
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">Prepaid Plan Successfully Active!</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Your organization now has active calendar-month sourcing access with {fee.monthlyRfqQuota} RFQs per month.
              </p>
            </div>

            <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 p-4 text-xs space-y-1.5 text-left max-w-md mx-auto">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plan:</span>
                <span className="font-bold text-foreground">{plan.name} ({selectedCycle})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monthly Quota:</span>
                <span className="font-bold text-foreground">{fee.monthlyRfqQuota} RFQs / month</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Base + 18% GST:</span>
                <span className="font-mono text-foreground">₹{gstBreakdown.basePrice} + ₹{gstBreakdown.gstAmount} = ₹{totalPayableWithGst}</span>
              </div>
              {creditsToApply > 0 && (
                <div className="flex justify-between text-amber-700 dark:text-amber-400">
                  <span>Wallet Credits Redeemed:</span>
                  <span className="font-bold">₹{creditsToApply.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount Paid via UPI:</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-300">₹{cashPayable.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Txn Reference:</span>
                <span className="font-mono text-foreground">{paymentRef}</span>
              </div>
              <div className="flex justify-between border-t border-emerald-200 dark:border-emerald-800/60 pt-1.5">
                <span className="text-muted-foreground font-semibold">Valid Until:</span>
                <span className="font-bold text-foreground">
                  {successExpiresAt ? new Date(successExpiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : `${fee.durationDays} days`}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 text-sm shadow-md transition cursor-pointer"
            >
              Back to Dashboard
            </button>
          </div>
        ) : (
          /* Payment Flow */
          <div className="space-y-5">
            {/* Step 1: Select Tier & Billing Cycle */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                1. Select Billing Cycle &amp; Tier
              </label>

              {/* Tier Selection Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {AVAILABLE_TIERS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTier(t.id)}
                    className={`rounded-lg px-2.5 py-2 text-xs font-bold transition border text-center ${
                      selectedTier === t.id
                        ? 'border-primary bg-primary/10 text-foreground shadow-2xs'
                        : 'border-muted bg-card text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    <div>{t.label.split(' (')[0]}</div>
                    <div className="text-[10px] font-normal text-muted-foreground mt-0.5">
                      ₹{selectedCycle === 'MONTHLY' ? SUBSCRIPTION_TIERS[t.id]?.monthlyPrice : SUBSCRIPTION_TIERS[t.id]?.yearlyPrice}
                    </div>
                  </button>
                ))}
              </div>

              {/* Monthly vs Yearly Switcher */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedCycle('MONTHLY')}
                  className={`rounded-xl border p-3 text-left transition relative ${
                    selectedCycle === 'MONTHLY'
                      ? 'border-primary bg-primary/10 shadow-xs'
                      : 'border-muted hover:bg-muted/40'
                  }`}
                >
                  <div className="font-bold text-sm text-foreground">Monthly Plan</div>
                  <div className="text-xs text-muted-foreground mt-0.5">5 RFQs / Calendar Month</div>
                  <div className="text-base font-black text-foreground mt-2">
                    ₹{SUBSCRIPTION_TIERS[selectedTier]?.monthlyPrice.toLocaleString('en-IN')}
                    <span className="text-[11px] font-normal text-muted-foreground"> + 18% GST</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedCycle('YEARLY')}
                  className={`rounded-xl border p-3 text-left transition relative ${
                    selectedCycle === 'YEARLY'
                      ? 'border-primary bg-primary/10 shadow-xs'
                      : 'border-muted hover:bg-muted/40'
                  }`}
                >
                  <span className="absolute top-2 right-2 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-1.5 py-0.2 border border-emerald-300 dark:border-emerald-700">
                    6 RFQs/mo (Annual Bonus)
                  </span>
                  <div className="font-bold text-sm text-foreground">Yearly Plan</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Save ₹{SUBSCRIPTION_TIERS[selectedTier]?.yearlySavings.toLocaleString('en-IN')}</div>
                  <div className="text-base font-black text-foreground mt-2">
                    ₹{SUBSCRIPTION_TIERS[selectedTier]?.yearlyPrice.toLocaleString('en-IN')}
                    <span className="text-[11px] font-normal text-muted-foreground"> + 18% GST</span>
                  </div>
                </button>
              </div>

              {/* Entitlement Summary Bar */}
              <div className="rounded-lg border bg-muted/20 p-2.5 text-xs flex items-center justify-between">
                <span className="text-muted-foreground">Monthly Entitlement:</span>
                <span className="font-bold text-foreground">
                  {fee.monthlyRfqQuota} RFQs / month {selectedCycle === 'YEARLY' ? '(Includes 1 Bonus RFQ/mo)' : ''}
                </span>
              </div>
            </div>

            {/* Wallet Credits Redemption Section */}
            {walletBalance > 0 && (
              <div
                data-testid="subscription-wallet-redemption-card"
                className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🎁</span>
                    <span className="font-bold text-foreground">
                      OTP Wallet Credits Available: ₹{walletBalance.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer font-bold text-amber-800 dark:text-amber-300">
                    <input
                      type="checkbox"
                      checked={applyCredits}
                      onChange={(e) => setApplyCredits(e.target.checked)}
                      className="rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                    />
                    <span>Apply Credits</span>
                  </label>
                </div>
                {applyCredits && (
                  <div className="flex justify-between items-center pt-1 border-t border-amber-500/20 text-muted-foreground">
                    <span>Discount applied: <strong className="text-foreground">₹{creditsToApply.toLocaleString('en-IN')}</strong></span>
                    <span>Remaining cash payable: <strong className="text-foreground">₹{cashPayable.toLocaleString('en-IN')}</strong></span>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Payment Display (UPI QR or Full Wallet Coverage) */}
            {isFullyCoveredByWallet ? (
              <div className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/10 p-5 text-center space-y-2">
                <span className="text-3xl">🎉</span>
                <h4 className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                  100% Covered by OTP Wallet Credits!
                </h4>
                <p className="text-xs text-muted-foreground">
                  Your available wallet balance (₹{walletBalance.toLocaleString('en-IN')}) completely covers the total fee of ₹{totalPayableWithGst.toLocaleString('en-IN')} (Base ₹{gstBreakdown.basePrice} + GST ₹{gstBreakdown.gstAmount}). No external UPI payment required.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-5">
                {/* Dynamic QR Code Box */}
                <div className="shrink-0 bg-white p-3 rounded-xl border shadow-sm flex flex-col items-center">
                  <svg viewBox="0 0 100 100" className="w-32 h-32 text-slate-900" aria-label="Dummy UPI QR Code">
                    <rect width="100" height="100" fill="white" />
                    <rect x="5" y="5" width="30" height="30" fill="#0f172a" rx="4" />
                    <rect x="10" y="10" width="20" height="20" fill="white" rx="2" />
                    <rect x="15" y="15" width="10" height="10" fill="#0f172a" rx="1" />
                    <rect x="65" y="5" width="30" height="30" fill="#0f172a" rx="4" />
                    <rect x="70" y="10" width="20" height="20" fill="white" rx="2" />
                    <rect x="75" y="15" width="10" height="10" fill="#0f172a" rx="1" />
                    <rect x="5" y="65" width="30" height="30" fill="#0f172a" rx="4" />
                    <rect x="10" y="70" width="20" height="20" fill="white" rx="2" />
                    <rect x="15" y="75" width="10" height="10" fill="#0f172a" rx="1" />
                    <rect x="40" y="10" width="5" height="15" fill="#0f172a" />
                    <rect x="50" y="5" width="10" height="5" fill="#0f172a" />
                    <rect x="40" y="30" width="20" height="5" fill="#0f172a" />
                    <rect x="10" y="40" width="15" height="5" fill="#0f172a" />
                    <rect x="30" y="40" width="15" height="15" fill="#0f172a" />
                    <rect x="50" y="40" width="10" height="10" fill="#0f172a" />
                    <rect x="65" y="40" width="15" height="5" fill="#0f172a" />
                    <rect x="85" y="40" width="10" height="15" fill="#0f172a" />
                    <rect x="40" y="60" width="15" height="10" fill="#0f172a" />
                    <rect x="60" y="55" width="10" height="20" fill="#0f172a" />
                    <rect x="75" y="65" width="20" height="10" fill="#0f172a" />
                    <rect x="40" y="75" width="15" height="15" fill="#0f172a" />
                    <rect x="60" y="80" width="15" height="10" fill="#0f172a" />
                    <rect x="80" y="80" width="15" height="15" fill="#0f172a" />
                  </svg>
                  <span className="text-[10px] font-bold text-slate-600 mt-1">Scan with Any UPI App</span>
                </div>

                {/* UPI ID & Instructions */}
                <div className="space-y-2 text-left flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">Scan or Pay to Dummy UPI ID:</div>
                  <div className="flex items-center gap-2">
                    <code className="rounded-lg bg-background border px-3 py-1.5 font-mono text-sm font-bold text-foreground select-all">
                      {dummyUpiId}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyUpi}
                      className="rounded-lg border bg-background hover:bg-muted px-2.5 py-1.5 text-xs font-semibold transition text-foreground cursor-pointer"
                    >
                      {copiedUpi ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>

                  <div className="text-xs text-muted-foreground space-y-1 pt-1">
                    <div className="flex items-baseline gap-2">
                      <span>Total Payable:</span>
                      <strong className="text-foreground text-sm font-black">
                        ₹{cashPayable.toLocaleString('en-IN')}
                      </strong>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        (Base ₹{gstBreakdown.basePrice} + 18% GST ₹{gstBreakdown.gstAmount})
                      </span>
                    </div>
                    {creditsToApply > 0 && (
                      <div className="text-[11px] text-amber-600 dark:text-amber-400">
                        ₹{creditsToApply} applied from OTP Wallet
                      </div>
                    )}
                    <div>Duration: <strong className="text-foreground">{fee.durationDays} Days ({selectedCycle})</strong></div>
                    <div className="text-[11px] text-muted-foreground italic">
                      Supported apps: GPay, PhonePe, Paytm, BHIM, Cred, Amazon Pay
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <p className="text-xs font-bold text-red-600 rounded-lg bg-red-50 p-2.5 border border-red-200">
                ⚠️ {error}
              </p>
            )}

            {/* Step 3: Simulation & Action Trigger */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <div className="text-xs text-muted-foreground text-center sm:text-left">
                {isFullyCoveredByWallet ? 'Wallet Direct Activation' : 'Test Simulation Mode · Instant Activation'}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isVerifying}
                  className="w-1/2 sm:w-auto rounded-xl border px-4 py-2.5 text-xs font-bold text-muted-foreground hover:bg-muted transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleSimulatePayment}
                  disabled={isVerifying}
                  className="w-1/2 sm:w-auto rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 text-xs shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isVerifying ? (
                    <>
                      <span className="animate-spin text-sm">⏳</span>
                      <span>Processing Activation…</span>
                    </>
                  ) : isFullyCoveredByWallet ? (
                    <>
                      <span>⚡</span>
                      <span>Activate with ₹{creditsToApply} Credits</span>
                    </>
                  ) : (
                    <>
                      <span>⚡</span>
                      <span>Simulate &amp; Verify Payment (₹{cashPayable})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
