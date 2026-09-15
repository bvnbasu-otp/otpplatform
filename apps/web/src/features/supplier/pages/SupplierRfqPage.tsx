import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AttachmentScope } from '@otp/domain';
import { usePortalRole } from '@/features/auth/use-portal-role';
import {
  AttachmentList,
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
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-xs font-semibold text-muted-foreground">Loading RFQ Opportunity…</p>
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center space-y-3">
        <span className="text-3xl block">⚠️</span>
        <h2 className="text-sm font-bold text-foreground">Opportunity Not Found</h2>
        <p className="text-xs text-red-600 dark:text-red-300">
          Invitation not found or access denied for your supplier account.
        </p>
        <Link
          to="/"
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-xs"
        >
          ← Return to Supplier Workspace
        </Link>
      </div>
    );
  }

  const canRevise =
    (rfqOpen || inClarification) && quote && quote.status !== 'FINAL';
  const canSubmitFinal =
    inClarification && quote && ['SUBMITTED', 'REVISED'].includes(quote.status);
  const canSubmitInitial = rfqOpen && !quote;

  return (
    <div
      className="p-3 sm:p-4 max-w-4xl mx-auto w-full space-y-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] overflow-x-hidden"
      data-testid="supplier-rfq-page"
    >
      {/* 1. Header Bar: Navigation, Ref & Aliasing */}
      <header className="rounded-2xl border bg-card p-3 shadow-xs flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to="/"
            className="min-h-[44px] px-2.5 rounded-lg text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-1 shrink-0 mobile-touch-target"
          >
            ← Enquiries
          </Link>
          <span className="text-muted-foreground">·</span>
          <span className="text-xs font-mono font-bold text-foreground truncate">
            {invitation.publicRef || 'RFQ'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            Alias: {invitation.anonymousLabel}
          </span>
          <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-[10px] font-bold">
            {rfqStatus === 'OPEN'
              ? '⚡ Quoting Active'
              : rfqStatus === 'EVALUATING'
              ? '⚖️ Evaluation'
              : quote?.status === 'SELECTED'
              ? '🏆 Won Award'
              : quote?.status === 'NOT_SELECTED'
              ? '❌ Concluded'
              : rfqStatus === 'AWARDED' || rfqStatus === 'CLOSED'
              ? '🔒 Closed'
              : rfqStatus}
          </span>
        </div>
      </header>

      {/* 2. Lifecycle Stage Navigator */}
      <RfqPhasePanel rfqId={rfqId} side="SUPPLIER" />

      {/* Feedback Alerts */}
      {error && (
        <div className="p-3 text-xs font-bold text-red-700 dark:text-red-300 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40">
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div
          className="p-3 text-xs font-bold text-emerald-800 dark:text-emerald-300 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40"
          data-testid="supplier-success"
        >
          ✓ {success}
        </div>
      )}

      {/* 3. Screen 6 Core: Supplier RFQ Opportunity Review Card */}
      <SupplierRequirementPanel rfq={invitation} />

      {/* Buyer Attached Documents */}
      {buyerFiles.length > 0 && (
        <section className="rounded-2xl border bg-card p-4 space-y-2 shadow-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
            📎 Customer Technical Documents &amp; Drawings:
          </h3>
          <AttachmentList attachments={buyerFiles} />
        </section>
      )}

      {/* 4. Active Quote Card & Review Actions (if quote exists) */}
      {quote && mode === 'view' && (
        <div className="space-y-3">
          <SupplierQuotePanel
            quote={quote}
            onReviseQuote={canRevise ? () => setIsQuoteSheetOpen(true) : undefined}
          />

          <section className="rounded-2xl border bg-card p-4 space-y-2 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-foreground">Quotation Documents &amp; Catalogues</h3>
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

          {/* Action Row */}
          <div className="flex flex-wrap items-center gap-2">
            {canRevise && (
              <button
                type="button"
                onClick={() => setIsQuoteSheetOpen(true)}
                className="min-h-[44px] flex-1 sm:flex-none rounded-xl border bg-card px-4 py-2 text-xs font-bold text-foreground hover:bg-muted transition shadow-xs flex items-center justify-center gap-1.5 mobile-touch-target"
              >
                <span>✏️ Revise Quote Price</span>
              </button>
            )}
            {canSubmitFinal && (
              <button
                type="button"
                onClick={() => void handleFinalize()}
                className="min-h-[44px] flex-1 sm:flex-none rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition flex items-center justify-center gap-1.5 mobile-touch-target"
              >
                <span>Lock Final Quote 🔒</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Q&A / Clarification Thread */}
      {inClarification && invitation && (
        <section className="rounded-2xl border bg-card p-4 shadow-xs space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
            💬 Neutral Clarification &amp; Technical Q&amp;A
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

      {/* Closed / Awarded Info State */}
      {!rfqOpen && !inClarification && !quote && (
        <div className="rounded-2xl border border-slate-300 bg-slate-50 dark:bg-slate-900/30 p-4 space-y-1 text-center">
          <span className="text-2xl block">🔒</span>
          <h3 className="text-xs font-bold text-foreground">Requirement Closed &amp; Awarded</h3>
          <p className="text-[11px] text-muted-foreground">
            The quotation and evaluation window for this requirement has ended.
          </p>
        </div>
      )}

      {quote?.status === 'NOT_SELECTED' && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/70 dark:bg-amber-950/20 p-4 space-y-1 shadow-xs text-center">
          <span className="text-2xl block">❌</span>
          <h3 className="text-xs font-bold text-amber-950 dark:text-amber-200">Tender Concluded · Not Awarded</h3>
          <p className="text-[11px] text-amber-900/80 dark:text-amber-300">
            The customer has completed evaluation and awarded the contract to another competitive quote.
          </p>
        </div>
      )}

      {/* 5. Bottom Action Bar for Screen 6 CTA */}
      {canSubmitInitial && (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setIsQuoteSheetOpen(true)}
            data-testid="open-quote-sheet-cta"
            className="w-full min-h-[48px] rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground shadow-md hover:bg-primary/90 transition flex items-center justify-center gap-2 active:scale-98 mobile-touch-target"
          >
            <span>⚡</span>
            <span>Draft &amp; Submit Quote →</span>
          </button>
        </div>
      )}

      {/* 6. Screen 7 Micro-Flow Bottom Sheet */}
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

      {/* Guaranteed scroll clearance spacer above MobileBottomNav */}
      <div className="h-28 sm:h-16 shrink-0 w-full" aria-hidden="true" />
    </div>
  );
}
