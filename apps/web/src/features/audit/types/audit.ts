import { formatDateTimeIST } from '@/lib/date-utils';

export interface AuditEvent {
  id: string;
  eventType: string;
  actorId: string | null;
  organizationId: string | null;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  correlationId: string | null;
}

/** Human-readable label for canonical event types. */
export function formatEventType(eventType: string): string {
  return eventType
    .split('.')
    .map((part) => part.replace(/_/g, ' '))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' · ');
}

export function formatEventTime(iso: string): string {
  return formatDateTimeIST(iso);
}
