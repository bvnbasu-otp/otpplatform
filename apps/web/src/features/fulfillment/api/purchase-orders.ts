import { supabase } from '@/lib/supabase';
import type { PurchaseOrderStatus } from '@otp/domain';
import type { PurchaseOrderSummary } from '../types/fulfillment';

interface PoRow {
  id: string;
  po_number: string;
  status: PurchaseOrderStatus;
  total_amount: number;
  currency: string;
  supplier_id: string;
  rfq_id: string;
  organization_id?: string;
  issued_at: string | null;
  acknowledged_at: string | null;
  created_at: string;
  place_of_supply_state_code?: string | null;
  place_of_supply_basis?: string | null;
  tax_snapshot?: Record<string, unknown> | null;
  taxable_total?: number | null;
  cgst_total?: number | null;
  sgst_total?: number | null;
  utgst_total?: number | null;
  igst_total?: number | null;
  organizations?: {
    id?: string;
    name?: string;
    org_type?: string;
    contact_person?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
    tax_registration?: string | null;
    address?: Record<string, unknown> | string | null;
    city?: string | null;
  } | {
    id?: string;
    name?: string;
    org_type?: string;
    contact_person?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
    tax_registration?: string | null;
    address?: Record<string, unknown> | string | null;
    city?: string | null;
  }[] | null;
  suppliers?: {
    business_name?: string;
    legal_name?: string | null;
    trade_name?: string | null;
    gstin?: string | null;
    pan?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
    gst_status?: string | null;
    gst_verified?: boolean | null;
  } | {
    business_name?: string;
    legal_name?: string | null;
    trade_name?: string | null;
    gstin?: string | null;
    pan?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
    gst_status?: string | null;
    gst_verified?: boolean | null;
  }[] | null;
  rfqs?: { title?: string } | { title?: string }[] | null;
  work_orders?:
    | {
        id?: string;
        status?: any;
        progress_percent?: number | null;
        buyer_accepted_at?: string | null;
        rating?: number | null;
        invoices?:
          | {
              id?: string;
              status?: string;
              payments?:
                | {
                    id?: string;
                    status?: string;
                  }
                | {
                    id?: string;
                    status?: string;
                  }[]
                | null;
            }
          | {
              id?: string;
              status?: string;
              payments?:
                | {
                    id?: string;
                    status?: string;
                  }
                | {
                    id?: string;
                    status?: string;
                  }[]
                | null;
            }[]
          | null;
      }
    | {
        id?: string;
        status?: any;
        progress_percent?: number | null;
        buyer_accepted_at?: string | null;
        rating?: number | null;
        invoices?:
          | {
              id?: string;
              status?: string;
              payments?:
                | {
                    id?: string;
                    status?: string;
                  }
                | {
                    id?: string;
                    status?: string;
                  }[]
                | null;
            }
          | {
              id?: string;
              status?: string;
              payments?:
                | {
                    id?: string;
                    status?: string;
                  }
                | {
                    id?: string;
                    status?: string;
                  }[]
                | null;
            }[]
          | null;
      }[]
    | null;
}

