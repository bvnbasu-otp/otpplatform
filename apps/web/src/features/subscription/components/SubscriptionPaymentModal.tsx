import { useMemo, useState } from 'react';
import {
  SUBSCRIPTION_TIERS,
  computeSubscriptionFee,
  generateSubscriptionPaymentRef,
  resolveTierForOrgType,
  type BillingCycle,
  type SubscriptionTierId,
} from '../types';
import { processSubscriptionPayment } from '../api/subscription';

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

  if (!isOpen) return null;

  const plan = SUBSCRIPTION_TIERS[selectedTier];
  const fee = computeSubscriptionFee(selectedTier, selectedCycle);
  const dummyUpiId = 'pay@otp';
  const paymentRef = useMemo(() => generateSubscriptionPaymentRef(), [isOpen]);

  // Standard Indian UPI Intent string
  const upiIntentUri = `upi://pay?pa=${dummyUpiId}&pn=OTP%20Platform&am=${fee.amount}&cu=INR&tn=Prepaid%20Subscription%20${selectedCycle}%20${selectedTier}`;

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(dummyUpiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2500);
  };

  const handleSimulatePayment = async () => {
    setIsVerifying(true);
    setError(null);

    // Realistic verification delay
    await new Promise((resolve) => setTimeout(resolve, 1400));

    const result = await processSubscriptionPayment({
      organizationId,
      tierId: selectedTier,
      cycle: selectedCycle,
      amount: fee.amount,
      paymentRef,
      upiId: dummyUpiId,
    });

    setIsVerifying(false);

    if (result.ok) {
      setIsSuccess(true);
      setSuccessExpiresAt(result.newExpiresAt);
      if (onSuccess) onSuccess(result.newExpiresAt);
    } else {
      setError(result.error);
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
              <span className="text-xs text-muted-foreground font-mono">Zero Commission</span>
            </div>
            <h2 className="text-xl font-bold mt-1 text-foreground">
              {isSuccess ? 'Payment Verified & Plan Activated!' : 'Recharge / Renew Platform Plan'}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Buyer Org: <strong className="text-foreground">{organizationName}</strong> · Standard UPI Payment
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
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
                Your organization now has full platform access to create requirements, invite verified suppliers, and execute tenders.
              </p>
            </div>

            <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 p-4 text-xs space-y-1.5 text-left max-w-md mx-auto">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plan:</span>
                <span className="font-bold text-foreground">{plan.name} ({selectedCycle})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount Paid:</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-300">₹{fee.amount.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Txn Reference:</span>
                <span className="font-mono text-foreground">{paymentRef}</span>
              </div>
              <div className="flex justify-between border-t border-emerald-200 dark:border-emerald-800/60 pt-1.5">
                <span className="text-muted-foreground font-semibold">Active Valid Until:</span>
                <span className="font-bold text-foreground">
                  {successExpiresAt ? new Date(successExpiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : `${fee.durationDays} days`}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 text-sm shadow-md transition"
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
                1. Select Billing Cycle
              </label>

              {/* Monthly vs Yearly Switcher */}
              <div className="grid grid-cols-2 gap-2">
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
                  <div className="text-xs text-muted-foreground mt-0.5">30 Days Validity</div>
                  <div className="text-base font-black text-foreground mt-2">
                    ₹{SUBSCRIPTION_TIERS[selectedTier].monthlyPrice.toLocaleString('en-IN')}
                    <span className="text-[11px] font-normal text-muted-foreground"> / 30d</span>
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
                    Save ₹{SUBSCRIPTION_TIERS[selectedTier].yearlySavings.toLocaleString('en-IN')}
                  </span>
                  <div className="font-bold text-sm text-foreground">Yearly Plan</div>
                  <div className="text-xs text-muted-foreground mt-0.5">365 Days Validity</div>
                  <div className="text-base font-black text-foreground mt-2">
                    ₹{SUBSCRIPTION_TIERS[selectedTier].yearlyPrice.toLocaleString('en-IN')}
                    <span className="text-[11px] font-normal text-muted-foreground"> / 365d</span>
                  </div>
                </button>
              </div>

              {/* Tier Toggle if needed */}
              <div className="flex items-center justify-between text-xs rounded-xl bg-muted/40 p-2 border">
                <span className="text-muted-foreground">Plan Tier:</span>
                <div className="flex gap-1.5">
                  {(['TIER_1_MSME', 'TIER_2_ENTERPRISE'] as SubscriptionTierId[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelectedTier(t)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                        selectedTier === t
                          ? 'bg-card text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t === 'TIER_1_MSME' ? 'Tier 1 (MSME / ₹99)' : 'Tier 2 (RWA / ₹1,000)'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Step 2: UPI & QR Code Display */}
            <div className="rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-5">
              {/* Dynamic QR Code Box */}
              <div className="shrink-0 bg-white p-3 rounded-xl border shadow-sm flex flex-col items-center">
                {/* Clean SVG QR Pattern Representation */}
                <svg viewBox="0 0 100 100" className="w-32 h-32 text-slate-900" aria-label="Dummy UPI QR Code">
                  <rect width="100" height="100" fill="white" />
                  {/* Top-Left Position Square */}
                  <rect x="5" y="5" width="30" height="30" fill="#0f172a" rx="4" />
                  <rect x="10" y="10" width="20" height="20" fill="white" rx="2" />
                  <rect x="15" y="15" width="10" height="10" fill="#0f172a" rx="1" />
                  {/* Top-Right Position Square */}
                  <rect x="65" y="5" width="30" height="30" fill="#0f172a" rx="4" />
                  <rect x="70" y="10" width="20" height="20" fill="white" rx="2" />
                  <rect x="75" y="15" width="10" height="10" fill="#0f172a" rx="1" />
                  {/* Bottom-Left Position Square */}
                  <rect x="5" y="65" width="30" height="30" fill="#0f172a" rx="4" />
                  <rect x="10" y="70" width="20" height="20" fill="white" rx="2" />
                  <rect x="15" y="75" width="10" height="10" fill="#0f172a" rx="1" />
                  {/* Dense Dummy QR Data Modules */}
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
                    className="rounded-lg border bg-background hover:bg-muted px-2.5 py-1.5 text-xs font-semibold transition text-foreground"
                  >
                    {copiedUpi ? '✓ Copied' : 'Copy'}
                  </button>
                </div>

                <div className="text-xs text-muted-foreground space-y-1 pt-1">
                  <div>Amount Payable: <strong className="text-foreground text-sm font-black">₹{fee.amount.toLocaleString('en-IN')}</strong></div>
                  <div>Duration: <strong className="text-foreground">{fee.durationDays} Days ({selectedCycle})</strong></div>
                  <div className="text-[11px] text-muted-foreground italic">
                    Supported apps: GPay, PhonePe, Paytm, BHIM, Cred, Amazon Pay
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <p className="text-xs font-bold text-red-600 rounded-lg bg-red-50 p-2.5 border border-red-200">
                ⚠️ {error}
              </p>
            )}

            {/* Step 3: Simulation & Action Trigger */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <div className="text-xs text-muted-foreground text-center sm:text-left">
                Test Simulation Mode · Instant Activation
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isVerifying}
                  className="w-1/2 sm:w-auto rounded-xl border px-4 py-2.5 text-xs font-bold text-muted-foreground hover:bg-muted transition"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleSimulatePayment}
                  disabled={isVerifying}
                  className="w-1/2 sm:w-auto rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 text-xs shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isVerifying ? (
                    <>
                      <span className="animate-spin text-sm">⏳</span>
                      <span>Verifying UPI Txn…</span>
                    </>
                  ) : (
                    <>
                      <span>⚡</span>
                      <span>Simulate &amp; Verify Payment (₹{fee.amount})</span>
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
