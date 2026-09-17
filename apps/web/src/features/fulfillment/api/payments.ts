import { supabase } from '@/lib/supabase';
import { fetchCurrentProfile } from '@/features/auth/user-role';
import type { PaymentMethod, PaymentStatus, PaymentAllocationStatus } from '@otp/domain';

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

export async function recordPayment(
  invoiceId: string,
  amount: number,
  method: PaymentMethod,
  reference: string,
  currency = 'INR',
  purchaseOrderId?: string | null,
): Promise<{ ok: true; paymentId: string } | { ok: false; error: string }> {
  const profile = await fetchCurrentProfile();
  if (!profile) return { ok: false, error: 'Not authenticated' };

  const now = new Date().toISOString();

  // If purchaseOrderId not provided, attempt to resolve from invoice
  let poId = purchaseOrderId;
  if (!poId) {
    const { data: inv } = await supabase
      .from('invoices')
      .select('purchase_order_id, work_order_id')
      .eq('id', invoiceId)
      .maybeSingle();

    if (inv) {
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
  }

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
      recorded_by: profile.profileId,
      recorded_at: now,
    })
    .select('id')
    .single();

  if (payErr) return { ok: false, error: payErr.message };

  // Create payment allocation entry
  const { error: allocErr } = await supabase
    .from('payment_allocations')
    .insert({
      payment_id: payData.id,
      invoice_id: invoiceId,
      allocated_amount: amount,
      allocated_at: now,
      status: 'ALLOCATED',
      notes: `Direct invoice remittance via ${method}`,
    });

  if (allocErr) {
    console.warn('Non-blocking payment allocation creation warning:', allocErr);
  }

  return { ok: true, paymentId: payData.id };
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

      // Controlled completion condition
      if (allInvoicesPaid && totalPaid >= totalPoAmount - 0.05) {
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