function mapPo(row: PoRow): PurchaseOrderSummary {
  const rfqObj = row.rfqs;
  const rfqTitle =
    (Array.isArray(rfqObj) ? rfqObj[0]?.title : rfqObj?.title) ?? 'Commercial Purchase Order';

  const supObj = row.suppliers;
  const sup = Array.isArray(supObj) ? supObj[0] : supObj;

  const orgObj = row.organizations;
  const org = Array.isArray(orgObj) ? orgObj[0] : orgObj;

  const woList = Array.isArray(row.work_orders)
    ? row.work_orders
    : row.work_orders
    ? [row.work_orders]
    : [];
  const wo = woList[0];
  const progress = wo?.progress_percent != null ? Number(wo.progress_percent) : 0;

  const invList = wo?.invoices
    ? Array.isArray(wo.invoices)
      ? wo.invoices
      : [wo.invoices]
    : [];
  const inv = invList[0];

  const payList = inv?.payments
    ? Array.isArray(inv.payments)
      ? inv.payments
      : [inv.payments]
    : [];
  const pay = payList[0];

  const isPaymentVerified = pay?.status === 'VERIFIED' || inv?.status === 'PAID';
  const isSettled = row.status === 'COMPLETED' || isPaymentVerified;

  return {
    id: row.id,
    poNumber: row.po_number,
    status: isSettled ? ('COMPLETED' as PurchaseOrderStatus) : row.status,
    totalAmount: Number(row.total_amount),
    currency: row.currency,
    supplierId: row.supplier_id,
    rfqId: row.rfq_id,
    organizationId: row.organization_id || org?.id,
    issuedAt: row.issued_at,
    acknowledgedAt: row.acknowledged_at,
    createdAt: row.created_at,
    rfqTitle,
    // Supplier Legal & Tax Identity
    supplierName: sup?.business_name,
    supplierLegalName: sup?.legal_name,
    supplierGstin: sup?.gstin,
    supplierGstVerified: Boolean(sup?.gst_verified),
    supplierPhone: sup?.contact_phone,
    supplierEmail: sup?.contact_email,
    // Buyer Legal & Tax Identity (for GST ITC & Tax Invoice issuance)
    buyerOrgId: org?.id,
    buyerOrgName: org?.name,
    buyerOrgType: org?.org_type,
    buyerGstin: org?.tax_registration,
    buyerContactPerson: org?.contact_person,
    buyerContactPhone: org?.contact_phone,
    buyerContactEmail: org?.contact_email,
    buyerAddress: org?.address,
    buyerCity: org?.city,
    // Progress & Fulfillment
    progressPercent: progress,
    workOrderId: wo?.id,
    workOrderStatus: wo?.status,
    buyerAcceptedAt: wo?.buyer_accepted_at,
    isSettled,
    invoiceStatus: inv?.status,
    paymentStatus: pay?.status,
    // Statutory GST & Tax Attributes
    placeOfSupplyStateCode: row.place_of_supply_state_code,
    placeOfSupplyBasis: row.place_of_supply_basis,
    taxSnapshot: row.tax_snapshot,
    taxableTotal: row.taxable_total != null ? Number(row.taxable_total) : undefined,
    cgstTotal: row.cgst_total != null ? Number(row.cgst_total) : undefined,
    sgstTotal: row.sgst_total != null ? Number(row.sgst_total) : undefined,
    utgstTotal: row.utgst_total != null ? Number(row.utgst_total) : undefined,
    igstTotal: row.igst_total != null ? Number(row.igst_total) : undefined,
  };
}

