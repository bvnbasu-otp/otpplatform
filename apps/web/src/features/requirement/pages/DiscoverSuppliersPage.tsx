import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchSupplierNetworkSummary } from '@/features/procurement-os/api/fetch-procurement-os';
import { ProcurementStageNavigator } from '@/features/lifecycle';
import type { SupplierNetworkSummary } from '@otp/domain';
import {
  discoverAndInvite,
  ensureRfqForRequirement,
  fetchRequirementRfqContext,
  openRfq,
  refreshSupplierInvitationPool,
  runExplicitSupplierDiscovery,
  type RequirementRfqContext,
} from '../api/rfq-lifecycle';
import type { MatchedSupplier, DiscoveryFilterOption } from '../types/discovery';
import { CompactRequirementContextCard } from '../components/CompactRequirementContextCard';
import { SupplierRadarPulseBanner, type RadarBannerState } from '../components/SupplierRadarPulseBanner';
import { SupplierCard } from '../components/SupplierCard';
import { DirectInviteModal } from '../components/DirectInviteModal';
import { classifyDiscoveryEmpty, discoveryFailureCopy, displayedSupplierCount } from '../lib/discovery-empty-state';
import { sourceSummary } from '../lib/discovery-source';
import { sortSuppliersForDisplay } from '../lib/supplier-truth';
import { DiscoveryTruthLegend } from '../components/DiscoveryTruthLegend';
import { SelectedSuppliersReviewPanel } from '../components/SelectedSuppliersReviewPanel';
import { useLanguage } from '@/lib/i18n';


interface DiscoverSuppliersPageProps {
  requirementId: string;
}

