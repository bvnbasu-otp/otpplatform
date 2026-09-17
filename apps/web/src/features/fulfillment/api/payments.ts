import { supabase } from '@/lib/supabase';
import { fetchCurrentProfile } from '@/features/auth/user-role';
import type {
  PaymentMethod,
  PaymentStatus,
  PaymentAllocationStatus,
  PoSettlementSummary,
  PoSettlementCertificate,
} from '@otp/domain';
import {
  calculatePoSettlementSummary,
  generatePoSettlementCertificate as generatePoSettlementCertDomain,
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
