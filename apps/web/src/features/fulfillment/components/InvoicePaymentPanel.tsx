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
  fetchPaymentsByPo,
  fetchInvoiceAllocations,
  reversePaymentAllocation,
  issueCreditDebitNote,
  fetchCreditDebitNotesByInvoice,
  fetchTdsDeductionsByInvoice,
  exportTallyPaymentVoucherXml,
  exportZohoPaymentReceiptJson,
  recordInvoicePayment,
  recordPayment,
  verifyPayment,
  allocateAdvancePayment,
  type PaymentSummary,
  type PaymentAllocationRecord,
  type TdsDeductionRecord,
} from '../api/payments';
import { fetchWorkOrderMilestones } from '../api/work-orders';
import { TdsWithholdingPanel } from './TdsWithholdingPanel';
import {
  calculateRemainingInvoiceableAmount,
  validateInvoiceAmountAgainstPo,
  type CreditDebitNote,
} from '@otp/domain';
import { translateError } from '@/lib/error-translator';

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
  const [poPayments, setPoPayments] = useState<PaymentSummary[]>([]);
  const [selectedAdvancePaymentId, setSelectedAdvancePaymentId] = useState<string>('');
  const [advanceAllocAmountInput, setAdvanceAllocAmountInput] = useState<string>('');
  const [milestones, setMilestones] = useState<MilestoneOption[]>([]);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string>('');
  const [invoiceType, setInvoiceType] = useState<'PROGRESSIVE' | 'FINAL' | 'ADVANCE' | 'STANDARD'>('PROGRESSIVE');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [hsnCode, setHsnCode] = useState('995411');
  const [amount, setAmount] = useState('');
  const [payAmountInput, setPayAmountInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'BANK_TRANSFER' | 'MANUAL' | 'OTHER'>('UPI');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [allocations, setAllocations] = useState<PaymentAllocationRecord[]>([]);
  const [invoiceNotes, setInvoiceNotes] = useState<CreditDebitNote[]>([]);
  const [tdsDeductions, setTdsDeductions] = useState<TdsDeductionRecord[]>([]);
  const [showReversalModal, setShowReversalModal] = useState(false);
  const [reversalTargetAlloc, setReversalTargetAlloc] = useState<PaymentAllocationRecord | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [showCreditDebitModal, setShowCreditDebitModal] = useState(false);
  const [cdnType, setCdnType] = useState<'DEBIT_NOTE' | 'CREDIT_NOTE'>('DEBIT_NOTE');
  const [cdnAmount, setCdnAmount] = useState('');
  const [cdnTaxAmount, setCdnTaxAmount] = useState('0');
  const [cdnReason, setCdnReason] = useState('');

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
        const bal = latest.balanceDue ?? (latest.status === 'PAID' ? 0 : latest.amount);
        setPayAmountInput(String(bal > 0 ? bal : latest.amount));
        const [payRes, allocRes, noteRes, tdsRes] = await Promise.all([
          fetchPaymentByInvoice(latest.id),
          fetchInvoiceAllocations(latest.id),
          fetchCreditDebitNotesByInvoice(latest.id),
          fetchTdsDeductionsByInvoice(latest.id),
        ]);
        if (payRes.ok) setPayment(payRes.payment);
        if (allocRes.ok) setAllocations(allocRes.allocations);
        if (noteRes.ok) setInvoiceNotes(noteRes.notes);
        if (tdsRes.ok) setTdsDeductions(tdsRes.deductions);

        if (latest.purchaseOrderId) {
          const poPayRes = await fetchPaymentsByPo(latest.purchaseOrderId);
          if (poPayRes.ok) {
            setPoPayments(poPayRes.payments);
            const firstUnalloc = poPayRes.payments.find((p) => p.unallocatedAmount > 0);
            if (firstUnalloc) {
              setSelectedAdvancePaymentId(firstUnalloc.id);
              const maxAlloc = Math.min(firstUnalloc.unallocatedAmount, bal > 0 ? bal : latest.amount);
              setAdvanceAllocAmountInput(String(maxAlloc));
            }
          }
        }
      } else {
        setPayment(null);
        setPayAmountInput('');
      }
    } else {
      setError(translateError(invsRes.error));
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

  const handleSelectInvoice = async (inv: InvoiceSummary) => {
    setActiveInvoice(inv);
    const bal = inv.balanceDue ?? (inv.status === 'PAID' ? 0 : inv.amount);
    setPayAmountInput(String(bal > 0 ? bal : inv.amount));
    const payRes = await fetchPaymentByInvoice(inv.id);
    if (payRes.ok) {
      setPayment(payRes.payment);
    } else {
      setPayment(null);
    }

    if (inv.purchaseOrderId) {
      const poPayRes = await fetchPaymentsByPo(inv.purchaseOrderId);
      if (poPayRes.ok) {
        setPoPayments(poPayRes.payments);
        const firstUnalloc = poPayRes.payments.find((p) => p.unallocatedAmount > 0);
        if (firstUnalloc) {
          setSelectedAdvancePaymentId(firstUnalloc.id);
          const maxAlloc = Math.min(firstUnalloc.unallocatedAmount, bal > 0 ? bal : inv.amount);
          setAdvanceAllocAmountInput(String(maxAlloc));
        }
      }
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
          hsnCode: hsnCode.trim() || '995411',
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
      setError(translateError(result.error));
      return;
    }

    setSuccess('✓ Official Statutory GST Progressive Invoice submitted successfully!');
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
      setError(translateError(result.error));
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
      setError(translateError(result.error));
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

    const payAmt = Number(payAmountInput);
    if (!payAmt || payAmt <= 0) {
      setError('Payment amount must be strictly greater than 0.');
      return;
    }

    const currentBalDue = activeInvoice.balanceDue ?? (activeInvoice.status === 'PAID' ? 0 : activeInvoice.amount);
    if (payAmt > currentBalDue) {
      setError(`Payment amount ₹${payAmt} exceeds invoice balance due of ₹${currentBalDue}`);
      return;
    }

    setBusy(true);
    setError(null);
    const result = await recordInvoicePayment(
      activeInvoice.id,
      payAmt,
      paymentMethod,
      reference.trim(),
    );
    setBusy(false);
    if (!result.ok) {
      setError(translateError(result.error));
      return;
    }
    setSuccess(
      `✓ Milestone payment of ${formatMoney(payAmt, activeInvoice.currency)} recorded via ${paymentMethod}!`,
    );
    await load();
    onUpdated?.();
  }

  async function handleAllocateAdvance(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!activeInvoice || !selectedAdvancePaymentId) return;

    const allocAmt = Number(advanceAllocAmountInput);
    if (!allocAmt || allocAmt <= 0) {
      setError('Allocation amount must be strictly greater than 0.');
      return;
    }

    const currentBalDue = activeInvoice.balanceDue ?? (activeInvoice.status === 'PAID' ? 0 : activeInvoice.amount);
    if (allocAmt > currentBalDue) {
      setError(`Allocation amount ₹${allocAmt} exceeds invoice balance due of ₹${currentBalDue}`);
      return;
    }

    const selectedPay = poPayments.find((p) => p.id === selectedAdvancePaymentId);
    if (selectedPay && allocAmt > selectedPay.unallocatedAmount) {
      setError(`Allocation amount ₹${allocAmt} exceeds payment unallocated balance of ₹${selectedPay.unallocatedAmount}`);
      return;
    }

    setBusy(true);
    setError(null);
    const result = await allocateAdvancePayment(
      selectedAdvancePaymentId,
      activeInvoice.id,
      allocAmt,
      `Advance balance allocation against invoice ${activeInvoice.invoiceNumber}`,
    );
    setBusy(false);
    if (!result.ok) {
      setError(translateError(result.error));
      return;
    }
    setSuccess(`✓ Successfully allocated ₹${allocAmt} from advance payment against ${activeInvoice.invoiceNumber}!`);
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
      setError(translateError(result.error));
      return;
    }
    setSuccess('✓ Payment verified and milestone settlement confirmed!');
    await load();
    onUpdated?.();
  }

  async function handleConfirmReversal(e: React.FormEvent) {
    e.preventDefault();
    if (!reversalTargetAlloc || !reversalReason.trim()) {
      setError('Please provide a reason for reversal');
      return;
    }

    setBusy(true);
    setError(null);
    const result = await reversePaymentAllocation({
      allocationId: reversalTargetAlloc.id,
      reason: reversalReason.trim(),
    });
    setBusy(false);

    if (!result.ok) {
      setError(translateError(result.error));
      return;
    }

    setSuccess(`✓ Successfully reversed payment allocation of ₹${reversalTargetAlloc.allocatedAmount}`);
    setShowReversalModal(false);
    setReversalTargetAlloc(null);
    setReversalReason('');
    await load();
    onUpdated?.();
  }

  async function handleIssueCreditDebitNote(e: React.FormEvent) {
    e.preventDefault();
    if (!activeInvoice) return;

    const noteAmt = Number(cdnAmount);
    if (!noteAmt || noteAmt <= 0) {
      setError('Note amount must be strictly greater than 0');
      return;
    }

    if (!cdnReason.trim()) {
      setError('Reason is required when issuing a credit or debit note');
      return;
    }

    setBusy(true);
    setError(null);
    const result = await issueCreditDebitNote({
      organizationId: (activeInvoice as any).organizationId || (activeInvoice as any).organization_id || '',
      invoiceId: activeInvoice.id,
      purchaseOrderId: activeInvoice.purchaseOrderId || undefined,
      noteType: cdnType,
      amount: noteAmt,
      taxAmount: Number(cdnTaxAmount || 0),
      reason: cdnReason.trim(),
    });
    setBusy(false);

    if (!result.ok) {
      setError(translateError(result.error));
      return;
    }

    setSuccess(`✓ Successfully issued ${cdnType === 'DEBIT_NOTE' ? 'Debit Note' : 'Credit Note'} (${result.note.noteNumber}) for ₹${noteAmt}!`);
    setShowCreditDebitModal(false);
    setCdnAmount('');
    setCdnTaxAmount('0');
    setCdnReason('');
    await load();
    onUpdated?.();
  }

  async function handleExportTally(pid: string) {
    if (!activeInvoice) return;
    setBusy(true);
    const res = await exportTallyPaymentVoucherXml(pid, activeInvoice.purchaseOrderId || undefined);
    setBusy(false);
    if (!res.ok) {
      setError(translateError(res.error));
      return;
    }
    const blob = new Blob([res.xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tally_Payment_Voucher_${activeInvoice.invoiceNumber}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setSuccess('✓ Tally XML Payment Voucher exported!');
  }

  async function handleExportZoho(pid: string) {
    if (!activeInvoice) return;
    setBusy(true);
    const res = await exportZohoPaymentReceiptJson(pid, activeInvoice.purchaseOrderId || undefined);
    setBusy(false);
    if (!res.ok) {
      setError(translateError(res.error));
      return;
    }
    const jsonStr = JSON.stringify(res.payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Zoho_Payment_Receipt_${activeInvoice.invoiceNumber}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setSuccess('✓ Zoho Books Payment Receipt JSON exported!');
  }

  const effectiveAmount = activeInvoice ? activeInvoice.amount : Number(amount) || poAmount;
  const activeBalDue = activeInvoice?.balanceDue ?? (activeInvoice?.status === 'PAID' ? 0 : activeInvoice?.amount ?? 0);
  const activePaidAmt = activeInvoice?.paidAmount ?? (activeInvoice?.status === 'PAID' ? activeInvoice.amount : 0);
  const payableAmount = activeBalDue > 0 ? activeBalDue : effectiveAmount;

  const baseAmount = activeInvoice?.taxableTotal ?? Math.round(effectiveAmount / 1.18);
  const cgstAmount = activeInvoice?.cgstTotal ?? (activeInvoice?.igstTotal ? 0 : Math.round((effectiveAmount - baseAmount) / 2));
  const sgstAmount = activeInvoice?.sgstTotal ?? (activeInvoice?.igstTotal || activeInvoice?.utgstTotal ? 0 : Math.round((effectiveAmount - baseAmount) / 2));
  const utgstAmount = activeInvoice?.utgstTotal ?? 0;
  const igstAmount = activeInvoice?.igstTotal ?? 0;
  const totalGst = cgstAmount + sgstAmount + utgstAmount + igstAmount || (effectiveAmount - baseAmount);

  // Sanitized dynamic virtual settlement handle
  const virtualAccountCode = `OTP-SETTLE-${workOrderId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

  function getStatusBadge(status: string) {
    if (status === 'PAID') {
      return (
        <span className="rounded-full px-2.5 py-0.5 text-[9px] font-black border bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300">
          ✓ PAID (100%)
        </span>
      );
    }
    if (status === 'PARTIALLY_PAID') {
      return (
        <span className="rounded-full px-2.5 py-0.5 text-[9px] font-black border bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border-amber-300">
          ⚡ PARTIALLY PAID
        </span>
      );
    }
    if (status === 'APPROVED') {
      return (
        <span className="rounded-full px-2.5 py-0.5 text-[9px] font-black border bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-300">
          APPROVED
        </span>
      );
    }
    if (status === 'SUBMITTED') {
      return (
        <span className="rounded-full px-2.5 py-0.5 text-[9px] font-black border bg-slate-100 dark:bg-slate-850 text-slate-800 dark:text-slate-300 border-slate-300">
          SUBMITTED
        </span>
      );
    }
    return (
      <span className="rounded-full px-2.5 py-0.5 text-[9px] font-black border bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border-red-300">
        {status}
      </span>
    );
  }

  return (
    <div className="space-y-4" data-testid="invoice-payment-panel">
      {/* =========================================================================
          PROGRESSIVE INVOICING & REMAINING INVOICEABLE AMOUNT BAR (PHASE 5A/5C)
          ========================================================================= */}
      <section className="rounded-2xl border bg-card p-3.5 sm:p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm">📊</span>
              <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
                Progressive Invoicing &amp; Settlement Ledger (Phase 5C.1)
              </h3>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              PO Authorized: <span className="font-mono font-bold text-foreground">{formatMoney(poAmount, 'INR')}</span> · Invoices: {invoices.length} submitted
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
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

        {/* Invoices List Table with Partial Payment Status & Balance Due */}
        {invoices.length > 0 && (
          <div className="rounded-xl border overflow-hidden pt-1">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b text-[10px] uppercase font-bold text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Invoice #</th>
                    <th className="px-3 py-2">Type / Milestone</th>
                    <th className="px-3 py-2 text-right">Total (₹)</th>
                    <th className="px-3 py-2 text-right">Paid (₹)</th>
                    <th className="px-3 py-2 text-right">Balance (₹)</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {invoices.map((inv) => {
                    const invPaid = inv.paidAmount ?? (inv.status === 'PAID' ? inv.amount : 0);
                    const invBal = inv.balanceDue ?? (inv.status === 'PAID' ? 0 : inv.amount);

                    return (
                      <tr
                        key={inv.id}
                        onClick={() => void handleSelectInvoice(inv)}
                        className={`cursor-pointer transition ${
                          activeInvoice?.id === inv.id ? 'bg-primary/5 font-semibold' : 'hover:bg-muted/20'
                        }`}
                      >
                        <td className="px-3 py-2 font-mono">{inv.invoiceNumber}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {inv.invoiceType} {inv.milestoneId ? '· Linked' : ''}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-foreground">
                          {formatMoney(inv.amount, inv.currency)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-700 dark:text-emerald-400">
                          {formatMoney(invPaid, inv.currency)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-foreground font-semibold">
                          {formatMoney(invBal, inv.currency)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {getStatusBadge(inv.status)}
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* =========================================================================
          STATUTORY TAX BREAKDOWN
          ========================================================================= */}
      <section className="rounded-2xl border bg-card p-3.5 sm:p-4 shadow-2xs space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm">🧾</span>
              <h3 className="text-xs font-extrabold text-foreground uppercase tracking-wider">
                Statutory GST Tax Invoice
              </h3>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Itemization summary, statutory GST tax splitting, and frozen tax snapshot.
            </p>
          </div>
          {activeInvoice && getStatusBadge(activeInvoice.status)}
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
            <div className="rounded-xl border bg-muted/10 p-3 space-y-2 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pb-2 border-b">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Invoice Reference
                  </span>
                  <span className="font-mono font-bold text-foreground">{activeInvoice.invoiceNumber}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Place of Supply (POS)
                  </span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">
                    ✓ State {activeInvoice.placeOfSupplyStateCode || '29'} · ITC Eligible
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Payment Progress
                  </span>
                  <span className="font-mono font-bold text-foreground">
                    Paid: {formatMoney(activePaidAmt, activeInvoice.currency)} / Bal: {formatMoney(activeBalDue, activeInvoice.currency)}
                  </span>
                </div>
              </div>

              {/* Line Items Table */}
              {activeInvoice.lineItems && activeInvoice.lineItems.length > 0 && (
                <div className="rounded-lg border bg-card overflow-hidden my-2">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-muted/60 border-b text-[9px] uppercase font-bold text-muted-foreground">
                      <tr>
                        <th className="px-2.5 py-1.5">Scope &amp; Description</th>
                        <th className="px-2 py-1.5 text-center">HSN/SAC</th>
                        <th className="px-2 py-1.5 text-right">Taxable</th>
                        <th className="px-2 py-1.5 text-right">GST Split</th>
                        <th className="px-2.5 py-1.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {activeInvoice.lineItems.map((li) => (
                        <tr key={li.id}>
                          <td className="px-2.5 py-1.5">{li.description}</td>
                          <td className="px-2 py-1.5 text-center font-mono text-[10px]">{li.hsnCode || '995411'}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{formatMoney(li.taxableAmount, 'INR')}</td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            {li.igstAmount && li.igstAmount > 0 ? (
                              <span>+{formatMoney(li.igstAmount, 'INR')} (IGST)</span>
                            ) : li.utgstAmount && li.utgstAmount > 0 ? (
                              <span>+{formatMoney(li.gstAmount, 'INR')} (CGST+UTGST)</span>
                            ) : (
                              <span>+{formatMoney(li.gstAmount, 'INR')} (CGST+SGST)</span>
                            )}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono font-bold">{formatMoney(li.totalAmount, 'INR')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="space-y-1 text-[11px] pt-1">
                <div className="flex justify-between text-muted-foreground">
                  <span>Taxable Base Value (excl. GST):</span>
                  <span className="font-mono font-semibold text-foreground">{formatMoney(baseAmount, 'INR')}</span>
                </div>

                {igstAmount > 0 ? (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Integrated GST (18% IGST):</span>
                    <span className="font-mono font-semibold text-foreground">+{formatMoney(igstAmount, 'INR')}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Central GST (9% CGST):</span>
                      <span className="font-mono font-semibold text-foreground">+{formatMoney(cgstAmount, 'INR')}</span>
                    </div>
                    {utgstAmount > 0 ? (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Union Territory GST (9% UTGST):</span>
                        <span className="font-mono font-semibold text-foreground">+{formatMoney(utgstAmount, 'INR')}</span>
                      </div>
                    ) : (
                      <div className="flex justify-between text-muted-foreground">
                        <span>State GST (9% SGST):</span>
                        <span className="font-mono font-semibold text-foreground">+{formatMoney(sgstAmount, 'INR')}</span>
                      </div>
                    )}
                  </>
                )}

                <div className="flex justify-between text-muted-foreground border-t pt-1">
                  <span>Total Statutory GST (18%):</span>
                  <span className="font-mono font-semibold text-foreground">+{formatMoney(totalGst, 'INR')}</span>
                </div>

                <div className="flex justify-between border-t pt-1 font-extrabold text-foreground text-xs">
                  <span>Gross Invoice Total:</span>
                  <span className="font-mono text-primary font-black">
                    {formatMoney(activeInvoice.amount, activeInvoice.currency)}
                  </span>
                </div>

                <div className="flex justify-between text-muted-foreground text-xs">
                  <span>Cumulative Paid Amount:</span>
                  <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                    {formatMoney(activePaidAmt, activeInvoice.currency)}
                  </span>
                </div>

                <div className="flex justify-between text-xs font-black text-foreground border-t pt-1">
                  <span>Outstanding Balance Due:</span>
                  <span className="font-mono text-primary font-bold">
                    {formatMoney(activeBalDue, activeInvoice.currency)}
                  </span>
                </div>
              </div>

              {/* Credit & Debit Notes / Financial Adjustments (Phase 5C.3) */}
              <div className="rounded-xl border bg-muted/10 p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between border-b pb-1.5">
                  <span className="font-bold text-foreground text-[11px] flex items-center gap-1.5">
                    <span>📑</span>
                    <span>Financial Adjustments / Credit &amp; Debit Notes</span>
                  </span>
                  {role === 'buyer' && activeInvoice.status !== 'REJECTED' && (
                    <button
                      type="button"
                      onClick={() => setShowCreditDebitModal(true)}
                      className="text-[10px] font-bold text-primary hover:underline"
                    >
                      + Issue Adjustment Note
                    </button>
                  )}
                </div>

                {invoiceNotes.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground">No credit or debit notes issued for this invoice.</p>
                ) : (
                  <div className="space-y-1">
                    {invoiceNotes.map((n) => (
                      <div key={n.id} className="p-1.5 rounded-lg border bg-card flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className={`rounded-full px-1.5 py-0.2 text-[8px] font-black ${n.noteType === 'DEBIT_NOTE' ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'}`}>
                            {n.noteType === 'DEBIT_NOTE' ? 'DEBIT' : 'CREDIT'}
                          </span>
                          <span className="font-mono font-bold">{n.noteNumber}</span>
                          <span className="text-muted-foreground">— {n.reason}</span>
                        </div>
                        <span className="font-mono font-bold">{formatMoney(n.amount, 'INR')}</span>
                      </div>
                    ))}
                  </div>
                )}
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

            {/* Statutory TDS & Form 16A Withholding Panel (Phase 5C.4) */}
            {(activeInvoice.status === 'APPROVED' || activeInvoice.status === 'PARTIALLY_PAID' || activeInvoice.status === 'PAID') && (
              <div className="pt-2">
                <TdsWithholdingPanel
                  organizationId={activeInvoice.organizationId || ''}
                  invoiceId={activeInvoice.id}
                  invoiceNumber={activeInvoice.invoiceNumber}
                  invoiceAmount={activeInvoice.amount}
                  supplierName="Assigned Supplier"
                  existingDeductions={tdsDeductions}
                  isBuyerUser={role === 'buyer'}
                  onDeductionApplied={() => void load()}
                />
              </div>
            )}
          </div>
        )}
      </section>

      {/* =========================================================================
          PAYMENT EXECUTION & SETTLEMENT SECTION
          ========================================================================= */}
      <section className="rounded-2xl border bg-card p-3.5 sm:p-4 shadow-2xs space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm">💳</span>
              <h3 className="text-xs font-extrabold text-foreground uppercase tracking-wider">
                Payment Execution &amp; Settlement
              </h3>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Direct Bank Transfer (NEFT/RTGS), Instant UPI QR, and Partial/Milestone Remittance.
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

        {/* Clean Neutral Settlement Card */}
        <div className="rounded-xl border bg-muted/15 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
              Authorized Settlement Destination
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
                Beneficiary Virtual Settlement Account
              </span>
              <p className="font-mono font-bold text-foreground">{virtualAccountCode}</p>
              <p className="text-[10px] text-muted-foreground">
                IFSC: <span className="font-mono text-foreground">HDFC0000001</span> (HDFC Settlement Node)
              </p>
            </div>

            <div className="p-2.5 rounded-lg border bg-card space-y-1">
              <span className="text-[9px] uppercase font-bold text-muted-foreground block">
                Instant UPI Settlement Handle
              </span>
              <p className="font-mono font-bold text-foreground">otp.settle@hdfcbank</p>
              <p className="text-[10px] text-muted-foreground">
                Merchant: <span className="font-semibold text-foreground">Open Trade Platform Node</span>
              </p>
            </div>
          </div>
        </div>

        {/* State: Buyer payment entry form (when invoice approved or partially paid with balance due) */}
        {activeInvoice && (activeInvoice.status === 'APPROVED' || activeInvoice.status === 'PARTIALLY_PAID') && activeBalDue > 0 && role === 'buyer' && (
          <div className="space-y-4 pt-1">
            {/* Advance Allocation Option (Phase 5C.2): If unallocated advances exist for PO */}
            {(() => {
              const availableAdvances = poPayments.filter((p) => p.unallocatedAmount > 0);
              if (availableAdvances.length === 0) return null;

              return (
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 dark:bg-blue-950/30 p-3.5 space-y-3" data-testid="advance-allocation-card">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                      <span>💡</span>
                      <span>Option A: Settle from Existing Unallocated Advance (Phase 5C.2)</span>
                    </span>
                    <span className="rounded-full bg-blue-600 text-white px-2 py-0.5 text-[9px] font-bold">
                      {availableAdvances.length} Advance{availableAdvances.length > 1 ? 's' : ''} Available
                    </span>
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    Apply existing unallocated advance remittance balance directly to this invoice without initiating a duplicate bank transfer.
                  </p>

                  <form onSubmit={(e) => void handleAllocateAdvance(e)} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-foreground mb-1">
                        Select Advance Remittance
                      </label>
                      <select
                        value={selectedAdvancePaymentId}
                        onChange={(e) => {
                          const pid = e.target.value;
                          setSelectedAdvancePaymentId(pid);
                          const p = availableAdvances.find((adv) => adv.id === pid);
                          if (p) {
                            const maxAlloc = Math.min(p.unallocatedAmount, activeBalDue);
                            setAdvanceAllocAmountInput(String(maxAlloc));
                          }
                        }}
                        className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-primary focus:outline-none min-h-[44px]"
                      >
                        {availableAdvances.map((adv) => (
                          <option key={adv.id} value={adv.id}>
                            {adv.reference ? `${adv.reference} — ` : ''}Available: {formatMoney(adv.unallocatedAmount, adv.currency)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-foreground mb-1">
                        Allocation Amount (₹ INR) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={advanceAllocAmountInput}
                        onChange={(e) => setAdvanceAllocAmountInput(e.target.value)}
                        placeholder={`Max: ₹${activeBalDue}`}
                        className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-mono font-bold focus:ring-2 focus:ring-primary focus:outline-none min-h-[44px]"
                      />
                    </div>

                    <div className="flex items-end">
                      <button
                        type="submit"
                        disabled={busy}
                        className="w-full min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white px-4 py-2 text-xs font-black shadow-xs disabled:opacity-50 transition flex items-center justify-center gap-1.5 mobile-touch-target"
                        data-testid="allocate-advance-button"
                      >
                        <span>⚡</span>
                        <span>{busy ? 'Allocating…' : 'Allocate Advance Balance →'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              );
            })()}

            {/* Direct Remittance Option */}
            <div className="border-t pt-2 space-y-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground block">
                {poPayments.some((p) => p.unallocatedAmount > 0) ? 'Option B: Record New Direct Remittance' : 'Record Direct Remittance'}
              </span>

              <form onSubmit={(e) => void handleRecordPayment(e)} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-foreground mb-1">
                      Settlement Method
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                      {([
                        { id: 'UPI', label: 'UPI' },
                        { id: 'BANK_TRANSFER', label: 'NEFT/RTGS' },
                        { id: 'MANUAL', label: 'Direct' },
                      ] as const).map((method) => (
                        <button
                          key={method.id}
                          type="button"
                          onClick={() => setPaymentMethod(method.id)}
                          className={`min-h-[44px] rounded-xl px-1.5 py-1 text-[10px] font-black transition border mobile-touch-target flex items-center justify-center text-center ${
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
                      Payment Amount (₹ INR) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={payAmountInput}
                      onChange={(e) => setPayAmountInput(e.target.value)}
                      placeholder={`Max: ₹${activeBalDue}`}
                      className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-mono font-bold focus:ring-2 focus:ring-primary focus:outline-none min-h-[44px]"
                    />
                    <span className="text-[10px] text-muted-foreground block mt-0.5">
                      Balance Due: <strong className="text-primary">{formatMoney(activeBalDue, 'INR')}</strong>
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-foreground mb-1">
                      UTR / Reference ID <span className="text-red-500">*</span>
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

                {/* Authoritative Action: [ 💳 Record Milestone Payment ] */}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full min-h-[44px] rounded-xl bg-emerald-700 px-5 py-3 text-xs font-black text-white shadow-md hover:bg-emerald-800 active:scale-98 disabled:opacity-50 transition flex items-center justify-center gap-2 mobile-touch-target"
                  data-testid="release-milestone-payment-button"
                >
                  <span>💳</span>
                  <span>
                    {busy
                      ? 'Recording Settlement…'
                      : `Record Direct Payment (${formatMoney(Number(payAmountInput) || activeBalDue, activeInvoice.currency)}) →`}
                  </span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* State: Payment is recorded, awaiting dual-signoff verification */}
        {payment && payment.status === 'RECORDED' && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 dark:bg-blue-950/40 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-extrabold text-xs text-blue-950 dark:text-blue-200">
                Payment Recorded — Awaiting Dual-Signoff Verification
              </span>
              <span className="font-mono text-xs font-bold text-blue-900 dark:text-blue-300">
                Ref: {payment.reference}
              </span>
            </div>
            <p className="text-[11px] text-blue-800 dark:text-blue-300">
              Amount of {formatMoney(payment.amount, payment.currency)} transmitted via {payment.method}. Click below to confirm bank ledger match and verify settlement.
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
        {activeInvoice && activeInvoice.status === 'PAID' && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/40 p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏁</span>
                <span className="font-black text-xs text-emerald-950 dark:text-emerald-200">
                  Invoice Settled &amp; Paid (100%)
                </span>
              </div>
              <span className="rounded-full bg-emerald-600 text-white px-2.5 py-0.5 text-[10px] font-black">
                PAID
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
              <div>
                <span className="text-muted-foreground block">Settled Amount</span>
                <span className="font-mono font-bold text-foreground">
                  {formatMoney(activeInvoice.amount, activeInvoice.currency)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block">Remaining Balance</span>
                <span className="font-mono font-bold text-foreground">₹0.00</span>
              </div>
            </div>
          </div>
        )}

        {/* Payment Allocations & Reversals Lifecycle (Phase 5C.3) */}
        {allocations.length > 0 && (
          <div className="rounded-xl border bg-card p-3 space-y-2 text-xs">
            <span className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground block">
              Payment Allocations &amp; Settlement Reversals (Phase 5C.3)
            </span>
            <div className="space-y-1.5">
              {allocations.map((alloc) => (
                <div key={alloc.id} className="p-2 rounded-lg border bg-muted/10 flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold">{formatMoney(alloc.allocatedAmount, 'INR')}</span>
                      <span className={`rounded-full px-1.5 py-0.2 text-[8px] font-black ${alloc.status === 'ALLOCATED' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'}`}>
                        {alloc.status}
                      </span>
                    </div>
                    {alloc.notes && <p className="text-[10px] text-muted-foreground">{alloc.notes}</p>}
                  </div>

                  {role === 'buyer' && alloc.status === 'ALLOCATED' && (
                    <button
                      type="button"
                      onClick={() => {
                        setReversalTargetAlloc(alloc);
                        setReversalReason('');
                        setShowReversalModal(true);
                      }}
                      className="min-h-[30px] rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 text-red-700 dark:text-red-300 px-2 py-1 text-[10px] font-bold transition"
                      data-testid="reverse-allocation-btn"
                    >
                      ↩ Reverse Allocation
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dual-Rail ERP Payment Voucher Export Buttons */}
        {payment && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/60">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleExportTally(payment.id)}
              className="min-h-[34px] rounded-lg border bg-background hover:bg-muted/40 px-2.5 py-1 text-[11px] font-bold text-foreground inline-flex items-center gap-1 transition disabled:opacity-50"
              title="Export Tally Prime XML payment voucher"
              data-testid="invoice-export-tally-btn"
            >
              <span>📥</span>
              <span>Export Tally Voucher (XML)</span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => void handleExportZoho(payment.id)}
              className="min-h-[34px] rounded-lg border bg-background hover:bg-muted/40 px-2.5 py-1 text-[11px] font-bold text-foreground inline-flex items-center gap-1 transition disabled:opacity-50"
              title="Export Zoho Books JSON receipt payload"
              data-testid="invoice-export-zoho-btn"
            >
              <span>🧾</span>
              <span>Export Zoho Receipt (JSON)</span>
            </button>
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
                <span>Submit Statutory GST Progressive Invoice (Phase 5B)</span>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-foreground mb-1">
                    HSN / SAC Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={hsnCode}
                    onChange={(e) => setHsnCode(e.target.value)}
                    placeholder="e.g. 995473 or 8413"
                    className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-mono font-bold focus:ring-2 focus:ring-primary focus:outline-none min-h-[44px]"
                  />
                  <span className="text-[10px] text-muted-foreground block mt-0.5">
                    SAC 995473 (Painting/Const) · HSN 8413 (Pumps)
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-foreground mb-1">
                    Gross Invoice Amount (₹ INR) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`Max Remaining: ₹${invoicingCalc.remainingInvoiceableAmount}`}
                    className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-mono font-bold focus:ring-2 focus:ring-primary focus:outline-none min-h-[44px]"
                  />
                  <span className="text-[10px] text-muted-foreground block mt-0.5">
                    Remaining: <strong className="text-primary">{formatMoney(invoicingCalc.remainingInvoiceableAmount, 'INR')}</strong>
                  </span>
                </div>
              </div>

              {/* Live Statutory Preview */}
              {Number(amount) > 0 && (
                <div className="rounded-xl border bg-muted/20 p-3 text-xs space-y-1">
                  <div className="flex justify-between text-muted-foreground text-[11px]">
                    <span>Taxable Base Value (excl. GST):</span>
                    <span className="font-mono font-semibold text-foreground">
                      {formatMoney(Math.round(Number(amount) / 1.18), 'INR')}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground text-[11px]">
                    <span>Statutory GST (18% IGST / CGST+SGST):</span>
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

      {/* Dynamic Neutral UPI QR Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 shadow-2xl text-center space-y-4">
            <h3 className="text-sm font-black text-foreground">Scan UPI QR to Remit</h3>
            <div className="bg-white p-4 rounded-xl border inline-block">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                  `upi://pay?pa=otp.settle@hdfcbank&pn=OTP+Settlement&am=${payableAmount}&cu=INR`,
                )}`}
                alt="UPI QR Code"
                className="w-44 h-44 mx-auto"
              />
            </div>
            <p className="font-mono text-xs font-bold text-foreground">otp.settle@hdfcbank</p>
            <p className="font-mono text-sm font-black text-primary">{formatMoney(payableAmount, 'INR')}</p>
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

      {/* Payment Allocation Reversal Confirmation Modal (Phase 5C.3) */}
      {showReversalModal && reversalTargetAlloc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-2.5">
              <h3 className="text-sm font-black text-foreground flex items-center gap-1.5 text-red-600">
                <span>↩</span>
                <span>Reverse Payment Allocation (Phase 5C.3)</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowReversalModal(false);
                  setReversalTargetAlloc(null);
                }}
                className="text-muted-foreground hover:text-foreground text-sm p-1"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1.5 text-xs text-amber-900 dark:text-amber-200">
              <p className="font-bold">⚠️ Warning: Financial Settlement Reversal</p>
              <p>
                Reversing this allocation of <span className="font-mono font-bold">{formatMoney(reversalTargetAlloc.allocatedAmount, 'INR')}</span> will restore the payment unallocated balance and increment the invoice balance due.
              </p>
            </div>

            <form onSubmit={(e) => void handleConfirmReversal(e)} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-foreground mb-1">
                  Reversal Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="e.g. Disputed line item inspection, erroneous payment assignment"
                  className="w-full rounded-xl border bg-background p-2.5 text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowReversalModal(false);
                    setReversalTargetAlloc(null);
                  }}
                  className="min-h-[40px] rounded-xl border px-3 py-1.5 text-xs font-bold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !reversalReason.trim()}
                  className="min-h-[40px] rounded-xl bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 text-xs font-black shadow-xs disabled:opacity-50"
                  data-testid="confirm-reversal-btn"
                >
                  {busy ? 'Reversing…' : 'Confirm Allocation Reversal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Credit / Debit Note Issuance Modal (Phase 5C.3) */}
      {showCreditDebitModal && activeInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-2.5">
              <h3 className="text-sm font-black text-foreground flex items-center gap-1.5">
                <span>📑</span>
                <span>Issue Financial Adjustment Note (Phase 5C.3)</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowCreditDebitModal(false)}
                className="text-muted-foreground hover:text-foreground text-sm p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={(e) => void handleIssueCreditDebitNote(e)} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-foreground mb-1">
                  Adjustment Type
                </label>
                <select
                  value={cdnType}
                  onChange={(e) => setCdnType(e.target.value as any)}
                  className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-primary focus:outline-none min-h-[40px]"
                >
                  <option value="DEBIT_NOTE">DEBIT NOTE (Price Reduction / Deductions)</option>
                  <option value="CREDIT_NOTE">CREDIT NOTE (Additional Payable / Adjustment)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-foreground mb-1">
                    Amount (₹ INR) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={cdnAmount}
                    onChange={(e) => setCdnAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-mono font-bold focus:ring-2 focus:ring-primary focus:outline-none min-h-[40px]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-foreground mb-1">
                    Tax Amount (₹ INR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={cdnTaxAmount}
                    onChange={(e) => setCdnTaxAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-mono font-bold focus:ring-2 focus:ring-primary focus:outline-none min-h-[40px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-foreground mb-1">
                  Reason for Adjustment <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={cdnReason}
                  onChange={(e) => setCdnReason(e.target.value)}
                  placeholder="e.g. Material quality deficiency deduction"
                  className="w-full rounded-xl border bg-background p-2.5 text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreditDebitModal(false)}
                  className="min-h-[40px] rounded-xl border px-3 py-1.5 text-xs font-bold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !cdnAmount || !cdnReason.trim()}
                  className="min-h-[40px] rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-1.5 text-xs font-black shadow-xs disabled:opacity-50"
                  data-testid="submit-cdn-btn"
                >
                  {busy ? 'Issuing…' : 'Issue Adjustment Note →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
