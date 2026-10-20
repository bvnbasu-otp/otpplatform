import type { WorkOrderStatus } from '@otp/domain';
import { supabase } from '@/lib/supabase';
import type { WorkOrderSummary } from '../types/fulfillment';
import { validateMilestoneTransition } from '../lib/milestone-progress';

interface WoRow {
  id: string;
  purchase_order_id: string;
  supplier_id: string;
  status: WorkOrderStatus;
  title: string;
  progress_percent: number;
  completed_at: string | null;
  buyer_accepted_at: string | null;
  inspection_notes: string | null;
  rating?: number | null;
  review_text?: string | null;
  purchase_orders?:
    | {
        po_number: string;
        payment_structure?: string | null;
        payment_schedule?: unknown;
        total_amount?: number;
        currency?: string;
      }
    | null;
}

function mapWo(row: WoRow): WorkOrderSummary {
  return {
    id: row.id,
    purchaseOrderId: row.purchase_order_id,
    supplierId: row.supplier_id,
    status: row.status,
    title: row.title,
    progressPercent: row.progress_percent,
    completedAt: row.completed_at,
    buyerAcceptedAt: row.buyer_accepted_at,
    inspectionNotes: row.inspection_notes,
    rating: row.rating != null ? Number(row.rating) : null,
    reviewText: row.review_text ?? row.inspection_notes,
    poNumber: row.purchase_orders?.po_number,
    paymentStructure: row.purchase_orders?.payment_structure ?? null,
    paymentSchedule: Array.isArray(row.purchase_orders?.payment_schedule)
      ? (row.purchase_orders.payment_schedule as WorkOrderSummary['paymentSchedule'])
      : null,
    poTotalAmount: row.purchase_orders?.total_amount != null ? Number(row.purchase_orders.total_amount) : undefined,
    poCurrency: row.purchase_orders?.currency,
  };
}

export async function fetchWorkOrders(): Promise<
  { ok: true; workOrders: WorkOrderSummary[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('work_orders')
    .select(
      'id, purchase_order_id, supplier_id, status, title, progress_percent, completed_at, buyer_accepted_at, inspection_notes, rating, review_text, purchase_orders(po_number)',
    )
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: error.message };
  return { ok: true, workOrders: (data as unknown as WoRow[]).map(mapWo) };
}

export async function fetchWorkOrderByPo(poId: string): Promise<
  { ok: true; workOrder: WorkOrderSummary | null } | { ok: false; error: string }
