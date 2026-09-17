import { supabase } from '@/lib/supabase';
import {
  buildTaxSnapshot,
  calculateOrderTaxBreakdown,
  determinePlaceOfSupply,
  type InvoiceStatus,
} from '@otp/domain';

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
  hsnCode?: string | null;
  cgstRate?: number;
  cgstAmount?: number;
  sgstRate?: number;
  sgstAmount?: number;
  utgstRate?: number;
  utgstAmount?: number;
  igstRate?: number;
  igstAmount?: number;
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
  paidAmount?: number;
  balanceDue?: number;
  currency: string;
  status: InvoiceStatus;
  organizationId?: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  lineItems?: InvoiceLineItemSummary[];
  placeOfSupplyStateCode?: string | null;
  placeOfSupplyBasis?: string | null;
  taxSnapshot?: Record<string, unknown> | null;
  taxableTotal?: number;
  cgstTotal?: number;
  sgstTotal?: number;
  utgstTotal?: number;
  igstTotal?: number;
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
  paid_amount?: number | null;
  balance_due?: number | null;
  currency: string;
  status: InvoiceStatus;
  submitted_at: string | null;
  approved_at: string | null;
  place_of_supply_state_code?: string | null;
  place_of_supply_basis?: string | null;
  tax_snapshot?: Record<string, unknown> | null;
  taxable_total?: number | null;
  cgst_total?: number | null;
  sgst_total?: number | null;
  utgst_total?: number | null;
  igst_total?: number | null;
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
    hsn_code?: string | null;
    cgst_rate?: number | null;
    cgst_amount?: number | null;
    sgst_rate?: number | null;
    sgst_amount?: number | null;
    utgst_rate?: number | null;
    utgst_amount?: number | null;
    igst_rate?: number | null;
    igst_amount?: number | null;
  }> | null;
}

function mapInvoice(row: InvoiceRow & { organization_id?: string | null }): InvoiceSummary {
  return {
    id: row.id,
    purchaseOrderId: row.purchase_order_id,
    workOrderId: row.work_order_id,
    milestoneId: row.milestone_id,
    supplierId: row.supplier_id,
    invoiceNumber: row.invoice_number,
    invoiceType: row.invoice_type || 'PROGRESSIVE',
    amount: Number(row.amount),
    paidAmount: row.paid_amount != null ? Number(row.paid_amount) : undefined,
    balanceDue: row.balance_due != null ? Number(row.balance_due) : undefined,
    currency: row.currency,
    status: row.status,
    organizationId: (row as any).organization_id || null,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    placeOfSupplyStateCode: row.place_of_supply_state_code,
    placeOfSupplyBasis: row.place_of_supply_basis,
    taxSnapshot: row.tax_snapshot,
    taxableTotal: row.taxable_total != null ? Number(row.taxable_total) : undefined,
    cgstTotal: row.cgst_total != null ? Number(row.cgst_total) : undefined,
    sgstTotal: row.sgst_total != null ? Number(row.sgst_total) : undefined,
    utgstTotal: row.utgst_total != null ? Number(row.utgst_total) : undefined,
    igstTotal: row.igst_total != null ? Number(row.igst_total) : undefined,
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
      hsnCode: li.hsn_code,
      cgstRate: li.cgst_rate != null ? Number(li.cgst_rate) : undefined,
      cgstAmount: li.cgst_amount != null ? Number(li.cgst_amount) : undefined,
      sgstRate: li.sgst_rate != null ? Number(li.sgst_rate) : undefined,
      sgstAmount: li.sgst_amount != null ? Number(li.sgst_amount) : undefined,
      utgstRate: li.utgst_rate != null ? Number(li.utgst_rate) : undefined,
      utgstAmount: li.utgst_amount != null ? Number(li.utgst_amount) : undefined,
      igstRate: li.igst_rate != null ? Number(li.igst_rate) : undefined,
      igstAmount: li.igst_amount != null ? Number(li.igst_amount) : undefined,
    })),
  };
}

const INVOICE_SELECT_QUERY = `
  id,
  purchase_order_id,
  work_order_id,
  milestone_id,
  supplier_id,
  invoice_number,
  invoice_type,
  amount,
  paid_amount,
  balance_due,
  currency,
  status,
  submitted_at,
  approved_at,
  place_of_supply_state_code,
  place_of_supply_basis,
  tax_snapshot,
  taxable_total,
  cgst_total,
  sgst_total,
  utgst_total,
  igst_total,
  invoice_line_items(
    id,
    invoice_id,
    po_line_item_id,
    milestone_id,
    line_index,
    description,
    quantity,
    unit_price,
    taxable_amount,
    gst_amount,
    total_amount,
    hsn_code,
    cgst_rate,
    cgst_amount,
    sgst_rate,
    sgst_amount,
    utgst_rate,
    utgst_amount,
    igst_rate,
    igst_amount
  )
`;

