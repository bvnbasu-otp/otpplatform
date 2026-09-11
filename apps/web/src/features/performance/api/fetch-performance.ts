import { supabase } from '@/lib/supabase';
import type { PerformanceRecord } from '../types/performance';

interface PerformanceRow {
  id: string;
  supplier_id: string;
  rfq_id: string;
  organization_id: string;
  quoted_total: number;
  actual_total: number | null;
  quoted_delivery_days: number;
  actual_delivery_days: number | null;
  quality_rating: number | null;
  variance: Record<string, unknown> | null;
  recorded_at: string;
}

function mapRow(row: PerformanceRow): PerformanceRecord {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    rfqId: row.rfq_id,
    organizationId: row.organization_id,
    quotedTotal: Number(row.quoted_total),
    actualTotal: row.actual_total != null ? Number(row.actual_total) : null,
    quotedDeliveryDays: row.quoted_delivery_days,
    actualDeliveryDays: row.actual_delivery_days,
    qualityRating: row.quality_rating != null ? Number(row.quality_rating) : null,
    variance: row.variance,
    recordedAt: row.recorded_at,
  };
}

export async function fetchPerformanceRecords(options?: {
  rfqId?: string;
}): Promise<
  { ok: true; records: PerformanceRecord[] } | { ok: false; error: string }
> {
  let query = supabase
    .from('procurement_performance_records')
    .select(
      'id, supplier_id, rfq_id, organization_id, quoted_total, actual_total, quoted_delivery_days, actual_delivery_days, quality_rating, variance, recorded_at',
    )
    .order('recorded_at', { ascending: false });

  if (options?.rfqId) {
    query = query.eq('rfq_id', options.rfqId);
  }

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  return { ok: true, records: (data as PerformanceRow[]).map(mapRow) };
}