> {
  const cleanId = (poId || '').trim();
  if (!cleanId) return { ok: true, workOrder: null };

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
  let resolvedPoId = cleanId;

  if (!isUuid) {
    const { data: poData } = await supabase
      .from('purchase_orders')
      .select('id')
      .eq('po_number', cleanId)
      .maybeSingle();

    if (!poData?.id) return { ok: true, workOrder: null };
    resolvedPoId = poData.id;
  }

  try {
    const { data, error } = await supabase
      .from('work_orders')
      .select(
        'id, purchase_order_id, supplier_id, status, title, progress_percent, completed_at, buyer_accepted_at, inspection_notes, rating, review_text, purchase_orders(po_number, payment_structure, payment_schedule, total_amount, currency)',
      )
      .eq('purchase_order_id', resolvedPoId)
      .maybeSingle();

    if (!error && data) {
      return { ok: true, workOrder: mapWo(data as unknown as WoRow) };
    }

    // Fallback: simple query if relation join fails
    const { data: rawData, error: rawError } = await supabase
      .from('work_orders')
      .select('*')
      .eq('purchase_order_id', resolvedPoId)
      .maybeSingle();

    if (rawError) return { ok: false, error: rawError.message };
    if (!rawData) return { ok: true, workOrder: null };
    return {
      ok: true,
      workOrder: {
        id: rawData.id,
        purchaseOrderId: rawData.purchase_order_id,
        supplierId: rawData.supplier_id,
        status: rawData.status,
        title: rawData.title,
        progressPercent: Number(rawData.progress_percent || 0),
        completedAt: rawData.completed_at,
        buyerAcceptedAt: rawData.buyer_accepted_at,
        inspectionNotes: rawData.inspection_notes,
        rating: rawData.rating != null ? Number(rawData.rating) : null,
        reviewText: rawData.review_text ?? rawData.inspection_notes,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch work order';
    return { ok: false, error: msg };
  }
}

export async function fetchWorkOrder(woId: string): Promise<
  { ok: true; workOrder: WorkOrderSummary } | { ok: false; error: string }
> {
  const cleanId = (woId || '').trim();
  if (!cleanId) return { ok: false, error: 'Work order identifier required' };

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
  if (!isUuid) return { ok: false, error: 'Work order not found' };

  try {
    const { data, error } = await supabase
      .from('work_orders')
      .select(
        'id, purchase_order_id, supplier_id, status, title, progress_percent, completed_at, buyer_accepted_at, inspection_notes, rating, review_text, purchase_orders(po_number, payment_structure, payment_schedule, total_amount, currency)',
      )
      .eq('id', cleanId)
      .maybeSingle();

    if (!error && data) {
      return { ok: true, workOrder: mapWo(data as unknown as WoRow) };
    }

    // Fallback: simple flat select
    const { data: rawData, error: rawError } = await supabase
      .from('work_orders')
      .select('*')
      .eq('id', cleanId)
      .maybeSingle();

    if (rawError) return { ok: false, error: rawError.message };
    if (!rawData) return { ok: false, error: 'Work order not found' };

    const { data: poData } = await supabase
      .from('purchase_orders')
      .select('po_number, payment_structure, payment_schedule, total_amount, currency')
      .eq('id', rawData.purchase_order_id)
      .maybeSingle();

    return {
      ok: true,
      workOrder: {
        id: rawData.id,
        purchaseOrderId: rawData.purchase_order_id,
        supplierId: rawData.supplier_id,
        status: rawData.status,
        title: rawData.title,
        progressPercent: Number(rawData.progress_percent || 0),
        completedAt: rawData.completed_at,
        buyerAcceptedAt: rawData.buyer_accepted_at,
        inspectionNotes: rawData.inspection_notes,
        rating: rawData.rating != null ? Number(rawData.rating) : null,
        reviewText: rawData.review_text ?? rawData.inspection_notes,
        poNumber: poData?.po_number,
        paymentStructure: poData?.payment_structure ?? null,
        paymentSchedule: Array.isArray(poData?.payment_schedule)
          ? (poData.payment_schedule as WorkOrderSummary['paymentSchedule'])
          : null,
        poTotalAmount: poData?.total_amount != null ? Number(poData.total_amount) : undefined,
        poCurrency: poData?.currency,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch work order';
    return { ok: false, error: msg };
  }
}

export async function createWorkOrder(
  poId: string,
  _supplierId: string,
  _title: string,
): Promise<{ ok: true; workOrderId: string } | { ok: false; error: string }> {
  const cleanPoId = (poId || '').trim();
  if (!cleanPoId) return { ok: false, error: 'Purchase order identifier is required.' };

  const rpcRes = await supabase.rpc('initialize_work_order', { p_po_id: cleanPoId });
  if (rpcRes.error) {
    return {
      ok: false,
      error: rpcRes.error.message || 'Work order could not be initialized. Try again or contact support.',
    };
  }

  const payload = rpcRes.data;
  if (payload && typeof payload === 'object' && 'work_order_id' in payload) {
    return { ok: true, workOrderId: String((payload as { work_order_id: string }).work_order_id) };
  }

  return { ok: false, error: 'Work order initialization did not return a work order id.' };
}

/**
 * Records the next 25% milestone. The current value is re-read from the database
 * and the write is conditional on it, so a stale screen or a double tap cannot
 * skip a milestone or advance twice.
 */
export async function updateWorkOrderProgress(
  woId: string,
  progressPercent: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: current, error: readError } = await supabase
    .from('work_orders')
    .select(
      'id, progress_percent, status, purchase_orders(payment_structure, payment_schedule)',
    )
    .eq('id', woId)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  if (!current) return { ok: false, error: 'Work order not found.' };

  const row = current as {
    progress_percent?: number;
    purchase_orders?: { payment_structure?: string; payment_schedule?: unknown } | null;
  };
  const poPlan = row.purchase_orders;
  const paymentStructure = poPlan?.payment_structure ?? null;
  const paymentSchedule = Array.isArray(poPlan?.payment_schedule)
    ? (poPlan.payment_schedule as { percentage?: number }[])
    : null;

  const fromPercent = Number(row.progress_percent ?? 0);
  const check = validateMilestoneTransition(
    fromPercent,
    progressPercent,
    paymentStructure,
    paymentSchedule,
  );
  if (!check.ok) return check;

  // COMPLETED is set only by the buyer's accept_delivery_inspection sign-off;
  // the server rejects any other path.
  const status: WorkOrderStatus = 'IN_PROGRESS';
  const patch: Record<string, unknown> = {
    progress_percent: progressPercent,
    status,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error } = await supabase
    .from('work_orders')
    .update(patch)
    .eq('id', woId)
    .eq('progress_percent', fromPercent)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!Array.isArray(updated) || updated.length === 0) {
    return { ok: false, error: 'Progress was already updated. Refresh to see the latest milestone.' };
  }
  return { ok: true };
}

export async function acceptDeliveryInspection(
  workOrderId: string,
  rating: number,
  notes?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc('accept_delivery_inspection', {
    p_work_order_id: workOrderId,
    p_notes: notes ?? null,
    p_rating: rating,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchWorkOrderMilestones(workOrderId: string): Promise<
  { ok: true; milestones: Array<Record<string, unknown>> } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('work_order_milestones')
    .select('*')
    .eq('work_order_id', workOrderId)
    .order('milestone_index', { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, milestones: data || [] };
}
