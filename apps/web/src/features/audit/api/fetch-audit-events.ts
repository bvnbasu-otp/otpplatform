import { supabase } from '@/lib/supabase';
import type { AuditEvent } from '../types/audit';

interface AuditRow {
  id: string;
  event_type: string;
  actor_id: string | null;
  organization_id: string | null;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown> | null;
  occurred_at: string;
  correlation_id: string | null;
}

function mapRow(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    actorId: row.actor_id,
    organizationId: row.organization_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payload: row.payload ?? {},
    occurredAt: row.occurred_at,
    correlationId: row.correlation_id,
  };
}

export async function fetchAuditEvents(options?: {
  rfqId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ ok: true; events: AuditEvent[]; totalCount: number } | { ok: false; error: string }> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  let query = supabase
    .from('audit_events')
    .select(
      'id, event_type, actor_id, organization_id, entity_type, entity_id, payload, occurred_at, correlation_id',
      { count: 'exact' },
    )
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.rfqId) {
    query = query.eq('entity_id', options.rfqId);
  }

  const { data, count, error } = await query;
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    events: (data as AuditRow[]).map(mapRow),
    totalCount: count ?? 0,
  };
}
