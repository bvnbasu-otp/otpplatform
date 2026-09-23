import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatDeadlineCountdown, formatDateIST } from '@/lib/date-utils';
import { usePortalRole } from '@/features/auth/use-portal-role';
import { fetchSupplierRfq } from '../api/fetch-invitations';
import { fetchSupplierQuoteForRfq } from '../api/fetch-quote';
import {
  fetchSupplierIdForProfile,
  submitSupplierQuote,
  reviseSupplierQuote,
} from '../api/quote-mutations';
import { QuoteForm } from '../components/QuoteForm';
import type {
  QuoteSnapshotInput,
  SupplierQuote,
  SupplierRfqDetail,
} from '../types/supplier-quote';

export function SupplierQuoteSubmitPage({ rfqId: propRfqId }: { rfqId?: string }) {
  const params = useParams<{ rfqId: string }>();
  const rfqId = propRfqId || params.rfqId || '';
  const navigate = useNavigate();
  const { profile } = usePortalRole();

  const [rfq, setRfq] = useState<SupplierRfqDetail | null>(null);
  const [existingQuote, setExistingQuote] = useState<SupplierQuote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittedVersion, setSubmittedVersion] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!rfqId) {
      setError('Invalid RFQ reference');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const rfqRes = await fetchSupplierRfq(rfqId);
    if (!rfqRes.ok) {
      setError(rfqRes.error);
      setIsLoading(false);
      return;
    }

    setRfq(rfqRes.rfq);

    const quoteRes = await fetchSupplierQuoteForRfq(rfqId);
    if (quoteRes.ok) {
      setExistingQuote(quoteRes.quote);
    }

    setIsLoading(false);
  }, [rfqId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (input: QuoteSnapshotInput): Promise<{ error: string | null }> => {
    if (!profile) {
      return { error: 'Your session is not ready. Please sign in again.' };
    }
    if (!rfq) {
      return { error: 'RFQ details not loaded' };
    }

    const supplierId = await fetchSupplierIdForProfile(profile.profileId);
    if (!supplierId) {
      return { error: 'Your supplier profile is not linked to an active supplier organization.' };
    }

    if (existingQuote) {
      // Revision
      const result = await reviseSupplierQuote(
        profile.profileId,
        existingQuote.quoteId,
        rfqId,
        input,
      );
      if (!result.ok) return { error: result.error };

      setSubmittedVersion(existingQuote.currentVersion + 1);
      return { error: null };
    }

    // Initial Quote Submission
    const result = await submitSupplierQuote(
      profile.profileId,
      rfqId,
      rfq.invitationId,
      supplierId,
      input,
    );
    if (!result.ok) return { error: result.error };

    setSubmittedVersion(1);
    return { error: null };
  };

  if (isLoading) {
    return (
      <div className="p-3 sm:p-4 max-w-4xl mx-auto w-full space-y-4" data-testid="supplier-quote-submit-loading">
        <div className="h-12 w-full rounded-2xl bg-muted/40 animate-pulse" />
        <div className="h-36 w-full rounded-2xl bg-muted/40 animate-pulse" />
        <div className="h-96 w-full rounded-2xl bg-muted/40 animate-pulse" />
      </div>
    );
  }

  if (!rfq) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center space-y-4" data-testid="supplier-quote-not-found">
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

  const countdown = formatDeadlineCountdown(rfq.quoteDeadline);
  const isExpired = countdown.isPassed;
  const isClosed = rfq.rfqStatus !== 'OPEN' && rfq.rfqStatus !== 'CLARIFICATION';

  // Confirmation View
  if (submittedVersion !== null) {
    return (
      <div
        className="p-3 sm:p-4 max-w-2xl mx-auto w-full space-y-5 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
        data-testid="supplier-quote-confirmation"
      >
        <div className="rounded-3xl border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-6 sm:p-8 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 flex items-center justify-center mx-auto text-3xl">
            ✓
          </div>

          <div className="space-y-1">
            <h1 className="text-lg sm:text-xl font-black text-foreground">
              {submittedVersion === 1 ? 'Sealed Quote Submitted' : `Quote Revision v${submittedVersion} Submitted`}
            </h1>
            <p className="text-xs text-muted-foreground">
              Your pricing, delivery timeline, and warranty terms have been recorded under anonymous evaluation.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/80 bg-card p-4 text-xs space-y-2 text-left">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground">Enquiry Ref:</span>
              <span className="font-mono font-bold text-foreground">{rfq.publicRef || rfq.rfqId}</span>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground">Supplier Alias:</span>
              <span className="font-bold text-primary">{rfq.anonymousLabel}</span>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground">Requirement:</span>
              <span className="font-bold text-foreground truncate max-w-[200px] sm:max-w-xs">{rfq.rfqTitle}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Submitted At:</span>
              <span className="font-mono text-muted-foreground">{formatDateIST(new Date().toISOString())}</span>
            </div>
          </div>

          <div className="rounded-xl bg-muted/40 p-3 text-[11px] text-muted-foreground leading-relaxed text-left border border-border/60">
            🔒 <strong>Identity Protection:</strong> Your company name is protected from competitors and evaluated purely on commercial, delivery, and quality merits.
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
            <Link
              to={`/supplier/rfq/${rfqId}`}
              className="w-full sm:flex-1 min-h-[48px] rounded-xl bg-primary px-4 py-3 text-xs font-extrabold text-primary-foreground shadow-sm hover:bg-primary/90 transition flex items-center justify-center gap-1.5 active:scale-98 mobile-touch-target"
            >
              <span>← Return to RFQ Details</span>
            </Link>
            <Link
              to="/"
              className="w-full sm:flex-1 min-h-[48px] rounded-xl border bg-card px-4 py-3 text-xs font-bold text-foreground hover:bg-muted transition flex items-center justify-center gap-1.5 mobile-touch-target"
            >
              <span>Opportunities Cockpit</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="p-3 sm:p-4 max-w-2xl mx-auto w-full space-y-4 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] overflow-x-hidden"
      data-testid="supplier-quote-submit-page"
    >
      {/* 1. Header with Breadcrumb Back Navigation */}
      <header className="rounded-2xl border bg-card p-3 shadow-2xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to={`/supplier/rfq/${rfqId}`}
            className="min-h-[48px] px-3 rounded-xl text-xs font-black text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-1 shrink-0 mobile-touch-target transition"
          >
            ← RFQ Details
          </Link>
          <span className="text-muted-foreground/60">·</span>
          <span className="text-xs font-mono font-black text-foreground truncate">
            {rfq.publicRef || 'RFQ'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 text-[10px] font-black">
            🔒 {rfq.anonymousLabel}
          </span>
          <span className="rounded-full bg-muted/80 px-2 py-1 text-[10px] font-bold text-muted-foreground">
            {existingQuote ? `v${existingQuote.currentVersion} Quoted` : '⚡ 30-Min Entry'}
          </span>
        </div>
      </header>

      {/* 2. RFQ Context Hero Summary Banner */}
      <section className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
          <div className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5">
            <span>🏷️</span>
            <span>{rfq.subcategory ?? rfq.category ?? 'General Procurement'}</span>
            {rfq.deliveryCity && (
              <>
                <span>•</span>
                <span>📍 {rfq.deliveryCity}</span>
              </>
            )}
          </div>

          {/* Response Deadline Urgency Pill */}
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold border shrink-0 flex items-center gap-1 ${
              countdown.isPassed
                ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300'
                : countdown.isUrgent
                ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300 dark:border-amber-800 animate-pulse'
                : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
            }`}
          >
            <span>{countdown.isPassed ? '🔒' : '⏳'}</span>
            <span>{countdown.label}</span>
          </span>
        </div>

        <h1 className="text-base sm:text-lg font-black text-foreground tracking-tight leading-snug">
          {rfq.rfqTitle}
        </h1>

        {/* Key Scope Parameter Strip */}
        <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-muted/30 border border-border/60 text-center text-xs">
          <div>
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">Quantity</span>
            <span className="text-sm font-black text-foreground block mt-0.5 truncate">
              {rfq.quantity === null ? 'As per specs' : `${rfq.quantity} ${rfq.unit || 'units'}`}
            </span>
          </div>
          <div className="border-x border-border/60 px-1">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">Location</span>
            <span className="text-sm font-bold text-foreground block mt-0.5 truncate">
              📍 {rfq.deliveryCity ?? 'Site Delivery'}
            </span>
          </div>
          <div>
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">Target TAT</span>
            <span className="text-sm font-bold text-primary block mt-0.5 truncate">
              {rfq.requiredByDays ? `${rfq.requiredByDays} Days` : 'Standard'}
            </span>
          </div>
        </div>

        {/* Identity Protection Notice */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-2.5 text-[11px] text-muted-foreground leading-relaxed">
          🔒 <strong className="text-primary font-bold">Identity-Protected Quoting:</strong> Pricing is evaluated anonymously. Your quote is sealed and protected from competing suppliers.
        </div>
      </section>

      {/* 3. Expired or Closed Alert */}
      {(isExpired || isClosed) && (
        <div className="rounded-2xl border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-4 text-xs font-bold text-red-700 dark:text-red-300 space-y-1">
          <p>⚠️ Quoting is no longer active for this requirement.</p>
          <p className="font-normal text-[11px] text-red-600 dark:text-red-400">
            The response deadline has passed or the RFQ window has concluded.
          </p>
        </div>
      )}

      {/* 4. Form Workspace */}
      <section className="rounded-2xl border border-border/80 bg-card p-4 sm:p-6 shadow-2xs space-y-4">
        <div className="border-b border-border/60 pb-3">
          <h2 className="text-sm font-black text-foreground flex items-center gap-2">
            <span>⚡</span>
            <span>{existingQuote ? `Revise Quote (v${existingQuote.currentVersion + 1})` : 'Enter Sealed Quote Details'}</span>
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Configure transparent GST-compliant commercial terms, turnaround execution, and warranty period.
          </p>
        </div>

        <QuoteForm
          initial={existingQuote?.snapshot ?? undefined}
          submitLabel={existingQuote ? 'Submit Revised Sealed Quote' : 'Submit Sealed Quote to Buyer'}
          onSubmit={handleSubmit}
          disabled={isExpired || isClosed}
          quoteId={existingQuote?.quoteId}
        />
      </section>
    </div>
  );
}
