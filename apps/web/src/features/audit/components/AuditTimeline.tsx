import type { AuditEvent } from '../types/audit';
import { formatEventTime, formatEventType } from '../types/audit';

interface AuditTimelineProps {
  events: AuditEvent[];
  isLoading?: boolean;
  error?: string | null;
}

export function AuditTimeline({ events, isLoading, error }: AuditTimelineProps) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading Audit History…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No audit events recorded yet.</p>
    );
  }

  return (
    <ol className="relative space-y-4 border-l pl-6" data-testid="audit-timeline">
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span
            className="absolute -left-[1.35rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-primary bg-background"
            aria-hidden
          />
          <div className="rounded-md border bg-card p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{formatEventType(event.eventType)}</p>
              <time className="text-xs text-muted-foreground">
                {formatEventTime(event.occurredAt)}
              </time>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {event.entityType} · {event.entityId.slice(0, 8)}…
            </p>
            {Object.keys(event.payload).length > 0 && (
              <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
