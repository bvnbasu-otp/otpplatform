import { deriveInvoiceTdsBase } from '@otp/domain';

/**
 * Single source of truth for the post-award settlement journey on a purchase order.
 *
 * OTP never collects, holds or settles money: the buyer pays the supplier directly
 * (bank transfer / UPI) and records the UTR here. During the pilot no payment is
 * processed by the platform at all, so no action may read "Pay now" or imply that
 * funds pass through OTP.
 */

export type FulfillmentTab = 'OVERVIEW' | 'MILESTONES' | 'INVOICE' | 'PAYMENT';

export interface SettlementInvoiceState {
  id?: string;
  status: string;
  amount: number;
  paidAmount?: number | null;
  balanceDue?: number | null;
}

export interface SettlementStateInput {
  role: 'buyer' | 'supplier';
  poStatus: string;
  hasWorkOrder: boolean;
  workOrderStatus?: string | null;
  progressPercent: number;
  inspectionAccepted: boolean;
  invoices: SettlementInvoiceState[];
  /** A recorded off-platform payment is waiting for the buyer's ledger verification. */
  hasPaymentAwaitingVerification: boolean;
  isFullySettled: boolean;
}

export type SettlementActionKind =
  | 'PO_CANCELLED'
  | 'PO_CLOSED'
  | 'DISPUTE_OPEN'
  | 'START_TRACKING'
  | 'REPORT_PROGRESS'
  | 'AWAIT_DELIVERY'
  | 'SIGN_OFF_DELIVERY'
  | 'AWAIT_DELIVERY_SIGNOFF'
  | 'SUBMIT_INVOICE'
  | 'AWAIT_INVOICE'
  | 'REVIEW_INVOICE'
  | 'AWAIT_INVOICE_APPROVAL'
  | 'VERIFY_PAYMENT'
  | 'AWAIT_PAYMENT_VERIFICATION'
  | 'RECORD_OFF_PLATFORM_PAYMENT'
  | 'AWAIT_BUYER_PAYMENT'
  | 'COMPLETE_PO'
  | 'AWAIT_PO_CLOSURE';

export interface SettlementAction {
  kind: SettlementActionKind;
  label: string;
  description: string;
  /** False when the viewer is waiting on the counterparty; rendered as a disabled status. */
  actionable: boolean;
  /** Tab that owns the inline control for this action, if any. */
  targetTab: FulfillmentTab | null;
}

export const RECORD_OFF_PLATFORM_PAYMENT_LABEL = 'Record Off-Platform Payment';

const OFF_PLATFORM_NOTE =
  'Pay the supplier directly by bank transfer or UPI, then record the UTR here. OTP does not collect, hold or settle funds.';

function balanceOf(inv: SettlementInvoiceState): number {
  if (inv.balanceDue != null) return Math.max(0, Number(inv.balanceDue) || 0);
  return inv.status === 'PAID' ? 0 : Math.max(0, Number(inv.amount) || 0);
}

function isLiveInvoice(inv: SettlementInvoiceState): boolean {
  return inv.status !== 'REJECTED' && inv.status !== 'CANCELLED' && inv.status !== 'DRAFT';
}

