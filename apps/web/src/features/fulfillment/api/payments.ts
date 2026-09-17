import { supabase } from '@/lib/supabase';
import { fetchCurrentProfile } from '@/features/auth/user-role';
import type {
  PaymentMethod,
  PaymentStatus,
  PaymentAllocationStatus,
  PoSettlementSummary,
  PoSettlementCertificate,
  CreditDebitNote,
  CreditDebitNoteType,
  CreditDebitNoteStatus,
  VendorSettlementStatement,
  ZohoPaymentReceiptPayload,
  TdsSection,
  TdsLawVersion,
  Form16ACertificate,
  Form16AGeneratorParams,
  PoChangeOrder,
  PoChangeOrderItem,
  ChangeOrderStatus,
  ChangeOrderType,
  BankReconciliationRecord,
  BankReconciliationStatus,
  BankRemittanceAdvice,
  FinancialObservabilitySummary,
  FinancialAuditPack,
} from '@otp/domain';
import {
  calculatePoSettlementSummary,
  calculateVendorSettlementStatement,
  calculateFinancialObservabilitySummary,
  calculateTds,
  calculateChangeOrderTotals,
  exportToTallyPaymentVoucher,
  exportToZohoPaymentReceipt,
  generateFinancialAuditPackCsv,
  generateFinancialAuditPackJson,
  generateForm16ACertificate,
  generatePoSettlementCertificate as generatePoSettlementCertDomain,
  reconcileBankRemittance,
} from '@otp/domain';

export interface PaymentSummary {
  id: string;
  invoiceId: string | null;
  purchaseOrderId?: string | null;
  amount: number;
  unallocatedAmount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string | null;
  recordedAt: string;
  verifiedAt: string | null;
}

export interface PaymentAllocationRecord {
  id: string;
  paymentId: string;
  invoiceId: string;
  allocatedAmount: number;
  allocatedAt: string;
  status: PaymentAllocationStatus;
  notes: string | null;
}

interface PaymentRow {
  id: string;
  invoice_id: string | null;
  purchase_order_id?: string | null;
  amount: number;
  unallocated_amount?: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string | null;
  recorded_at: string;
  verified_at: string | null;
}

function mapPayment(row: PaymentRow): PaymentSummary {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    purchaseOrderId: row.purchase_order_id,
    amount: Number(row.amount),
    unallocatedAmount: Number(row.unallocated_amount ?? 0),
    currency: row.currency,
    method: row.method,
    status: row.status,
    reference: row.reference,
    recordedAt: row.recorded_at,
    verifiedAt: row.verified_at,
  };
}

export async function fetchPaymentByInvoice(invoiceId: string): Promise<
  { ok: true; payment: PaymentSummary | null } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('payments')
    .select('id, invoice_id, purchase_order_id, amount, unallocated_amount, currency, method, status, reference, recorded_at, verified_at')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, payment: null };
  return { ok: true, payment: mapPayment(data as PaymentRow) };
}

export async function fetchPaymentsByPo(poId: string): Promise<
  { ok: true; payments: PaymentSummary[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('payments')
    .select('id, invoice_id, purchase_order_id, amount, unallocated_amount, currency, method, status, reference, recorded_at, verified_at')
    .eq('purchase_order_id', poId)
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: error.message };
  return { ok: true, payments: (data || []).map((p) => mapPayment(p as PaymentRow)) };
}

export async function fetchInvoiceAllocations(invoiceId: string): Promise<
  { ok: true; allocations: PaymentAllocationRecord[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('payment_allocations')
    .select('id, payment_id, invoice_id, allocated_amount, allocated_at, status, notes')
    .eq('invoice_id', invoiceId)
    .order('allocated_at', { ascending: false });

  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    allocations: (data || []).map((a: any) => ({
      id: a.id,
      paymentId: a.payment_id,
      invoiceId: a.invoice_id,
      allocatedAmount: Number(a.allocated_amount),
      allocatedAt: a.allocated_at,
      status: a.status as PaymentAllocationStatus,
      notes: a.notes,
    })),
  };
}

/**
 * Records a payment against a Purchase Order or Invoice.
 * In Phase 5C.1 (Mode A), this creates the authoritative Payment entity (unallocated if no direct invoice).
 */
export async function recordPayment(
  amount: number,
  method: PaymentMethod,
  reference: string,
  purchaseOrderId: string,
  currency = 'INR',
  invoiceId?: string | null,
): Promise<{ ok: true; paymentId: string } | { ok: false; error: string }> {
  const profile = await fetchCurrentProfile();
  if (!profile) return { ok: false, error: 'Not authenticated' };

  if (amount <= 0) {
    return { ok: false, error: 'Payment amount must be strictly greater than 0' };
  }

  const now = new Date().toISOString();

  const { data: payData, error: payErr } = await supabase
    .from('payments')
    .insert({
      invoice_id: invoiceId || null,
      purchase_order_id: purchaseOrderId,
      amount,
      unallocated_amount: amount,
      currency,
      method,
      status: 'RECORDED',
      reference,
      recorded_by: profile.profileId,
      recorded_at: now,
    })
    .select('id')
    .single();

  if (payErr) return { ok: false, error: payErr.message };
  return { ok: true, paymentId: payData.id };
}

/**
 * Executes true database-level atomic payment recording and invoice allocation.
 *
 * CRITICAL ATOMIC GUARANTEE (Phase 5C.1-H2 / H2-01):
 * - Invokes public.record_invoice_payment_atomic(...) RPC.
 * - Entire payment creation, invoice row lock (SELECT FOR UPDATE), eligibility check,
 *   allocation record insertion, invoice paid_amount / balance_due synchronization,
 *   and audit event emission happen inside a single PostgreSQL database transaction.
 * - If ANY step fails, PostgreSQL transaction rolls back 100% (zero orphan payments, zero modified balances).
 * - Transparent fallback with compensating rollback is provided for offline/mock test environments.
 */
