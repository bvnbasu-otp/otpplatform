import { useEffect, useMemo, useState } from 'react';
import {
  SUBSCRIPTION_TIERS,
  computeSubscriptionFee,
  generateSubscriptionPaymentRef,
  resolveTierForOrgType,
  type BillingCycle,
  type SubscriptionTierId,
} from '../types';
import {
  applyWalletCreditsToSubscription,
  fetchCanonicalSubscriptionPrice,
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

const AVAILABLE_TIERS: { id: SubscriptionTierId; label: string }[] = [
  { id: 'INDIVIDUAL', label: 'Individual' },
  { id: 'RWA', label: 'RWA / Society' },
  { id: 'MSME', label: 'MSME' },
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
  const [canonicalPrices, setCanonicalPrices] = useState<{ monthly: number | null; yearly: number | null; error: string | null }>({
    monthly: null,
    yearly: null,
    error: null,
  });

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

  useEffect(() => {
    if (!isOpen) return;
    let live = true;
    setCanonicalPrices({ monthly: null, yearly: null, error: null });
    Promise.all([
      fetchCanonicalSubscriptionPrice(selectedTier, 'MONTHLY'),
      fetchCanonicalSubscriptionPrice(selectedTier, 'YEARLY'),
    ]).then(([monthly, yearly]) => {
      if (!live) return;
      const failure = (!monthly.ok && monthly.error) || (!yearly.ok && yearly.error) || null;
      setCanonicalPrices({
        monthly: monthly.ok ? monthly.amount : null,
        yearly: yearly.ok ? yearly.amount : null,
        error: failure,
      });
    });
    return () => {
      live = false;
    };
  }, [isOpen, selectedTier]);

  if (!isOpen) return null;

  const plan = SUBSCRIPTION_TIERS[selectedTier] || SUBSCRIPTION_TIERS.INDIVIDUAL;
  const fee = computeSubscriptionFee(selectedTier, selectedCycle);
  const canonicalAmount = selectedCycle === 'YEARLY' ? canonicalPrices.yearly : canonicalPrices.monthly;
  const dummyUpiId = 'pay@otp';
  const paymentRef = useMemo(() => generateSubscriptionPaymentRef(), [isOpen]);

  // Wallet redemption and cash checkout both pay the canonical catalogue amount.
  // A partial credit balance does not reduce the payable price.
  const priceReady = canonicalAmount != null && canonicalAmount > 0;
  const creditsToApply = applyCredits && priceReady && walletBalance >= canonicalAmount ? canonicalAmount : 0;
  const cashPayable = priceReady && creditsToApply === 0 ? canonicalAmount : 0;
  const isFullyCoveredByWallet = priceReady && creditsToApply === canonicalAmount;

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(dummyUpiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2500);
  };

  const handleSimulatePayment = async () => {
    if (canonicalAmount == null) {
      setError(canonicalPrices.error || 'Canonical subscription price is not configured');
      return;
    }
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
          amount: canonicalAmount,
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-2.5 py-0.5 text-xs font-bold border border-emerald-300 dark:border-emerald-700">
                Pilot pricing
              </span>
              <span className="text-xs text-muted-foreground font-mono">Real Entitlement (3 RFQs/mo)</span>
            </div>
            <h2 className="text-xl font-bold mt-1 text-foreground">
              {isSuccess ? 'Sourcing plan activated' : 'Activate or renew sourcing plan'}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Buyer: <strong className="text-foreground">{organizationName}</strong>
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

        {/* Controlled Pilot Commercial Mode Notice */}
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2 shadow-2xs">
          <span className="text-base shrink-0">🛡️</span>
          <div>
            <span className="font-bold block">Pilot Mode — No real payment will be charged during this pilot.</span>
            <span className="text-[11px] text-muted-foreground">
              Commercial pricing is displayed for complete budget transparency. Activating a plan grants genuine calendar-month sourcing allowances (3 RFQs/mo + 1 quarterly bonus on annual plans) with ₹0 charged.
            </span>
          </div>
        </div>

        {isSuccess ? (
          /* Success Screen */
          <div className="text-center py-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-300 text-3xl border-2 border-emerald-400 shadow-md">
              ✓
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-[10px] font-bold px-2.5 py-0.5 border border-blue-300 mb-2">
                <span>🛡️</span>
                <span>No charge during the pilot</span>
              </div>
              <h3 className="text-lg font-bold text-foreground">Sourcing Entitlement Successfully Activated!</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Your organization now has active calendar-month sourcing access with {fee.monthlyRfqQuota} RFQs per month in controlled pilot mode (zero real payment charged).
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
                <span className="text-muted-foreground">Catalogue price:</span>
                <span className="font-mono text-foreground">{canonicalAmount == null ? 'Not configured' : `₹${canonicalAmount.toLocaleString('en-IN')}`}</span>
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
                    <div>{t.label}</div>
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
                  <div className="text-xs text-muted-foreground mt-0.5">3 RFQs / Calendar Month</div>
                  <div className="text-base font-black text-foreground mt-2">
                    {canonicalPrices.monthly == null ? 'Not configured' : `₹${canonicalPrices.monthly.toLocaleString('en-IN')}`}
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
                    +1 Quarterly Bonus
                  </span>
                  <div className="font-bold text-sm text-foreground">Yearly Plan</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {canonicalPrices.monthly != null && canonicalPrices.yearly != null
                      ? `Save ₹${Math.max(0, canonicalPrices.monthly * 12 - canonicalPrices.yearly).toLocaleString('en-IN')}`
                      : 'Yearly price comes from the subscription catalogue'}
                  </div>
                  <div className="text-base font-black text-foreground mt-2">
                    {canonicalPrices.yearly == null ? 'Not configured' : `₹${canonicalPrices.yearly.toLocaleString('en-IN')}`}
                  </div>
                </button>
              </div>

              {/* Entitlement Summary Bar */}
              <div className="rounded-lg border bg-muted/20 p-2.5 text-xs flex items-center justify-between">
                <span className="text-muted-foreground">Monthly Entitlement:</span>
                <span className="font-bold text-foreground">
                  {fee.monthlyRfqQuota} RFQs / month {selectedCycle === 'YEARLY' ? '(+1 Quarterly Bonus RFQ)' : ''}
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
                    <span>Catalogue amount: <strong className="text-foreground">₹{(canonicalAmount ?? 0).toLocaleString('en-IN')}</strong></span>
                    <span>{isFullyCoveredByWallet ? 'Covered by wallet' : 'Wallet does not reduce the catalogue price'}</span>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Payment Display (UPI QR or Full Wallet Coverage) */}
            {!priceReady ? (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-900 dark:text-amber-200">
                {canonicalPrices.error || 'This plan has no canonical price. Checkout stays closed until subscription_plans maps the tier.'}
              </div>
            ) : isFullyCoveredByWallet ? (
              <div className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/10 p-5 text-center space-y-2">
                <span className="text-3xl">🎉</span>
                <h4 className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                  100% Covered by OTP Wallet Credits!
                </h4>
                <p className="text-xs text-muted-foreground">
                  Your available wallet balance (₹{walletBalance.toLocaleString('en-IN')}) covers the catalogue price of ₹{(canonicalAmount ?? 0).toLocaleString('en-IN')}. No separate cash amount is charged.
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
                        Catalogue price
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
                {isFullyCoveredByWallet ? 'Use subscription credits' : 'Amount is the canonical catalogue price'}
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
                  disabled={isVerifying || !priceReady}
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
                      <span>Submit canonical amount ₹{cashPayable.toLocaleString('en-IN')}</span>
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
