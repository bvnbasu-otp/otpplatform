import { useEffect, useState } from 'react';
import { formatMoney } from '../types/fulfillment';
import {
  approveInvoice,
  fetchInvoiceByWorkOrder,
  rejectInvoice,
  submitInvoice,
  type InvoiceSummary,
} from '../api/invoices';
import {
  fetchPaymentByInvoice,
  recordPayment,
  verifyPayment,
  type PaymentSummary,
} from '../api/payments';

interface InvoicePaymentPanelProps {
  workOrderId: string;
  supplierId: string;
  role: 'buyer' | 'supplier';
  poAmount?: number;
  deliveryAccepted?: boolean;
  onUpdated?: () => void;
}

export function InvoicePaymentPanel({
  workOrderId,
  supplierId,
  role,
  poAmount,
  deliveryAccepted = true,
  onUpdated,
}: InvoicePaymentPanelProps) {
  const [invoice, setInvoice] = useState<InvoiceSummary | null>(null);
  const [payment, setPayment] = useState<PaymentSummary | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [amount, setAmount] = useState(poAmount ? String(poAmount) : '');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const invRes = await fetchInvoiceByWorkOrder(workOrderId);
    if (!invRes.ok) {
      setError(invRes.error);
      return;
    }
    setInvoice(invRes.invoice);
    if (invRes.invoice) {
      const payRes = await fetchPaymentByInvoice(invRes.invoice.id);
      if (payRes.ok) setPayment(payRes.payment);
    }
  }

  useEffect(() => {
    void load();
  }, [workOrderId]);

  async function handleSubmitInvoice(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await submitInvoice(
      workOrderId,
      supplierId,
      invoiceNumber,
      Number(amount),
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess('Invoice submitted');
    await load();
    onUpdated?.();
  }

  async function handleApprove() {
    if (!invoice) return;
    setBusy(true);
    const result = await approveInvoice(invoice.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess('Invoice approved');
    await load();
    onUpdated?.();
  }

  async function handleRecordPayment() {
    if (!invoice) return;
    setBusy(true);
    const result = await recordPayment(invoice.id, invoice.amount, 'UPI', reference);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess('Payment recorded');
    await load();
    onUpdated?.();
  }

  async function handleVerify() {
    if (!payment) return;
    setBusy(true);
    const result = await verifyPayment(payment.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess('Payment verified');
    await load();
    onUpdated?.();
  }

  return (
    <section className="mt-6 rounded-lg border bg-card p-4" data-testid="invoice-payment-panel">
      <h2 className="font-medium">Invoice &amp; payment</h2>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-2 text-sm text-green-700">{success}</p>}

      {!invoice && role === 'supplier' && !deliveryAccepted && (
        <p className="mt-3 text-sm text-muted-foreground">
          Invoice submission unlocks after buyer accepts delivery and inspection.
        </p>
      )}

      {!invoice && role === 'supplier' && deliveryAccepted && (
        <form onSubmit={(e) => void handleSubmitInvoice(e)} className="mt-3 space-y-2">
          <input
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="Invoice number"
            required
            className="w-full rounded border px-3 py-2 text-sm"
          />
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount (INR)"
            required
            className="w-full rounded border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            Submit invoice
          </button>
        </form>
      )}

      {invoice && (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Invoice</dt>
            <dd>{invoice.invoiceNumber}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Amount</dt>
            <dd>{formatMoney(invoice.amount, invoice.currency)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd>{invoice.status}</dd>
          </div>
        </dl>
      )}

      {invoice && role === 'buyer' && invoice.status === 'SUBMITTED' && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleApprove()}
            className="rounded border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Approve invoice
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void rejectInvoice(invoice.id)}
            className="rounded border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Reject
          </button>
        </div>
      )}

      {invoice && role === 'buyer' && invoice.status === 'APPROVED' && !payment && (
        <div className="mt-3 space-y-2">
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="UPI / bank reference"
            className="w-full rounded border px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleRecordPayment()}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            Record payment
          </button>
        </div>
      )}

      {payment && payment.status === 'VERIFIED' && (
        <div className="mt-4 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🏁</span>
              <span className="font-bold text-xs text-emerald-900 dark:text-emerald-200">
                Transaction Verified &amp; Settled
              </span>
            </div>
            <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 px-2.5 py-0.5 text-[11px] font-bold">
              ✓ 7. SETTLED
            </span>
          </div>
          <p className="text-xs text-emerald-800 dark:text-emerald-400">
            Payment has been verified ({formatMoney(payment.amount, payment.currency)} via {payment.method} · {payment.reference || 'Ref Verified'}). Full procurement lifecycle completed and recorded in audit log.
          </p>
        </div>
      )}

      {payment && payment.status !== 'VERIFIED' && (
        <p className="mt-3 text-sm flex items-center gap-2">
          <span>Payment: <strong>{payment.status}</strong></span>
          {payment.reference && <span className="font-mono text-xs text-muted-foreground">({payment.reference})</span>}
          {role === 'buyer' && payment.status === 'RECORDED' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleVerify()}
              className="ml-2 rounded-md bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              Verify &amp; Settle Payment ✓
            </button>
          )}
        </p>
      )}
    </section>
  );
}
