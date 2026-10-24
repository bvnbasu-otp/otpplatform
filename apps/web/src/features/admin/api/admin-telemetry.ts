import { logClientAuditEvent } from '@/features/audit/api/log-client-audit-event';

export interface AdminTelemetryEventInput {
  eventType: string;
  entityType: 'REQUIREMENT' | 'RFQ' | 'QUOTE' | 'PURCHASE_ORDER' | 'INVOICE' | 'SUPPLIER' | 'BUYER' | 'SYSTEM';
  entityId: string;
  action: string;
  reason?: string;
  fromState?: string;
  toState?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Emits a structured telemetry audit event into public.audit_events
 */
export async function emitAdminTelemetryEvent(input: AdminTelemetryEventInput): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const result = await logClientAuditEvent({
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      payload: {
        action: input.action,
        from_state: input.fromState,
        to_state: input.toState,
        reason: input.reason || 'Admin Diagnostic Override',
        metadata: input.metadata || {},
        timestamp: new Date().toISOString(),
      },
    });

    if (!result.ok) {
      console.warn('Telemetry event failed to persist to audit_events:', result.error);
      return { ok: false, error: result.error };
    }

    return { ok: true };
  } catch (err: any) {
    console.error('emitAdminTelemetryEvent error:', err);
    return { ok: false, error: err?.message || 'Unknown error emitting telemetry' };
  }
}
