import { supabase } from '@/lib/supabase';
import { fetchCurrentProfile } from '@/features/auth/user-role';
import type { PaymentMethod, PaymentStatus } from '@otp/domain';

export interface PaymentSummary {
  id: string;
  invoiceId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string | null;
  recordedAt: string;
  verifiedAt: string | null;
}

interface PaymentRow {
  id: string;
  invoice_id: string;
  amount: number;
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
    amount: Number(row.amount),
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
    .select('id, invoice_id, amount, currency, method, status, reference, recorded_at, verified_at')
    .eq('invoice_id', invoiceId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, payment: null };
  return { ok: true, payment: mapPayment(data as PaymentRow) };
}

export async function recordPayment(
  invoiceId: string,
  amount: number,
  method: PaymentMethod,
  reference: string,
  currency = 'INR',
): Promise<{ ok: true; paymentId: string } | { ok: false; error: string }> {
  const profile = await fetchCurrentProfile();
  if (!profile) return { ok: false, error: 'Not authenticated' };

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('payments')
    .insert({
      invoice_id: invoiceId,
      amount,
      currency,
      method,
      status: 'RECORDED',
      reference,
      recorded_by: profile.profileId,
      recorded_at: now,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, paymentId: data.id };
}

export async function verifyPayment(paymentId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const now = new Date().toISOString();

  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .select('invoice_id')
    .eq('id', paymentId)
    .maybeSingle();

  if (payErr || !payment) return { ok: false, error: payErr?.message ?? 'Payment not found' };

  const { error: verifyErr } = await supabase
    .from('payments')
    .update({ status: 'VERIFIED', verified_at: now })
    .eq('id', paymentId);

  if (verifyErr) return { ok: false, error: verifyErr.message };

  // 1. Update invoice to PAID
  const { data: inv } = await supabase
    .from('invoices')
    .update({ status: 'PAID' })
    .eq('id', payment.invoice_id)
    .select('work_order_id')
    .maybeSingle();

  if (inv?.work_order_id) {
    // 2. Complete Work Order
    const { data: wo } = await supabase
      .from('work_orders')
      .update({ status: 'COMPLETED', completed_at: now })
      .eq('id', inv.work_order_id)
      .select('purchase_order_id')
      .maybeSingle();

    if (wo?.purchase_order_id) {
      // 3. Complete Purchase Order
      const { data: po } = await supabase
        .from('purchase_orders')
        .update({ status: 'COMPLETED' })
        .eq('id', wo.purchase_order_id)
        .select('rfq_id')
        .maybeSingle();

      if (po?.rfq_id) {
        // 4. Complete Requirement
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

  return { ok: true };
}