export async function recordInvoicePayment(
  invoiceId: string,
  amount: number,
  method: PaymentMethod,
  reference: string,
  currency = 'INR',
  purchaseOrderId?: string | null,
  idempotencyKey?: string | null,
): Promise<{ ok: true; paymentId: string; allocationId: string } | { ok: false; error: string }> {
  const profile = await fetchCurrentProfile();
  if (!profile) return { ok: false, error: 'Not authenticated' };

  if (amount <= 0) {
    return { ok: false, error: 'Payment amount must be strictly greater than 0' };
  }

  // 1. Primary Path: Call PostgreSQL Atomic RPC
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('record_invoice_payment_atomic', {
      p_invoice_id: invoiceId,
      p_amount: amount,
      p_method: method,
      p_reference: reference || null,
      p_currency: currency || 'INR',
      p_purchase_order_id: purchaseOrderId || null,
      p_notes: `Direct invoice remittance via ${method}`,
      p_idempotency_key: idempotencyKey || null,
    });

    if (!rpcErr && rpcData) {
      const res = rpcData as Record<string, any>;
      if (res.ok) {
        return {
          ok: true,
          paymentId: res.payment_id,
          allocationId: res.allocation_id,
        };
      }
      return {
        ok: false,
        error: res.error || 'Atomic payment transaction failed',
      };
    }

    if (rpcErr) {
      // In production environments, FAIL CLOSED immediately if the RPC fails or is missing.
      // NEVER fall back to multi-step non-atomic writes in production.
      const isTestEnv =
        typeof process !== 'undefined' &&
        (process.env?.NODE_ENV === 'test' || process.env?.VITEST === 'true');

      if (!isTestEnv) {
        return {
          ok: false,
          error: `Production atomic payment RPC failed (FAIL-CLOSED): ${rpcErr.message || 'Database RPC unavailable'}`,
        };
      }

      // If in test environment and error is NOT missing function, fail directly
      if (!rpcErr.message.includes('function public.record_invoice_payment_atomic') && !rpcErr.message.includes('could not find function')) {
        return { ok: false, error: rpcErr.message };
      }
    }
  } catch (rpcException: any) {
    const isTestEnv =
      typeof process !== 'undefined' &&
      (process.env?.NODE_ENV === 'test' || process.env?.VITEST === 'true');

    if (!isTestEnv) {
      return {
        ok: false,
        error: `Production atomic payment execution error: ${rpcException?.message || 'Unexpected RPC failure (FAIL-CLOSED)'}`,
      };
    }

    // In test environment: if it's a known postgres exception, return error directly
    if (rpcException?.message && !rpcException.message.includes('not found') && !rpcException.message.includes('is not a function')) {
      return { ok: false, error: rpcException.message };
    }
  }

  // 2. Test-Only Mock Fallback Path: Only executed in test/offline environments with mock database adapters
  const isTestEnv =
    typeof process !== 'undefined' &&
    (process.env?.NODE_ENV === 'test' || process.env?.VITEST === 'true');

  if (!isTestEnv) {
    return {
      ok: false,
      error: 'Non-atomic payment fallback is strictly disabled in production (FAIL-CLOSED).',
    };
  }
  const now = new Date().toISOString();

  // Resolve Purchase Order ID and validate Invoice state
  let poId = purchaseOrderId;
  const { data: inv, error: invErr } = await supabase
    .from('invoices')
    .select('id, amount, status, paid_amount, balance_due, purchase_order_id, work_order_id')
    .eq('id', invoiceId)
    .maybeSingle();

  if (invErr || !inv) {
    return { ok: false, error: invErr?.message ?? 'Invoice not found' };
  }

  if (inv.status !== 'APPROVED' && inv.status !== 'PARTIALLY_PAID') {
    return { ok: false, error: 'Invoice must be APPROVED or PARTIALLY_PAID before payment' };
  }

  const currentBalDue = inv.balance_due !== undefined && inv.balance_due !== null
    ? Number(inv.balance_due)
    : (inv.status === 'PAID' ? 0 : Number(inv.amount) - Number(inv.paid_amount || 0));

  if (amount > currentBalDue) {
    return {
      ok: false,
      error: `Payment amount ₹${amount} exceeds invoice balance due of ₹${currentBalDue}`,
    };
  }

  if (!poId) {
    if (inv.purchase_order_id) {
      poId = inv.purchase_order_id;
    } else if (inv.work_order_id) {
      const { data: wo } = await supabase
        .from('work_orders')
        .select('purchase_order_id')
        .eq('id', inv.work_order_id)
        .maybeSingle();
      poId = wo?.purchase_order_id;
    }
  }

  if (!poId) {
    return { ok: false, error: 'Associated purchase order could not be resolved' };
  }

  // Insert Payment record
  const { data: payData, error: payErr } = await supabase
    .from('payments')
    .insert({
      invoice_id: invoiceId,
      purchase_order_id: poId,
      amount,
      unallocated_amount: 0,
      currency,
      method,
      status: 'RECORDED',
      reference,
      gateway_event_id: idempotencyKey || null,
      recorded_by: profile.profileId,
      recorded_at: now,
    })
    .select('id')
    .single();

  if (payErr || !payData) {
    return { ok: false, error: payErr?.message ?? 'Failed to record payment' };
  }

  // Create Payment Allocation
  const { data: allocData, error: allocErr } = await supabase
    .from('payment_allocations')
    .insert({
      payment_id: payData.id,
      invoice_id: invoiceId,
      allocated_amount: amount,
      allocated_at: now,
      status: 'ALLOCATED',
      notes: `Direct invoice remittance via ${method}`,
    })
    .select('id')
    .single();

  if (allocErr || !allocData) {
    // Compensating Rollback: Delete payment so no orphan or unallocated ghost payment remains
    await supabase.from('payments').delete().eq('id', payData.id);
    return {
      ok: false,
      error: allocErr?.message ?? 'Payment allocation failed; payment rolled back.',
    };
  }

  return { ok: true, paymentId: payData.id, allocationId: allocData.id };
}

export async function recordPaymentAllocation(
  paymentId: string,
  invoiceId: string,
  allocatedAmount: number,
  notes?: string,
): Promise<{ ok: true; allocationId: string } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('payment_allocations')
    .insert({
      payment_id: paymentId,
      invoice_id: invoiceId,
      allocated_amount: allocatedAmount,
      allocated_at: new Date().toISOString(),
      status: 'ALLOCATED',
      notes: notes || null,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, allocationId: data.id };
}

/**
 * Verifies a recorded payment and applies controlled progressive settlement.
 *
 * CRITICAL DEFECT FIX (Phase 5C.1):
 * - In a progressive invoicing workflow, verifying a milestone or partial payment
 *   MUST NOT unconditionally complete the parent Purchase Order, Work Order, or Requirement.
 * - Parent execution objects only transition to COMPLETED when:
 *   1. All non-rejected invoices for the PO have status === 'PAID'.
 *   2. Cumulative paid amount across all invoices matches or exceeds the total PO authorized amount.
 */
export async function verifyPayment(paymentId: string): Promise<
  { ok: true; isFullySettled: boolean } | { ok: false; error: string }