export async function fetchPurchaseOrders(): Promise<
  { ok: true; orders: PurchaseOrderSummary[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      id,
      po_number,
      status,
      total_amount,
      currency,
      supplier_id,
      rfq_id,
      organization_id,
      place_of_supply_state_code,
      place_of_supply_basis,
      tax_snapshot,
      taxable_total,
      cgst_total,
      sgst_total,
      utgst_total,
      igst_total,
      issued_at,
      acknowledged_at,
      created_at,
      organizations (
        id,
        name,
        org_type,
        contact_person,
        contact_phone,
        contact_email,
        tax_registration,
        address,
        city
      ),
      suppliers (
        business_name,
        legal_name,
        trade_name,
        gstin,
        pan,
        contact_phone,
        contact_email,
        gst_status,
        gst_verified
      ),
      rfqs (
        title
      ),
      work_orders (
        id,
        status,
        progress_percent,
        buyer_accepted_at,
        rating,
        invoices (
          id,
          status,
          payments (
            id,
            status
          )
        )
      )
    `)
    .order('created_at', { ascending: false });

  if (!error && data) {
    return { ok: true, orders: (data as unknown as PoRow[]).map(mapPo) };
  }

  // Fallback: simple flat select if nested relation join fails
  const { data: rawData, error: rawError } = await supabase
    .from('purchase_orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (rawError) return { ok: false, error: rawError.message };
  if (!rawData || rawData.length === 0) return { ok: true, orders: [] };

  return {
    ok: true,
    orders: (rawData as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      poNumber: String(r.po_number || ''),
      status: (r.status as PurchaseOrderStatus) || 'ISSUED',
      totalAmount: Number(r.total_amount || 0),
      currency: String(r.currency || 'INR'),
      supplierId: String(r.supplier_id || ''),
      rfqId: String(r.rfq_id || ''),
      organizationId: r.organization_id ? String(r.organization_id) : undefined,
      issuedAt: (r.issued_at as string) || null,
      acknowledgedAt: (r.acknowledged_at as string) || null,
      createdAt: String(r.created_at || new Date().toISOString()),
      rfqTitle: 'Commercial Purchase Order',
      progressPercent: 0,
      isSettled: r.status === 'COMPLETED',
    })),
  };
}

export async function fetchPurchaseOrder(poId: string): Promise<
  { ok: true; order: PurchaseOrderSummary } | { ok: false; error: string }
> {
  const cleanId = (poId || '').trim();
  if (!cleanId) return { ok: false, error: 'Purchase order identifier is required' };

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);

  let primaryQuery = supabase
    .from('purchase_orders')
    .select(`
      id,
      po_number,
      status,
      total_amount,
      currency,
      supplier_id,
      rfq_id,
      organization_id,
      place_of_supply_state_code,
      place_of_supply_basis,
      tax_snapshot,
      taxable_total,
      cgst_total,
      sgst_total,
      utgst_total,
      igst_total,
      issued_at,
      acknowledged_at,
      created_at,
      organizations (
        id,
        name,
        org_type,
        contact_person,
        contact_phone,
        contact_email,
        tax_registration,
        address,
        city
      ),
      suppliers (
        business_name,
        legal_name,
        trade_name,
        gstin,
        pan,
        contact_phone,
        contact_email,
        gst_status,
        gst_verified
      ),
      rfqs (
        title
      ),
      work_orders (
        id,
        status,
        progress_percent,
        buyer_accepted_at,
        rating,
        invoices (
          id,
          status,
          payments (
            id,
            status
          )
        )
      )
    `);

  if (isUuid) {
    primaryQuery = primaryQuery.or(`id.eq.${cleanId},rfq_id.eq.${cleanId}`);
  } else {
    primaryQuery = primaryQuery.eq('po_number', cleanId);
  }

  const { data, error } = await primaryQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();

  if (!error && data) {
    return { ok: true, order: mapPo(data as unknown as PoRow) };
  }

  // Fallback: flat select with progressive enrichment
  let fallbackQuery = supabase.from('purchase_orders').select('*');
  if (isUuid) {
    fallbackQuery = fallbackQuery.or(`id.eq.${cleanId},rfq_id.eq.${cleanId}`);
  } else {
    fallbackQuery = fallbackQuery.eq('po_number', cleanId);
  }

  const { data: rawData, error: rawError } = await fallbackQuery
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rawError) return { ok: false, error: rawError.message };
  if (!rawData) return { ok: false, error: 'Purchase order not found' };

  let rfqTitle = 'Commercial Purchase Order';
  if (rawData.rfq_id) {
    const { data: rfq } = await supabase.from('rfqs').select('title').eq('id', rawData.rfq_id).maybeSingle();
    if (rfq?.title) rfqTitle = rfq.title;
  }

  let supplierName: string | undefined;
  let supplierGstin: string | undefined;
  if (rawData.supplier_id) {
    const { data: sup } = await supabase.from('suppliers').select('business_name, gstin').eq('id', rawData.supplier_id).maybeSingle();
    if (sup) {
      supplierName = sup.business_name;
      supplierGstin = sup.gstin;
    }
  }

  return {
    ok: true,
    order: {
      id: rawData.id,
      poNumber: rawData.po_number,
      status: rawData.status,
      totalAmount: Number(rawData.total_amount || 0),
      currency: rawData.currency || 'INR',
      supplierId: rawData.supplier_id,
      rfqId: rawData.rfq_id,
      organizationId: rawData.organization_id,
      issuedAt: rawData.issued_at,
      acknowledgedAt: rawData.acknowledged_at,
      createdAt: rawData.created_at,
      rfqTitle,
      supplierName,
      supplierGstin,
      progressPercent: 0,
      isSettled: rawData.status === 'COMPLETED',
    },
  };
}

export async function updatePurchaseOrderStatus(
  poId: string,
  status: PurchaseOrderStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cleanId = (poId || '').trim();
  if (!cleanId) return { ok: false, error: 'Purchase order identifier is required' };
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);

  // POL-01: Financial Transition Predicate Harmonization
  // When completing PO, cleanly synchronize any invoices with balance_due <= 0.00 or paid_amount >= amount to status = 'PAID'
  if (status === 'COMPLETED') {
    try {
      let resolvedPoId = isUuid ? cleanId : null;
      if (!resolvedPoId) {
        const { data: poLookup } = await supabase
          .from('purchase_orders')
          .select('id')
          .eq('po_number', cleanId)
          .maybeSingle();
        resolvedPoId = poLookup?.id || null;
      }

      if (resolvedPoId) {
        // Query non-rejected invoices for this PO
        const { data: invoices } = await supabase
          .from('invoices')
          .select('id, amount, paid_amount, balance_due, status')
          .or(`purchase_order_id.eq.${resolvedPoId},work_order_id.in.(select id from work_orders where purchase_order_id='${resolvedPoId}')`)
          .neq('status', 'REJECTED');

        if (invoices && invoices.length > 0) {
          const eligibleInvoiceIds = invoices
            .filter((inv) => inv.status !== 'PAID' && (
              (inv.balance_due !== null && inv.balance_due !== undefined && Number(inv.balance_due) <= 0) ||
              (Number(inv.paid_amount || 0) >= Number(inv.amount) && Number(inv.amount) > 0)
            ))
            .map((inv) => inv.id);

          if (eligibleInvoiceIds.length > 0) {
            await supabase
              .from('invoices')
              .update({
                status: 'PAID',
                balance_due: 0,
                updated_at: new Date().toISOString(),
              })
              .in('id', eligibleInvoiceIds);
          }
        }
      }
    } catch {
      // Allow database trigger to perform final authoritative validation
    }
  }

  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'ISSUED') patch.issued_at = new Date().toISOString();
  if (status === 'ACCEPTED') patch.acknowledged_at = new Date().toISOString();

  const query = supabase.from('purchase_orders').update(patch);
  const { error } = isUuid ? await query.eq('id', cleanId) : await query.eq('po_number', cleanId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchPurchaseOrderByRfq(rfqId: string): Promise<
  { ok: true; poId: string | null } | { ok: false; error: string }
> {
  const cleanId = (rfqId || '').trim();
  if (!cleanId) return { ok: true, poId: null };
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
  if (!isUuid) return { ok: true, poId: null };

  const { data, error } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('rfq_id', cleanId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  return { ok: true, poId: data?.id ?? null };
}

export async function createPurchaseOrderFromAward(
  awardId: string,
): Promise<{ ok: true; poId: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('create_purchase_order_from_award', {
    p_award_id: awardId,
  });

  if (error) return { ok: false, error: error.message };
  const res = data as { po_id?: string; po_number?: string } | null;
  if (!res?.po_id) return { ok: false, error: 'Failed to create Purchase Order' };

  return { ok: true, poId: res.po_id };
}

export async function fetchPoLineItems(poId: string): Promise<
  { ok: true; lineItems: Array<Record<string, unknown>> } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('purchase_order_line_items')
    .select('*')
    .eq('purchase_order_id', poId)
    .order('item_index', { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, lineItems: data || [] };
}

export async function fetchPoInvoicingSummary(poId: string): Promise<{
  ok: true;
  summary: {
    totalAuthorizedAmount: number;
    alreadyInvoicedAmount: number;
    approvedInvoicedAmount: number;
    remainingInvoiceableAmount: number;
    invoiceCount: number;
    isFullyInvoiced: boolean;
  };
} | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('get_purchase_order_invoicing_summary', {
    p_po_id: poId,
  });

  if (error) return { ok: false, error: error.message };
  const res = data as {
    ok: boolean;
    total_authorized_amount: number;
    already_invoiced_amount: number;
    approved_invoiced_amount: number;
    remaining_invoiceable_amount: number;
    invoice_count: number;
    is_fully_invoiced: boolean;
    error?: string;
  };

  if (!res || !res.ok) {
    return { ok: false, error: res?.error || 'Failed to fetch invoicing summary' };
  }

  return {
    ok: true,
    summary: {
      totalAuthorizedAmount: Number(res.total_authorized_amount),
      alreadyInvoicedAmount: Number(res.already_invoiced_amount),
      approvedInvoicedAmount: Number(res.approved_invoiced_amount),
      remainingInvoiceableAmount: Number(res.remaining_invoiceable_amount),
      invoiceCount: Number(res.invoice_count),
      isFullyInvoiced: Boolean(res.is_fully_invoiced),
    },
  };
}
