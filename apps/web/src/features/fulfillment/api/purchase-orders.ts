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

  if (error) return { ok: false, error: error.message };
  return { ok: true, orders: (data as unknown as PoRow[]).map(mapPo) };
}

export async function fetchPurchaseOrder(poId: string): Promise<
  { ok: true; order: PurchaseOrderSummary } | { ok: false; error: string }
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
    .eq('id', poId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Purchase order not found' };
  return { ok: true, order: mapPo(data as unknown as PoRow) };
}

export async function updatePurchaseOrderStatus(
  poId: string,
  status: PurchaseOrderStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'ISSUED') patch.issued_at = new Date().toISOString();
  if (status === 'ACCEPTED') patch.acknowledged_at = new Date().toISOString();

  const { error } = await supabase.from('purchase_orders').update(patch).eq('id', poId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchPurchaseOrderByRfq(rfqId: string): Promise<
  { ok: true; poId: string | null } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('rfq_id', rfqId)
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
