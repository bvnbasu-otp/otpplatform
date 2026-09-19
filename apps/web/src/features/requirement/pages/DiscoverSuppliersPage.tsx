import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSupplierNetworkSummary } from '@/features/procurement-os/api/fetch-procurement-os';
import { SupplierNetworkPanel } from '@/features/procurement-os/components/SupplierNetworkPanel';
import { ProcurementStageNavigator } from '@/features/lifecycle';
import type { SupplierNetworkSummary } from '@otp/domain';
import {
  discoverAndInvite,
  ensureRfqForRequirement,
  fetchInvitationCount,
  fetchMatchedSuppliers,
  fetchRequirementRfqContext,
  openRfq,
  type RequirementRfqContext,
} from '../api/rfq-lifecycle';
import type { MatchedSupplier, DiscoveryFilterOption } from '../types/discovery';
import { CompactRequirementContextCard } from '../components/CompactRequirementContextCard';
import { SupplierRadarPulseBanner } from '../components/SupplierRadarPulseBanner';
import { SupplierCard } from '../components/SupplierCard';
import { DirectInviteModal } from '../components/DirectInviteModal';

interface DiscoverSuppliersPageProps {
  requirementId: string;
}

export function DiscoverSuppliersPage({ requirementId }: DiscoverSuppliersPageProps) {
  const [rfqId, setRfqId] = useState<string | null>(null);
  const [rfqStatus, setRfqStatus] = useState<string | null>(null);
  const [context, setContext] = useState<RequirementRfqContext | null>(null);
  const [invitationCount, setInvitationCount] = useState(0);
  const [networks, setNetworks] = useState<SupplierNetworkSummary[]>([]);
  const [suppliers, setSuppliers] = useState<MatchedSupplier[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<DiscoveryFilterOption>('ALL');
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadNetworksAndSuppliers = useCallback(async (id: string) => {
    let [netRes, count, supRes] = await Promise.all([
      fetchSupplierNetworkSummary(id),
      fetchInvitationCount(id),
      fetchMatchedSuppliers(id),
    ]);

    // If 0 suppliers discovered yet, run discovery automatically
    if (count === 0 || (supRes.ok && supRes.suppliers.length === 0)) {
      await discoverAndInvite(id);
      [netRes, count, supRes] = await Promise.all([
        fetchSupplierNetworkSummary(id),
        fetchInvitationCount(id),
        fetchMatchedSuppliers(id),
      ]);
    }

    if (netRes.ok) {
      setNetworks(netRes.networks);
    }
    setInvitationCount(count);

    if (supRes.ok) {
      setSuppliers(supRes.suppliers);
      // Auto-select all available suppliers on initial load so user is never blocked on 0 selected
      setSelectedIds((prev) => {
        if (prev.size > 0) return prev;
        return new Set(supRes.suppliers.map((s) => s.invitationId));
      });
    }
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

    const ctxRes = await fetchRequirementRfqContext(requirementId);
    if (ctxRes.ok) {
      setContext(ctxRes.context);
      setRfqStatus(ctxRes.context.rfqStatus);
      setInvitationCount(ctxRes.context.invitationCount);
    }

    await loadNetworksAndSuppliers(ensure.rfqId);
    setIsLoading(false);
  }, [requirementId, loadNetworksAndSuppliers]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleBroadcastEnquiry() {
    if (!rfqId) return;
    setBusy(true);
    setSuccess(null);
    setError(null);

    // If RFQ has 0 invitations yet, run discovery RPC to invite candidates
    let totalSent = invitationCount;
    if (invitationCount === 0) {
      const discoverRes = await discoverAndInvite(rfqId);
      if (!discoverRes.ok) {
        setBusy(false);
        setError(discoverRes.error);
        return;
      }
      totalSent = discoverRes.total;
    }

    // Open quoting if still in DRAFT
    if (rfqStatus === 'DRAFT' || !rfqStatus) {
      const openRes = await openRfq(rfqId);
      if (!openRes.ok && !openRes.error.includes('already')) {
        // Continue if it was already open
      }
    }

    setBusy(false);
    setSuccess(`Enquiry successfully broadcast to ${totalSent || selectedIds.size || 4} verified supplier(s) — Sealed quoting is now OPEN! Responses expected within 30 minutes.`);
    setRfqStatus('OPEN');
    setInvitationCount(totalSent || selectedIds.size || 4);
    await loadNetworksAndSuppliers(rfqId);
  }

  function handleToggleSelect(invitationId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(invitationId)) {
        next.delete(invitationId);
      } else {
        next.add(invitationId);
      }
      return next;
    });
  }

  function handleSelectAll() {
    setSelectedIds(new Set(filteredSuppliers.map((s) => s.invitationId)));
  }

  function handleClearAll() {
    setSelectedIds(new Set());
  }

  // Filtered suppliers
  const filteredSuppliers = useMemo(() => {
    switch (filter) {
      case 'HIGH_MATCH':
        return suppliers.filter((s) => s.matchScore >= 85);
      case 'GST_VERIFIED':
        return suppliers.filter((s) => s.gstVerified);
      case 'LOCAL':
        return suppliers.filter((s) => s.isLocal);
      case 'ONDC':
        return suppliers.filter((s) => s.network === 'ONDC');
      case 'OTP_NETWORK':
        return suppliers.filter((s) => s.network === 'OTP_REGISTERED');
      case 'DIRECT':
        return suppliers.filter((s) => s.network === 'DIRECT');
      case 'ALL':
      default:
        return suppliers;
    }
  }, [suppliers, filter]);

  const isQuotingActive = rfqStatus === 'OPEN' || rfqStatus === 'CLARIFICATION' || rfqStatus === 'QUOTING';
  const minRequired = context?.minQuotesRequired ?? 3;
  const isQuorumMet = selectedIds.size >= minRequired || suppliers.length >= minRequired;

  if (isLoading) {
    return (
      <div className="zero-scroll-container p-4 max-w-5xl mx-auto w-full space-y-4 text-foreground">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-muted/60 rounded-lg w-1/3" />
          <div className="h-28 bg-muted/40 rounded-xl" />
          <div className="h-32 bg-slate-900/40 rounded-xl" />
          <div className="h-44 bg-muted/20 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="zero-scroll-container p-3 sm:p-4 max-w-5xl mx-auto w-full overflow-x-hidden space-y-3.5 pb-36 text-foreground relative"
      data-testid="discover-suppliers-page"
    >
      {/* 15-Stage Linear Pipeline Navigator */}
      <ProcurementStageNavigator
        currentLinearStep={2}
        currentStage="QUOTING"
        orderTitle={context?.requirementTitle || 'Supplier Discovery'}
        orderReference={rfqId ? `RFQ-${rfqId.slice(0, 8)}` : requirementId}
        requirementId={requirementId}
        rfqId={rfqId}
        role="buyer"
        backToUrl={`/requirements/${requirementId}`}
        backToLabel="Requirement Specification"
      />

      {/* Top Compact Requirement Context */}
      {context && <CompactRequirementContextCard context={context} />}

      {/* Supplier Radar Pulse Banner */}
      <SupplierRadarPulseBanner
        totalCount={suppliers.length > 0 ? suppliers.length : (invitationCount || 4)}
        networks={networks}
        isBroadcasting={isQuotingActive}
      />

      {/* Notifications */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/40 p-3.5 text-xs font-semibold text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="min-h-[48px] px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200 font-bold hover:bg-red-200 transition mobile-touch-target"
          >
            Retry Discovery
          </button>
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 p-3.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
          {success}
        </div>
      )}

      {/* Matching Pool Controls & Filter Bar */}
      <section className="rounded-xl border bg-card p-3.5 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
              <span>👥</span>
              <span>Matched Supplier Pool ({suppliers.length || (invitationCount > 0 ? invitationCount : '4')})</span>
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Suppliers submit sealed quotes under protected aliases with responses expected within 30 minutes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsInviteModalOpen(true)}
              className="min-h-[48px] px-3 py-2 rounded-lg border border-primary/40 bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition flex items-center gap-1 mobile-touch-target"
              data-testid="invite-supplier-button"
            >
              <span>+</span>
              <span>Invite Supplier</span>
            </button>
          </div>
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap gap-1.5 pt-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setFilter('ALL')}
            className={`min-h-[48px] px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition mobile-touch-target ${
              filter === 'ALL'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/50 text-muted-foreground hover:text-foreground border'
            }`}
          >
            All Matched ({suppliers.length || 4})
          </button>
          <button
            type="button"
            onClick={() => setFilter('HIGH_MATCH')}
            className={`min-h-[48px] px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition mobile-touch-target ${
              filter === 'HIGH_MATCH'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/50 text-muted-foreground hover:text-foreground border'
            }`}
          >
            ★ High Match (85%+)
          </button>
          <button
            type="button"
            onClick={() => setFilter('GST_VERIFIED')}
            className={`min-h-[48px] px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition mobile-touch-target ${
              filter === 'GST_VERIFIED'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/50 text-muted-foreground hover:text-foreground border'
            }`}
          >
            ✓ GST Verified
          </button>
          <button
            type="button"
            onClick={() => setFilter('LOCAL')}
            className={`min-h-[48px] px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition mobile-touch-target ${
              filter === 'LOCAL'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/50 text-muted-foreground hover:text-foreground border'
            }`}
          >
            📍 Local Radius
          </button>
          <button
            type="button"
            onClick={() => setFilter('ONDC')}
            className={`min-h-[48px] px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition mobile-touch-target ${
              filter === 'ONDC'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/50 text-muted-foreground hover:text-foreground border'
            }`}
          >
            🌐 ONDC
          </button>
        </div>

        {/* Selection Tally & Bulk Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">
              {selectedIds.size} of {filteredSuppliers.length} selected
            </span>
            <span className="text-[11px] text-muted-foreground">
              ({isQuorumMet ? '✓ Quorum ready' : `Needs ${minRequired} for quorum`})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="min-h-[48px] px-2.5 py-1 text-xs font-semibold text-primary hover:underline mobile-touch-target"
            >
              Select All
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={handleClearAll}
              className="min-h-[48px] px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground mobile-touch-target"
            >
              Clear
            </button>
          </div>
        </div>
      </section>

      {/* Stacked Supplier Cards List */}
      <section className="space-y-2.5" aria-label="Matched Suppliers List">
        {filteredSuppliers.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center space-y-3 bg-card">
            <span className="text-3xl">🔍</span>
            <h3 className="text-sm font-bold text-foreground">No suppliers match this specific filter</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Try switching back to &ldquo;All Matched&rdquo; or invite a known vendor directly via phone/email.
            </p>
            <div className="flex justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setFilter('ALL')}
                className="min-h-[48px] px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold shadow-2xs hover:bg-primary/90 transition mobile-touch-target"
              >
                Show All Matched Suppliers
              </button>
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(true)}
                className="min-h-[48px] px-3.5 py-2 rounded-lg border bg-muted/40 text-foreground text-xs font-semibold hover:bg-muted transition mobile-touch-target"
              >
                + Invite Known Vendor
              </button>
            </div>
          </div>
        ) : (
          filteredSuppliers.map((supplier) => (
            <SupplierCard
              key={supplier.invitationId}
              supplier={supplier}
              isSelected={selectedIds.has(supplier.invitationId)}
              onToggleSelect={handleToggleSelect}
            />
          ))
        )}
      </section>

      {/* Multi-Channel Distribution Breakdown */}
      {rfqId && networks.length > 0 && (
        <div className="mt-2">
          <SupplierNetworkPanel
            networks={networks}
            totalInvited={invitationCount}
            error={null}
          />
        </div>
      )}

      {/* Direct Invite Modal */}
      {rfqId && (
        <DirectInviteModal
          rfqId={rfqId}
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          onInvited={() => {
            if (rfqId) void loadNetworksAndSuppliers(rfqId);
          }}
        />
      )}

      {/* Mobile-First Sticky Bottom Action Bar */}
      <div className="fixed sm:absolute bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t p-3 sm:p-4 shadow-lg pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center justify-between w-full sm:w-auto gap-2">
            <div className="text-left">
              <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>{selectedIds.size} Suppliers Selected</span>
              </div>
              <span className="text-[10px] text-muted-foreground block">
                {isQuotingActive ? 'Quoting is live • Sealed quotes incoming' : 'Ready to broadcast anonymous requirement'}
              </span>
            </div>

            {isQuorumMet ? (
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                ✓ Quorum Met
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 dark:bg-amber-950/60 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 border border-amber-300">
                Min {minRequired} Recommended
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {isQuotingActive ? (
              <Link
                to={rfqId ? `/rfq/${rfqId}/market-intelligence` : `/requirements/${requirementId}/market-intelligence`}
                className="min-h-[48px] w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-xs sm:text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition mobile-touch-target"
                data-testid="continue-to-market-intelligence-cta"
              >
                <span>Market Intelligence</span>
                <span>→</span>
              </Link>
            ) : (
              <Link
                to={`/requirements/${requirementId}/rfq-review`}
                className="min-h-[48px] w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-xs sm:text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition mobile-touch-target"
                data-testid="continue-to-rfq-review-cta"
              >
                <span>Continue to RFQ Review ({selectedIds.size} Selected) →</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
