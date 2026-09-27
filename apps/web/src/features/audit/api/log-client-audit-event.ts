import { supabase } from '@/lib/supabase';

export interface ClientAuditEventInput {
  eventType: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
  organizationId?: string | null;
  isDemo?: boolean | null;
}

/**
 * Appends an audit event through the log_client_audit_event RPC. Clients have
 * no direct INSERT on audit_events; the server sets actor_id from the session
 * and only accepts admin.* events from platform admins.
 */
export async function logClientAuditEvent(
  input: ClientAuditEventInput,
): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('log_client_audit_event', {
    p_event_type: input.eventType,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_payload: input.payload ?? {},
    p_organization_id: input.organizationId ?? null,
    p_is_demo: input.isDemo ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as { ok?: boolean; id?: string; error?: string } | null;
  if (!result?.ok) return { ok: false, error: result?.error || 'Audit event was not recorded' };
  return { ok: true, id: result.id };
}