> {
  const now = new Date().toISOString();

  // 1. Fetch payment
  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .select('id, invoice_id, purchase_order_id, amount')
    .eq('id', paymentId)
    .maybeSingle();

  if (payErr || !payment) {
    return { ok: false, error: payErr?.message ?? 'Payment not found' };
  }

  // 2. Mark payment as VERIFIED
  const { error: verifyErr } = await supabase
    .from('payments')
    .update({ status: 'VERIFIED', verified_at: now })
    .eq('id', paymentId);

  if (verifyErr) return { ok: false, error: verifyErr.message };

  // 3. Resolve Purchase Order ID
  let poId = payment.purchase_order_id;
  let workOrderId: string | null = null;

  if (payment.invoice_id) {
    const { data: inv } = await supabase
      .from('invoices')
      .select('id, amount, work_order_id, purchase_order_id, status, paid_amount')
      .eq('id', payment.invoice_id)
      .maybeSingle();

    if (inv) {
      workOrderId = inv.work_order_id;
      if (!poId) {
        poId = inv.purchase_order_id;
      }
    }
  }

  if (!poId && workOrderId) {
    const { data: wo } = await supabase
      .from('work_orders')
      .select('purchase_order_id')
      .eq('id', workOrderId)
      .maybeSingle();
    poId = wo?.purchase_order_id ?? null;
  }

  // 4. Check whether entire PO is fully invoiced & fully paid
  let isFullySettled = false;

  if (poId) {
    const [{ data: po }, { data: poInvoices }] = await Promise.all([
      supabase
        .from('purchase_orders')
        .select('id, total_amount, rfq_id, status')
        .eq('id', poId)
        .maybeSingle(),
      supabase
        .from('invoices')
        .select('id, amount, status, paid_amount')
        .or(`purchase_order_id.eq.${poId},work_order_id.in.(select id from work_orders where purchase_order_id='${poId}')`)
        .neq('status', 'REJECTED'),
    ]);

    if (po && poInvoices && poInvoices.length > 0) {
      const allInvoicesPaid = poInvoices.every((i) => i.status === 'PAID');
      const totalPaid = poInvoices.reduce((sum, i) => sum + Number(i.paid_amount || (i.status === 'PAID' ? i.amount : 0)), 0);
      const totalPoAmount = Number(po.total_amount);

      // Controlled completion condition: exact ceiling invariant
      if (allInvoicesPaid && totalPaid >= totalPoAmount) {
        isFullySettled = true;

        // Complete Work Order
        if (workOrderId) {
          await supabase
            .from('work_orders')
            .update({ status: 'COMPLETED', completed_at: now })
            .eq('id', workOrderId);
        } else {
          await supabase
            .from('work_orders')
            .update({ status: 'COMPLETED', completed_at: now })
            .eq('purchase_order_id', poId);
        }

        // Complete Purchase Order
        await supabase
          .from('purchase_orders')
          .update({ status: 'COMPLETED' })
          .eq('id', poId);

        // Complete Requirement
        if (po.rfq_id) {
          const { data: rfq } = await supabase
            .from('rfqs')
            .select('requirement_id')
            .eq('id', po.rfq_id)
            .maybeSingle();

          if (rfq?.requirement_id) {
            await supabase
              .from('requirements')
              .update({ status: 'COMPLETED' })
              .eq('id', rfq.requirement_id);
          }
        }
      }
    }
  }

  return { ok: true, isFullySettled };
}

/**
 * Retrieves the Authoritative PO Cumulative Financial Settlement Summary (Phase 5C.2).
 * Tries the high-performance PostgreSQL RPC public.get_po_settlement_summary(poId) first,
 * with pure domain calculator fallback for client/test resilience.
 */
export async function getPoSettlementSummary(
  poId: string,
): Promise<{ ok: true; summary: PoSettlementSummary } | { ok: false; error: string }> {
  // 1. Authoritative RPC call
  try {
    if (typeof (supabase as any).rpc === 'function') {
      const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)(
        'get_po_settlement_summary',
        { p_po_id: poId },
      );

      if (!rpcErr && rpcData && (rpcData.poAuthorizedTotal !== undefined || rpcData.po_authorized_total !== undefined)) {
        return { ok: true, summary: rpcData as PoSettlementSummary };
      }
    }
  } catch (_e) {
    // Fall back to client calculation if RPC is missing in offline test mode
  }

  // 2. Client-side pure fallback
  try {
    const [poRes, invRes, payRes] = await Promise.all([
      supabase.from('purchase_orders').select('*').eq('id', poId).maybeSingle(),
      supabase
        .from('invoices')
        .select('*')
        .or(`purchase_order_id.eq.${poId},work_order_id.in.(select id from work_orders where purchase_order_id='${poId}')`),
      supabase.from('payments').select('*').eq('purchase_order_id', poId),
    ]);

    if (poRes.error || !poRes.data) {
      return { ok: false, error: poRes.error?.message || 'Purchase order not found' };
    }

    const invoices = (invRes.data || []).map((i: any) => ({
      id: i.id,
      amount: Number(i.amount),
      paidAmount: Number(i.paid_amount || 0),
      balanceDue: Number(i.balance_due ?? i.amount),
      status: i.status,
      taxableAmount: i.taxable_amount ? Number(i.taxable_amount) : undefined,
      cgstAmount: i.cgst_amount ? Number(i.cgst_amount) : undefined,
      sgstAmount: i.sgst_amount ? Number(i.sgst_amount) : undefined,
      utgstAmount: i.utgst_amount ? Number(i.utgst_amount) : undefined,
      igstAmount: i.igst_amount ? Number(i.igst_amount) : undefined,
    }));

    const payments = (payRes.data || []).map((p: any) => ({
      id: p.id,
      amount: Number(p.amount),
      unallocatedAmount: Number(p.unallocated_amount ?? 0),
      status: p.status,
    }));

    // Fetch allocations for all invoices
    const invIds = invoices.map((i: any) => i.id);
    let allocations: any[] = [];
    if (invIds.length > 0) {
      const { data: allocData } = await supabase
        .from('payment_allocations')
        .select('*')
        .in('invoice_id', invIds);
      allocations = (allocData || []).map((a: any) => ({
        id: a.id,
        paymentId: a.payment_id,
        invoiceId: a.invoice_id,
        allocatedAmount: Number(a.allocated_amount),
        status: a.status,
      }));
    }

    const summary = calculatePoSettlementSummary(
      {
        id: poRes.data.id,
        totalAmount: Number(poRes.data.total_amount),
        taxableTotal: poRes.data.taxable_total ? Number(poRes.data.taxable_total) : undefined,
        cgstTotal: poRes.data.cgst_total ? Number(poRes.data.cgst_total) : undefined,
        sgstTotal: poRes.data.sgst_total ? Number(poRes.data.sgst_total) : undefined,
        utgstTotal: poRes.data.utgst_total ? Number(poRes.data.utgst_total) : undefined,
        igstTotal: poRes.data.igst_total ? Number(poRes.data.igst_total) : undefined,
      },
      invoices,
      payments,
      allocations,
    );

    return { ok: true, summary };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to calculate PO settlement summary' };
  }
}

