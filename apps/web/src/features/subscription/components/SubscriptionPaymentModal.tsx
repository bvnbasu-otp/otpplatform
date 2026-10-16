import { useMemo, useState } from 'react';
import {
  generateSubscriptionPaymentRef,
  type BillingCycle,
  type SubscriptionTierId,
} from '../types';
import { processPilotSimulatedPurchase } from '../api/subscription';
import type { PilotPurchaseProduct } from '../api/subscription';

interface SubscriptionPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string | null;
  organizationName: string;
  orgType?: string;
  initialTierId?: SubscriptionTierId;
  initialCycle?: BillingCycle;
  onSuccess?: (newExpiresAt: string) => void;
}

/**
 * Active checkout surface. It exposes only the two approved no-money pilot
 * products and sends no amount, tax calculation, provider, or outcome.
 */
export function SubscriptionPaymentModal({
  isOpen,
  onClose,
  organizationId,
  organizationName,
  onSuccess,
}: SubscriptionPaymentModalProps) {
  const [product, setProduct] = useState<PilotPurchaseProduct>('MONTHLY_SUBSCRIPTION');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof processPilotSimulatedPurchase>> | null>(null);
  const idempotencyKey = useMemo(() => `PILOT-${generateSubscriptionPaymentRef()}`, [isOpen]);

  if (!isOpen) return null;

  const submit = async () => {
    setIsProcessing(true);
    setResult(null);
    const response = await processPilotSimulatedPurchase({
      organizationId,
      productType: product,
      idempotencyKey,
    });
    setResult(response);
    setIsProcessing(false);
    if (response.ok) {
      onSuccess?.(response.purchase.entitlementExpiresAt ?? '');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl space-y-5 text-foreground">
        <div className="flex items-start justify-between border-b pb-4">
          <div>
            <span className="rounded-full bg-blue-100 text-blue-800 px-2.5 py-0.5 text-xs font-bold">
              No-money pilot
            </span>
            <h2 className="text-xl font-bold mt-2">Pilot entitlement simulator</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Buyer: <strong className="text-foreground">{organizationName}</strong>
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5">✕</button>
        </div>

        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-sm font-bold text-blue-900 dark:text-blue-200">
          Pilot simulation — no money will be collected.
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setProduct('EXTRA_RFQ')}
            className={`rounded-xl border p-4 text-left ${product === 'EXTRA_RFQ' ? 'border-primary bg-primary/10' : 'border-muted'}`}
          >
            <span className="block font-bold">One extra RFQ</span>
            <span className="text-xs text-muted-foreground">Expires with the active subscription.</span>
          </button>
          <button
            type="button"
            onClick={() => setProduct('MONTHLY_SUBSCRIPTION')}
            className={`rounded-xl border p-4 text-left ${product === 'MONTHLY_SUBSCRIPTION' ? 'border-primary bg-primary/10' : 'border-muted'}`}
          >
            <span className="block font-bold">One-month subscription</span>
            <span className="text-xs text-muted-foreground">Three RFQs per UTC calendar month.</span>
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Price, GST, persona, ownership, subscription status, and simulation outcome are validated by the server.
          Annual plans remain catalogue-only and are not sold through this pilot simulator.
        </p>

        {result && !result.ok && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
            {result.error}
          </p>
        )}
        {result?.ok && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
            <strong>Simulated entitlement granted.</strong>
            <div>No money was collected. Attempt: {result.purchase.attemptId}</div>
            {Number.isFinite(result.purchase.grossAmount) && (
              <div>Server-calculated total including GST: ₹{result.purchase.grossAmount?.toLocaleString('en-IN')}</div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={isProcessing} className="rounded-xl border px-4 py-2.5 text-xs font-bold">
            Close
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isProcessing || result?.ok === true}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50"
          >
            {isProcessing ? 'Running simulation…' : 'Simulate entitlement purchase'}
          </button>
        </div>
      </div>
    </div>
  );
}
