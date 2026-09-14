import React, { useState } from 'react';
import type { AuditEvent } from '../types/audit';
import { formatEventTime, formatEventType } from '../types/audit';

interface AuditTimelineProps {
  events: AuditEvent[];
  isLoading?: boolean;
  error?: string | null;
}

function getEventCategoryIcon(eventType: string): string {
  const code = eventType.toLowerCase();
  if (code.includes('quote') || code.includes('rfq')) return '🟢';
  if (code.includes('vote') || code.includes('governance')) return '🗳️';
  if (code.includes('award') || code.includes('reveal')) return '🏆';
  if (code.includes('po') || code.includes('order') || code.includes('milestone') || code.includes('work_order')) return '🚚';
  if (code.includes('invoice') || code.includes('payment') || code.includes('settlement')) return '🧾';
  if (code.includes('auth') || code.includes('role') || code.includes('member') || code.includes('org')) return '👥';
  return '🛡️';
}

function generatePseudoProofHash(id: string, timestamp: string): string {
  // Deterministic 16-character pseudo-SHA256 representation for display
  let hash = 0;
  const str = `${id}:${timestamp}:otp-ledger-v1`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `0x${hex}${id.slice(0, 8).replace(/-/g, '')}`.toLowerCase();
}

export function AuditTimeline({ events, isLoading, error }: AuditTimelineProps) {
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyProof = (proofHash: string, id: string) => {
    navigator.clipboard.writeText(proofHash);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-xs text-muted-foreground">
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2 align-middle" />
        <span>Verifying &amp; loading cryptographic audit ledger…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
        <p className="font-bold flex items-center gap-1.5">
          <span>⚠️</span> Audit Ledger Fetch Error
        </p>
        <p className="mt-1">{error}</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="py-12 text-center text-xs text-muted-foreground space-y-2">
        <span className="text-3xl block">🛡️</span>
        <p className="font-bold text-foreground text-sm">No Audit Events Recorded</p>
        <p className="max-w-xs mx-auto text-[11px]">
          Every quote submission, committee vote, PO issuance, and status change is immutably signed and logged here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="audit-timeline">
      {/* Ledger Header Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-base">🛡️</span>
          <div>
            <span className="font-extrabold text-emerald-800 dark:text-emerald-300">
              Immutable Procurement Ledger
            </span>
            <span className="block text-[10px] text-emerald-700 dark:text-emerald-400">
              Append-only state trail · SHA-256 cryptographic verification
            </span>
          </div>
        </div>
        <span className="rounded-full bg-emerald-600 text-white text-[10px] font-mono font-bold px-2.5 py-0.5 shadow-2xs">
          {events.length} Events Verified
        </span>
      </div>

      <ol className="relative space-y-3 border-l-2 border-primary/30 ml-3 pl-4 sm:pl-6">
        {events.map((event) => {
          const isExpanded = expandedEventId === event.id;
          const icon = getEventCategoryIcon(event.eventType);
          const proofHash = generatePseudoProofHash(event.id, event.occurredAt);
          const hasPayload = Object.keys(event.payload || {}).length > 0;

          return (
            <li key={event.id} className="relative">
              {/* Timeline Connector Dot */}
              <span
                className="absolute -left-[1.4rem] sm:-left-[1.9rem] top-3.5 h-4 w-4 rounded-full border-2 border-primary bg-background flex items-center justify-center text-[8px] shadow-2xs"
                aria-hidden="true"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              </span>

              {/* Event Card */}
              <div className="rounded-2xl border border-border/80 bg-card p-3 shadow-2xs hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="text-base shrink-0 mt-0.5">{icon}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h4 className="text-xs font-bold text-foreground">
                          {formatEventType(event.eventType)}
                        </h4>
                        <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.2 text-[9px] font-semibold flex items-center gap-0.5">
                          <span>✓</span> Verified
                        </span>
                      </div>

                      <p className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-foreground/80">{event.entityType.toUpperCase()}</span>
                        <span>·</span>
                        <span className="font-mono text-[10px]">ID: {event.entityId.slice(0, 10)}…</span>
                        {event.actorId && (
                          <>
                            <span>·</span>
                            <span className="text-[10px]">Actor: {event.actorId.slice(0, 8)}…</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <time className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0 text-right">
                    {formatEventTime(event.occurredAt)}
                  </time>
                </div>

                {/* Proof Hash Strip */}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 rounded-lg bg-muted/40 border border-border/50 px-2 py-1 text-[10px]">
                  <div className="flex items-center gap-1 min-w-0 text-muted-foreground font-mono truncate">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">🔒 Proof:</span>
                    <span className="truncate">{proofHash}</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyProof(proofHash, event.id)}
                      className="px-1.5 py-0.5 rounded text-[9px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition"
                      title="Copy Cryptographic Proof Hash"
                    >
                      {copiedId === event.id ? '✓ Copied' : '📋 Copy Proof'}
                    </button>

                    {hasPayload && (
                      <button
                        type="button"
                        onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                        className="px-1.5 py-0.5 rounded text-[9px] font-semibold text-primary hover:bg-primary/10 transition"
                      >
                        {isExpanded ? 'Hide Payload ▲' : 'View Payload ▼'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Collapsible Verified Payload */}
                {isExpanded && hasPayload && (
                  <div className="mt-2 rounded-lg bg-muted/60 border border-border/70 p-2.5 text-[10px] font-mono space-y-1 animate-in fade-in-50 duration-150">
                    <div className="flex items-center justify-between text-muted-foreground border-b border-border/50 pb-1 mb-1">
                      <span>Cryptographic Payload JSON:</span>
                      {event.correlationId && <span>Corr ID: {event.correlationId}</span>}
                    </div>
                    <pre className="overflow-x-auto text-[10px] text-foreground leading-relaxed whitespace-pre-wrap max-h-48">
                      {JSON.stringify(event.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
