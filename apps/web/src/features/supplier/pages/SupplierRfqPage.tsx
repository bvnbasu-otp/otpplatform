import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortalRole } from '@/features/auth/use-portal-role';
import {
  fetchSharedRequirementAttachments,
  type Attachment,
} from '@/features/attachments';
import {
  ClarificationThread,
  fetchClarificationMessagesForSupplier,
} from '@/features/clarification';
import type { ClarificationMessage } from '@/features/clarification/api/clarification';
import { RfqPhasePanel } from '@/features/phase';
import { formatDeadlineCountdown } from '@/lib/date-utils';
import { fetchSupplierRfq, markInvitationViewed } from '../api/fetch-invitations';
import { fetchSupplierQuoteForRfq } from '../api/fetch-quote';
import { SupplierQuotePanel } from '../components/SupplierQuotePanel';
import {
  SupplierRequirementPanel,
  type SupplierPrimaryAction,
} from '../components/SupplierRequirementPanel';
import type {
  SupplierQuote,
  SupplierRfqDetail,
} from '../types/supplier-quote';

export function SupplierRfqPage({ rfqId }: { rfqId: string }) {
  const { profile: _profile } = usePortalRole();
  const [invitation, setInvitation] = useState<SupplierRfqDetail | null>(null);
  const [quote, setQuote] = useState<SupplierQuote | null>(null);
  const [clarificationMessages, setClarificationMessages] = useState<ClarificationMessage[]>([]);
  const [buyerFiles, setBuyerFiles] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const rfqStatus = invitation?.rfqStatus ?? 'OPEN';
  const rfqOpen = rfqStatus === 'OPEN';
  const inClarification = rfqStatus === 'CLARIFICATION';

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const invResult = await fetchSupplierRfq(rfqId);
    if (!invResult.ok) {
      setError(invResult.error);
      setIsLoading(false);
      return;
    }

    const inv = invResult.rfq;
    setInvitation(inv);

    if (inv?.status === 'INVITED') {
      await markInvitationViewed(inv.invitationId);
    }

    const quoteResult = await fetchSupplierQuoteForRfq(rfqId);
    if (!quoteResult.ok) {
      setError(quoteResult.error);
    } else {
      setQuote(quoteResult.quote);
    }

    const buyerFileResult = await fetchSharedRequirementAttachments(rfqId);
    if (buyerFileResult.ok) setBuyerFiles(buyerFileResult.attachments);

    if (inv && inv.rfqStatus === 'CLARIFICATION') {
      const msgResult = await fetchClarificationMessagesForSupplier(rfqId, inv.invitationId);
      if (msgResult.ok) setClarificationMessages(msgResult.messages);
    }

    setIsLoading(false);
  }, [rfqId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) {
    return (
      <div className="p-3 sm:p-4 max-w-5xl mx-auto w-full space-y-4" data-testid="supplier-rfq-loading">
        <div className="h-12 w-full rounded-2xl bg-muted/40 animate-pulse" />
        <div className="h-44 w-full rounded-2xl bg-muted/40 animate-pulse" />
        <div className="h-32 w-full rounded-2xl bg-muted/40 animate-pulse" />
        <div className="h-48 w-full rounded-2xl bg-muted/40 animate-pulse" />
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center space-y-4" data-testid="supplier-rfq-not-found">
        <span className="text-4xl block">⚠️</span>
        <h2 className="text-base font-black text-foreground">Opportunity Not Found</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {error || 'This enquiry could not be found or access is restricted for your supplier account.'}
        </p>
        <div className="pt-2">
          <Link
            to="/"
            className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition mobile-touch-target"
          >
            ← Return to Supplier Opportunities
          </Link>
        </div>
      </div>
    );
  }

  const countdown = formatDeadlineCountdown(invitation.quoteDeadline);

  // Single State-Aware Primary Action (Truthful Routing Only)
  const primaryAction: SupplierPrimaryAction = (() => {
    if (quote?.status === 'SELECTED') {
      return {
        label: 'View Outcome',
        to: '/supplier/purchase-orders',
        icon: '🏆',
        variant: 'primary',
      };
    }
    if (quote) {
      return {
        label: 'View Submitted Quote',
        href: '#submitted-quote',
        icon: '📄',
        variant: 'secondary',
      };
    }
    if (inClarification) {
      return {
        label: 'View Clarification',
        href: '#clarification-thread',
        icon: '💬',
        variant: 'primary',
      };
    }
    if (rfqOpen) {
      return {
        label: 'Respond to RFQ',
        to: `/supplier/rfq/${rfqId}`,
        icon: '⚡',
        variant: 'primary',
      };
    }
    return {
      label: 'View RFQ',
      href: '#requirement-details',
      icon: '🔒',
      variant: 'concluded',
    };
  })();

  return (
    <div
      className="p-3 sm:p-4 max-w-5xl mx-auto w-full space-y-4 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] overflow-x-hidden"
      data-testid="supplier-rfq-page"
    >
      {/* 1. Top Header Bar: Navigation, Ref Code & Anonymous Alias */}
      <header className="rounded-2xl border bg-card p-3 shadow-2xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to="/"
            className="min-h-[48px] px-3 rounded-xl text-xs font-black text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-1 shrink-0 mobile-touch-target transition"
          >
            ← Opportunities
          </Link>
          <span className="text-muted-foreground/60">·</span>
          <span className="text-xs font-mono font-black text-foreground truncate">
            {invitation.publicRef || 'RFQ'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="rounded-full bg-muted/80 px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
            Alias: {invitation.anonymousLabel}
          </span>
          <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 text-[10px] font-black">
            {rfqStatus === 'OPEN'
              ? '⚡ Quoting Active'
              : rfqStatus === 'EVALUATING'
              ? '⚖️ Evaluation'
              : inClarification
              ? '💬 Clarification'
              : quote?.status === 'SELECTED'
              ? '🏆 Won Award'
              : quote?.status === 'NOT_SELECTED'
              ? '🔒 Concluded'
              : rfqStatus === 'AWARDED' || rfqStatus === 'CLOSED'
              ? '🔒 Concluded'
              : rfqStatus}
          </span>
        </div>
      </header>

      {/* 2. Lifecycle Stage Navigator */}
      <RfqPhasePanel rfqId={rfqId} side="SUPPLIER" />

      {/* Feedback Alerts */}
      {error && (
        <div className="p-3 text-xs font-bold text-red-700 dark:text-red-300 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 shadow-2xs">
          ⚠️ {error}
        </div>
      )}

      {/* 3. Main Layout Grid (2 Columns on Desktop, 1 Column on Mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Scope, Specifications, Location/Timeline, Commercial, Attachments, Eligibility, What Happens Next */}
        <div className="lg:col-span-8 space-y-4">
          <SupplierRequirementPanel
            rfq={invitation}
            buyerFiles={buyerFiles}
            hasQuote={!!quote}
            primaryAction={primaryAction}
          />

          {/* Read-Only Submitted Quote State (if quote exists) */}
          {quote && (
            <div id="submitted-quote" className="space-y-4">
              <SupplierQuotePanel quote={quote} />
            </div>
          )}

          {/* Clarification Thread */}
          {inClarification && invitation && (
            <section id="clarification-thread" className="rounded-2xl border bg-card p-4 sm:p-5 shadow-2xs space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <span>💬</span> Neutral Clarification &amp; Technical Q&amp;A
              </h3>
              <ClarificationThread
                rfqId={rfqId}
                invitationId={invitation.invitationId}
                messages={clarificationMessages}
                authorSide="SUPPLIER"
                onPosted={() => void load()}
              />
            </section>
          )}

          {/* Closed / Concluded State Message */}
          {!rfqOpen && !inClarification && !quote && (
            <div className="rounded-2xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-5 space-y-1.5 text-center shadow-2xs">
              <span className="text-3xl block">🔒</span>
              <h3 className="text-xs font-black text-foreground">Requirement Concluded</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                The quotation and evaluation window for this requirement has ended.
              </p>
            </div>
          )}

          {quote?.status === 'NOT_SELECTED' && (
            <div className="rounded-2xl border border-amber-300 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 p-5 space-y-1.5 shadow-2xs text-center">
              <span className="text-3xl block">🔒</span>
              <h3 className="text-xs font-black text-amber-950 dark:text-amber-200">Tender Concluded</h3>
              <p className="text-[11px] text-amber-900/80 dark:text-amber-300 leading-relaxed">
                The customer has completed merit evaluation and awarded the contract to another competitive quote.
              </p>
            </div>
          )}
        </div>

        {/* Right Column (Desktop Sticky Summary & State CTA) */}
        <aside className="hidden lg:block lg:col-span-4 sticky top-4 space-y-4">
          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
              Opportunity Summary
            </h3>

            {/* Deadline status */}
            <div className="space-y-1 p-3 rounded-xl bg-muted/30 border border-border/60">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                Response Deadline:
              </span>
              <span
                className={`text-xs font-black block ${
                  countdown.isPassed
                    ? 'text-muted-foreground'
                    : countdown.isUrgent
                    ? 'text-amber-600 dark:text-amber-400 animate-pulse'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                ⏱️ {countdown.label}
              </span>
            </div>

            {/* State-Aware Response Status Indicator */}
            {quote ? (
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 p-3 text-center space-y-1">
                <span className="text-xs font-black text-emerald-800 dark:text-emerald-300 block">
                  ✓ Quote Submitted (v{quote.currentVersion})
                </span>
                <span className="text-[10px] text-muted-foreground block">
                  Anonymous Sealed Evaluation Active
                </span>
              </div>
            ) : rfqOpen ? (
              <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-center space-y-1">
                <span className="text-xs font-black text-primary block">
                  ⚡ Quoting Active
                </span>
                <span className="text-[10px] text-muted-foreground block leading-relaxed">
                  Open for supplier response. Identity and terms protected under sealed evaluation.
                </span>
              </div>
            ) : (
              <div className="rounded-xl bg-muted p-3 text-center text-xs font-bold text-muted-foreground">
                🔒 Quoting Window Closed
              </div>
            )}

            {/* Desktop Primary CTA Link */}
            {primaryAction.to ? (
              <Link
                to={primaryAction.to}
                data-testid="desktop-supplier-primary-cta"
                className={`w-full min-h-[48px] rounded-xl px-4 py-3 text-xs font-extrabold shadow-sm transition flex items-center justify-center gap-1.5 active:scale-98 mobile-touch-target ${
                  primaryAction.variant === 'primary'
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : primaryAction.variant === 'secondary'
                    ? 'border border-border bg-card text-foreground hover:bg-muted'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {primaryAction.icon && <span>{primaryAction.icon}</span>}
                <span>{primaryAction.label} →</span>
              </Link>
            ) : primaryAction.href ? (
              <a
                href={primaryAction.href}
                data-testid="desktop-supplier-primary-cta"
                className={`w-full min-h-[48px] rounded-xl px-4 py-3 text-xs font-extrabold shadow-sm transition flex items-center justify-center gap-1.5 active:scale-98 mobile-touch-target ${
                  primaryAction.variant === 'primary'
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : primaryAction.variant === 'secondary'
                    ? 'border border-border bg-card text-foreground hover:bg-muted'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {primaryAction.icon && <span>{primaryAction.icon}</span>}
                <span>{primaryAction.label} →</span>
              </a>
            ) : null}

            {/* Participation Notice (Truthful, No Fabricated Match) */}
            <div className="rounded-xl bg-muted/30 border border-border/60 p-3 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-foreground text-[11px]">
                <span>📋</span>
                <span>Supplier Participation</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Standard category eligibility and transparent quoting terms apply.
              </p>
            </div>

            {/* Shield Notice */}
            <div className="text-[11px] text-muted-foreground leading-relaxed pt-2 border-t border-border/60">
              🔒 <strong className="text-foreground">Identity-Protected Evaluation:</strong> Pricing and technical details are protected from competing suppliers.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
