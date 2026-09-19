import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AwardSummary } from '@/features/award/api/awards';
import { awardRunnerUpQuote } from '@/features/award/api/awards';
import {
  createPurchaseOrderFromAward,
  fetchPurchaseOrderByRfq,
} from '@/features/fulfillment/api/purchase-orders';
import { fetchRevealedQuotes, type RevealedQuoteRow } from '../api/fetch-revealed-quotes';
import { fetchAwardForReveal, revealSupplier } from '../api/reveal';
import { DecisionReceipt } from '../components/DecisionReceipt';
import { ProcurementStageNavigator } from '@/features/lifecycle';
import { CancelRfqModal } from '@/features/rfq/components';
import { triggerPrintDialog } from '@/features/reporting/lib/pdf-generator';

export function SupplierRevealPage({ rfqId }: { rfqId: string }) {
  const navigate = useNavigate();
  const [award, setAward] = useState<AwardSummary | null>(null);
  const [quotes, setQuotes] = useState<RevealedQuoteRow[]>([]);
  const [existingPoId, setExistingPoId] = useState<string | null>(null);
  const [commitmentChecked, setCommitmentChecked] = useState(true);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const awardRes = await fetchAwardForReveal(rfqId);
    if (!awardRes.ok) {
      setError(awardRes.error);
      setIsLoading(false);
      return;
    }
    setAward(awardRes.award);

    if (awardRes.award?.status === 'REVEALED') {
      const [quotesRes, poRes] = await Promise.all([
        fetchRevealedQuotes(rfqId),
        fetchPurchaseOrderByRfq(rfqId),
      ]);
      if (quotesRes.ok) setQuotes(quotesRes.quotes);
      if (poRes.ok) setExistingPoId(poRes.poId);
    }
    setIsLoading(false);
  }, [rfqId]);

  useEffect(() => {
    void load();
  }, [load]);

  const winningQuote = useMemo(
    () => quotes.find((q) => q.quoteId === award?.quoteId),
    [quotes, award],
  );

  async function handleReveal() {
    if (!commitmentChecked) {
      setError('Please acknowledge the on-platform procurement commitment before unmasking.');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    const result = await revealSupplier(rfqId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    const { winner } = result;
    setSuccess(
      winner.aliasBeforeReveal
        ? `Identity unmasked: ${winner.aliasBeforeReveal} is ${winner.businessName}. Official Purchase Order generated!`
        : `Identity unmasked: The winner is ${winner.businessName}.`,
    );
    await load();
  }

  async function handleCreatePo() {
    if (!award) return;
    setBusy(true);
    setError(null);
    const result = await createPurchaseOrderFromAward(award.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess('Purchase order generated successfully.');
    navigate(`/purchase-orders/${result.poId}`);
  }

  async function handleAwardRunnerUp() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    const result = await awardRunnerUpQuote(rfqId, 'Winning supplier failed contact validation or requested reassignment');
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(`Award successfully transferred to Runner-Up (${result.data.runnerUpAlias} - ₹${result.data.totalCost.toLocaleString('en-IN')}) with 0 penalty on Buyer Reliability Score!`);
    await load();
  }

  const handleShareWhatsApp = () => {
    const businessName = winningQuote?.businessName || 'Awarded Supplier';
    const amount = winningQuote ? `₹${winningQuote.totalCost.toLocaleString('en-IN')}` : '';
    const ref = `RFQ-${rfqId.slice(0, 8)}`;
    const poLink = existingPoId ? `${window.location.origin}/purchase-orders/${existingPoId}` : window.location.href;

    const message = encodeURIComponent(
      `*OTP Procurement Award Notice*\n\n` +
      `📋 Reference: ${ref}\n` +
      `🏆 Awarded Supplier: ${businessName}\n` +
      `💰 Total Value: ${amount}\n` +
      `📄 Digital PO: ${poLink}\n\n` +
      `*Cryptographically verified & sealed on OTP Platform.*`
    );

    window.open(`https://wa.me/?text=${message}`, '_blank', 'noopener,noreferrer');
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Award Confirmation - RFQ-${rfqId.slice(0, 8)}`,
          text: `Award confirmed for ${winningQuote?.businessName || 'Supplier'} on OTP.`,
          url: window.location.href,
        });
      } catch {
        handleShareWhatsApp();
      }
    } else {
      handleShareWhatsApp();
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-6 text-sm text-muted-foreground">
        <div className="text-center space-y-2">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p>Loading Supplier Reveal &amp; Receipt Room…</p>
        </div>
      </div>
    );
  }

  const isRevealed = award?.status === 'REVEALED';
  const activeLinearStep = isRevealed ? 12 : 11;

  return (
    <div
      className="zero-scroll-container min-h-screen bg-background text-foreground overflow-x-hidden max-w-full pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]"
      data-testid="supplier-reveal-page"
    >
      <ProcurementStageNavigator
        currentLinearStep={activeLinearStep}
        currentStage="AWARDED"
        orderTitle={isRevealed ? 'Contract Gate & Winner Reveal' : 'Intent-to-Procure & Unmasking Gate'}
        orderReference={award ? `AWARD-${award.id.slice(0, 8)}` : `RFQ-${rfqId.slice(0, 8)}`}
        rfqId={rfqId}
        poId={existingPoId}
        role="buyer"
        backToUrl={`/rfq/${rfqId}/award`}
        backToLabel="Lock Award"
      />

      <div className="px-3.5 sm:px-6 max-w-4xl mx-auto w-full space-y-4 pt-2">
        {/* Header Bar */}
        <div className="rounded-2xl border bg-card/90 backdrop-blur-xs p-3.5 sm:p-4 shadow-2xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-rose-100 dark:bg-rose-950/70 px-2.5 py-0.5 text-[11px] font-bold text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                Controlled Supplier Identity Reveal
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                  isRevealed
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-primary/10 border-primary/30 text-primary'
                }`}
              >
                {isRevealed ? '✓ Identity Unmasked' : '🔒 Intent Gate Active'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsCancelModalOpen(true)}
              className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/30 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 transition min-h-[44px]"
            >
              Cancel Tender
            </button>
          </div>

          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-foreground">
              {isRevealed
                ? 'Winning Supplier Credentials & Audit Proof'
                : 'Contract Gate & Controlled Identity Unmasking'}
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
              {isRevealed
                ? 'Authoritative legal entity, GSTIN, and direct contact details revealed for PO execution.'
                : 'Confirm committee commitment to unmask the winning supplier credentials and generate the digital Purchase Order.'}
            </p>
          </div>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-300 bg-red-50/90 dark:bg-red-950/50 dark:border-red-900 p-3 text-xs font-semibold text-red-800 dark:text-red-200 shadow-2xs"
          >
            {error}
          </div>
        )}
        {success && (
          <div
            role="status"
            className="rounded-xl border border-emerald-300 bg-emerald-50/90 dark:bg-emerald-950/50 dark:border-emerald-900 p-3 text-xs font-semibold text-emerald-800 dark:text-emerald-200 shadow-2xs"
            data-testid="reveal-success"
          >
            {success}
          </div>
        )}

        {/* No Award Warning */}
        {!award && (
          <div className="rounded-2xl border bg-card p-5 text-xs text-muted-foreground text-center space-y-2">
            <p>No award decision recorded yet.</p>
            <Link
              to={`/rfq/${rfqId}/award`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground min-h-[44px]"
            >
              Record Award Decision →
            </Link>
          </div>
        )}

        {/* PRE-REVEAL INTENT GATE */}
        {award && !isRevealed && (
          <section className="rounded-2xl border border-primary/30 bg-card p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[10px] font-bold">
                INTENT-TO-AWARD GATE
              </span>
              <span className="text-[10px] text-muted-foreground">
                Vote tally locked: {award.votesLockedAt ? new Date(award.votesLockedAt).toLocaleString() : 'Recorded'}
              </span>
            </div>

            <div className="space-y-1">
              <h2 className="text-sm sm:text-base font-black text-foreground">
                Confirm Intent to Procure &amp; Unmask Supplier Identity
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                By unmasking this supplier, you confirm your committee&rsquo;s authorization to execute this procurement on OTP. A digital Purchase Order draft will be issued with price-locking.
              </p>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-muted/20 p-3.5 text-xs text-foreground transition hover:bg-muted/30 min-h-[44px]">
              <input
                type="checkbox"
                checked={commitmentChecked}
                onChange={(e) => setCommitmentChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded text-primary focus:ring-primary"
              />
              <span className="leading-snug text-[11px]">
                <strong>Procurement Execution Commitment:</strong> I confirm on behalf of our organization that we authorize issuing the digital Purchase Order on OTP with the winning supplier.
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={busy || !commitmentChecked}
                onClick={() => void handleReveal()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-xs sm:text-sm font-black text-primary-foreground shadow-md hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 transition min-h-[44px]"
                data-testid="reveal-button"
              >
                <span>🔓</span>
                <span>{busy ? 'Unmasking Supplier…' : 'Confirm Intent & Unmask Supplier →'}</span>
              </button>
            </div>
          </section>
        )}

        {/* POST-REVEAL: SPOTLIGHT WINNER CARD */}
        {isRevealed && winningQuote && (
          <section className="rounded-2xl border-2 border-emerald-500/40 bg-card p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                  🏆
                </span>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
                    Unmasked Winning Entity
                  </span>
                  <h2 className="text-base sm:text-lg font-black text-foreground">
                    {winningQuote.businessName}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 px-2.5 py-0.5 text-[10px] font-bold">
                  ✓ Verified
                </span>
                <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[10px] font-bold">
                  Alias: {winningQuote.anonymousLabel}
                </span>
              </div>
            </div>

            {/* Statutory Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-muted/20 dark:bg-muted/10 p-3.5 rounded-xl border border-border/50 text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                  Legal Entity:
                </span>
                <strong className="text-foreground text-sm block truncate">
                  {winningQuote.businessName || 'Verified Supplier'}
                </strong>
                <span className="text-[10px] text-muted-foreground">Supplier ID: {winningQuote.supplierId ? winningQuote.supplierId.slice(0, 8) : 'Revealed'}</span>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                  Direct Contact:
                </span>
                <span className="font-semibold text-foreground block">
                  {winningQuote.phone || 'Phone on File'}
                </span>
                <span className="text-[10px] text-muted-foreground block truncate">
                  {winningQuote.email || 'Email on File'}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                  Agreed Total:
                </span>
                <strong className="font-mono font-black text-foreground text-base block">
                  ₹{winningQuote.totalCost.toLocaleString('en-IN')}
                </strong>
                <span className="text-[10px] text-muted-foreground">
                  TAT: {winningQuote.deliveryDays ? `${winningQuote.deliveryDays} Days` : 'Standard'}
                  {winningQuote.isDeliveryDaysEstimated ? ' (Estimated)' : ''}
                </span>
              </div>
            </div>

            {/* Direct Action Row */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              {existingPoId ? (
                <Link
                  to={`/purchase-orders/${existingPoId}`}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-xs sm:text-sm font-black text-primary-foreground shadow-md hover:bg-primary/90 active:scale-[0.98] transition min-h-[44px]"
                  data-testid="view-po-link"
                >
                  <span>📄</span>
                  <span>View Purchase Order →</span>
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleCreatePo()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-xs sm:text-sm font-black text-primary-foreground shadow-md hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 transition min-h-[44px]"
                  data-testid="create-po-button"
                >
                  <span>📄</span>
                  <span>{busy ? 'Creating PO…' : 'Generate Purchase Order →'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleNativeShare}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 px-4 py-3 text-xs font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 transition min-h-[44px]"
              >
                <span>📲</span>
                <span>Share via WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => triggerPrintDialog()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border bg-card px-4 py-3 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition min-h-[44px]"
              >
                <span>📥</span>
                <span>PDF Proof</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleAwardRunnerUp()}
                className="inline-flex items-center justify-center gap-1 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30 px-3 py-3 text-xs font-bold text-amber-800 dark:text-amber-300 hover:bg-amber-100 transition min-h-[44px]"
                data-testid="runner-up-award-button"
              >
                Auto-Award to Runner-Up →
              </button>
            </div>
          </section>
        )}

        {/* DECISION RECEIPT COMPONENT */}
        {isRevealed && award && (
          <DecisionReceipt rfqId={rfqId} winningQuoteId={award.quoteId} />
        )}

        {/* CONFIDENTIALITY MATRIX (Controlled Unmasking Table) */}
        {quotes.length > 0 && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowMatrix(!showMatrix)}
              className="w-full flex items-center justify-between rounded-xl border bg-card p-3 text-xs font-bold text-muted-foreground hover:text-foreground transition min-h-[44px]"
            >
              <span>🔒 View Confidentiality &amp; Award Matrix ({quotes.length} Candidates)</span>
              <span>{showMatrix ? '▲' : '▼'}</span>
            </button>

            {showMatrix && (
              <section
                className="mt-2 rounded-2xl border bg-card p-3.5 sm:p-4 shadow-2xs space-y-2 animate-in fade-in"
                data-testid="revealed-quotes-table"
              >
                <div className="flex items-center justify-between border-b pb-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                    Controlled Unmasking Matrix
                  </h3>
                  <span className="text-[10px] text-muted-foreground">
                    Losing offers remain strictly sealed &amp; protected
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Candidate</th>
                        <th className="px-3 py-2">Entity Name</th>
                        <th className="px-3 py-2">Contact</th>
                        <th className="px-3 py-2">Quoted Amount</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quotes.map((q) => {
                        const isWinner = q.quoteId === award?.quoteId;
                        return (
                          <tr
                            key={q.quoteId}
                            className={`border-t transition ${
                              isWinner ? 'bg-emerald-50/40 dark:bg-emerald-950/20 font-semibold' : 'bg-card'
                            }`}
                          >
                            <td className="px-3 py-2.5 font-bold text-foreground">
                              {q.anonymousLabel}
                              {isWinner && (
                                <span className="ml-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                                  ★ Winner
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {isWinner ? (
                                <span className="font-bold text-foreground">{q.businessName}</span>
                              ) : (
                                <span className="text-muted-foreground text-[11px] italic">
                                  🔒 Sealed &amp; Identity-Protected
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground text-[11px]">
                              {isWinner ? (
                                <span>{q.phone ?? '—'} {q.email ? `(${q.email})` : ''}</span>
                              ) : (
                                <span>—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 font-mono font-bold text-foreground">
                              ₹{q.totalCost.toLocaleString('en-IN')}
                            </td>
                            <td className="px-3 py-2.5">
                              {isWinner ? (
                                <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 text-[9px] font-black text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                                  AWARDED
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">Not Selected</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Cancel RFQ Modal */}
      <CancelRfqModal
        rfqId={rfqId}
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onCancelled={() => {
          setIsCancelModalOpen(false);
          navigate('/');
        }}
      />

      {/* STICKY BOTTOM ACTION BAR */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur-md p-3 sm:px-6 shadow-xl pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-2 text-xs">
            <span className="text-muted-foreground">
              {isRevealed ? 'Awarded Supplier:' : 'Winning Candidate:'}{' '}
              <strong className="text-foreground">
                {isRevealed
                  ? winningQuote?.businessName || winningQuote?.anonymousLabel || 'Winner'
                  : winningQuote?.anonymousLabel || 'Selected'}
              </strong>
            </span>
            {winningQuote && (
              <span className="font-mono font-black text-foreground">
                ₹{winningQuote.totalCost.toLocaleString('en-IN')}
              </span>
            )}
          </div>

          <div className="w-full sm:w-auto flex items-center gap-2">
            {isRevealed ? (
              existingPoId ? (
                <Link
                  to={`/purchase-orders/${existingPoId}`}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-xs sm:text-sm font-black text-primary-foreground shadow-md hover:bg-primary/90 active:scale-[0.98] transition min-h-[44px]"
                >
                  <span>📄 View Digital Purchase Order →</span>
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleCreatePo()}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-xs sm:text-sm font-black text-primary-foreground shadow-md hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 transition min-h-[44px]"
                >
                  <span>📄 Generate Purchase Order →</span>
                </button>
              )
            ) : (
              <button
                type="button"
                disabled={busy || !commitmentChecked}
                onClick={() => void handleReveal()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-xs sm:text-sm font-black text-primary-foreground shadow-md hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 transition min-h-[44px]"
              >
                <span>🔓</span>
                <span>{busy ? 'Unmasking…' : 'Confirm Intent & Unmask Supplier →'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