export function resolveSettlementAction(state: SettlementStateInput): SettlementAction {
  const buyer = state.role === 'buyer';
  const invoices = state.invoices.filter(isLiveInvoice);

  if (state.poStatus === 'CANCELLED') {
    return { kind: 'PO_CANCELLED', label: 'Purchase Order Cancelled', description: 'No settlement is due on a cancelled purchase order.', actionable: false, targetTab: null };
  }
  if (state.poStatus === 'COMPLETED') {
    return { kind: 'PO_CLOSED', label: 'Purchase Order Closed', description: 'All invoices are paid and the contract is closed.', actionable: false, targetTab: null };
  }
  if (state.workOrderStatus === 'DISPUTED') {
    return { kind: 'DISPUTE_OPEN', label: 'Settlement Paused — Dispute Open', description: 'Resolve the open dispute before recording further settlement.', actionable: false, targetTab: 'MILESTONES' };
  }
  if (!state.hasWorkOrder) {
    return { kind: 'START_TRACKING', label: 'Initialize Milestones', description: 'Start milestone tracking before invoicing and settlement.', actionable: true, targetTab: 'MILESTONES' };
  }

  if (state.hasPaymentAwaitingVerification) {
    return buyer
      ? { kind: 'VERIFY_PAYMENT', label: 'Verify Recorded Payment', description: 'Match the recorded UTR against your bank statement and confirm it.', actionable: true, targetTab: 'PAYMENT' }
      : { kind: 'AWAIT_PAYMENT_VERIFICATION', label: 'Awaiting Buyer Payment Verification', description: 'The buyer has recorded a direct payment and is verifying it.', actionable: false, targetTab: 'PAYMENT' };
  }

  if (invoices.some((inv) => (inv.status === 'APPROVED' || inv.status === 'PARTIALLY_PAID') && balanceOf(inv) > 0)) {
    return buyer
      ? { kind: 'RECORD_OFF_PLATFORM_PAYMENT', label: RECORD_OFF_PLATFORM_PAYMENT_LABEL, description: OFF_PLATFORM_NOTE, actionable: true, targetTab: 'PAYMENT' }
      : { kind: 'AWAIT_BUYER_PAYMENT', label: 'Awaiting Direct Payment from Buyer', description: 'The buyer pays you directly and records the UTR on OTP.', actionable: false, targetTab: 'PAYMENT' };
  }

  if (invoices.some((inv) => inv.status === 'SUBMITTED')) {
    return buyer
      ? { kind: 'REVIEW_INVOICE', label: 'Review & Approve Invoice', description: 'Check the GST invoice against delivered milestones.', actionable: true, targetTab: 'INVOICE' }
      : { kind: 'AWAIT_INVOICE_APPROVAL', label: 'Awaiting Invoice Approval', description: 'The buyer is reviewing your submitted invoice.', actionable: false, targetTab: 'INVOICE' };
  }

  if (state.isFullySettled && invoices.length > 0) {
    return buyer
      ? { kind: 'COMPLETE_PO', label: 'Complete Purchase Order', description: 'Every invoice is paid in full. Close the contract.', actionable: true, targetTab: null }
      : { kind: 'AWAIT_PO_CLOSURE', label: 'Awaiting Buyer Closure', description: 'All invoices are paid; the buyer closes the purchase order.', actionable: false, targetTab: null };
  }

  if (!state.inspectionAccepted) {
    if (state.progressPercent < 100) {
      return buyer
        ? { kind: 'AWAIT_DELIVERY', label: `Awaiting Delivery (${state.progressPercent}%)`, description: 'The supplier is executing milestones.', actionable: false, targetTab: 'MILESTONES' }
        : { kind: 'REPORT_PROGRESS', label: `Report Next Milestone (${state.progressPercent}%)`, description: 'Record progress on the next milestone.', actionable: true, targetTab: 'MILESTONES' };
    }
    return buyer
      ? { kind: 'SIGN_OFF_DELIVERY', label: 'Sign Off Delivery Inspection', description: 'Inspect the delivered work and sign off.', actionable: true, targetTab: 'MILESTONES' }
      : { kind: 'AWAIT_DELIVERY_SIGNOFF', label: 'Awaiting Buyer Inspection Sign-off', description: '100% completion reported; the buyer is inspecting.', actionable: false, targetTab: 'MILESTONES' };
  }

  return buyer
    ? { kind: 'AWAIT_INVOICE', label: 'Awaiting Supplier Invoice', description: 'The supplier submits a GST invoice for the accepted work.', actionable: false, targetTab: 'INVOICE' }
    : { kind: 'SUBMIT_INVOICE', label: 'Submit GST Invoice', description: 'Raise a GST invoice for the accepted work.', actionable: true, targetTab: 'INVOICE' };
}

/**
 * The invoice the panel opens on: the first one the buyer still has to act on
 * (payable, then awaiting approval), otherwise the most recent.
 */
export function pickActionableInvoice<T extends SettlementInvoiceState>(invoices: T[]): T | null {
  const live = invoices.filter(isLiveInvoice);
  return (
    live.find((inv) => (inv.status === 'APPROVED' || inv.status === 'PARTIALLY_PAID') && balanceOf(inv) > 0) ??
    live.find((inv) => inv.status === 'SUBMITTED') ??
    invoices[invoices.length - 1] ??
    null
  );
}