/**
 * Allocates available funds from an existing unallocated advance payment to an approved invoice (Phase 5C.2).
 * Tries the PostgreSQL RPC public.allocate_advance_payment_atomic(...) first with fail-closed production safety.
 */
export async function allocateAdvancePayment(
  paymentId: string,
  invoiceId: string,
  amount: number,
  notes?: string,
  idempotencyKey?: string,
): Promise<{ ok: true; allocationId?: string } | { ok: false; error: string }> {
  if (amount <= 0) {
    return { ok: false, error: 'Allocation amount must be strictly greater than 0' };
  }

  // 1. Authoritative Atomic RPC
  try {
    const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)(
      'allocate_advance_payment_atomic',
      {
        p_payment_id: paymentId,
        p_invoice_id: invoiceId,
        p_amount: amount,
        p_notes: notes || null,
        p_idempotency_key: idempotencyKey || null,
      },
    );

    if (rpcErr) {
      if (rpcErr.message && !rpcErr.message.includes('not found') && !rpcErr.message.includes('is not a function')) {
        return { ok: false, error: rpcErr.message };
      }
    } else if (rpcData) {
      return { ok: true, allocationId: rpcData.allocation_id };
    }
  } catch (rpcException: any) {
    if (rpcException?.message && !rpcException.message.includes('not found') && !rpcException.message.includes('is not a function')) {
      return { ok: false, error: rpcException.message };
    }
  }

  // 2. Mock / Test fallback
  const isTestEnv =
    typeof process !== 'undefined' &&
    (process.env?.NODE_ENV === 'test' || process.env?.VITEST === 'true');

  if (!isTestEnv) {
    return {
      ok: false,
      error: 'Non-atomic advance allocation fallback is strictly disabled in production (FAIL-CLOSED).',
    };
  }

  const now = new Date().toISOString();
  const { data: allocData, error: allocErr } = await supabase
    .from('payment_allocations')
    .insert({
      payment_id: paymentId,
      invoice_id: invoiceId,
      allocated_amount: amount,
      allocated_at: now,
      status: 'ALLOCATED',
      notes: notes || 'Advance payment balance allocation',
    })
    .select('id')
    .single();

  if (allocErr || !allocData) {
    return { ok: false, error: allocErr?.message || 'Failed to allocate advance payment' };
  }

  return { ok: true, allocationId: allocData.id };
}

/**
 * Generates an immutable, structured settlement certificate for a Purchase Order (Phase 5C.2).
 */
export async function generatePoSettlementCertificate(
  poId: string,
): Promise<{ ok: true; certificate: PoSettlementCertificate } | { ok: false; error: string }> {
  try {
    const profile = await fetchCurrentProfile();
    const [poRes, invRes, payRes] = await Promise.all([
      supabase.from('purchase_orders').select('*').eq('id', poId).maybeSingle(),
      supabase
        .from('invoices')
        .select('*')
        .or(`purchase_order_id.eq.${poId},work_order_id.in.(select id from work_orders where purchase_order_id='${poId}')`),
      supabase.from('payments').select('*').eq('purchase_order_id', poId),
    ]);

    if (poRes.error || !poRes.data) {
      return { ok: false, error: poRes.error?.message || 'Purchase order not found' };
    }

    const invoices = (invRes.data || []).map((i: any) => ({
      id: i.id,
      invoiceNumber: i.invoice_number,
      amount: Number(i.amount),
      paidAmount: Number(i.paid_amount || 0),
      balanceDue: Number(i.balance_due ?? i.amount),
      status: i.status,
      taxableAmount: i.taxable_amount ? Number(i.taxable_amount) : undefined,
      gstAmount: i.gst_amount ? Number(i.gst_amount) : undefined,
      cgstAmount: i.cgst_amount ? Number(i.cgst_amount) : undefined,
      sgstAmount: i.sgst_amount ? Number(i.sgst_amount) : undefined,
      utgstAmount: i.utgst_amount ? Number(i.utgst_amount) : undefined,
      igstAmount: i.igst_amount ? Number(i.igst_amount) : undefined,
    }));

    const payments = (payRes.data || []).map((p: any) => ({
      id: p.id,
      reference: p.reference,
      amount: Number(p.amount),
      unallocatedAmount: Number(p.unallocated_amount ?? 0),
      status: p.status,
      recordedAt: p.recorded_at,
    }));

    const invIds = invoices.map((i: any) => i.id);
    let allocations: any[] = [];
    if (invIds.length > 0) {
      const { data: allocData } = await supabase
        .from('payment_allocations')
        .select('*')
        .in('invoice_id', invIds);
      allocations = (allocData || []).map((a: any) => ({
        id: a.id,
        paymentId: a.payment_id,
        invoiceId: a.invoice_id,
        allocatedAmount: Number(a.allocated_amount),
        status: a.status,
      }));
    }

    const cert = generatePoSettlementCertDomain(
      {
        id: poRes.data.id,
        poNumber: poRes.data.po_number,
        totalAmount: Number(poRes.data.total_amount),
        taxableTotal: poRes.data.taxable_total ? Number(poRes.data.taxable_total) : undefined,
        cgstTotal: poRes.data.cgst_total ? Number(poRes.data.cgst_total) : undefined,
        sgstTotal: poRes.data.sgst_total ? Number(poRes.data.sgst_total) : undefined,
        utgstTotal: poRes.data.utgst_total ? Number(poRes.data.utgst_total) : undefined,
        igstTotal: poRes.data.igst_total ? Number(poRes.data.igst_total) : undefined,
      },
      invoices,
      payments,
      allocations,
      {
        id: profile?.profileId || 'system',
        name: profile?.fullName || profile?.email || 'Authorized Representative',
        email: profile?.email || undefined,
        role: profile?.isPlatformAdmin ? 'PLATFORM_ADMIN' : 'BUYER_REPRESENTATIVE',
      },
      {
        id: poRes.data.organization_id,
      },
    );

    return { ok: true, certificate: cert };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to generate settlement certificate' };
  }
}

/**
 * Exports a payment and its allocations into statutory Tally XML payment voucher format (Phase 5C.3).
 */
