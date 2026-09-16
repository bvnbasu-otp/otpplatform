import type { WorkOrderStatus } from '@otp/domain';
import { supabase } from '@/lib/supabase';
import type { WorkOrderSummary } from '../types/fulfillment';

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
  purchase_orders?: { po_number: string } | null;
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
        'id, purchase_order_id, supplier_id, status, title, progress_percent, completed_at, buyer_accepted_at, inspection_notes, rating, review_text, purchase_orders(po_number)',
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
        'id, purchase_order_id, supplier_id, status, title, progress_percent, completed_at, buyer_accepted_at, inspection_notes, rating, review_text, purchase_orders(po_number)',
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

export async function createWorkOrder(
  poId: string,
  supplierId: string,
  title: string,
): Promise<{ ok: true; workOrderId: string } | { ok: false; error: string }> {
  const rpcRes = await supabase.rpc('initialize_work_order', { p_po_id: poId });
  if (!rpcRes.error && rpcRes.data && typeof rpcRes.data === 'object' && 'work_order_id' in rpcRes.data) {
    return { ok: true, workOrderId: String((rpcRes.data as { work_order_id: string }).work_order_id) };
  }

  const { data, error } = await supabase
    .from('work_orders')
    .insert({
      purchase_order_id: poId,
      supplier_id: supplierId,
      title,
      status: 'NOT_STARTED',
      progress_percent: 0,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, workOrderId: data.id };
}

export async function updateWorkOrderProgress(
  woId: string,
  progressPercent: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const status: WorkOrderStatus =
    progressPercent >= 100 ? 'COMPLETED' : progressPercent > 0 ? 'IN_PROGRESS' : 'NOT_STARTED';

  const patch: Record<string, unknown> = {
    progress_percent: progressPercent,
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'COMPLETED') patch.completed_at = new Date().toISOString();

  const { error } = await supabase.from('work_orders').update(patch).eq('id', woId);
  if (error) return { ok: false, error: error.message };
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