/**
 * Where the one CTA for the current state is rendered. When the active tab already
 * shows the control that performs the action (payment form, verify button, approve
 * button, inspection sign-off, milestone stepper) the sticky bar stays empty so the
 * action appears exactly once.
 */
export function resolveSettlementCtaPlacement(
  action: SettlementAction,
  activeTab: FulfillmentTab,
): 'INLINE' | 'STICKY' {
  if (action.actionable && action.targetTab !== null && action.targetTab === activeTab) {
    return 'INLINE';
  }
  return 'STICKY';
}

// ---------------------------------------------------------------------------
// Completion (sign-off) blockers
// ---------------------------------------------------------------------------

export type CompletionBlockerCode =
  | 'NO_WORK_ORDER'
  | 'MILESTONES_INCOMPLETE'
  | 'INSPECTION_PENDING'
  | 'DISPUTE_OPEN'
  | 'NO_INVOICE'
  | 'INVOICE_AWAITING_APPROVAL'
  | 'INVOICE_UNPAID'
  | 'PAYMENT_UNVERIFIED'
  | 'ALLOCATED_BELOW_PO_TOTAL';

export interface CompletionBlocker {
  code: CompletionBlockerCode;
  message: string;
  /**
   * SERVER: rejected by the database trigger `validate_po_status_transition`
   * (migration 00171). WORKFLOW: checked by this screen only.
   */
  enforcedBy: 'SERVER' | 'WORKFLOW';
  tab: FulfillmentTab;
}

export interface CompletionBlockerInput {
  hasWorkOrder: boolean;
  workOrderStatus?: string | null;
  progressPercent: number;
  inspectionAccepted: boolean;
  invoices: Array<SettlementInvoiceState & { invoiceNumber?: string }>;
  hasPaymentAwaitingVerification: boolean;
  poTotal: number;
  /** Sum of ALLOCATED payment allocations (PoSettlementSummary.cumulativeAllocatedAmount). */
  allocatedTotal: number | null;
  currencyFormatter?: (n: number) => string;
}

