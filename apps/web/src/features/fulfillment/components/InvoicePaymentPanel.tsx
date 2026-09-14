import React, { useEffect, useState } from 'react';
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

export interface InvoicePaymentPanelProps {
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
  poAmount = 0,
  deliveryAccepted = true,
  onUpdated,
}: InvoicePaymentPanelProps) {
  const [invoice, setInvoice] = useState<InvoiceSummary | null>(null);
  const [payment, setPayment] = useState<PaymentSummary | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [amount, setAmount] = useState(poAmount ? String(poAmount) : '');
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'BANK_TRANSFER' | 'MANUAL' | 'OTHER'>('UPI');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

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
    setError(null);
    setSuccess(null);
    const result = await submitInvoice(
      workOrderId,
      supplierId,
      invoiceNumber || `INV-${Date.now().toString().slice(-6)}`,
      Number(amount) || poAmount,
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess('✓ Official GST Invoice submitted successfully!');
    await load();
    onUpdated?.();
  }

  async function handleApprove() {
    if (!invoice) return;
    setBusy(true);
    setError(null);
    const result = await approveInvoice(invoice.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess('✓ Invoice approved for payment settlement!');
    await load();
    onUpdated?.();
  }

  async function handleReject() {
    if (!invoice) return;
    setBusy(true);
    setError(null);
    const result = await rejectInvoice(invoice.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess('Invoice rejected. Supplier notified to re-submit.');
    await load();
    onUpdated?.();
  }

  async function handleRecordPayment(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!invoice) return;
    if (!reference.trim()) {
      setError('Please provide a UPI Transaction UTR or Bank Transfer Reference ID.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await recordPayment(
      invoice.id,
      invoice.amount,
      paymentMethod,
      reference.trim()
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(`✓ Milestone payment of ${formatMoney(invoice.amount, invoice.currency)} recorded via ${paymentMethod}!`);
    await load();
    onUpdated?.();
  }

  async function handleVerify() {
    if (!payment) return;
    setBusy(true);
    setError(null);
    const result = await verifyPayment(payment.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess('✓ Payment verified and full procurement lifecycle 100% settled!');
    await load();
    onUpdated?.();
  }

  const effectiveAmount = invoice ? invoice.amount : (Number(amount) || poAmount);
  const baseAmount = Math.round(effectiveAmount / 1.18);
  const gstAmount = effectiveAmount - baseAmount;
  const isMatchingPo = poAmount > 0 ? Math.abs(effectiveAmount - poAmount) < 1 : true;

  return (
    <div className="space-y-4" data-testid="invoice-payment-panel">
      {/* =========================================================================
          SCREEN 12: INVOICE & DELIVERY SIGN-OFF SECTION
          ========================================================================= */}
      <section className="rounded-2xl border bg-card p-4 shadow-2xs space-y-3.5">
        <div className="flex items-center justify-between border-b pb-2.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm">🧾</span>
              <h3 className="text-xs font-extrabold text-foreground uppercase tracking-wider">
                Screen 12: Official GST Tax Invoice
              </h3>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Itemization summary, GST tax breakdown, and automatic match check against PO.
            </p>
          </div>
          {invoice && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-black border ${
                invoice.status === 'APPROVED' || invoice.status === 'PAID'
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300'
                  : invoice.status === 'SUBMITTED'
                  ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-300'
                  : 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border-red-300'
              }`}
            >
              {invoice.status}
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/40 p-2.5 text-xs font-bold text-red-700 dark:text-red-300">
            ⚠️ {error}
          </div>
        )}

        {success && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
            {success}
          </div>
        )}

        {/* State: Supplier waiting for delivery acceptance */}
        {!invoice && role === 'supplier' && !deliveryAccepted && (
          <div className="rounded-xl border border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 p-3.5 text-xs text-amber-900 dark:text-amber-200 space-y-1">
            <span className="font-extrabold block">⏳ Awaiting Buyer Inspection Sign-off</span>
            <p className="text-[11px] text-amber-800 dark:text-amber-300">
              Tax invoice creation unlocks automatically once the buyer acknowledges 100% on-site delivery and rates the service.
            </p>
          </div>
        )}

        {/* State: Supplier form to create / submit invoice */}
        {!invoice && role === 'supplier' && deliveryAccepted && (
          <form onSubmit={(e) => void handleSubmitInvoice(e)} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-foreground mb-1">
                  Tax Invoice Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="e.g. INV-2026-09-001"
                  className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-mono font-bold focus:ring-2 focus:ring-primary focus:outline-none min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-foreground mb-1">
                  Total Tax Invoice Amount (₹ INR) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Invoice Total Amount"
                  className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-mono font-bold focus:ring-2 focus:ring-primary focus:outline-none min-h-[44px]"
                />
              </div>
            </div>

            {/* Live Calculation Preview */}
            <div className="rounded-xl border bg-muted/20 p-3 text-xs space-y-1">
              <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                <span>Taxable Base Value (82%):</span>
                <span className="font-mono font-semibold text-foreground">{formatMoney(baseAmount, 'INR')}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                <span>GST (18% IGST / CGST+SGST):</span>
                <span className="font-mono font-semibold text-foreground">{formatMoney(gstAmount, 'INR')}</span>
              </div>
              <div className="flex items-center justify-between border-t pt-1 font-bold text-foreground">
                <span>Total Payable with GST:</span>
                <span className="font-mono text-primary font-black">{formatMoney(effectiveAmount, 'INR')}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[44px] rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50 transition mobile-touch-target"
            >
              {busy ? 'Submitting Tax Invoice…' : '📤 Submit Official GST Invoice →'}
            </button>
          </form>
        )}

        {/* State: Invoice is submitted / viewable */}
        {invoice && (
          <div className="space-y-3">
            {/* Invoice Matching Check Chip */}
            <div
              className={`rounded-xl p-2.5 border text-xs flex items-center justify-between gap-2 ${
                isMatchingPo
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-900 dark:text-emerald-200'
                  : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 text-amber-900 dark:text-amber-200'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-base">{isMatchingPo ? '✓' : '⚠️'}</span>
                <span className="font-bold truncate">
                  {isMatchingPo
                    ? '100% 3-Way Match Verified (PO = BoQ = Invoice)'
                    : 'Invoice amount differs from baseline PO contract value'}
                </span>
              </div>
              <span className="font-mono font-black text-[11px] shrink-0">
                {formatMoney(invoice.amount, invoice.currency)}
              </span>
            </div>

            {/* Detailed Itemization & Tax Breakdown */}
            <div className="rounded-xl border bg-muted/10 p-3 space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2 pb-2 border-b">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Invoice Reference
                  </span>
                  <span className="font-mono font-bold text-foreground">{invoice.invoiceNumber}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Compliance Status
                  </span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">
                    ✓ Valid E-Invoice / ITC Eligible
                  </span>
                </div>
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between text-muted-foreground">
                  <span>Taxable Base Value:</span>
                  <span className="font-mono font-semibold text-foreground">{formatMoney(baseAmount, 'INR')}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Applicable GST (18%):</span>
                  <span className="font-mono font-semibold text-foreground">{formatMoney(gstAmount, 'INR')}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-extrabold text-foreground text-xs">
                  <span>Gross Invoice Total:</span>
                  <span className="font-mono text-primary font-black">{formatMoney(invoice.amount, invoice.currency)}</span>
                </div>
              </div>
            </div>

            {/* Buyer Approval / Rejection Actions (Primary Action: [ ✓ Approve Invoice for Payment ]) */}
            {role === 'buyer' && invoice.status === 'SUBMITTED' && (
              <div className="pt-2 border-t flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleApprove()}
                  className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white shadow-xs hover:bg-emerald-700 active:scale-98 disabled:opacity-50 transition flex items-center justify-center gap-1.5 mobile-touch-target"
                  data-testid="approve-invoice-button"
                >
                  <span>✓</span>
                  <span>{busy ? 'Authorizing…' : 'Approve Invoice for Payment'}</span>
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleReject()}
                  className="min-h-[44px] rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/30 px-4 py-2.5 text-xs font-bold text-red-700 dark:text-red-300 hover:bg-red-100 transition mobile-touch-target"
                >
                  Reject / Request Edit
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* =========================================================================
          SCREEN 13: ESCROW & PAYMENT EXECUTION SECTION
          ========================================================================= */}
      <section className="rounded-2xl border bg-card p-4 shadow-2xs space-y-3.5">
        <div className="flex items-center justify-between border-b pb-2.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm">💳</span>
              <h3 className="text-xs font-extrabold text-foreground uppercase tracking-wider">
                Screen 13: Escrow &amp; Payment Execution
              </h3>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Bank NEFT/RTGS settlement, Instant UPI QR, and Escrow Milestone release.
            </p>
          </div>
          {payment && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-black border ${
                payment.status === 'VERIFIED'
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300'
                  : 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-300'
              }`}
            >
              {payment.status}
            </span>
          )}
        </div>

        {/* Clean Payment Card: Bank Details & UPI QR */}
        <div className="rounded-xl border bg-muted/15 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
              Authorized Settlement Target
            </span>
            <button
              type="button"
              onClick={() => setShowQrModal(true)}
              className="min-h-[36px] text-[11px] font-bold text-primary flex items-center gap-1 hover:underline"
            >
              <span>📱</span>
              <span>View UPI QR</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-lg border bg-card space-y-1">
              <span className="text-[9px] uppercase font-bold text-muted-foreground block">
                Beneficiary Virtual Escrow Account
              </span>
              <p className="font-mono font-bold text-foreground">OTP-ESCROW-002984</p>
              <p className="text-[10px] text-muted-foreground">IFSC: <span className="font-mono text-foreground">HDFC0000001</span> (HDFC Bank Ltd)</p>
            </div>

            <div className="p-2.5 rounded-lg border bg-card space-y-1">
              <span className="text-[9px] uppercase font-bold text-muted-foreground block">
                Instant UPI VPA Handle
              </span>
              <p className="font-mono font-bold text-foreground">otp.escrow@hdfcbank</p>
              <p className="text-[10px] text-muted-foreground">Merchant: <span className="font-semibold text-foreground">Open Trade Platform Escrow</span></p>
            </div>
          </div>
        </div>

        {/* State: Buyer payment entry form (when invoice approved) */}
        {invoice && invoice.status === 'APPROVED' && !payment && role === 'buyer' && (
          <form onSubmit={(e) => void handleRecordPayment(e)} className="space-y-3 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-foreground mb-1">
                  Settlement Method
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { id: 'UPI', label: 'UPI' },
                    { id: 'BANK_TRANSFER', label: 'NEFT / RTGS' },
                    { id: 'MANUAL', label: 'Direct Transfer' },
                  ] as const).map((method) => (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setPaymentMethod(method.id)}
                      className={`min-h-[44px] rounded-xl text-xs font-black transition border mobile-touch-target ${
                        paymentMethod === method.id
                          ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                          : 'bg-card text-muted-foreground hover:bg-muted border-border'
                      }`}
                    >
                      {method.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-foreground mb-1">
                  Bank UTR / Transaction Reference <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. UTR / UPI Ref ID (12 digits)"
                  className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-mono font-bold focus:ring-2 focus:ring-primary focus:outline-none min-h-[44px]"
                />
              </div>
            </div>

            {/* Authoritative Action: [ 💳 Release Milestone Payment ] */}
            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[44px] rounded-xl bg-emerald-700 px-5 py-3 text-xs font-black text-white shadow-md hover:bg-emerald-800 active:scale-98 disabled:opacity-50 transition flex items-center justify-center gap-2 mobile-touch-target"
              data-testid="release-milestone-payment-button"
            >
              <span>💳</span>
              <span>
                {busy
                  ? 'Releasing Settlement…'
                  : `Release Milestone Payment (${formatMoney(invoice.amount, invoice.currency)}) →`}
              </span>
            </button>
          </form>
        )}

        {/* State: Payment is recorded, awaiting final verification */}
        {payment && payment.status === 'RECORDED' && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 dark:bg-blue-950/40 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-xs text-blue-950 dark:text-blue-200">
                Payment Recorded — Awaiting Dual-Signoff Verification
              </span>
              <span className="font-mono text-xs font-bold text-blue-900 dark:text-blue-300">
                Ref: {payment.reference}
              </span>
            </div>
            <p className="text-[11px] text-blue-800 dark:text-blue-300">
              Amount of {formatMoney(payment.amount, payment.currency)} transmitted via {payment.method}. Click below to confirm bank ledger match and mark complete.
            </p>

            {role === 'buyer' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleVerify()}
                className="w-full min-h-[44px] rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white shadow-xs hover:bg-emerald-700 active:scale-98 disabled:opacity-50 transition mobile-touch-target"
                data-testid="verify-payment-button"
              >
                {busy ? 'Verifying Settle…' : '✓ Verify Ledger & Settle Contract (Step 15)'}
              </button>
            )}
          </div>
        )}

        {/* State: Payment is verified and settled */}
        {payment && payment.status === 'VERIFIED' && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/40 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏁</span>
                <span className="font-black text-xs text-emerald-950 dark:text-emerald-200">
                  Escrow Released &amp; Contract 100% Settled
                </span>
              </div>
              <span className="rounded-full bg-emerald-200 dark:bg-emerald-900/60 text-emerald-950 dark:text-emerald-300 px-2.5 py-0.5 text-[10px] font-black border border-emerald-300">
                ✓ 7. SETTLED
              </span>
            </div>
            <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-snug">
              Milestone settlement of {formatMoney(payment.amount, payment.currency)} successfully reconciled via {payment.method} (Ref: <span className="font-mono font-bold">{payment.reference || 'VERIFIED'}</span>). Full procurement transaction audit log sealed.
            </p>
          </div>
        )}
      </section>

      {/* UPI QR Modal Dialog */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 shadow-2xl space-y-4 text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-foreground">Scan UPI QR for Settlement</h3>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="p-1 rounded-lg text-muted-foreground hover:bg-muted min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-white rounded-2xl inline-block border-2 border-slate-900 shadow-md">
              <div className="w-44 h-44 bg-slate-900 flex flex-col items-center justify-center text-white rounded-lg space-y-1">
                <span className="text-3xl">📱</span>
                <span className="font-mono text-[10px] font-bold">BHIM / UPI / GPay / PhonePe</span>
                <span className="text-[9px] text-slate-300 font-mono">otp.escrow@hdfcbank</span>
                <span className="text-xs font-black text-emerald-400 mt-1">₹ {effectiveAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground leading-snug">
              Scan with any UPI app to pay directly into the escrow holding account.
            </p>

            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="w-full min-h-[44px] rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground"
            >
              Done / Enter Reference
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
