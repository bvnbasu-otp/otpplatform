import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchAuditEvents } from '../api/fetch-audit-events';
import { AuditTimeline } from '../components/AuditTimeline';
import type { AuditEvent } from '../types/audit';

interface AuditLogPageProps {
  rfqId?: string;
  title?: string;
}

export function AuditLogPage({
  rfqId,
  title = 'Audit History & Proofs',
}: AuditLogPageProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const loadEvents = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchAuditEvents({ rfqId, limit: 100 });
      if (!result.ok) {
        setError(result.error);
        setEvents([]);
      } else {
        setError(null);
        setEvents(result.events);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit events');
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadEvents();
  }, [rfqId]);

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-4 py-3 space-y-3 overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      {/* 1. Page Header & Navigation Bar */}
      <header className="rounded-2xl border border-border bg-card p-3 shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              to="/dashboard"
              className="flex items-center justify-center h-8 w-8 rounded-xl border border-border/70 bg-muted/40 hover:bg-muted text-foreground transition text-xs shrink-0"
              title="Return to Dashboard"
            >
              ←
            </Link>
            <div className="min-w-0">
              <h1 className="text-sm font-extrabold text-foreground flex items-center gap-1.5 truncate">
                <span>🛡️</span>
                <span>{title}</span>
              </h1>
              <p className="text-[11px] text-muted-foreground truncate">
                {rfqId ? `Cryptographic audit ledger for RFQ #${rfqId.slice(0, 8)}…` : 'Cryptographic append-only ledger of procurement transactions'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void loadEvents()}
              disabled={isLoading}
              className="rounded-xl border border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition shadow-2xs min-h-[44px] mobile-touch-target flex items-center gap-1.5"
            >
              <span>↻</span>
              <span>{isLoading ? 'Verifying…' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Segmented Control / Tab Pills */}
        <div
          role="tablist"
          aria-label="Activity Mode Switcher"
          className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1 border border-border/80"
        >
          <button
            type="button"
            role="tab"
            aria-selected={false}
            onClick={() => navigate('/notifications')}
            className="flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold text-muted-foreground hover:text-foreground transition-all min-h-[44px] mobile-touch-target"
          >
            <span>🔔 Notifications Feed</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={true}
            className="flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold bg-card text-foreground shadow-xs ring-1 ring-border transition-all min-h-[44px] mobile-touch-target"
          >
            <span>🛡️ Audit Trail</span>
            {events.length > 0 && (
              <span className="rounded-full bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-mono font-bold px-1.5 py-0.2 border border-emerald-500/30">
                {events.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* 2. Audit Trail Content */}
      <section className="rounded-2xl border border-border bg-card p-3.5 sm:p-4 shadow-xs">
        <AuditTimeline events={events} isLoading={isLoading} error={error} />
      </section>
    </div>
  );
}