export async function fetchInvoiceByWorkOrder(workOrderId: string): Promise<
  { ok: true; invoice: InvoiceSummary | null } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('invoices')
    .select(INVOICE_SELECT_QUERY)
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
    .select(INVOICE_SELECT_QUERY)
    .eq('work_order_id', workOrderId)
    .order('created_at', { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, invoices: ((data as unknown as InvoiceRow[]) || []).map(mapInvoice) };
}

export async function fetchInvoicesByPurchaseOrder(poId: string): Promise<
  { ok: true; invoices: InvoiceSummary[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('invoices')
    .select(INVOICE_SELECT_QUERY)
    .eq('purchase_order_id', poId)
    .order('created_at', { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, invoices: ((data as unknown as InvoiceRow[]) || []).map(mapInvoice) };
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
    hsnCode?: string | null;
    cgstRate?: number;
    cgstAmount?: number;
    sgstRate?: number;
    sgstAmount?: number;
    utgstRate?: number;
    utgstAmount?: number;
    igstRate?: number;
    igstAmount?: number;
  }>,
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  const now = new Date().toISOString();

  // 1. Fetch linked PO & Supplier GST details for POS determination
  const { data: woData } = await supabase
    .from('work_orders')
    .select(`
      purchase_order_id,
      purchase_orders (
        id,
        place_of_supply_state_code,
        organizations (
          tax_registration
        )
      )
    `)
    .eq('id', workOrderId)
    .single();

  const purchaseOrderId = woData?.purchase_order_id || null;
  const poObj = woData?.purchase_orders as any;
  const poState = poObj?.place_of_supply_state_code || '29';

  const { data: supData } = await supabase
    .from('suppliers')
    .select('gstin, legal_name, business_name')
    .eq('id', supplierId)
    .maybeSingle();

  const supGstin = supData?.gstin || null;
  const supState = supGstin ? supGstin.slice(0, 2) : '29';

  // 2. Determine Place of Supply
  const pos = determinePlaceOfSupply({
    supplierStateCode: supState,
    recipientStateCode: poState,
    supplyType: 'PRODUCT_GOODS',
  });

  // 3. Compute Line Items Tax Breakdown
  const rawItems = lineItems && lineItems.length > 0
    ? lineItems.map((li) => ({
        itemIndex: li.lineIndex,
        description: li.description,
        hsnSacCode: li.hsnCode || '995411',
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        gstRate: 18.0,
      }))
    : [
        {
          itemIndex: 1,
          description: `Progressive Milestone Deliverables (${invoiceType})`,
          hsnSacCode: '995411',
          quantity: 1,
          unitPrice: Math.round((amount / 1.18) * 100) / 100,
          gstRate: 18.0,
        },
      ];

  const taxBreakdown = calculateOrderTaxBreakdown(rawItems, pos);

  const taxSnapshot = buildTaxSnapshot({
    supplierGstin: supGstin,
    supplierLegalName: supData?.legal_name || supData?.business_name,
    supplierStateCode: supState,
    buyerStateCode: poState,
    supplyType: 'PRODUCT_GOODS',
    pos,
    taxBreakdown,
    capturedAt: now,
  });

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
      place_of_supply_state_code: pos.placeOfSupplyStateCode,
      place_of_supply_basis: pos.placeOfSupplyBasis,
      taxable_total: taxBreakdown.taxableTotal,
      cgst_total: taxBreakdown.cgstTotal,
      sgst_total: taxBreakdown.sgstTotal,
      utgst_total: taxBreakdown.utgstTotal,
      igst_total: taxBreakdown.igstTotal,
      tax_snapshot: taxSnapshot as unknown as Record<string, unknown>,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  // 4. Insert normalized line items with full statutory tax splitting
  const itemsToInsert = taxBreakdown.lineItems.map((li) => ({
    invoice_id: data.id,
    po_line_item_id: lineItems?.[li.itemIndex - 1]?.poLineItemId || null,
    milestone_id: milestoneId || null,
    line_index: li.itemIndex,
    description: li.description,
    quantity: li.quantity,
    unit_price: li.unitPrice,
    taxable_amount: li.taxableAmount,
    gst_amount: li.totalTax,
    total_amount: li.totalAmount,
    hsn_code: li.hsnSacCode || null,
    cgst_rate: li.cgstRate,
    cgst_amount: li.cgstAmount,
    sgst_rate: li.sgstRate,
    sgst_amount: li.sgstAmount,
    utgst_rate: li.utgstRate,
    utgst_amount: li.utgstAmount,
    igst_rate: li.igstRate,
    igst_amount: li.igstAmount,
  }));

  const { error: lineError } = await supabase
    .from('invoice_line_items')
    .insert(itemsToInsert);

  if (lineError) {
    console.warn('Invoice line items insertion error:', lineError.message);
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
