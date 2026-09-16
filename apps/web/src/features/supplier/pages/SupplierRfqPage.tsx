import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AttachmentScope } from '@otp/domain';
import { usePortalRole } from '@/features/auth/use-portal-role';
import {
  AttachmentUploader,
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
import {
  fetchSupplierIdForProfile,
  finalizeSupplierQuote,
  reviseSupplierQuote,
  submitSupplierQuote,
} from '../api/quote-mutations';
import { QuoteForm } from '../components/QuoteForm';
import { SupplierQuotePanel } from '../components/SupplierQuotePanel';
import { SupplierRequirementPanel } from '../components/SupplierRequirementPanel';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type {
  QuoteSnapshotInput,
  SupplierQuote,
  SupplierRfqDetail,
} from '../types/supplier-quote';

export function SupplierRfqPage({ rfqId }: { rfqId: string }) {
  const { profile } = usePortalRole();
  const [invitation, setInvitation] = useState<SupplierRfqDetail | null>(null);
  const [quote, setQuote] = useState<SupplierQuote | null>(null);
  const [clarificationMessages, setClarificationMessages] = useState<ClarificationMessage[]>([]);
  const [buyerFiles, setBuyerFiles] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState<'view' | 'revise'>('view');
  const [success, setSuccess] = useState<string | null>(null);
  const [isQuoteSheetOpen, setIsQuoteSheetOpen] = useState(false);

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

  async function handleSubmit(input: QuoteSnapshotInput) {
    if (!profile || !invitation) {
      return { error: 'Session not ready' };
    }
    const supplierId = await fetchSupplierIdForProfile(profile.profileId);
    if (!supplierId) return { error: 'Supplier account not found' };

    const result = await submitSupplierQuote(
      profile.profileId,
      rfqId,
      invitation.invitationId,
      supplierId,
      input,
    );
    if (!result.ok) return { error: result.error };

    setSuccess('Sealed quote submitted successfully.');
    setIsQuoteSheetOpen(false);
    await load();
    return { error: null };
  }

  async function handleRevise(input: QuoteSnapshotInput) {
    if (!profile || !quote) return { error: 'No quote to revise' };

    const result = await reviseSupplierQuote(profile.profileId, quote.quoteId, rfqId, input);
    if (!result.ok) return { error: result.error };

    setSuccess('Final quote updated.');
    setMode('view');
    setIsQuoteSheetOpen(false);
    await load();
    return { error: null };
  }

  async function handleFinalize() {
    if (!quote) return;
    const result = await finalizeSupplierQuote(quote.quoteId, rfqId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess('Final quote submitted for identity-protected evaluation.');
    await load();
  }

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

  const canRevise =
    (rfqOpen || inClarification) && quote && quote.status !== 'FINAL';
  const canSubmitFinal =
    inClarification && quote && ['SUBMITTED', 'REVISED'].includes(quote.status);
  const canSubmitInitial = rfqOpen && !quote;
  const countdown = formatDeadlineCountdown(invitation.quoteDeadline);

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
      {success && (
        <div
          className="p-3 text-xs font-bold text-emerald-800 dark:text-emerald-300 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 shadow-2xs"
          data-testid="supplier-success"
        >
          ✓ {success}
        </div>
      )}

      {/* 3. Main Layout Grid (2 Columns on Desktop, 1 Column on Mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Scope, Specifications, Location/Timeline, Commercial, Attachments, Eligibility, What Happens Next */}
        <div className="lg:col-span-8 space-y-4">
          <SupplierRequirementPanel
            rfq={invitation}
            buyerFiles={buyerFiles}
            onOpenQuote={() => setIsQuoteSheetOpen(true)}
            canSubmitInitial={canSubmitInitial}
            hasQuote={!!quote}
          />

          {/* Active Submitted Quote Panel (if quote exists) */}
          {quote && mode === 'view' && (
            <div className="space-y-4">
              <SupplierQuotePanel
                quote={quote}
                onReviseQuote={canRevise ? () => setIsQuoteSheetOpen(true) : undefined}
              />

              {/* Quotation Documents Upload */}
              <section className="rounded-2xl border bg-card p-4 sm:p-5 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
                    📎 Quotation Documents &amp; Catalogues
                  </h3>
                  <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-semibold">
                    Metadata Protected
                  </span>
                </div>
                <AttachmentUploader
                  scope={AttachmentScope.QUOTE}
                  quoteId={quote.quoteId}
                  label="Upload priced drawing, datasheet, or photos"
                  hint="The buyer sees a neutral label, never your internal filename."
                  disabled={quote.status === 'FINAL'}
                />
              </section>

              {/* Action Buttons for Existing Quote */}
              <div className="flex flex-wrap items-center gap-2">
                {canRevise && (
                  <button
                    type="button"
                    onClick={() => setIsQuoteSheetOpen(true)}
                    className="min-h-[48px] flex-1 sm:flex-none rounded-xl border bg-card px-4 py-2.5 text-xs font-bold text-foreground hover:bg-muted transition shadow-2xs flex items-center justify-center gap-1.5 mobile-touch-target cursor-pointer"
                  >
                    <span>✏️</span>
                    <span>Revise Quote Price</span>
                  </button>
                )}
                {canSubmitFinal && (
                  <button
                    type="button"
                    onClick={() => void handleFinalize()}
                    className="min-h-[48px] flex-1 sm:flex-none rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground shadow-sm hover:bg-primary/90 transition flex items-center justify-center gap-1.5 mobile-touch-target cursor-pointer"
                  >
                    <span>🔒</span>
                    <span>Lock Final Quote</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Clarification Thread */}
          {inClarification && invitation && (
            <section className="rounded-2xl border bg-card p-4 sm:p-5 shadow-2xs space-y-3">
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
              Action Summary
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

            {/* Primary Action Button */}
            {canSubmitInitial && (
              <button
                type="button"
                onClick={() => setIsQuoteSheetOpen(true)}
                data-testid="desktop-open-quote-cta"
                className="w-full min-h-[48px] rounded-xl bg-primary px-4 py-3 text-xs font-extrabold text-primary-foreground shadow-sm hover:bg-primary/90 transition flex items-center justify-center gap-1.5 active:scale-98 mobile-touch-target cursor-pointer"
              >
                <span>⚡</span>
                <span>Draft &amp; Submit Quote →</span>
              </button>
            )}

            {quote && (
              <div className="space-y-2">
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 p-3 text-center">
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 block">
                    ✓ Quote Submitted (v{quote.currentVersion})
                  </span>
                  <span className="text-[10px] text-muted-foreground block mt-0.5">
                    Anonymous Evaluation Active
                  </span>
                </div>
                {canRevise && (
                  <button
                    type="button"
                    onClick={() => setIsQuoteSheetOpen(true)}
                    className="w-full min-h-[48px] rounded-xl border bg-card px-4 py-2.5 text-xs font-bold text-foreground hover:bg-muted transition shadow-2xs flex items-center justify-center gap-1.5 mobile-touch-target cursor-pointer"
                  >
                    <span>✏️ Revise Quote Price</span>
                  </button>
                )}
              </div>
            )}

            {!rfqOpen && !quote && (
              <div className="rounded-xl bg-muted p-3 text-center text-xs font-bold text-muted-foreground">
                🔒 Quoting Window Closed
              </div>
            )}

            {/* Shield Notice */}
            <div className="text-[11px] text-muted-foreground leading-relaxed pt-2 border-t border-border/60">
              🔒 <strong className="text-foreground">Sealed Evaluation:</strong> Prices and technical specifications are protected until buyer award decision.
            </div>
          </div>
        </aside>
      </div>

      {/* 4. Mobile Sticky Bottom Action Bar */}
      {canSubmitInitial && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 p-3 bg-background/95 backdrop-blur-md border-t border-border z-30 shadow-lg">
          <div className="max-w-md mx-auto">
            <button
              type="button"
              onClick={() => setIsQuoteSheetOpen(true)}
              data-testid="open-quote-sheet-cta"
              className="w-full min-h-[48px] rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground shadow-md hover:bg-primary/90 transition flex items-center justify-center gap-2 active:scale-98 mobile-touch-target cursor-pointer"
            >
              <span>⚡</span>
              <span>Draft &amp; Submit Quote →</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. Micro-Flow Bottom Sheet (Phase 3.3 Boundary Preserved) */}
      <BottomSheet
        isOpen={isQuoteSheetOpen}
        onClose={() => setIsQuoteSheetOpen(false)}
        title={quote ? `Revise Quote (v${quote.currentVersion + 1})` : '⚡ Submit Sealed Quote'}
        subtitle={invitation.rfqTitle}
        maxHeight="max-h-[90vh]"
      >
        <QuoteForm
          initial={quote?.snapshot ?? undefined}
          submitLabel={quote ? 'Update Final Quote' : 'Submit Sealed Quote'}
          onSubmit={quote ? handleRevise : handleSubmit}
          quoteId={quote?.quoteId}
        />
      </BottomSheet>
    </div>
  );
}

