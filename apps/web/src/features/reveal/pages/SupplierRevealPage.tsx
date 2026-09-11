import { useCallback, useEffect, useState } from 'react';
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

export function SupplierRevealPage({ rfqId }: { rfqId: string }) {
  const navigate = useNavigate();
  const [award, setAward] = useState<AwardSummary | null>(null);
  const [quotes, setQuotes] = useState<RevealedQuoteRow[]>([]);
  const [existingPoId, setExistingPoId] = useState<string | null>(null);
  const [commitmentChecked, setCommitmentChecked] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
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
        ? `Identity unmasked: ${winner.aliasBeforeReveal} is ${winner.businessName}. Draft Purchase Order created.`
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
    setSuccess('Purchase order created');
    navigate(`/purchase-orders/${result.poId}`);
  }

  async function handleAwardRunnerUp() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    const result = await awardRunnerUpQuote(rfqId, 'Supplier unresponsive or failed inspection');
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(`Award successfully transferred to Runner-Up (${result.data.runnerUpAlias} - ₹${result.data.totalCost.toLocaleString('en-IN')}) with 0 penalty on your Buyer Reliability Score!`);
    await load();
  }

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading…</p>;

  const isRevealed = award?.status === 'REVEALED';
  const activeLinearStep = isRevealed ? 12 : 11;

  return (
    <div className="zero-scroll-container p-3 max-w-7xl mx-auto w-full" data-testid="supplier-reveal-page">
      <ProcurementStageNavigator
        currentLinearStep={activeLinearStep}
        currentStage="AWARDED"
        orderTitle="Contract Gate & Winner Reveal"
        orderReference={award ? `AWARD-${award.id.slice(0, 8)}` : `RFQ-${rfqId.slice(0, 8)}`}
        rfqId={rfqId}
        poId={existingPoId}
        role="buyer"
        backToUrl={`/rfq/${rfqId}/award`}
        backToLabel="Step 10: Lock Award"
      />

      {/* Header Bar */}
      <div className="rounded-lg border bg-card px-3 py-2 shadow-2xs shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-md bg-rose-100 dark:bg-rose-950/60 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800 shrink-0">
            Step {activeLinearStep} / 15
          </span>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-foreground truncate">
              {activeLinearStep === 11 ? 'Contract Gate & Statutory Verification' : 'Winner Contact & GST Reveal'}
            </h1>
            <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
              {activeLinearStep === 11
                ? 'Validate terms, milestone payment structure, and sign off intent before unmasking.'
                : 'Winning supplier contact & GST details are revealed; losing quotes stay confidential.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsCancelModalOpen(true)}
            className="rounded border border-red-200 bg-red-50/60 dark:bg-red-950/30 px-2.5 py-1 text-[11px] font-semibold text-red-700 dark:text-red-300 hover:bg-red-100"
          >
            Cancel Tender
          </button>
        </div>
      </div>

      {error && <p className="mt-1 text-xs text-red-600 bg-red-50 dark:bg-red-950/40 p-2 rounded border shrink-0">{error}</p>}
      {success && (
        <p className="mt-1 text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 p-2 rounded border shrink-0" data-testid="reveal-success">
          {success}
        </p>
      )}

      {/* Main Content Pane */}
      <div className="zero-scroll-pane mt-2 pb-20 sm:pb-12 space-y-2">
        {!award && (
          <p className="text-xs text-muted-foreground p-3 bg-muted/20 rounded border">
            No award recorded yet.{' '}
            <Link to={`/rfq/${rfqId}/award`} className="text-primary font-bold hover:underline">
              Record award →
            </Link>
          </p>
        )}

        {award && (award.status === 'LOCKED' || award.status === 'PENDING_REVEAL') && (
          <div className="rounded-lg border border-primary/30 bg-card p-3 shadow-2xs space-y-2">
            <div className="flex items-center gap-2">
              <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                INTENT-TO-AWARD GATE
              </span>
              <span className="text-[10px] text-muted-foreground">
                Vote tally locked {award.votesLockedAt ? new Date(award.votesLockedAt).toLocaleString() : ''}
              </span>
            </div>

            <h2 className="text-xs font-bold text-foreground">
              Confirm Intent to Procure &amp; Unmask Supplier Identity
            </h2>
            <p className="text-[11px] text-muted-foreground leading-snug">
              By unmasking this supplier, you confirm your organization&rsquo;s commitment to execute this tender on OTP. A digital PO draft will be created with price-locking.
            </p>

            <div className="rounded border bg-muted/30 p-2 text-xs">
              <label className="flex items-start gap-2 cursor-pointer font-medium text-[11px]">
                <input
                  type="checkbox"
                  checked={commitmentChecked}
                  onChange={(e) => setCommitmentChecked(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 rounded text-primary"
                />
                <span>
                  I confirm on behalf of our committee that we intend to issue the digital Purchase Order on OTP with the winning supplier.
                </span>
              </label>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={busy || !commitmentChecked}
                onClick={() => void handleReveal()}
                className="rounded bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-50 transition"
                data-testid="reveal-button"
              >
                {busy ? 'Unmasking…' : '🔓 Confirm Intent & Unmask Supplier →'}
              </button>
            </div>
          </div>
        )}

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

        {award?.status === 'REVEALED' && (
          <DecisionReceipt rfqId={rfqId} winningQuoteId={award.quoteId} />
        )}

        {quotes.length > 0 && (
          <section className="rounded-lg border bg-card p-2.5 shadow-2xs space-y-1.5" data-testid="revealed-quotes-table">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Supplier Award &amp; Confidentiality Matrix
              </h2>
              <span className="text-[10px] text-muted-foreground">
                Only the awarded supplier is unmasked.
              </span>
            </div>
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2.5 py-1.5">Supplier</th>
                    <th className="px-2.5 py-1.5">Business Name</th>
                    <th className="px-2.5 py-1.5">Contact</th>
                    <th className="px-2.5 py-1.5">Final Quoted</th>
                    <th className="px-2.5 py-1.5">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => {
                    const isWinner = q.quoteId === award?.quoteId;
                    return (
                      <tr
                        key={q.quoteId}
                        className={`border-t transition ${
                          isWinner ? 'bg-emerald-50/40 dark:bg-emerald-950/20 font-medium' : 'bg-card'
                        }`}
                      >
                        <td className="px-2.5 py-1.5 font-bold text-foreground">
                          {q.anonymousLabel}
                          {isWinner && (
                            <span className="ml-1 rounded bg-emerald-100 dark:bg-emerald-950/60 px-1 py-0.2 text-[9px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                              ★ Winner
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5">
                          {isWinner ? (
                            <span className="font-bold text-foreground text-xs">
                              {q.businessName}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px] italic">
                              🔒 Confidential
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5 text-muted-foreground text-[11px]">
                          {isWinner ? (
                            <span>{q.phone ?? '—'} {q.email ? `(${q.email})` : ''}</span>
                          ) : (
                            <span>—</span>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5 font-mono font-bold">
                          ₹{q.totalCost.toLocaleString('en-IN')}
                        </td>
                        <td className="px-2.5 py-1.5">
                          {isWinner ? (
                            <span className="rounded bg-emerald-100 dark:bg-emerald-950/60 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                              AWARDED
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Not Awarded</span>
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

        {award?.status === 'REVEALED' && (
          <section className="rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-2.5 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-bold text-xs text-foreground">Next Step: Purchase Order Fulfillment</h2>
              <p className="text-[10px] text-muted-foreground">
                Issue a PO from the revealed award to start milestone fulfillment.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleAwardRunnerUp()}
                className="rounded border border-amber-300 dark:border-amber-700 bg-card px-2 py-1 text-[10px] font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100"
              >
                Auto-Award to Runner-Up →
              </button>
              {existingPoId ? (
                <Link
                  to={`/purchase-orders/${existingPoId}`}
                  className="rounded bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90"
                  data-testid="view-po-link"
                >
                  View PO →
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleCreatePo()}
                  className="rounded bg-primary px-3 py-1 text-xs font-bold text-primary-foreground disabled:opacity-50 shadow-2xs"
                  data-testid="create-po-button"
                >
                  Create PO
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
