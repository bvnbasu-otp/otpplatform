import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSupplierNetworkSummary } from '@/features/procurement-os/api/fetch-procurement-os';
import { SupplierNetworkPanel } from '@/features/procurement-os/components/SupplierNetworkPanel';
import { ProcurementStageNavigator } from '@/features/lifecycle';
import type { SupplierNetworkSummary } from '@otp/domain';
import {
  discoverAndInvite,
  ensureRfqForRequirement,
  fetchInvitationCount,
  fetchRequirementRfqContext,
  openRfq,
} from '../api/rfq-lifecycle';

interface DiscoverSuppliersPageProps {
  requirementId: string;
}

export function DiscoverSuppliersPage({ requirementId }: DiscoverSuppliersPageProps) {
  const [rfqId, setRfqId] = useState<string | null>(null);
  const [rfqStatus, setRfqStatus] = useState<string | null>(null);
  const [requirementTitle, setRequirementTitle] = useState('');
  const [invitationCount, setInvitationCount] = useState(0);
  const [networks, setNetworks] = useState<SupplierNetworkSummary[]>([]);
  const [totalInvited, setTotalInvited] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadNetworks = useCallback(async (id: string) => {
    const [result, count] = await Promise.all([
      fetchSupplierNetworkSummary(id),
      fetchInvitationCount(id),
    ]);
    if (result.ok) {
      setNetworks(result.networks);
      setTotalInvited(result.totalInvited);
    }
    setInvitationCount(count);
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const ensure = await ensureRfqForRequirement(requirementId);
    if (!ensure.ok) {
      setError(ensure.error);
      setIsLoading(false);
      return;
    }

    setRfqId(ensure.rfqId);

    const ctx = await fetchRequirementRfqContext(requirementId);
    if (ctx.ok) {
      setRequirementTitle(ctx.context.requirementTitle);
      setRfqStatus(ctx.context.rfqStatus);
      setInvitationCount(ctx.context.invitationCount);
    }

    await loadNetworks(ensure.rfqId);
    setIsLoading(false);
  }, [requirementId, loadNetworks]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDiscover() {
    if (!rfqId) return;
    setBusy(true);
    setSuccess(null);
    setError(null);
    const result = await discoverAndInvite(rfqId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(`Enquiry successfully sent to ${result.total} verified supplier(s) — Quoting is now OPEN!`);
    setRfqStatus('OPEN');
    setInvitationCount(result.total);
    await loadNetworks(rfqId);
  }

  if (isLoading) {
    return <p className="p-8 text-muted-foreground">Loading Discovery…</p>;
  }

  const isQuotingOpen = rfqStatus === 'OPEN' || rfqStatus === 'CLARIFICATION' || rfqStatus === 'QUOTING';

  return (
    <div className="zero-scroll-container p-3 max-w-7xl mx-auto w-full" data-testid="discover-suppliers-page">
      <ProcurementStageNavigator
        currentLinearStep={2}
        currentStage="QUOTING"
        orderTitle={requirementTitle || 'Supplier Discovery'}
        orderReference={rfqId ? `RFQ-${rfqId.slice(0, 8)}` : requirementId}
        requirementId={requirementId}
        rfqId={rfqId}
        role="buyer"
        backToUrl={`/requirements/${requirementId}`}
        backToLabel="Step 1: Spec Submitted"
      />

      {/* Main Sourcing Discovery Header Card */}
      <section className="rounded-lg border bg-card px-3 py-2 shadow-2xs shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="rounded-md bg-purple-100 dark:bg-purple-950/60 px-2 py-0.5 text-[10px] font-bold text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0">
              Step 2 / 15
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground truncate">Send Enquiry to Verified Suppliers</h2>
              <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
                Broadcasts requirement across verified registries. Suppliers receive anonymous RFQs to submit sealed quotes.
              </p>
            </div>
          </div>
          {isQuotingOpen && (
            <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 shrink-0 border border-emerald-300">
              Quoting Active ({invitationCount} Invited)
            </span>
          )}
        </div>

        {error && <p className="mt-2 text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-950/40 p-2 rounded border">{error}</p>}
        {success && <p className="mt-2 text-xs font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded border">{success}</p>}

        <div className="mt-2 flex items-center justify-between border-t pt-2 gap-2">
          {invitationCount === 0 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDiscover()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-50 transition"
              data-testid="run-discovery-button"
            >
              {busy ? 'Matching & Sending Enquiries…' : 'Send Enquiry to Verified Suppliers →'}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to={rfqId ? `/rfq/${rfqId}/market-intelligence` : `/requirements/${requirementId}/market-intelligence`}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition"
              >
                <span>Step 3: Market Intelligence</span>
                <span>→</span>
              </Link>
              {rfqId && (
                <Link
                  to={`/rfq/${rfqId}/clarification`}
                  className="rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition"
                >
                  Step 4: Negotiation &amp; Q&amp;A →
                </Link>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Network Reach Breakdown */}
      {rfqId && (
        <div className="zero-scroll-pane mt-2">
          <SupplierNetworkPanel
            networks={networks}
            totalInvited={totalInvited}
            error={null}
          />
        </div>
      )}
    </div>
  );
}
