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
}): Promise<{ ok: true; events: AuditEvent[] } | { ok: false; error: string }> {
  let query = supabase
    .from('audit_events')
    .select(
      'id, event_type, actor_id, organization_id, entity_type, entity_id, payload, occurred_at, correlation_id',
    )
    .order('occurred_at', { ascending: false });

  if (options?.rfqId) {
    query = query.limit(100);
  } else if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };

  let events = (data as AuditRow[]).map(mapRow);
  if (options?.rfqId) {
    events = events.filter(
      (e) =>
        e.entityId === options.rfqId ||
        (e.entityType === 'rfq' && e.entityId === options.rfqId),
    );
  }
  return { ok: true, events };
}
