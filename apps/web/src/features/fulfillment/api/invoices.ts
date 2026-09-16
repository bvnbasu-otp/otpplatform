import { supabase } from '@/lib/supabase';
import type { InvoiceStatus } from '@otp/domain';

export interface InvoiceLineItemSummary {
  id: string;
  invoiceId: string;
  poLineItemId?: string | null;
  milestoneId?: string | null;
  lineIndex: number;
  description: string;
  quantity: number;
  unitPrice: number;
  taxableAmount: number;
  gstAmount: number;
  totalAmount: number;
}

export interface InvoiceSummary {
  id: string;
  purchaseOrderId?: string | null;
  workOrderId: string;
  milestoneId?: string | null;
  supplierId: string;
  invoiceNumber: string;
  invoiceType?: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  lineItems?: InvoiceLineItemSummary[];
}

interface InvoiceRow {
  id: string;
  purchase_order_id?: string | null;
  work_order_id: string;
  milestone_id?: string | null;
  supplier_id: string;
  invoice_number: string;
  invoice_type?: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  submitted_at: string | null;
  approved_at: string | null;
  invoice_line_items?: Array<{
    id: string;
    invoice_id: string;
    po_line_item_id?: string | null;
    milestone_id?: string | null;
    line_index: number;
    description: string;
    quantity: number;
    unit_price: number;
    taxable_amount: number;
    gst_amount: number;
    total_amount: number;
  }> | null;
}

function mapInvoice(row: InvoiceRow): InvoiceSummary {
  return {
    id: row.id,
    purchaseOrderId: row.purchase_order_id,
    workOrderId: row.work_order_id,
    milestoneId: row.milestone_id,
    supplierId: row.supplier_id,
    invoiceNumber: row.invoice_number,
    invoiceType: row.invoice_type || 'PROGRESSIVE',
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    lineItems: row.invoice_line_items?.map((li) => ({
      id: li.id,
      invoiceId: li.invoice_id,
      poLineItemId: li.po_line_item_id,
      milestoneId: li.milestone_id,
      lineIndex: li.line_index,
      description: li.description,
      quantity: Number(li.quantity),
      unitPrice: Number(li.unit_price),
      taxableAmount: Number(li.taxable_amount),
      gstAmount: Number(li.gst_amount),
      totalAmount: Number(li.total_amount),
    })),
  };
}

export async function fetchInvoiceByWorkOrder(workOrderId: string): Promise<
  { ok: true; invoice: InvoiceSummary | null } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, purchase_order_id, work_order_id, milestone_id, supplier_id, invoice_number, invoice_type, amount, currency, status, submitted_at, approved_at, invoice_line_items(*)',
    )
    .eq('work_order_id', workOrderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, invoice: null };
  return { ok: true, invoice: mapInvoice(data as unknown as InvoiceRow) };
}

export async function fetchInvoicesByWorkOrder(workOrderId: string): Promise<
  { ok: true; invoices: InvoiceSummary[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, purchase_order_id, work_order_id, milestone_id, supplier_id, invoice_number, invoice_type, amount, currency, status, submitted_at, approved_at, invoice_line_items(*)',
    )
    .eq('work_order_id', workOrderId)
    .order('created_at', { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, invoices: (data as unknown as InvoiceRow[] || []).map(mapInvoice) };
}

export async function fetchInvoicesByPurchaseOrder(poId: string): Promise<
  { ok: true; invoices: InvoiceSummary[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, purchase_order_id, work_order_id, milestone_id, supplier_id, invoice_number, invoice_type, amount, currency, status, submitted_at, approved_at, invoice_line_items(*)',
    )
    .eq('purchase_order_id', poId)
    .order('created_at', { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, invoices: (data as unknown as InvoiceRow[] || []).map(mapInvoice) };
}

export async function submitInvoice(
  workOrderId: string,
  supplierId: string,
  invoiceNumber: string,
  amount: number,
  currency = 'INR',
  milestoneId?: string | null,
  invoiceType = 'PROGRESSIVE',
  lineItems?: Array<{
    poLineItemId?: string | null;
    milestoneId?: string | null;
    lineIndex: number;
    description: string;
    quantity: number;
    unitPrice: number;
    taxableAmount: number;
    gstAmount: number;
    totalAmount: number;
  }>,
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  
  // Find purchase_order_id from work_orders
  const { data: woData } = await supabase
    .from('work_orders')
    .select('purchase_order_id')
    .eq('id', workOrderId)
    .single();

  const purchaseOrderId = woData?.purchase_order_id || null;

  const { data, error } = await supabase
    .from('invoices')
    .insert({
      purchase_order_id: purchaseOrderId,
      work_order_id: workOrderId,
      milestone_id: milestoneId || null,
      supplier_id: supplierId,
      invoice_number: invoiceNumber,
      invoice_type: invoiceType,
      amount,
      currency,
      status: 'SUBMITTED',
      submitted_at: now,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  // Insert line items if provided
  if (lineItems && lineItems.length > 0) {
    const itemsToInsert = lineItems.map((li) => ({
      invoice_id: data.id,
      po_line_item_id: li.poLineItemId || null,
      milestone_id: li.milestoneId || milestoneId || null,
      line_index: li.lineIndex,
      description: li.description,
      quantity: li.quantity,
      unit_price: li.unitPrice,
      taxable_amount: li.taxableAmount,
      gst_amount: li.gstAmount,
      total_amount: li.totalAmount,
    }));

    const { error: lineError } = await supabase
      .from('invoice_line_items')
      .insert(itemsToInsert);

    if (lineError) {
      console.warn('Invoice line items insertion error:', lineError.message);
    }
  }

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
