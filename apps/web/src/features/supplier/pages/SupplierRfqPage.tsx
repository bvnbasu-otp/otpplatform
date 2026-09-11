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

    setSuccess('Initial quote submitted.');
    await load();
    return { error: null };
  }

  async function handleRevise(input: QuoteSnapshotInput) {
    if (!profile || !quote) return { error: 'No quote to revise' };

    const result = await reviseSupplierQuote(profile.profileId, quote.quoteId, rfqId, input);
    if (!result.ok) return { error: result.error };

    setSuccess('Final quote updated.');
    setMode('view');
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
    return <p className="p-8 text-muted-foreground">Loading RFQ…</p>;
  }

  if (!invitation) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-red-600">Invitation not found or access denied.</p>
        <Link to="/" className="mt-4 inline-block text-sm text-primary">
          ← Back
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
    <div className="zero-scroll-container p-3 max-w-7xl mx-auto w-full" data-testid="supplier-rfq-page">
      {/* Compressed Top Bar */}
      <header className="rounded-lg border bg-card px-3 py-1.5 shadow-2xs shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link to="/" className="text-xs font-semibold text-muted-foreground hover:text-foreground shrink-0">
            ← Enquiries
          </Link>
          <span className="text-muted-foreground">|</span>
          <h1 className="text-xs font-bold text-foreground truncate">{invitation.rfqTitle}</h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            Alias: {invitation.anonymousLabel}
          </span>
          <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[10px] font-bold">
            {rfqStatus === 'OPEN'
              ? '⚡ Quoting Active'
              : rfqStatus === 'EVALUATING'
              ? '⚖️ Evaluation in Progress'
              : quote?.status === 'SELECTED'
              ? '🏆 Won Award'
              : quote?.status === 'NOT_SELECTED'
              ? '❌ Tender Concluded'
              : rfqStatus === 'AWARDED' || rfqStatus === 'CLOSED'
              ? '🔒 Closed'
              : rfqStatus}
          </span>
          {quote && mode === 'view' && canRevise && (
            <button
              type="button"
              onClick={() => setMode('revise')}
              className="rounded border bg-card px-2.5 py-0.5 text-xs font-bold text-foreground hover:bg-muted transition shadow-2xs"
            >
              ✏️ Revise Price
            </button>
          )}
        </div>
      </header>

      {/* Lifecycle Progress Bar */}
      <div className="mt-1.5 shrink-0">
        <RfqPhasePanel rfqId={rfqId} side="SUPPLIER" />
      </div>

      {error && (
        <p className="mt-1 shrink-0 text-xs font-bold text-red-600 dark:text-red-300 rounded border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-2">
          ⚠️ {error}
        </p>
      )}
      {success && (
        <p className="mt-1 shrink-0 text-xs font-bold text-emerald-800 dark:text-emerald-300 rounded border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 p-2" data-testid="supplier-success">
          ✓ {success}
        </p>
      )}

      {/* Main Content Area - Split Column Grid in zero-scroll-pane */}
      <div className="zero-scroll-pane mt-2">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5">
          {/* Left Column (7 cols): Quote Submission / Quote Panel / Q&A */}
          <div className="lg:col-span-7 space-y-2.5">
            {quote && mode === 'view' && (
              <div className="space-y-2.5">
                <SupplierQuotePanel quote={quote} />

                <section className="rounded-lg border bg-card p-3 space-y-1.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-foreground">Quotation Documents &amp; Catalogues</h3>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.2 rounded">Metadata Protected</span>
                  </div>
                  <AttachmentUploader
                    scope={AttachmentScope.QUOTE}
                    quoteId={quote.quoteId}
                    label="Priced drawing, datasheet, or photo of similar work"
                    hint="The buyer sees a neutral label, never your internal filename."
                    disabled={quote.status === 'FINAL'}
                  />
                </section>

                <div className="flex flex-wrap items-center gap-2">
                  {canRevise && (
                    <button
                      type="button"
                      onClick={() => setMode('revise')}
                      className="rounded border bg-card px-3 py-1.5 text-xs font-bold hover:bg-muted transition shadow-2xs"
                    >
                      ✏️ Revise Quote Price
                    </button>
                  )}
                  {canSubmitFinal && (
                    <button
                      type="button"
                      onClick={() => void handleFinalize()}
                      className="rounded bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-2xs"
                    >
                      Lock Final Quote 🔒
                    </button>
                  )}
                </div>
              </div>
            )}

            {quote && mode === 'revise' && (
              <div className="rounded-lg border bg-card p-3 shadow-2xs">
                <h2 className="mb-2 text-xs font-bold">Update Final Quote (v{quote.currentVersion + 1})</h2>
                <QuoteForm
                  initial={quote.snapshot ?? undefined}
                  submitLabel="Save final quote"
                  onSubmit={handleRevise}
                  quoteId={quote.quoteId}
                />
                <button
                  type="button"
                  onClick={() => setMode('view')}
                  className="mt-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            )}

            {canSubmitInitial && (
              <div className="rounded-lg border bg-card p-3 shadow-2xs">
                <h2 className="mb-2 text-xs font-bold">Submit Initial Quote</h2>
                <QuoteForm submitLabel="Submit initial quote" onSubmit={handleSubmit} />
              </div>
            )}

            {inClarification && invitation && (
              <section className="rounded-lg border bg-card p-3 shadow-2xs">
                <h2 className="mb-2 text-xs font-bold">Negotiation &amp; Q&amp;A</h2>
                <ClarificationThread
                  rfqId={rfqId}
                  invitationId={invitation.invitationId}
                  messages={clarificationMessages}
                  authorSide="SUPPLIER"
                  onPosted={() => void load()}
                />
              </section>
            )}

            {!rfqOpen && !inClarification && !quote && (
              <div className="rounded-lg border border-slate-300 bg-slate-50 dark:bg-slate-900/30 p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">ℹ️</span>
                  <h3 className="text-xs font-bold text-foreground">Requirement Closed &amp; Awarded</h3>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  The quotation and evaluation window for this requirement has ended. The buyer has placed the order with another supplier.
                </p>
              </div>
            )}

            {quote?.status === 'NOT_SELECTED' && (
              <div className="rounded-lg border border-amber-300 bg-amber-50/70 dark:bg-amber-950/20 p-3 space-y-1 shadow-2xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">❌</span>
                  <h3 className="text-xs font-bold text-amber-950 dark:text-amber-200">Tender Concluded · Not Awarded</h3>
                </div>
                <p className="text-[11px] text-amber-900/80 dark:text-amber-300">
                  The customer has completed evaluation and awarded the contract to another supplier. Thank you for submitting your competitive quote.
                </p>
              </div>
            )}
          </div>

          {/* Right Column (5 cols): Requirement Specifications & Documents */}
          <div className="lg:col-span-5 space-y-2.5">
            <SupplierRequirementPanel rfq={invitation} />

            {buyerFiles.length > 0 && (
              <section className="rounded-lg border bg-card p-3 space-y-1.5 shadow-2xs">
                <h2 className="text-xs font-bold text-foreground">Customer Documents &amp; Specifications</h2>
                <AttachmentList attachments={buyerFiles} />
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
