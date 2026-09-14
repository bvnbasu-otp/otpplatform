import React, { useState, useEffect } from 'react';
import { fetchSupportTickets, resolveSupportTicket } from '../api/admin-ops';
import type { SupportTicketItem, SupportTicketCategory, SupportTicketStatus } from '../types/admin';

export function AdminSupportTicketsPanel() {
  const [tickets, setTickets] = useState<SupportTicketItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketItem | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const loadTickets = async () => {
    setIsLoading(true);
    const res = await fetchSupportTickets({
      category: selectedCategory || undefined,
      status: selectedStatus || undefined,
      limit: 100,
    });
    if (res.ok) {
      setTickets(res.tickets);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    void loadTickets();
  }, [selectedCategory, selectedStatus]);

  const handleUpdateStatus = async (ticketId: string, status: SupportTicketStatus) => {
    setIsUpdating(true);
    const res = await resolveSupportTicket(ticketId, status, resolutionNotes.trim() || undefined);
    if (res.ok) {
      setResolutionNotes('');
      setSelectedTicket(null);
      void loadTickets();
    } else {
      alert(res.error || 'Failed to update ticket');
    }
    setIsUpdating(false);
  };

  return (
    <div className="space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      {/* Top Banner */}
      <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl shrink-0">🎫</span>
            <h3 className="text-sm sm:text-base font-bold text-foreground">Disputes &amp; Support Escalations Console</h3>
          </div>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
            Incoming buyer and supplier dispute claims, mediation tickets, and feedback routed to Ops with resolution notes.
          </p>
        </div>

        <button
          type="button"
          onClick={loadTickets}
          disabled={isLoading}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted active:scale-98 transition shadow-2xs"
        >
          {isLoading ? 'Refreshing…' : '🔄 Refresh Queue'}
        </button>
      </div>

      {/* Filter Chips Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-muted/20 p-3 rounded-2xl border">
        {/* Category Filters */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-bold text-muted-foreground mr-1">Category:</span>
          <button
            type="button"
            onClick={() => setSelectedCategory('')}
            className={`inline-flex min-h-[44px] items-center rounded-xl px-3 py-1 font-semibold transition active:scale-98 mobile-touch-target ${
              selectedCategory === '' ? 'bg-primary text-primary-foreground font-bold shadow-xs' : 'bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            All Tickets ({tickets.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('BUG')}
            className={`inline-flex min-h-[44px] items-center rounded-xl px-3 py-1 font-semibold transition active:scale-98 mobile-touch-target ${
              selectedCategory === 'BUG' ? 'bg-primary text-primary-foreground font-bold shadow-xs' : 'bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            🐛 Bugs
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('FEATURE')}
            className={`inline-flex min-h-[44px] items-center rounded-xl px-3 py-1 font-semibold transition active:scale-98 mobile-touch-target ${
              selectedCategory === 'FEATURE' ? 'bg-primary text-primary-foreground font-bold shadow-xs' : 'bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            💡 Features
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('OPS')}
            className={`inline-flex min-h-[44px] items-center rounded-xl px-3 py-1 font-semibold transition active:scale-98 mobile-touch-target ${
              selectedCategory === 'OPS' ? 'bg-primary text-primary-foreground font-bold shadow-xs' : 'bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            🛡️ Ops / Dispute
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('SALES')}
            className={`inline-flex min-h-[44px] items-center rounded-xl px-3 py-1 font-semibold transition active:scale-98 mobile-touch-target ${
              selectedCategory === 'SALES' ? 'bg-primary text-primary-foreground font-bold shadow-xs' : 'bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            💼 Sales
          </button>
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-2">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-xl border bg-card px-3 py-2 text-xs font-semibold text-foreground cursor-pointer min-h-[44px]"
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open Only</option>
            <option value="IN_REVIEW">In Review</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
      </div>

      {/* Tickets List */}
      {isLoading ? (
        <p className="py-12 text-center text-xs text-muted-foreground animate-pulse">Loading support tickets…</p>
      ) : tickets.length === 0 ? (
        <div className="rounded-2xl border bg-card p-12 text-center space-y-2">
          <span className="text-3xl">🎉</span>
          <h4 className="text-sm font-bold text-foreground">Support Queue is Clean!</h4>
          <p className="text-xs text-muted-foreground">No open support tickets or buyer/supplier escalation requests found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 w-full max-w-full">
          {tickets.map((t) => (
            <article
              key={t.id}
              className="rounded-2xl border bg-card p-4 shadow-2xs space-y-3.5 hover:border-primary/40 transition flex flex-col justify-between"
            >
              <div className="space-y-2 border-b border-border/50 pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-xs font-black text-foreground bg-muted px-2 py-0.5 rounded-md">
                      {t.ticketNumber}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      t.category === 'BUG' ? 'bg-red-100 text-red-900 border border-red-300' :
                      t.category === 'FEATURE' || t.category === 'ENHANCEMENT' ? 'bg-purple-100 text-purple-900 border border-purple-300' :
                      t.category === 'OPS' ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                      'bg-blue-100 text-blue-900 border border-blue-300'
                    }`}>
                      {t.category}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      t.priority === 'CRITICAL' ? 'bg-red-600 text-white animate-pulse' :
                      t.priority === 'HIGH' ? 'bg-amber-500 text-white' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {t.priority}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      t.status === 'OPEN' ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300' :
                      t.status === 'IN_REVIEW' ? 'bg-blue-500/20 text-blue-800 dark:text-blue-300' :
                      'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                    }`}>
                      {t.status}
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-foreground">{t.subject}</h4>
                  <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                    {new Date(t.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Problem Description */}
              <div className="space-y-2 text-xs flex-1">
                <p className="text-xs text-foreground leading-relaxed bg-muted/20 p-3 rounded-xl border font-mono whitespace-pre-wrap">
                  {t.description}
                </p>

                {/* User Info */}
                <div className="rounded-xl border bg-muted/10 p-2.5 text-[11px] text-muted-foreground space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span>From: <strong className="text-foreground">{t.userEmail || 'Anonymous'}</strong></span>
                    <span>Role: <strong>{t.userRole || 'N/A'}</strong> ({t.userSide || 'Portal'})</span>
                  </div>
                  {t.pageUrl && (
                    <div className="truncate" title={t.pageUrl}>
                      📍 URL: <span className="font-mono">{t.pageUrl.replace(/^https?:\/\/[^/]+/, '')}</span>
                    </div>
                  )}
                </div>

                {t.resolutionNotes && (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-2.5 text-xs text-emerald-950 dark:text-emerald-200 font-medium">
                    <strong>Mediation &amp; Resolution Notes:</strong> {t.resolutionNotes}
                  </div>
                )}
              </div>

              {/* Footer Actions: 44px+ touch targets */}
              <div className="pt-2 border-t border-border/50 flex flex-wrap items-center gap-2">
                {t.status === 'OPEN' && (
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => handleUpdateStatus(t.id, 'IN_REVIEW')}
                    className="flex-1 inline-flex min-h-[44px] items-center justify-center rounded-xl border bg-card px-3.5 py-2 font-semibold text-foreground hover:bg-muted active:scale-98 transition text-xs shadow-2xs mobile-touch-target"
                  >
                    Mark In Review
                  </button>
                )}
                {t.status !== 'RESOLVED' && (
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => {
                      const notes = prompt('Enter resolution notes / mediation summary:');
                      if (notes !== null) {
                        setResolutionNotes(notes);
                        void resolveSupportTicket(t.id, 'RESOLVED', notes).then(() => loadTickets());
                      }
                    }}
                    className="flex-1 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-700 active:scale-98 transition text-xs shadow-2xs mobile-touch-target"
                  >
                    ✓ Mark Resolved &amp; Close Dispute
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