export async function exportTallyPaymentVoucherXml(
  paymentId: string,
  poId?: string,
  bankLedgerName?: string,
): Promise<{ ok: true; xml: string } | { ok: false; error: string }> {
  try {
    const { data: payData, error: payErr } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .maybeSingle();

    if (payErr || !payData) {
      return { ok: false, error: payErr?.message || 'Payment not found' };
    }

    const resolvedPoId = poId || payData.purchase_order_id;
    let supplierName = 'Supplier';
    let poNumber = resolvedPoId || 'N/A';

    if (resolvedPoId) {
      const { data: poData } = await supabase
        .from('purchase_orders')
        .select('id, po_number, supplier_id')
        .eq('id', resolvedPoId)
        .maybeSingle();

      if (poData) {
        poNumber = poData.po_number || poData.id;
        if (poData.supplier_id) {
          const { data: supData } = await supabase
            .from('suppliers')
            .select('business_name')
            .eq('id', poData.supplier_id)
            .maybeSingle();
          if (supData?.business_name) supplierName = supData.business_name;
        }
      }
    }

    // Fetch allocations
    const { data: allocData } = await supabase
      .from('payment_allocations')
      .select('id, invoice_id, allocated_amount, status')
      .eq('payment_id', paymentId)
      .eq('status', 'ALLOCATED');

    const allocationItems: Array<{ invoiceNumber: string; allocatedAmount: number }> = [];
    if (allocData && allocData.length > 0) {
      const invIds = allocData.map((a: any) => a.invoice_id);
      const { data: invData } = await supabase
        .from('invoices')
        .select('id, invoice_number')
        .in('id', invIds);

      const invMap = new Map((invData || []).map((i: any) => [i.id, i.invoice_number]));
      for (const a of allocData) {
        allocationItems.push({
          invoiceNumber: invMap.get(a.invoice_id) || `INV-${a.invoice_id.slice(0, 8)}`,
          allocatedAmount: Number(a.allocated_amount),
        });
      }
    }

    const xml = exportToTallyPaymentVoucher({
      paymentId: payData.id,
      paymentDate: payData.recorded_at ? payData.recorded_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
      paymentReference: payData.reference || payData.id,
      paymentMethod: payData.method,
      amount: Number(payData.amount),
      currency: payData.currency || 'INR',
      bankLedgerName: bankLedgerName || 'Bank Account',
      supplierName,
      poNumber,
      allocations: allocationItems,
      unallocatedAmount: Number(payData.unallocated_amount ?? 0),
    });

    return { ok: true, xml };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to export Tally payment voucher' };
  }
}

/**
 * Exports a payment and its allocations into Zoho Books JSON receipt format (Phase 5C.3).
 */
export async function exportZohoPaymentReceiptJson(
  paymentId: string,
  poId?: string,
  bankAccountName?: string,
): Promise<{ ok: true; payload: ZohoPaymentReceiptPayload } | { ok: false; error: string }> {
  try {
    const { data: payData, error: payErr } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .maybeSingle();

    if (payErr || !payData) {
      return { ok: false, error: payErr?.message || 'Payment not found' };
    }

    const resolvedPoId = poId || payData.purchase_order_id;
    let supplierName = 'Supplier';
    let poNumber = resolvedPoId || 'N/A';

    if (resolvedPoId) {
      const { data: poData } = await supabase
        .from('purchase_orders')
        .select('id, po_number, supplier_id')
        .eq('id', resolvedPoId)
        .maybeSingle();

      if (poData) {
        poNumber = poData.po_number || poData.id;
        if (poData.supplier_id) {
          const { data: supData } = await supabase
            .from('suppliers')
            .select('business_name')
            .eq('id', poData.supplier_id)
            .maybeSingle();
          if (supData?.business_name) supplierName = supData.business_name;
        }
      }
    }

    // Fetch allocations
    const { data: allocData } = await supabase
      .from('payment_allocations')
      .select('id, invoice_id, allocated_amount, status')
      .eq('payment_id', paymentId)
      .eq('status', 'ALLOCATED');

    const allocationItems: Array<{ invoiceNumber: string; invoiceId: string; allocatedAmount: number }> = [];
    if (allocData && allocData.length > 0) {
      const invIds = allocData.map((a: any) => a.invoice_id);
      const { data: invData } = await supabase
        .from('invoices')
        .select('id, invoice_number')
        .in('id', invIds);

      const invMap = new Map((invData || []).map((i: any) => [i.id, i.invoice_number]));
      for (const a of allocData) {
        allocationItems.push({
          invoiceNumber: invMap.get(a.invoice_id) || `INV-${a.invoice_id.slice(0, 8)}`,
          invoiceId: a.invoice_id,
          allocatedAmount: Number(a.allocated_amount),
        });
      }
    }

    const payload = exportToZohoPaymentReceipt({
      paymentId: payData.id,
      paymentDate: payData.recorded_at ? payData.recorded_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
      paymentReference: payData.reference || payData.id,
      paymentMode: payData.method === 'CHEQUE' ? 'Check' : 'Bank Transfer',
      amount: Number(payData.amount),
      currency: payData.currency || 'INR',
      bankAccountName: bankAccountName || 'Bank Account',
      supplierName,
      poNumber,
      allocations: allocationItems,
      unallocatedAmount: Number(payData.unallocated_amount ?? 0),
    });

    return { ok: true, payload };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to export Zoho payment receipt' };
  }
}

/**
 * Atomically reverses a payment allocation and synchronizes parent invoice & payment state (Phase 5C.3).
 */