export function computeCompletionBlockers(input: CompletionBlockerInput): CompletionBlocker[] {
  const fmt = input.currencyFormatter ?? ((n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`);
  const blockers: CompletionBlocker[] = [];
  const invoices = input.invoices.filter(isLiveInvoice);

  if (input.workOrderStatus === 'DISPUTED') {
    blockers.push({ code: 'DISPUTE_OPEN', message: 'An open dispute on this work order must be resolved.', enforcedBy: 'WORKFLOW', tab: 'MILESTONES' });
  }

  if (!input.hasWorkOrder) {
    blockers.push({ code: 'NO_WORK_ORDER', message: 'Milestone tracking has not been started for this purchase order.', enforcedBy: 'WORKFLOW', tab: 'MILESTONES' });
  } else if (!input.inspectionAccepted) {
    if (input.progressPercent < 100) {
      blockers.push({ code: 'MILESTONES_INCOMPLETE', message: `Milestones are ${input.progressPercent}% complete; the supplier has not reported 100%.`, enforcedBy: 'WORKFLOW', tab: 'MILESTONES' });
    }
    blockers.push({ code: 'INSPECTION_PENDING', message: 'Buyer delivery inspection has not been signed off.', enforcedBy: 'WORKFLOW', tab: 'MILESTONES' });
  }

  if (invoices.length === 0) {
    blockers.push({ code: 'NO_INVOICE', message: 'No invoice has been submitted by the supplier.', enforcedBy: 'SERVER', tab: 'INVOICE' });
  }

  const submitted = invoices.filter((inv) => inv.status === 'SUBMITTED');
  if (submitted.length > 0) {
    const refs = submitted.map((inv) => inv.invoiceNumber).filter(Boolean).join(', ');
    blockers.push({
      code: 'INVOICE_AWAITING_APPROVAL',
      message: `${submitted.length} invoice${submitted.length > 1 ? 's' : ''} awaiting buyer approval${refs ? ` (${refs})` : ''}.`,
      enforcedBy: 'SERVER',
      tab: 'INVOICE',
    });
  }

  const unpaid = invoices.filter((inv) => inv.status !== 'SUBMITTED' && (inv.status !== 'PAID' || balanceOf(inv) > 0));
  if (unpaid.length > 0) {
    const outstanding = unpaid.reduce((s, inv) => s + balanceOf(inv), 0);
    const refs = unpaid.map((inv) => inv.invoiceNumber).filter(Boolean).join(', ');
    blockers.push({
      code: 'INVOICE_UNPAID',
      message: `${unpaid.length} approved invoice${unpaid.length > 1 ? 's are' : ' is'} not fully paid${refs ? ` (${refs})` : ''}: ${fmt(outstanding)} outstanding.`,
      enforcedBy: 'SERVER',
      tab: 'PAYMENT',
    });
  }

  if (input.hasPaymentAwaitingVerification) {
    blockers.push({ code: 'PAYMENT_UNVERIFIED', message: 'A recorded payment is awaiting buyer ledger verification.', enforcedBy: 'WORKFLOW', tab: 'PAYMENT' });
  }

  if (input.allocatedTotal != null && input.poTotal > 0 && input.allocatedTotal < input.poTotal) {
    blockers.push({
      code: 'ALLOCATED_BELOW_PO_TOTAL',
      message: `Payments allocated to invoices total ${fmt(input.allocatedTotal)} against a PO value of ${fmt(input.poTotal)}.`,
      enforcedBy: 'SERVER',
      tab: 'PAYMENT',
    });
  }

  return blockers;
}

// ---------------------------------------------------------------------------
// Invoice & balances review rows
// ---------------------------------------------------------------------------

export interface BalanceInvoiceInput extends SettlementInvoiceState {
  id: string;
  invoiceNumber: string;
  currency?: string;
  taxableTotal?: number | null;
  cgstTotal?: number | null;
  sgstTotal?: number | null;
  utgstTotal?: number | null;
  igstTotal?: number | null;
}

export interface InvoiceBalanceRow {
  id: string;
  invoiceNumber: string;
  status: string;
  gross: number;
  gst: number;
  gstStated: boolean;
  tds: number;
  paid: number;
  /** Balance due on the invoice as stored by the ledger (gross − allocations). */
  outstanding: number;
  /** What the buyer still remits directly: outstanding − live TDS withheld. */
  netPayable: number;
}

export interface InvoiceBalanceTotals {
  gross: number;
  gst: number;
  tds: number;
  paid: number;
  outstanding: number;
  netPayable: number;
  unallocatedAdvances: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function buildInvoiceBalanceRows(
  invoices: BalanceInvoiceInput[],
  tdsByInvoice: Record<string, number>,
  unallocatedAdvances: number,
): { rows: InvoiceBalanceRow[]; totals: InvoiceBalanceTotals } {
  const rows = invoices.filter(isLiveInvoice).map((inv) => {
    const base = deriveInvoiceTdsBase(inv);
    const outstanding = balanceOf(inv);
    const paid = inv.paidAmount != null ? Number(inv.paidAmount) || 0 : Math.max(0, base.grossAmount - outstanding);
    const tds = r2(Math.max(0, tdsByInvoice[inv.id] ?? 0));
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      gross: base.grossAmount,
      gst: base.gstAmount,
      gstStated: base.gstSeparatelyStated,
      tds,
      paid: r2(paid),
      outstanding: r2(outstanding),
      netPayable: r2(Math.max(0, outstanding - tds)),
    };
  });
  const sum = (k: keyof Pick<InvoiceBalanceRow, 'gross' | 'gst' | 'tds' | 'paid' | 'outstanding' | 'netPayable'>) =>
    r2(rows.reduce((s, r) => s + r[k], 0));
  return {
    rows,
    totals: {
      gross: sum('gross'),
      gst: sum('gst'),
      tds: sum('tds'),
      paid: sum('paid'),
      outstanding: sum('outstanding'),
      netPayable: sum('netPayable'),
      unallocatedAdvances: r2(Math.max(0, unallocatedAdvances)),
    },
  };
}

/** Sums non-voided TDS deductions per invoice. */
export function sumLiveTdsByInvoice(deductions: Array<{ invoiceId: string; tdsAmount: number; status: string }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of deductions) {
    if (d.status === 'VOIDED') continue;
    out[d.invoiceId] = r2((out[d.invoiceId] ?? 0) + (Number(d.tdsAmount) || 0));
  }
  return out;
}
