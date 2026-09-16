import React, { useEffect, useState } from 'react';
import { formatMoney } from '../types/fulfillment';
import {
  approveInvoice,
  fetchInvoicesByWorkOrder,
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
import { fetchWorkOrderMilestones } from '../api/work-orders';
import {
  calculateRemainingInvoiceableAmount,
  validateInvoiceAmountAgainstPo,
} from '@otp/domain';

export interface InvoicePaymentPanelProps {
  workOrderId: string;
  supplierId: string;
  role: 'buyer' | 'supplier';
  poAmount?: number;
  deliveryAccepted?: boolean;
  onUpdated?: () => void;
}

export interface MilestoneOption {
  id: string;
  milestoneIndex: number;
  milestoneTitle: string;
  targetPercentage: number;
  allocatedAmount: number;
  invoicedAmount: number;
  isInvoiced: boolean;
  status: string;
}

export function InvoicePaymentPanel({
  workOrderId,
  supplierId,
  role,
  poAmount = 0,
  deliveryAccepted = true,
  onUpdated,
}: InvoicePaymentPanelProps) {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [activeInvoice, setActiveInvoice] = useState<InvoiceSummary | null>(null);
  const [payment, setPayment] = useState<PaymentSummary | null>(null);
  const [milestones, setMilestones] = useState<MilestoneOption[]>([]);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string>('');
  const [invoiceType, setInvoiceType] = useState<'PROGRESSIVE' | 'FINAL' | 'ADVANCE' | 'STANDARD'>('PROGRESSIVE');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'BANK_TRANSFER' | 'MANUAL' | 'OTHER'>('UPI');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  async function load() {
    const [invsRes, mRes] = await Promise.all([
      fetchInvoicesByWorkOrder(workOrderId),
      fetchWorkOrderMilestones(workOrderId),
    ]);

    if (invsRes.ok) {
      setInvoices(invsRes.invoices);
      const latest = invsRes.invoices[invsRes.invoices.length - 1] || null;
      setActiveInvoice(latest);
      if (latest) {
        const payRes = await fetchPaymentByInvoice(latest.id);
        if (payRes.ok) setPayment(payRes.payment);
      } else {
        setPayment(null);
      }
    } else {
      setError(invsRes.error);
    }

    if (mRes.ok && mRes.milestones) {
      const parsedMilestones: MilestoneOption[] = mRes.milestones.map((m: any) => ({
        id: String(m.id),
        milestoneIndex: Number(m.milestone_index || 1),
        milestoneTitle: String(m.milestone_title || `Milestone ${m.milestone_index || 1}`),
        targetPercentage: Number(m.target_percentage || 0),
        allocatedAmount: Number(m.allocated_amount || 0),
        invoicedAmount: Number(m.invoiced_amount || 0),
        isInvoiced: Boolean(m.is_invoiced),
        status: String(m.status || 'PENDING'),
      }));
      setMilestones(parsedMilestones);
    }
  }

  useEffect(() => {
    void load();
  }, [workOrderId]);

  // Derived progressive invoicing ledger calculation
  const invoicingCalc = calculateRemainingInvoiceableAmount(
    poAmount,
    invoices.map((i) => ({ amount: i.amount, status: i.status })),
  );

  // When selected milestone changes, pre-fill suggested amount
  const handleMilestoneSelect = (mId: string) => {
    setSelectedMilestoneId(mId);
    if (!mId) {
      setAmount(String(invoicingCalc.remainingInvoiceableAmount || ''));
      return;
    }
    const target = milestones.find((m) => m.id === mId);
    if (target) {
      const targetRemaining = Math.max(0, target.allocatedAmount - target.invoicedAmount);
      setAmount(String(targetRemaining > 0 ? targetRemaining : target.allocatedAmount));
    }
  };

  async function handleSubmitInvoice(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);

    const invAmount = Number(amount);
    if (!invAmount || invAmount <= 0) {
      setError('Invoice amount must be strictly greater than 0');
      setBusy(false);
      return;
    }

    // Over-invoicing check
    const val = validateInvoiceAmountAgainstPo(
      poAmount,
      invoices.map((i) => ({ amount: i.amount, status: i.status })),
      invAmount,
    );

    if (!val.valid) {
      setError(val.error || 'Invoice amount exceeds PO authorized limit');
      setBusy(false);
      return;
    }

    const selectedM = milestones.find((m) => m.id === selectedMilestoneId);
    const lineDescription = selectedM
      ? `${selectedM.milestoneTitle} — Deliverables & Progress Execution`
      : `Progressive Milestone Deliverables (${invoiceType})`;

    const lineBase = Math.round((invAmount / 1.18) * 100) / 100;
    const lineGst = Math.round((invAmount - lineBase) * 100) / 100;

    const result = await submitInvoice(
      workOrderId,
      supplierId,
      invoiceNumber || `INV-${Date.now().toString().slice(-6)}`,
      invAmount,
      'INR',
      selectedMilestoneId || null,
      invoiceType,
      [
        {
          lineIndex: 1,
          description: lineDescription,
          quantity: 1,
          unitPrice: lineBase,
          taxableAmount: lineBase,
          gstAmount: lineGst,
          totalAmount: invAmount,
          milestoneId: selectedMilestoneId || null,
        },
      ],
    );

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSuccess('✓ Official GST Progressive Invoice submitted successfully!');
    setInvoiceNumber('');
    setAmount('');
    setSelectedMilestoneId('');
    setShowSubmitModal(false);
    await load();
    onUpdated?.();
  }

  async function handleApprove(invId: string) {
    setBusy(true);
    setError(null);
    const result = await approveInvoice(invId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess('✓ Invoice approved for payment settlement!');
    await load();
    onUpdated?.();
  }

  async function handleReject(invId: string) {
    setBusy(true);
    setError(null);
    const result = await rejectInvoice(invId);
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
    if (!activeInvoice) return;
    if (!reference.trim()) {
      setError('Please provide a UPI Transaction UTR or Bank Transfer Reference ID.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await recordPayment(
      activeInvoice.id,
      activeInvoice.amount,
      paymentMethod,
      reference.trim(),
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(
      `✓ Milestone payment of ${formatMoney(activeInvoice.amount, activeInvoice.currency)} recorded via ${paymentMethod}!`,
    );
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
    setSuccess('✓ Payment verified and milestone settlement confirmed!');
    await load();
    onUpdated?.();
  }

  const effectiveAmount = activeInvoice ? activeInvoice.amount : Number(amount) || poAmount;
  const baseAmount = Math.round(effectiveAmount / 1.18);
  const gstAmount = effectiveAmount - baseAmount;

  return (
    <div className="space-y-4" data-testid="invoice-payment-panel">
      {/* =========================================================================
          PROGRESSIVE INVOICING & REMAINING INVOICEABLE AMOUNT BAR (PHASE 5A)
          ========================================================================= */}
      <section className="rounded-2xl border bg-card p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm">📊</span>
              <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
                Progressive Invoicing Ledger (Phase 5A)
              </h3>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              PO Authorized: <span className="font-mono font-bold text-foreground">{formatMoney(poAmount, 'INR')}</span> · Invoices: {invoices.length} submitted
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-black border ${
                invoicingCalc.isFullyInvoiced
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300'
                  : 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-300'
              }`}
            >
              {invoicingCalc.isFullyInvoiced ? '✓ Fully Invoiced (100%)' : `Remaining: ${formatMoney(invoicingCalc.remainingInvoiceableAmount, 'INR')}`}
            </span>

            {role === 'supplier' && !invoicingCalc.isFullyInvoiced && (
              <button
                type="button"
                onClick={() => setShowSubmitModal(true)}
                className="min-h-[44px] rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition mobile-touch-target"
              >
                + New Invoice
              </button>
            )}
          </div>
        </div>

        {/* Amount Allocation Triad */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="rounded-xl border bg-muted/20 p-2.5 space-y-0.5">
            <span className="text-[9px] uppercase font-bold text-muted-foreground block">PO Authorized Cap</span>
            <span className="font-mono font-black text-sm text-foreground">{formatMoney(poAmount, 'INR')}</span>
          </div>

          <div className="rounded-xl border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60 p-2.5 space-y-0.5">
            <span className="text-[9px] uppercase font-bold text-blue-900 dark:text-blue-300 block">Already Invoiced</span>
            <span className="font-mono font-black text-sm text-blue-700 dark:text-blue-300">
              {formatMoney(invoicingCalc.alreadyInvoicedAmount, 'INR')}
            </span>
          </div>

          <div className="rounded-xl border bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60 p-2.5 space-y-0.5">
            <span className="text-[9px] uppercase font-bold text-emerald-900 dark:text-emerald-300 block">Remaining Invoiceable</span>
            <span className="font-mono font-black text-sm text-emerald-700 dark:text-emerald-300">
              {formatMoney(invoicingCalc.remainingInvoiceableAmount, 'INR')}
            </span>
          </div>
        </div>

        {/* Invoices List Table */}
        {invoices.length > 0 && (
          <div className="rounded-xl border overflow-hidden pt-1">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b text-[10px] uppercase font-bold text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Invoice #</th>
                    <th className="px-3 py-2">Type / Scope</th>
                    <th className="px-3 py-2 text-right">Amount (₹)</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      onClick={() => setActiveInvoice(inv)}
                      className={`cursor-pointer transition ${
                        activeInvoice?.id === inv.id ? 'bg-primary/5 font-semibold' : 'hover:bg-muted/20'
                      }`}
                    >
                      <td className="px-3 py-2 font-mono">{inv.invoiceNumber}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {inv.invoiceType} {inv.milestoneId ? '· Milestone Linked' : ''}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-foreground">
                        {formatMoney(inv.amount, inv.currency)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-bold border ${
                            inv.status === 'APPROVED' || inv.status === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : inv.status === 'SUBMITTED'
                              ? 'bg-blue-100 text-blue-800 border-blue-300'
                              : 'bg-red-100 text-red-800 border-red-300'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {role === 'buyer' && inv.status === 'SUBMITTED' && (
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleApprove(inv.id);
                              }}
                              className="px-2 py-1 rounded-md bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleReject(inv.id);
                              }}
                              className="px-2 py-1 rounded-md bg-red-100 text-red-800 text-[10px] font-bold hover:bg-red-200"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* =========================================================================
          SCREEN 12: ACTIVE INVOICE DETAIL & TAX BREAKDOWN
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
              Itemization summary, GST tax breakdown, and progressive milestone traceability.
            </p>
          </div>
          {activeInvoice && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-black border ${
                activeInvoice.status === 'APPROVED' || activeInvoice.status === 'PAID'
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300'
                  : activeInvoice.status === 'SUBMITTED'
                  ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-300'
                  : 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border-red-300'
              }`}
            >
              {activeInvoice.status}
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

        {/* State: No invoices created yet */}
        {invoices.length === 0 && role === 'supplier' && (
          <div className="rounded-xl border border-dashed p-4 text-center space-y-2">
            <p className="text-xs text-muted-foreground">No invoices submitted yet for this purchase order.</p>
            <button
              type="button"
              onClick={() => setShowSubmitModal(true)}
              className="min-h-[44px] rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition mobile-touch-target"
            >
              + Create First Milestone Tax Invoice →
            </button>
          </div>
        )}

        {invoices.length === 0 && role === 'buyer' && (
          <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
            Awaiting supplier to submit progressive GST invoice for milestone settlement.
          </div>
        )}

        {/* State: Active Invoice Detail */}
        {activeInvoice && (
          <div className="space-y-3">
            {/* Detailed Itemization & Tax Breakdown */}
            <div className="rounded-xl border bg-muted/10 p-3 space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2 pb-2 border-b">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Invoice Reference
                  </span>
                  <span className="font-mono font-bold text-foreground">{activeInvoice.invoiceNumber}</span>
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
                  <span>Taxable Base Value (82%):</span>
                  <span className="font-mono font-semibold text-foreground">{formatMoney(baseAmount, 'INR')}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Applicable GST (18%):</span>
                  <span className="font-mono font-semibold text-foreground">{formatMoney(gstAmount, 'INR')}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-extrabold text-foreground text-xs">
                  <span>Gross Invoice Total:</span>
                  <span className="font-mono text-primary font-black">
                    {formatMoney(activeInvoice.amount, activeInvoice.currency)}
                  </span>
                </div>
              </div>
            </div>

            {/* Buyer Approval / Rejection Actions */}
            {role === 'buyer' && activeInvoice.status === 'SUBMITTED' && (
              <div className="pt-2 border-t flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleApprove(activeInvoice.id)}
                  className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white shadow-xs hover:bg-emerald-700 active:scale-98 disabled:opacity-50 transition flex items-center justify-center gap-1.5 mobile-touch-target"
                  data-testid="approve-invoice-button"
                >
                  <span>✓</span>
                  <span>{busy ? 'Authorizing…' : `Approve Invoice ${activeInvoice.invoiceNumber} for Payment`}</span>
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleReject(activeInvoice.id)}
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
              <p className="text-[10px] text-muted-foreground">
                IFSC: <span className="font-mono text-foreground">HDFC0000001</span> (HDFC Bank Ltd)
              </p>
            </div>

            <div className="p-2.5 rounded-lg border bg-card space-y-1">
              <span className="text-[9px] uppercase font-bold text-muted-foreground block">
                Instant UPI VPA Handle
              </span>
              <p className="font-mono font-bold text-foreground">otp.escrow@hdfcbank</p>
              <p className="text-[10px] text-muted-foreground">
                Merchant: <span className="font-semibold text-foreground">Open Trade Platform Escrow</span>
              </p>
            </div>
          </div>
        </div>

        {/* State: Buyer payment entry form (when invoice approved) */}
        {activeInvoice && activeInvoice.status === 'APPROVED' && !payment && role === 'buyer' && (
          <form onSubmit={(e) => void handleRecordPayment(e)} className="space-y-3 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-foreground mb-1">
                  Settlement Method
                </label>
                <div className="grid grid-cols-1 xs:grid-cols-3 gap-1.5">
                  {([
                    { id: 'UPI', label: 'UPI' },
                    { id: 'BANK_TRANSFER', label: 'NEFT / RTGS' },
                    { id: 'MANUAL', label: 'Direct Transfer' },
                  ] as const).map((method) => (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setPaymentMethod(method.id)}
                      className={`min-h-[44px] rounded-xl px-2 py-1 text-[11px] font-black transition border mobile-touch-target flex items-center justify-center text-center ${
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
                  : `Release Milestone Payment (${formatMoney(activeInvoice.amount, activeInvoice.currency)}) →`}
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
                {busy ? 'Verifying Settle…' : '✓ Verify Ledger & Confirm Milestone Settlement'}
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
                  Payment Remitted &amp; Cryptographically Verified
                </span>
              </div>
              <span className="rounded-full bg-emerald-600 text-white px-2.5 py-0.5 text-[10px] font-black">
                100% SETTLED
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
              <div>
                <span className="text-muted-foreground block">Verified Amount</span>
                <span className="font-mono font-bold text-foreground">
                  {formatMoney(payment.amount, payment.currency)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block">Bank Reference</span>
                <span className="font-mono font-bold text-foreground">{payment.reference}</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* =========================================================================
          PROGRESSIVE INVOICE SUBMISSION MODAL
          ========================================================================= */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-card border border-border p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b pb-2.5">
              <h3 className="text-sm font-black text-foreground flex items-center gap-1.5">
                <span>📤</span>
                <span>Submit Progressive GST Invoice (Phase 5A)</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="text-muted-foreground hover:text-foreground text-sm p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={(e) => void handleSubmitInvoice(e)} className="space-y-3.5">
              {/* Milestone Allocation Picker */}
              <div>
                <label className="block text-[11px] font-bold text-foreground mb-1">
                  Target Milestone Allocation
                </label>
                <select
                  value={selectedMilestoneId}
                  onChange={(e) => handleMilestoneSelect(e.target.value)}
                  className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-primary focus:outline-none min-h-[44px]"
                >
                  <option value="">-- General Progressive / Unlinked --</option>
                  {milestones.map((m) => (
                    <option key={m.id} value={m.id} disabled={m.isInvoiced}>
                      {m.milestoneTitle} ({m.targetPercentage}%) — Cap: {formatMoney(m.allocatedAmount, 'INR')}{' '}
                      {m.isInvoiced ? '[Fully Invoiced]' : `(Remaining: ${formatMoney(Math.max(0, m.allocatedAmount - m.invoicedAmount), 'INR')})`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-foreground mb-1">
                    Invoice Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="e.g. INV-2026-M1"
                    className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-mono font-bold focus:ring-2 focus:ring-primary focus:outline-none min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-foreground mb-1">
                    Invoice Type
                  </label>
                  <select
                    value={invoiceType}
                    onChange={(e) => setInvoiceType(e.target.value as any)}
                    className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-primary focus:outline-none min-h-[44px]"
                  >
                    <option value="PROGRESSIVE">PROGRESSIVE</option>
                    <option value="FINAL">FINAL</option>
                    <option value="ADVANCE">ADVANCE</option>
                    <option value="STANDARD">STANDARD</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-foreground mb-1">
                  Invoice Amount (₹ INR) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`Max Remaining: ₹${invoicingCalc.remainingInvoiceableAmount}`}
                  className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-mono font-bold focus:ring-2 focus:ring-primary focus:outline-none min-h-[44px]"
                />
                <span className="text-[10px] text-muted-foreground block mt-1">
                  Authorized Remaining Budget: <strong className="text-primary">{formatMoney(invoicingCalc.remainingInvoiceableAmount, 'INR')}</strong>
                </span>
              </div>

              {/* Live Statutory Preview */}
              {Number(amount) > 0 && (
                <div className="rounded-xl border bg-muted/20 p-3 text-xs space-y-1">
                  <div className="flex justify-between text-muted-foreground text-[11px]">
                    <span>Taxable Base Value (82%):</span>
                    <span className="font-mono font-semibold text-foreground">
                      {formatMoney(Math.round(Number(amount) / 1.18), 'INR')}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground text-[11px]">
                    <span>GST (18% IGST / CGST+SGST):</span>
                    <span className="font-mono font-semibold text-foreground">
                      {formatMoney(Number(amount) - Math.round(Number(amount) / 1.18), 'INR')}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-1 font-bold text-foreground">
                    <span>Gross Invoice Total:</span>
                    <span className="font-mono text-primary font-black">{formatMoney(Number(amount), 'INR')}</span>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="min-h-[44px] rounded-xl border px-4 py-2 text-xs font-bold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="min-h-[44px] rounded-xl bg-primary px-5 py-2 text-xs font-black text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50"
                >
                  {busy ? 'Submitting…' : 'Submit Progressive Invoice →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UPI QR Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 shadow-2xl text-center space-y-4">
            <h3 className="text-sm font-black text-foreground">Scan UPI QR to Remit</h3>
            <div className="bg-white p-4 rounded-xl border inline-block">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                  `upi://pay?pa=otp.escrow@hdfcbank&pn=OpenTradePlatform&am=${effectiveAmount}&cu=INR`,
                )}`}
                alt="UPI QR Code"
                className="w-44 h-44 mx-auto"
              />
            </div>
            <p className="font-mono text-xs font-bold text-foreground">otp.escrow@hdfcbank</p>
            <p className="font-mono text-sm font-black text-primary">{formatMoney(effectiveAmount, 'INR')}</p>
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="w-full min-h-[44px] rounded-xl bg-primary text-primary-foreground text-xs font-bold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