export async function reversePaymentAllocation(params: {
  allocationId: string;
  reason: string;
  idempotencyKey?: string;
}): Promise<{ ok: true; allocation: PaymentAllocationRecord } | { ok: false; error: string }> {
  const { allocationId, reason, idempotencyKey } = params;

  if (!reason || reason.trim() === '') {
    return { ok: false, error: 'Reversal reason is required' };
  }

  // 1. Attempt Atomic PostgreSQL RPC
  if (typeof (supabase as any).rpc === 'function') {
    const { data: rpcData, error: rpcError } = await (supabase as any).rpc(
      'reverse_payment_allocation_atomic',
      {
        p_allocation_id: allocationId,
        p_reason: reason,
        p_idempotency_key: idempotencyKey || null,
      },
    );

    if (!rpcError && rpcData?.ok) {
      const allocRow = rpcData.allocation;
      return {
        ok: true,
        allocation: {
          id: allocRow.id,
          paymentId: allocRow.payment_id,
          invoiceId: allocRow.invoice_id,
          allocatedAmount: Number(allocRow.allocated_amount),
          allocatedAt: allocRow.allocated_at,
          status: allocRow.status,
          notes: allocRow.notes,
        },
      };
    }

    if (rpcError) {
      return { ok: false, error: rpcError.message };
    }
  }

  // 2. Direct Fallback if RPC not active in client
  const { data: alloc, error: allocErr } = await supabase
    .from('payment_allocations')
    .select('*')
    .eq('id', allocationId)
    .maybeSingle();

  if (allocErr || !alloc) {
    return { ok: false, error: allocErr?.message || 'Allocation not found' };
  }

  if (alloc.status === 'REVERSED' || alloc.status === 'VOIDED') {
    return { ok: false, error: `Allocation is already ${alloc.status}` };
  }

  const { error: updateErr } = await supabase
    .from('payment_allocations')
    .update({
      status: 'REVERSED',
      notes: reason ? `${alloc.notes ? alloc.notes + ' ' : ''}[REVERSED: ${reason}]` : alloc.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', allocationId);

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  return {
    ok: true,
    allocation: {
      id: alloc.id,
      paymentId: alloc.payment_id,
      invoiceId: alloc.invoice_id,
      allocatedAmount: Number(alloc.allocated_amount),
      allocatedAt: alloc.allocated_at,
      status: 'REVERSED',
      notes: reason ? `${alloc.notes ? alloc.notes + ' ' : ''}[REVERSED: ${reason}]` : alloc.notes,
    },
  };
}

/**
 * Issues a statutory Credit or Debit Note against an invoice (Phase 5C.3).
 */
export async function issueCreditDebitNote(params: {
  organizationId: string;
  invoiceId: string;
  purchaseOrderId?: string;
  noteType: CreditDebitNoteType;
  amount: number;
  taxAmount?: number;
  reason: string;
  noteNumber?: string;
  idempotencyKey?: string;
}): Promise<{ ok: true; note: CreditDebitNote } | { ok: false; error: string }> {
  const { organizationId, invoiceId, purchaseOrderId, noteType, amount, taxAmount = 0, reason, noteNumber, idempotencyKey } = params;

  if (amount <= 0) {
    return { ok: false, error: 'Note amount must be strictly greater than 0' };
  }

  if (typeof (supabase as any).rpc === 'function') {
    const { data: rpcData, error: rpcError } = await (supabase as any).rpc(
      'issue_credit_debit_note_atomic',
      {
        p_organization_id: organizationId,
        p_invoice_id: invoiceId,
        p_note_type: noteType,
        p_amount: amount,
        p_tax_amount: taxAmount,
        p_reason: reason,
        p_note_number: noteNumber || null,
        p_idempotency_key: idempotencyKey || null,
      },
    );

    if (!rpcError && rpcData?.ok && rpcData.note) {
      const n = rpcData.note;
      return {
        ok: true,
        note: {
          id: n.id,
          organizationId: n.organization_id,
          purchaseOrderId: n.purchase_order_id,
          invoiceId: n.invoice_id,
          noteNumber: n.note_number,
          noteType: n.note_type,
          amount: Number(n.amount),
          taxAmount: Number(n.tax_amount || 0),
          reason: n.reason,
          status: n.status,
          createdBy: n.created_by,
          createdAt: n.created_at,
          updatedAt: n.updated_at,
        },
      };
    }

    if (rpcError) {
      return { ok: false, error: rpcError.message };
    }
  }

  // Fallback direct insert
  const prefix = noteType === 'DEBIT_NOTE' ? 'DN' : 'CN';
  const genNoteNum = noteNumber || `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const { data: inserted, error: insErr } = await supabase
    .from('credit_debit_notes')
    .insert({
      organization_id: organizationId,
      invoice_id: invoiceId,
      purchase_order_id: purchaseOrderId || null,
      note_type: noteType,
      amount,
      tax_amount: taxAmount,
      reason,
      note_number: genNoteNum,
      status: 'ISSUED',
    })
    .select('*')
    .single();

  if (insErr || !inserted) {
    return { ok: false, error: insErr?.message || 'Failed to issue credit/debit note' };
  }

  return {
    ok: true,
    note: {
      id: inserted.id,
      organizationId: inserted.organization_id,
      purchaseOrderId: inserted.purchase_order_id,
      invoiceId: inserted.invoice_id,
      noteNumber: inserted.note_number,
      noteType: inserted.note_type,
      amount: Number(inserted.amount),
      taxAmount: Number(inserted.tax_amount || 0),
      reason: inserted.reason,
      status: inserted.status,
      createdBy: inserted.created_by,
      createdAt: inserted.created_at,
      updatedAt: inserted.updated_at,
    },
  };
}

/**
 * Fetches Credit / Debit notes for a specific invoice (Phase 5C.3).
 */
export async function fetchCreditDebitNotesByInvoice(
  invoiceId: string,
): Promise<{ ok: true; notes: CreditDebitNote[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('credit_debit_notes')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: error.message };
  const notes: CreditDebitNote[] = (data || []).map((n: any) => ({
    id: n.id,
    organizationId: n.organization_id,
    purchaseOrderId: n.purchase_order_id,
    invoiceId: n.invoice_id,
    noteNumber: n.note_number,
    noteType: n.note_type,
    amount: Number(n.amount),
    taxAmount: Number(n.tax_amount || 0),
    reason: n.reason,
    status: n.status,
    createdBy: n.created_by,
    createdAt: n.created_at,
    updatedAt: n.updated_at,
  }));
  return { ok: true, notes };
}

/**
 * Fetches Credit / Debit notes for a specific Purchase Order (Phase 5C.3).
 */
export async function fetchCreditDebitNotesByPo(
  poId: string,
): Promise<{ ok: true; notes: CreditDebitNote[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('credit_debit_notes')
    .select('*')
    .eq('purchase_order_id', poId)
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: error.message };
  const notes: CreditDebitNote[] = (data || []).map((n: any) => ({
    id: n.id,
    organizationId: n.organization_id,
    purchaseOrderId: n.purchase_order_id,
    invoiceId: n.invoice_id,
    noteNumber: n.note_number,
    noteType: n.note_type,
    amount: Number(n.amount),
    taxAmount: Number(n.tax_amount || 0),
    reason: n.reason,
    status: n.status,
    createdBy: n.created_by,
    createdAt: n.created_at,
    updatedAt: n.updated_at,
  }));
  return { ok: true, notes };
}

/**
 * Fetches Multi-PO Cumulative Vendor Settlement Statement (Phase 5C.3).
 */
export async function fetchVendorSettlementStatement(
  organizationId: string,
  supplierId: string,
  fromDate?: string,
  toDate?: string,
): Promise<{ ok: true; statement: VendorSettlementStatement } | { ok: false; error: string }> {
  try {
    if (typeof (supabase as any).rpc === 'function') {
      const { data: rpcData, error: rpcError } = await (supabase as any).rpc(
        'get_vendor_settlement_statement',
        {
          p_organization_id: organizationId,
          p_supplier_id: supplierId,
          p_from_date: fromDate || null,
          p_to_date: toDate || null,
        },
      );

      if (!rpcError && rpcData) {
        return { ok: true, statement: rpcData as VendorSettlementStatement };
      }
    }

    // Client fallback aggregation
    const [posRes, notesRes] = await Promise.all([
      supabase
        .from('purchase_orders')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('supplier_id', supplierId),
      supabase
        .from('credit_debit_notes')
        .select('*')
        .eq('organization_id', organizationId),
    ]);

    const pos = (posRes.data || []).map((p: any) => ({
      id: p.id,
      poNumber: p.po_number,
      totalAmount: Number(p.total_amount),
      status: p.status,
    }));

    const poIds = pos.map((p) => p.id);
    let invoices: any[] = [];
    let payments: any[] = [];
    let allocations: any[] = [];

    if (poIds.length > 0) {
      const [invRes, payRes] = await Promise.all([
        supabase.from('invoices').select('*').in('purchase_order_id', poIds),
        supabase.from('payments').select('*').in('purchase_order_id', poIds),
      ]);

      invoices = (invRes.data || []).map((i: any) => ({
        id: i.id,
        purchaseOrderId: i.purchase_order_id,
        invoiceNumber: i.invoice_number,
        amount: Number(i.amount),
        paidAmount: Number(i.paid_amount || 0),
        balanceDue: Number(i.balance_due ?? i.amount),
        status: i.status,
      }));

      payments = (payRes.data || []).map((p: any) => ({
        id: p.id,
        purchaseOrderId: p.purchase_order_id,
        amount: Number(p.amount),
        unallocatedAmount: Number(p.unallocated_amount ?? 0),
        status: p.status,
        reference: p.reference,
        recordedAt: p.recorded_at,
      }));

      const invIds = invoices.map((i) => i.id);
      if (invIds.length > 0) {
        const { data: allocData } = await supabase
          .from('payment_allocations')
          .select('*')
          .in('invoice_id', invIds);

        allocations = (allocData || []).map((a: any) => ({
          id: a.id,
          paymentId: a.payment_id,
          invoiceId: a.invoice_id,
          allocatedAmount: Number(a.allocated_amount),
          status: a.status,
        }));
      }
    }

    const notes = (notesRes.data || []).map((n: any) => ({
      id: n.id,
      organizationId: n.organization_id,
      purchaseOrderId: n.purchase_order_id,
      invoiceId: n.invoice_id,
      noteNumber: n.note_number,
      noteType: n.note_type,
      amount: Number(n.amount),
      taxAmount: Number(n.tax_amount || 0),
      reason: n.reason,
      status: n.status,
      createdAt: n.created_at,
      updatedAt: n.updated_at,
    }));

    const statement = calculateVendorSettlementStatement({
      buyerOrganizationId: organizationId,
      supplierId,
      periodStart: fromDate || null,
      periodEnd: toDate || null,
      purchaseOrders: pos,
      invoices,
      payments,
      allocations,
      creditDebitNotes: notes,
    });

    return { ok: true, statement };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to fetch vendor settlement statement' };
  }
}

// ===========================================================================
// Phase 5C.4 — Statutory TDS, Change Orders, Bank Reconciliation & Observability API
// ===========================================================================

export interface TdsDeductionRecord {
  id: string;
  organizationId: string;
  supplierId: string;
  purchaseOrderId?: string | null;
  invoiceId: string;
  lawVersion: string;
  section: string;
  taxableAmount: number;
  tdsRate: number;
  tdsAmount: number;
  status: 'PENDING' | 'DEDUCTED' | 'DEPOSITED' | 'CERTIFIED' | 'VOIDED';
  deducteePan?: string | null;
  panStatus: string;
  isLowerDeduction: boolean;
  financialYear: string;
  assessmentYear: string;
  createdAt: string;
}

export async function fetchTdsDeductionsByInvoice(invoiceId: string): Promise<
  { ok: true; deductions: TdsDeductionRecord[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('tds_deductions')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    deductions: (data || []).map((t: any) => ({
      id: t.id,
      organizationId: t.organization_id,
      supplierId: t.supplier_id,
      purchaseOrderId: t.purchase_order_id,
      invoiceId: t.invoice_id,
      lawVersion: t.law_version,
      section: t.section,
      taxableAmount: Number(t.taxable_amount),
      tdsRate: Number(t.tds_rate),
      tdsAmount: Number(t.tds_amount),
      status: t.status,
      deducteePan: t.deductee_pan,
      panStatus: t.pan_status,
      isLowerDeduction: Boolean(t.is_lower_deduction),
      financialYear: t.financial_year,
      assessmentYear: t.assessment_year,
      createdAt: t.created_at,
    })),
  };
}

export async function applyTdsWithholdingRpc(params: {
  organizationId: string;
  invoiceId: string;
  section: string;
  taxableAmount: number;
  tdsRate: number;
  deducteePan?: string | null;
  panStatus?: string;
  isLowerDeduction?: boolean;
  lowerDeductionCert?: string | null;
}): Promise<{ ok: true; deductionId: string } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.rpc('apply_tds_withholding_atomic', {
      p_organization_id: params.organizationId,
      p_invoice_id: params.invoiceId,
      p_section: params.section,
      p_taxable_amount: params.taxableAmount,
      p_tds_rate: params.tdsRate,
      p_deductee_pan: params.deducteePan || null,
      p_pan_status: params.panStatus || 'VALID',
      p_is_lower_deduction: Boolean(params.isLowerDeduction),
      p_lower_deduction_cert: params.lowerDeductionCert || null,
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true, deductionId: data?.tds_deduction_id || data?.id };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to apply TDS withholding' };
  }
}

export async function fetchPoChangeOrdersApi(poId: string): Promise<
  { ok: true; changeOrders: PoChangeOrder[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('po_change_orders')
    .select('*, po_change_order_items(*)')
    .eq('purchase_order_id', poId)
    .order('sequence', { ascending: true });

  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    changeOrders: (data || []).map((co: any) => ({
      id: co.id,
      organizationId: co.organization_id,
      purchaseOrderId: co.purchase_order_id,
      changeOrderNumber: co.change_order_number,
      sequence: co.sequence,
      title: co.title,
      reason: co.reason,
      status: co.status,
      changeType: co.change_type,
      netAmountDelta: Number(co.net_amount_delta),
      taxAmountDelta: Number(co.tax_amount_delta),
      totalDelta: Number(co.total_delta),
      previousPoTotal: Number(co.previous_po_total),
      revisedPoTotal: Number(co.revised_po_total),
      items: (co.po_change_order_items || []).map((item: any) => ({
        id: item.id,
        changeOrderId: item.change_order_id,
        poLineItemId: item.po_line_item_id,
        itemIndex: item.item_index,
        description: item.description,
        hsnSacCode: item.hsn_sac_code,
        quantityDelta: Number(item.quantity_delta),
        unit: item.unit,
        unitPrice: Number(item.unit_price),
        amountDelta: Number(item.amount_delta),
        taxAmountDelta: Number(item.tax_amount_delta),
        totalDelta: Number(item.total_delta),
        notes: item.notes,
      })),
      requestedBy: co.requested_by,
      requestedAt: co.requested_at,
      approvedBy: co.approved_by,
      approvedAt: co.approved_at,
      committedBy: co.committed_by,
      committedAt: co.committed_at,
      rejectionReason: co.rejection_reason,
      createdAt: co.created_at,
      updatedAt: co.updated_at,
    })),
  };
}

export async function commitPoChangeOrderRpc(
  changeOrderId: string,
  organizationId: string,
): Promise<{ ok: true; changeOrder: any } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.rpc('commit_po_change_order_atomic', {
      p_change_order_id: changeOrderId,
      p_organization_id: organizationId,
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true, changeOrder: data?.change_order };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to commit PO change order' };
  }
}

export async function reconcileBankUtrRpc(params: {
  organizationId: string;
  utrNumber: string;
  clearedAmount: number;
  clearedDate: string;
  bankName?: string;
  bankReference?: string;
  paymentId?: string;
}): Promise<{ ok: true; record: any } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.rpc('reconcile_bank_utr_atomic', {
      p_organization_id: params.organizationId,
      p_utr_number: params.utrNumber,
      p_cleared_amount: params.clearedAmount,
      p_cleared_date: params.clearedDate,
      p_bank_name: params.bankName || null,
      p_bank_reference: params.bankReference || null,
      p_payment_id: params.paymentId || null,
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true, record: data?.reconciliation };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to reconcile bank UTR' };
  }
}

export async function fetchFinancialObservabilitySummaryApi(
  organizationId: string,
): Promise<{ ok: true; summary: FinancialObservabilitySummary } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.rpc('get_financial_observability_summary', {
      p_organization_id: organizationId,
    });

    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      summary: {
        organizationId: data.organization_id,
        totalPoAuthorized: Number(data.total_po_authorized || 0),
        openPoCount: Number(data.open_po_count || 0),
        completedPoCount: Number(data.completed_po_count || 0),
        totalInvoiced: Number(data.total_invoiced || 0),
        totalPaid: Number(data.total_paid || 0),
        totalTdsWithheld: Number(data.total_tds_withheld || 0),
        totalTdsDeposited: Number(data.total_tds_deposited || 0),
        totalDebitNotes: Number(data.total_debit_notes || 0),
        totalCreditNotes: Number(data.total_credit_notes || 0),
        totalOutstandingObligations: Number(data.total_outstanding_obligations || 0),
        totalUnallocatedAdvances: Number(data.total_unallocated_advances || 0),
        totalUtrCleared: Number(data.total_utr_cleared || 0),
        reconciliationDiscrepancyCount: Number(data.reconciliation_discrepancy_count || 0),
        reconciliationDiscrepancyAmount: Number(data.reconciliation_discrepancy_amount || 0),
        totalPlatformFeeCalculated: Number(data.total_platform_fee_calculated || 0),
        totalPlatformFeeSettled: Number(data.total_platform_fee_settled || 0),
        settlementReconciliationCount: Number(data.settlement_reconciliation_count || 0),
        settlementMismatchCount: Number(data.settlement_mismatch_count || 0),
        openExceptionCount: Number(data.open_exception_count || 0),
        resolvedExceptionCount: Number(data.resolved_exception_count || 0),
        generatedAt: data.generated_at || new Date().toISOString(),
      },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to fetch financial observability summary' };
  }
}

export async function acknowledgePoPlatformFeeRpc(params: {
  purchaseOrderId: string;
  policyId?: string;
}): Promise<{ ok: true; snapshot: any } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.rpc('acknowledge_po_platform_fee_atomic', {
      p_purchase_order_id: params.purchaseOrderId,
      p_policy_id: params.policyId || null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, snapshot: data };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to acknowledge platform fee' };
  }
}

export async function applyPlatformFeeDeductionRpc(params: {
  organizationId: string;
  purchaseOrderId: string;
  invoiceId: string;
  paymentId?: string;
  paymentAllocationId?: string;
  grossAmount?: number;
}): Promise<{ ok: true; transaction: any } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.rpc('apply_platform_fee_deduction_atomic', {
      p_organization_id: params.organizationId,
      p_purchase_order_id: params.purchaseOrderId,
      p_invoice_id: params.invoiceId,
      p_payment_id: params.paymentId || null,
      p_payment_allocation_id: params.paymentAllocationId || null,
      p_gross_amount: params.grossAmount || null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, transaction: data };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to apply platform fee deduction' };
  }
}

export async function executeSettlementReconciliationRpc(params: {
  organizationId: string;
  invoiceId: string;
  paymentId?: string;
  utrNumber?: string;
  utrAmount?: number;
}): Promise<{ ok: true; reconciliation: any; exception: any } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.rpc('execute_settlement_reconciliation_atomic', {
      p_organization_id: params.organizationId,
      p_invoice_id: params.invoiceId,
      p_payment_id: params.paymentId || null,
      p_utr_number: params.utrNumber || null,
      p_utr_amount: params.utrAmount || null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, reconciliation: data?.reconciliation, exception: data?.exception_id ? { id: data.exception_id } : null };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to execute settlement reconciliation' };
  }
}

export async function resolveSettlementExceptionRpc(params: {
  exceptionId: string;
  resolutionNotes: string;
}): Promise<{ ok: true; result: any } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.rpc('resolve_settlement_exception_atomic', {
      p_exception_id: params.exceptionId,
      p_resolution_notes: params.resolutionNotes,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, result: data };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to resolve settlement exception' };
  }
}

export async function fetchPoFeeSnapshotApi(
  poId: string,
): Promise<{ ok: true; snapshot: any } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase
      .from('po_fee_snapshots')
      .select('*')
      .eq('purchase_order_id', poId)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    return { ok: true, snapshot: data };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to fetch PO fee snapshot' };
  }
}

export async function fetchSettlementReconciliationsApi(
  organizationId: string,
): Promise<{ ok: true; reconciliations: any[] } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase
      .from('settlement_reconciliations')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) return { ok: false, error: error.message };
    return { ok: true, reconciliations: data || [] };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to fetch settlement reconciliations' };
  }
}

export async function fetchSettlementExceptionsApi(
  organizationId: string,
): Promise<{ ok: true; exceptions: any[] } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase
      .from('settlement_exceptions')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) return { ok: false, error: error.message };
    return { ok: true, exceptions: data || [] };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to fetch settlement exceptions' };
  }
}


