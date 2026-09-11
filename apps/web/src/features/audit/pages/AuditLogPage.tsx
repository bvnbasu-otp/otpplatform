import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAuditEvents } from '../api/fetch-audit-events';
import { AuditTimeline } from '../components/AuditTimeline';
import type { AuditEvent } from '../types/audit';

interface AuditLogPageProps {
  rfqId?: string;
  title?: string;
}

export function AuditLogPage({
  rfqId,
  title = 'Audit history',
}: AuditLogPageProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      const result = await fetchAuditEvents({ rfqId, limit: 50 });
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setEvents([]);
      } else {
        setError(null);
        setEvents(result.events);
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [rfqId]);

  return (
    <div className="zero-scroll-container p-3 max-w-4xl mx-auto w-full">
      <header className="rounded-lg border bg-card px-3 py-1.5 shadow-2xs shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link to="/" className="text-xs font-semibold text-muted-foreground hover:text-foreground shrink-0">
            ← Dashboard
          </Link>
          <span className="text-muted-foreground">|</span>
          <h1 className="text-xs font-bold text-foreground truncate">{title}</h1>
        </div>
        <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded shrink-0">
          Append-Only Audit Trail
        </span>
      </header>

      <div className="zero-scroll-pane mt-2 rounded-lg border bg-card p-3 shadow-2xs">
        <AuditTimeline events={events} isLoading={isLoading} error={error} />
      </div>
    </div>
  );
}
