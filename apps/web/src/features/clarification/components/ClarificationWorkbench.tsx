import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  CLARIFICATION_CATEGORIES,
  type ClarificationCategory,
  type ClarificationMessage,
  type RequirementSpecReference,
  fetchClarificationMessagesForBuyer,
  fetchClarificationMessagesForSupplier,
  fetchRequirementSpecsAndItems,
  subscribeClarificationMessages,
} from '../api/clarification';
import { ClarificationCategoryBadge } from './ClarificationCategoryBadge';
import { ClarificationThread } from './ClarificationThread';
import { BroadcastAddendumComposer } from './BroadcastAddendumComposer';

export interface SupplierLabel {
  invitationId: string;
  anonymousLabel: string;
}

interface ClarificationWorkbenchProps {
  rfqId: string;
  persona: 'BUYER' | 'SUPPLIER';
  supplierInvitationId?: string;
  supplierAlias?: string;
  readOnly?: boolean;
  invitedSuppliers?: SupplierLabel[];
  onActionComplete?: () => void;
  className?: string;
}

export function ClarificationWorkbench({
  rfqId,
  persona,
  supplierInvitationId,
  supplierAlias,
  readOnly = false,
  invitedSuppliers = [],
  onActionComplete,
  className = '',
}: ClarificationWorkbenchProps) {
  const [messages, setMessages] = useState<ClarificationMessage[]>([]);
  const [specs, setSpecs] = useState<RequirementSpecReference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('ALL');
  const [selectedScope, setSelectedScope] = useState<'ALL' | 'DIRECT' | 'BROADCAST'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'UNANSWERED' | 'ANSWERED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showBroadcastComposer, setShowBroadcastComposer] = useState(false);
  const [ariaAnnouncement, setAriaAnnouncement] = useState('');

  // Load messages and requirement specs
  const loadData = useCallback(async () => {
    setIsRefreshing(true);
    const [msgRes, specsRes] = await Promise.all([
      persona === 'BUYER'
        ? fetchClarificationMessagesForBuyer(rfqId)
        : fetchClarificationMessagesForSupplier(rfqId, supplierInvitationId),
      fetchRequirementSpecsAndItems(rfqId),
    ]);

    if (msgRes.ok) {
      setMessages(msgRes.messages);
      setAriaAnnouncement(`Loaded ${msgRes.messages.length} clarification messages.`);
    }
    if (specsRes.ok) {
      setSpecs(specsRes.items);
    }
    setIsLoading(false);
    setIsRefreshing(false);
  }, [rfqId, persona, supplierInvitationId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Realtime subscription
  useEffect(() => {
    const unsub = subscribeClarificationMessages(rfqId, () => {
      void loadData();
    });
    return () => unsub();
  }, [rfqId, loadData]);

  // Derived metrics for Buyer triage
  const metrics = useMemo(() => {
    const total = messages.length;
    const broadcasts = messages.filter((m) => m.isBroadcast).length;
    const directMessages = messages.filter((m) => !m.isBroadcast);

    // Group direct messages by invitationId to see which threads have pending supplier questions
    const threadMap: Record<string, ClarificationMessage[]> = {};
    directMessages.forEach((m) => {
      if (m.invitationId) {
        if (!threadMap[m.invitationId]) threadMap[m.invitationId] = [];
        threadMap[m.invitationId]!.push(m);
      }
    });

    let unansweredCount = 0;
    const supplierUnansweredMap: Record<string, boolean> = {};

    Object.entries(threadMap).forEach(([invId, thread]) => {
      const lastMsg = thread[thread.length - 1];
      if (lastMsg && lastMsg.authorSide === 'SUPPLIER') {
        unansweredCount++;
        supplierUnansweredMap[invId] = true;
      }
    });

    const categoryBreakdown: Record<ClarificationCategory, number> = {
      TECHNICAL_SPEC: 0,
      COMMERCIAL_TERMS: 0,
      DELIVERY_LOGISTICS: 0,
      COMPLIANCE: 0,
    };

    messages.forEach((m) => {
      if (m.inquiryCategory && categoryBreakdown[m.inquiryCategory] !== undefined) {
        categoryBreakdown[m.inquiryCategory]++;
      }
    });

    return {
      total,
      broadcasts,
      directCount: directMessages.length,
      unansweredCount,
      supplierUnansweredMap,
      categoryBreakdown,
      threadMap,
    };
  }, [messages]);

  // Filtered messages
  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      // Category filter
      if (selectedCategory !== 'ALL' && m.inquiryCategory !== selectedCategory) {
        return false;
      }

      // Scope filter
      if (selectedScope === 'DIRECT' && m.isBroadcast) return false;
      if (selectedScope === 'BROADCAST' && !m.isBroadcast) return false;

      // Supplier filter (for buyer persona)
      if (persona === 'BUYER' && selectedSupplierId !== 'ALL') {
        if (m.isBroadcast) {
          // If viewing specific supplier, only show broadcast if user selected all or broadcast
          return false;
        }
        if (m.invitationId !== selectedSupplierId) return false;
      }

      // Status filter
      if (selectedStatus !== 'ALL' && !m.isBroadcast && m.invitationId) {
        const isUnanswered = Boolean(metrics.supplierUnansweredMap[m.invitationId]);
        if (selectedStatus === 'UNANSWERED' && !isUnanswered) return false;
        if (selectedStatus === 'ANSWERED' && isUnanswered) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchBody = m.body.toLowerCase().includes(q);
        const matchAuthor = m.authorDisplay.toLowerCase().includes(q);
        const matchRef = (m.lineItemRef || '').toLowerCase().includes(q);
        const matchCategory = m.inquiryCategory.toLowerCase().includes(q);
        if (!matchBody && !matchAuthor && !matchRef && !matchCategory) return false;
      }

      return true;
    });
  }, [messages, selectedCategory, selectedScope, selectedSupplierId, selectedStatus, searchQuery, persona, metrics]);

  // Broadcast addenda list
  const broadcastAddenda = useMemo(() => {
    return messages.filter((m) => m.isBroadcast);
  }, [messages]);

  // Supplier private thread messages
  const supplierPrivateMessages = useMemo(() => {
    return messages.filter((m) => !m.isBroadcast);
  }, [messages]);

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center space-y-2">
        <div className="inline-block animate-spin text-2xl">⏳</div>
        <p className="text-xs font-bold text-foreground">Loading Clarification Workbench…</p>
      </div>
    );
  }

  return (
    <div
      className={`space-y-4 max-w-7xl mx-auto w-full ${className}`}
      data-testid="clarification-workbench"
    >
      {/* ARIA Live Region for Accessibility Status Announcements */}
      <div className="sr-only" role="status" aria-live="polite">
        {ariaAnnouncement}
      </div>

      {/* 1. Dual Persona Top Bar */}
      {persona === 'BUYER' ? (
        <div className="rounded-2xl border bg-card p-3 sm:p-4 shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚖️</span>
                <h2 className="text-sm sm:text-base font-black text-foreground">
                  Collaborative Clarification &amp; Sealed Q&amp;A Workbench
                </h2>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Triage supplier inquiries with sealed pre-award pseudonymity and publish neutral addenda to all participants.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => void loadData()}
                disabled={isRefreshing}
                className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-muted min-h-[44px] mobile-touch-target flex items-center gap-1.5 transition"
                title="Refresh Q&A messages"
                aria-label="Refresh Q&A messages"
              >
                <span className={isRefreshing ? 'animate-spin' : ''}>🔄</span>
                <span className="hidden sm:inline">Refresh</span>
              </button>

              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setShowBroadcastComposer((prev) => !prev)}
                  data-testid="open-broadcast-addendum-button"
                  className="rounded-xl bg-primary px-3.5 py-2 text-xs font-black text-primary-foreground shadow-xs hover:bg-primary/90 min-h-[44px] mobile-touch-target flex items-center gap-1.5 transition"
                >
                  <span>📢</span>
                  <span>{showBroadcastComposer ? 'Close Addendum' : 'Publish Addendum'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Stats Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-border/60">
            <div className="rounded-xl bg-muted/30 border border-border/50 p-2 text-center">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                Total Inquiries
              </span>
              <span className="text-sm sm:text-base font-black text-foreground">
                {metrics.total}
              </span>
            </div>

            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 p-2 text-center">
              <span className="text-[10px] uppercase font-bold text-amber-800 dark:text-amber-300 block">
                Pending Reply
              </span>
              <span className="text-sm sm:text-base font-black text-amber-900 dark:text-amber-200">
                {metrics.unansweredCount}
              </span>
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-2 text-center">
              <span className="text-[10px] uppercase font-bold text-primary block">
                Broadcast Notices
              </span>
              <span className="text-sm sm:text-base font-black text-foreground">
                {metrics.broadcasts}
              </span>
            </div>

            <div className="rounded-xl bg-muted/30 border border-border/50 p-2 text-center">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                Active Suppliers
              </span>
              <span className="text-sm sm:text-base font-black text-foreground">
                {invitedSuppliers.length || Object.keys(metrics.threadMap).length || 0}
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Supplier Top Status Banner */
        <div className="space-y-3">
          {/* Pseudonymity Protection Shield */}
          <div
            className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-50/80 dark:bg-emerald-950/40 p-3.5 sm:p-4 shadow-2xs space-y-1.5"
            data-testid="supplier-pseudonymity-banner"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">🛡️</span>
              <h3 className="text-xs sm:text-sm font-black text-emerald-950 dark:text-emerald-200">
                Identity-Protected Clarification Room
              </h3>
            </div>
            <p className="text-[11px] sm:text-xs text-emerald-900/90 dark:text-emerald-300 leading-relaxed">
              You are communicating as <strong>{supplierAlias || 'Masked Supplier'}</strong>. Your business identity, registration, and corporate profile remain strictly sealed until contract award.
            </p>
          </div>
        </div>
      )}

      {/* Broadcast Addendum Composer Modal / Panel for Buyer */}
      {persona === 'BUYER' && showBroadcastComposer && (
        <BroadcastAddendumComposer
          rfqId={rfqId}
          specReferences={specs}
          onPublished={() => {
            setShowBroadcastComposer(false);
            void loadData();
            onActionComplete?.();
          }}
          onCancel={() => setShowBroadcastComposer(false)}
        />
      )}

      {/* 2. Filter & Triage Toolbar (Buyer Persona) */}
      {persona === 'BUYER' && (
        <div className="rounded-2xl border bg-card p-3 space-y-3 shadow-2xs">
          {/* Search Bar + Scope Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="relative flex-1 min-w-[200px]">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search questions, specs, keywords…"
                className="w-full rounded-xl border border-input bg-card text-foreground px-3 py-2 pl-8 text-xs placeholder:text-muted-foreground/60 min-h-[40px] focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <span className="absolute left-2.5 top-2.5 text-xs text-muted-foreground">🔍</span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border">
              {(['ALL', 'DIRECT', 'BROADCAST'] as const).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => setSelectedScope(scope)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition min-h-[36px] mobile-touch-target ${
                    selectedScope === scope
                      ? 'bg-primary text-primary-foreground shadow-2xs font-black'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {scope === 'ALL' ? 'All Scope' : scope === 'DIRECT' ? 'Direct Q&A' : '📢 Broadcast'}
                </button>
              ))}
            </div>
          </div>

          {/* Structured Category Filter Chips */}
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">
              Filter by Inquiry Category:
            </span>
            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => setSelectedCategory('ALL')}
                className={`rounded-full px-3 py-1 text-xs font-bold border transition min-h-[38px] mobile-touch-target ${
                  selectedCategory === 'ALL'
                    ? 'bg-foreground text-background border-foreground shadow-2xs'
                    : 'bg-muted/30 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                }`}
              >
                All Categories ({metrics.total})
              </button>

              {CLARIFICATION_CATEGORIES.map((cat) => {
                const count = metrics.categoryBreakdown[cat.key] || 0;
                const isSelected = selectedCategory === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setSelectedCategory(cat.key)}
                    className={`rounded-full px-3 py-1 text-xs font-bold border transition flex items-center gap-1.5 min-h-[38px] mobile-touch-target ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground shadow-2xs font-black'
                        : 'border-border bg-muted/20 text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                    <span className="opacity-70 text-[10px]">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Supplier Alias Filter Strip (if suppliers exist) */}
          {invitedSuppliers.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-border/50">
              <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">
                Filter by Supplier Thread:
              </span>
              <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedSupplierId('ALL')}
                  className={`rounded-xl px-2.5 py-1 text-xs font-bold border transition min-h-[38px] mobile-touch-target ${
                    selectedSupplierId === 'ALL'
                      ? 'bg-primary/20 text-primary border-primary ring-1 ring-primary/40 font-black'
                      : 'bg-muted/20 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                  }`}
                >
                  All Suppliers
                </button>

                {invitedSuppliers.map((s) => {
                  const isSelected = selectedSupplierId === s.invitationId;
                  const isUnanswered = Boolean(metrics.supplierUnansweredMap[s.invitationId]);
                  const threadCount = metrics.threadMap[s.invitationId]?.length || 0;

                  return (
                    <button
                      key={s.invitationId}
                      type="button"
                      onClick={() => setSelectedSupplierId(s.invitationId)}
                      className={`rounded-xl px-2.5 py-1 text-xs font-bold border transition flex items-center gap-1.5 min-h-[38px] mobile-touch-target ${
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground shadow-2xs font-black'
                          : 'border-border bg-muted/20 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <span>🔒 {s.anonymousLabel}</span>
                      {threadCount > 0 && (
                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[9px] font-black ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-muted text-foreground'
                          }`}
                        >
                          {threadCount}
                        </span>
                      )}
                      {isUnanswered && (
                        <span
                          className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"
                          title="Awaiting Buyer Response"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. SUPPLIER VIEW: Noticeboard & Thread Layout */}
      {persona === 'SUPPLIER' && (
        <div className="space-y-4">
          {/* Public Broadcast Addenda Noticeboard */}
          {broadcastAddenda.length > 0 && (
            <section
              className="rounded-2xl border-2 border-primary/30 bg-primary/5 dark:bg-primary/10 p-4 sm:p-5 shadow-2xs space-y-3"
              data-testid="supplier-broadcast-noticeboard"
            >
              <div className="flex items-center justify-between gap-2 border-b border-primary/20 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📢</span>
                  <h3 className="text-xs sm:text-sm font-black text-foreground uppercase tracking-wide">
                    Official Broadcast Addenda ({broadcastAddenda.length})
                  </h3>
                </div>
                <span className="text-[10px] text-muted-foreground font-semibold">
                  Published to all participating suppliers
                </span>
              </div>

              <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                {broadcastAddenda.map((addendum) => (
                  <div
                    key={addendum.id}
                    className="rounded-xl border border-primary/20 bg-card p-3 text-xs space-y-1.5 shadow-2xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <ClarificationCategoryBadge category={addendum.inquiryCategory} size="sm" />
                        {addendum.lineItemRef && (
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground border border-border">
                            🏷️ {addendum.lineItemRef}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {new Date(addendum.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <p className="whitespace-pre-wrap leading-relaxed text-foreground font-medium text-xs sm:text-[13px]">
                      {addendum.body}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Private Supplier Clarification Thread */}
          <section className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <span>💬</span> Private Clarification Q&amp;A Thread
            </h3>
            <ClarificationThread
              rfqId={rfqId}
              invitationId={supplierInvitationId}
              messages={supplierPrivateMessages}
              authorSide="SUPPLIER"
              readOnly={readOnly}
              specReferences={specs}
              onPosted={() => {
                void loadData();
                onActionComplete?.();
              }}
            />
          </section>
        </div>
      )}

      {/* 4. BUYER VIEW: Thread & Messages View */}
      {persona === 'BUYER' && (
        <div className="space-y-4">
          {/* Main Thread Component */}
          <ClarificationThread
            rfqId={rfqId}
            invitationId={selectedSupplierId !== 'ALL' ? selectedSupplierId : invitedSuppliers[0]?.invitationId}
            messages={filteredMessages}
            authorSide="BUYER"
            readOnly={readOnly}
            specReferences={specs}
            onPosted={() => {
              void loadData();
              onActionComplete?.();
            }}
          />
        </div>
      )}
    </div>
  );
}