export function DiscoverSuppliersPage({ requirementId }: DiscoverSuppliersPageProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();
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
  const [isLoading, setIsLoading] = useState(true);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryRunState, setDiscoveryRunState] = useState<'NOT_STARTED' | 'DONE'>('NOT_STARTED');
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const refreshPool = useCallback(async (id: string): Promise<string | null> => {
    const [netRes, poolRes] = await Promise.all([
      fetchSupplierNetworkSummary(id),
      refreshSupplierInvitationPool(id),
    ]);
    if (netRes.ok) setNetworks(netRes.networks);
    if (!poolRes.ok) {
      setSuppliers([]);
      setInvitationCount(0);
      return poolRes.error;
    }
    setInvitationCount(poolRes.invitationCount);
    setSuppliers(poolRes.suppliers);
    if (poolRes.invitationCount > 0 || poolRes.suppliers.length > 0) {
      setDiscoveryRunState('DONE');
    }
    return null;
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

    const refreshError = await refreshPool(ensure.rfqId);
    if (refreshError) setError(refreshError);
    setIsLoading(false);
  }, [requirementId, refreshPool]);

  const handleRunDiscovery = useCallback(async () => {
    if (!rfqId || isDiscovering) return;
    setIsDiscovering(true);
    setError(null);
    setSuccess(null);
    const result = await runExplicitSupplierDiscovery(rfqId);
    const refreshError = await refreshPool(rfqId);
    setIsDiscovering(false);
    if (refreshError) {
      setError(refreshError);
      return;
    }
    if (!result.ok) {
      setError(result.error);
      setDiscoveryRunState('DONE');
      return;
    }
    setDiscoveryRunState('DONE');
    if (result.outcome === 'ZERO_RESULTS') {
      setSuccess(
        'Discovery finished but no invitation records were created. Try a direct invite or adjust the requirement scope.',
      );
      return;
    }
    setSuccess('Discovery complete. Invitation records are on file for matched suppliers.');
  }, [rfqId, isDiscovering, refreshPool]);

  useEffect(() => {
    void load();
  }, [load]);

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

  // Add all currently filtered suppliers to existing selection pool
  function handleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredSuppliers.forEach((s) => next.add(s.invitationId));
      return next;
    });
  }

  // Clear all selections
  function handleClearAll() {
    setSelectedIds(new Set());
  }

  // Filtered suppliers memo
  const filteredSuppliers = useMemo(() => {
    let list: MatchedSupplier[];
    switch (filter) {
      case 'HIGH_MATCH':
        list = suppliers.filter((s) => s.matchScore >= 85);
        break;
      case 'GST_VERIFIED':
        list = suppliers.filter((s) => s.gstVerified);
        break;
      case 'LOCAL':
        list = suppliers.filter((s) => s.isLocal);
        break;
      case 'ONDC':
        list = suppliers.filter((s) => s.network === 'ONDC');
        break;
      case 'OTP_NETWORK':
        list = suppliers.filter((s) => s.network === 'OTP_REGISTERED' || s.otpRegistered);
        break;
      case 'DIRECT':
        list = suppliers.filter((s) => s.network === 'DIRECT');
        break;
      case 'ALL':
      default:
        list = suppliers;
    }
    return sortSuppliersForDisplay(list);
  }, [suppliers, filter]);

  const isQuotingActive = rfqStatus === 'OPEN' || rfqStatus === 'CLARIFICATION' || rfqStatus === 'QUOTING';
  const minRequired = context?.minQuotesRequired ?? 3;
  const isQuorumMet = selectedIds.size >= minRequired;

  // Filter labels for granular empty states
  const filterLabelMap: Record<DiscoveryFilterOption, string> = {
    ALL: 'All Matched',
    HIGH_MATCH: 'High Match (85%+)',
    GST_VERIFIED: 'GST Verified',
    LOCAL: 'Local',
    ONDC: 'ONDC Protocol',
    OTP_NETWORK: 'OTP Network',
    DIRECT: 'Direct Invitations',
  };

  // Determine Radar state
  const radarState: RadarBannerState = error
    ? 'ERROR'
    : isDiscovering
    ? 'DISCOVERING'
    : isLoading
    ? 'DISCOVERING'
    : isQuotingActive
    ? 'READY'
    : suppliers.length === 0
    ? 'EMPTY'
    : filteredSuppliers.length === 0
    ? 'FILTERED_EMPTY'
    : 'MATCHED';

  const emptyKind = classifyDiscoveryEmpty({ supplierCount: suppliers.length, error });
  const googleCount = suppliers.filter((s) => s.network === 'GOOGLE_PLACES').length;
  const otpCount = suppliers.filter((s) => s.network === 'OTP_REGISTERED').length;
  const sources = sourceSummary({ google: googleCount, otp: otpCount });
  const nobodyInvited = suppliers.length === 0 && invitationCount === 0;

  async function handleSearchOtpRegistered() {
    if (!rfqId || isDiscovering) return;
    setIsDiscovering(true);
    setError(null);
    setSuccess(null);
    const discovered = await discoverAndInvite(rfqId, 'OTP_REGISTERED');
    const refreshError = await refreshPool(rfqId);
    setIsDiscovering(false);
    setDiscoveryRunState('DONE');
    if (refreshError) {
      setError(refreshError);
      return;
    }
    if (!discovered.ok) {
      setError(discovered.error);
      return;
    }
    if (discovered.otpRegisteredInvited === 0 && discovered.invited === 0) {
      setSuccess("We couldn't find enough matches yet. You can invite a known supplier or run full discovery.");
    } else {
      setSuccess('OTP-registered search finished. Check invitation status on each card.');
    }
  }

  async function handleBroadcastRfq() {
    if (!rfqId) return;
    setIsBroadcasting(true);
    setError(null);
    try {
      if (invitationCount < 1) {
        setError(
          'No server-confirmed invitations exist yet. Run supplier discovery or add a direct invite before opening quotes.',
        );
        setIsBroadcasting(false);
        return;
      }
      const openRes = await openRfq(rfqId);
      if (!openRes.ok && !openRes.error?.toLowerCase().includes('cannot open rfq from status open')) {
        setError(openRes.error);
        setIsBroadcasting(false);
        return;
      }
      navigate(`/rfq/${rfqId}/quotes`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to broadcast RFQ');
    } finally {
      setIsBroadcasting(false);
    }
  }

  if (isLoading) {
    return (
      <div
        className="zero-scroll-container p-3 sm:p-4 max-w-5xl mx-auto w-full space-y-4 text-foreground"
        data-testid="discover-suppliers-loading"
      >
        <SupplierRadarPulseBanner
          totalCount={0}
          state="DISCOVERING"
          isBroadcasting={false}
        />
        <div className="rounded-xl border border-border bg-card/60 p-6 flex flex-col items-center justify-center text-center space-y-3 shadow-xs">
          <div className="relative flex items-center justify-center w-12 h-12">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/20 opacity-75" />
            <span className="relative inline-flex rounded-full h-8 w-8 bg-primary/10 text-primary items-center justify-center font-bold text-base">
              ⚡
            </span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Loading requirement and invitation status…
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              Supplier discovery does not run until you choose Run supplier discovery.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="zero-scroll-container p-3 sm:p-4 max-w-5xl mx-auto w-full overflow-x-hidden space-y-3.5 pb-40 sm:pb-36 pb-[calc(10rem+env(safe-area-inset-bottom,0px))] text-foreground relative"
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
        totalCount={displayedSupplierCount(suppliers.length)}
        networks={networks}
        isBroadcasting={isQuotingActive}
        state={radarState}
        errorMessage={error}
        onRetry={() => (discoveryRunState === 'NOT_STARTED' ? void load() : void handleRunDiscovery())}
      />

      {/* Notifications */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/40 p-3.5 text-xs font-semibold text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void handleRunDiscovery()}
            className="min-h-[48px] px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200 font-bold hover:bg-red-200 transition mobile-touch-target"
          >
            {t('Retry Discovery', 'Retry Discovery')}
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
              <span aria-hidden="true">👥</span>
              <span>{t('Matched Supplier Pool', 'Matched Supplier Pool')} ({displayedSupplierCount(suppliers.length)})</span>
            </h2>
            <p className="text-[11px] text-muted-foreground" data-testid="discovery-source-summary">
              {sources.label}
            </p>
            {context?.categoryName && (
              <p className="text-[10px] text-muted-foreground mt-0.5" data-testid="discovery-category-scope">
                Invitations respect this requirement&apos;s category
                {context.deliveryPincode ? ` and delivery PIN ${context.deliveryPincode}` : ''}; nearby suppliers are not invited without a category/capability match.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isDiscovering || !rfqId}
              onClick={() => void handleRunDiscovery()}
              className="min-h-[48px] px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold shadow-2xs hover:bg-primary/90 transition flex items-center gap-1 mobile-touch-target disabled:opacity-60"
              data-testid="run-supplier-discovery-button"
            >
              <span>⚡</span>
              <span>{isDiscovering ? 'Discovering…' : t('Run supplier discovery', 'Run supplier discovery')}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsInviteModalOpen(true)}
              className="min-h-[48px] px-3 py-2 rounded-lg border border-primary/40 bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition flex items-center gap-1 mobile-touch-target"
              data-testid="invite-supplier-button"
            >
              <span>+</span>
              <span>{t('Invite Supplier', 'Invite Supplier')}</span>
            </button>
          </div>
        </div>

        {discoveryRunState === 'NOT_STARTED' && invitationCount === 0 && suppliers.length === 0 && !isDiscovering && (
          <div
            className="rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-3 text-[11px] text-muted-foreground space-y-2"
            data-testid="discovery-not-started-prompt"
          >
            <p className="font-bold text-foreground">Supplier discovery has not been run for this RFQ yet.</p>
            <p>
              Use <strong className="text-foreground/90">Run supplier discovery</strong> to search OTP-registered suppliers for this category and PIN, then scoped area matches. Invitations are created by that server workflow — not when you open this page.
            </p>
          </div>
        )}

        {/* Filter Chips */}
        <div className="flex flex-wrap gap-1.5 pt-1 overflow-x-auto" role="tablist" aria-label="Supplier Filters">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'ALL'}
            onClick={() => setFilter('ALL')}
            className={`min-h-[48px] px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition mobile-touch-target ${
              filter === 'ALL'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/50 text-muted-foreground hover:text-foreground border'
            }`}
          >
            {t('All', 'All Matched')} ({suppliers.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'HIGH_MATCH'}
            onClick={() => setFilter('HIGH_MATCH')}
            className={`min-h-[48px] px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition mobile-touch-target ${
              filter === 'HIGH_MATCH'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/50 text-muted-foreground hover:text-foreground border'
            }`}
          >
            ★ {t('High Match', 'High Match (85%+)')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'GST_VERIFIED'}
            onClick={() => setFilter('GST_VERIFIED')}
            className={`min-h-[48px] px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition mobile-touch-target ${
              filter === 'GST_VERIFIED'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/50 text-muted-foreground hover:text-foreground border'
            }`}
          >
            ✓ {t('GST Verified', 'GST verified')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'LOCAL'}
            onClick={() => setFilter('LOCAL')}
            className={`min-h-[48px] px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition mobile-touch-target ${
              filter === 'LOCAL'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/50 text-muted-foreground hover:text-foreground border'
            }`}
            >
            📍 {t('Local', 'Local')}
          </button>
        </div>

        {/* Selection Tally & Bulk Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground" data-testid="selection-tally-text">
              {filter !== 'ALL'
                ? `${filteredSuppliers.length} visible, ${selectedIds.size} selected`
                : `${selectedIds.size} of ${suppliers.length} selected`}
            </span>
            <span
              className={`text-[11px] font-semibold ${
                isQuorumMet ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
              }`}
              data-testid="quorum-status-indicator"
            >
              {isQuorumMet
                ? `${selectedIds.size} of ${minRequired} minimum selected ✓`
                : `${selectedIds.size} of ${minRequired} minimum suppliers selected (Needs ${minRequired - selectedIds.size} more for quorum)`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="min-h-[48px] px-2.5 py-1 text-xs font-semibold text-primary hover:underline mobile-touch-target"
            >
              {t('Select All', 'Select All')}
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={handleClearAll}
              className="min-h-[48px] px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground mobile-touch-target"
            >
              {t('Clear', 'Clear')}
            </button>
          </div>
        </div>

        <DiscoveryTruthLegend />
      </section>

      <SelectedSuppliersReviewPanel suppliers={suppliers} selectedIds={selectedIds} />

      {/* Stacked Supplier Cards List */}
      <section className="space-y-2.5" aria-label="Matched Suppliers List">
        {discoveryFailureCopy(emptyKind) ? (
          <div className="rounded-xl border border-dashed p-6 text-center space-y-3 bg-card" data-testid="discovery-not-a-zero-result">
            <h3 className="text-sm font-bold text-foreground">{discoveryFailureCopy(emptyKind)?.title}</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">{discoveryFailureCopy(emptyKind)?.body}</p>
            <button
              type="button"
              onClick={() => void handleSearchOtpRegistered()}
              className="min-h-[48px] px-3.5 py-2 rounded-lg border bg-muted/40 text-foreground text-xs font-semibold hover:bg-muted transition mobile-touch-target"
            >
              Search OTP Registered Suppliers
            </button>
          </div>
        ) : suppliers.length === 0 ? (
          /* Granular Empty State 1: No suppliers discovered yet */
          <div className="rounded-xl border border-dashed p-6 text-center space-y-3 bg-card" data-testid="empty-suppliers-pool">
            <span className="text-3xl" aria-hidden="true">🔍</span>
            <h3 className="text-sm font-bold text-foreground">We couldn&apos;t find enough matches yet</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              No matching businesses were returned for this PIN and category yet. Your requirement is saved. You can retry discovery, search registered suppliers, invite a known vendor, or return to edit specifications.
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => void handleRunDiscovery()}
                className="min-h-[48px] px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold shadow-2xs hover:bg-primary/90 transition mobile-touch-target"
              >
                Retry Discovery
                {/* Retry Google Places */}
              </button>
              <button
                type="button"
                onClick={() => void handleSearchOtpRegistered()}
                className="min-h-[48px] px-3.5 py-2 rounded-lg border bg-muted/40 text-foreground text-xs font-semibold hover:bg-muted transition mobile-touch-target"
                data-testid="search-otp-registered-suppliers"
              >
                Search OTP Registered Suppliers
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
        ) : filteredSuppliers.length === 0 ? (
          /* Granular Empty State 2: Filter produces 0 results */
          <div className="rounded-xl border border-dashed p-6 text-center space-y-3 bg-card" data-testid="filtered-empty-suppliers">
            <span className="text-3xl" aria-hidden="true">🎯</span>
            <h3 className="text-sm font-bold text-foreground">
              No suppliers match active filter &ldquo;{filterLabelMap[filter]}&rdquo;
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Try switching back to &ldquo;All Matched&rdquo; or invite a known vendor directly.
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setFilter('ALL')}
                className="min-h-[48px] px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold shadow-2xs hover:bg-primary/90 transition mobile-touch-target"
              >
                Show All Matched ({suppliers.length})
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

      {/* Direct Invite Modal */}
      {rfqId && (
        <DirectInviteModal
          rfqId={rfqId}
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          onInvited={() => {
            if (rfqId) void refreshPool(rfqId);
          }}
        />
      )}

      {/* Mobile-First Sticky Bottom Action Bar */}
      <div className="sticky bottom-0 z-40 mt-auto bg-background/95 backdrop-blur-md border-t p-3 sm:p-4 shadow-lg pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pb-safe">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center justify-between w-full sm:w-auto gap-2">
            <div className="text-left">
              <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse motion-reduce:animate-none" />
                <span data-testid="selected-suppliers-count">{selectedIds.size} Suppliers Selected</span>
              </div>
              <span className="text-[10px] text-muted-foreground block" data-testid="zero-invite-waiting">
                {nobodyInvited
                  ? 'No suppliers are invited. This request is waiting for discovery or an invitation. It is not collecting quotes.'
                  : isQuotingActive
                    ? 'Quotes can arrive from invited suppliers'
                    : 'Ready to request offers from the invited suppliers'}
              </span>
            </div>

            {isQuorumMet ? (
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300 shrink-0">
                ✓ Quorum Met ({selectedIds.size}/{minRequired})
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 dark:bg-amber-950/60 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 border border-amber-300 shrink-0">
                Min {minRequired} Recommended ({selectedIds.size}/{minRequired})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {rfqId && !nobodyInvited && (rfqStatus === 'DRAFT' || !isQuotingActive) ? (
              <button
                type="button"
                disabled={isBroadcasting}
                onClick={() => void handleBroadcastRfq()}
                className="min-h-[48px] w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-xs sm:text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition mobile-touch-target"
                data-testid="broadcast-rfq-cta"
              >
                <span>⚡</span>
                <span>{isBroadcasting ? 'Broadcasting…' : 'Request Offers & Broadcast RFQ →'}</span>
              </button>
            ) : rfqId ? (
              <Link
                to={`/rfq/${rfqId}/quotes`}
                className="min-h-[48px] w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-xs sm:text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition mobile-touch-target"
                data-testid="continue-to-quotes-cta"
              >
                <span>View Incoming Sealed Quotes →</span>
              </Link>
            ) : (
              <Link
                to={`/requirements/${requirementId}/rfq-review`}
                className="min-h-[48px] w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-xs sm:text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition mobile-touch-target"
                data-testid="continue-to-rfq-review-cta"
              >
                <span>Review Requirement &amp; RFQ →</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
