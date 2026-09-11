import { supabase } from '@/lib/supabase';
import type { InvoiceStatus } from '@otp/domain';

export interface InvoiceSummary {
  id: string;
  workOrderId: string;
  supplierId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  submittedAt: string | null;
  approvedAt: string | null;
}

interface InvoiceRow {
  id: string;
  work_order_id: string;
  supplier_id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  submitted_at: string | null;
  approved_at: string | null;
}

function mapInvoice(row: InvoiceRow): InvoiceSummary {
  return {
    id: row.id,
    workOrderId: row.work_order_id,
    supplierId: row.supplier_id,
    invoiceNumber: row.invoice_number,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
  };
}

export async function fetchInvoiceByWorkOrder(workOrderId: string): Promise<
  { ok: true; invoice: InvoiceSummary | null } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, work_order_id, supplier_id, invoice_number, amount, currency, status, submitted_at, approved_at',
    )
    .eq('work_order_id', workOrderId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, invoice: null };
  return { ok: true, invoice: mapInvoice(data as InvoiceRow) };
}

export async function submitInvoice(
  workOrderId: string,
  supplierId: string,
  invoiceNumber: string,
  amount: number,
  currency = 'INR',
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('invoices')
    .insert({
      work_order_id: workOrderId,
      supplier_id: supplierId,
      invoice_number: invoiceNumber,
      amount,
      currency,
      status: 'SUBMITTED',
      submitted_at: now,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, invoiceId: data.id };
}

export async function approveInvoice(invoiceId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const { error } = await supabase
    .from('invoices')
    .update({
      status: 'APPROVED',
      approved_at: new Date().toISOString(),
    })
    .eq('id', invoiceId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function rejectInvoice(invoiceId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const { error } = await supabase
    .from('invoices')
    .update({ status: 'REJECTED' })
    .eq('id', invoiceId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
