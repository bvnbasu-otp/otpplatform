import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PRODUCT_NAME } from '@/lib/brand';
import { formatDateIST } from '@/lib/date-utils';
import {
  fetchUserOrganization,
  fetchOrganizationRequirements,
  type UserOrganization,
  type OrganizationRequirementSummary,
} from '@/features/requirement/api/requirements';
import { fastTrackExpressIntake } from '@/features/intake/api/fast-track-intake';
import {
  CORE_PROCUREMENT_STATES,
  type CoreProcurementState,
} from '@/features/lifecycle';
import {
  fetchOrganizationSubscription,
  SubscriptionExpiryBanner,
  SubscriptionPaymentModal,
  type OrganizationSubscription,
} from '@/features/subscription';

type MacroPhaseFilter = 'ALL' | 'ACTION_REQUIRED' | CoreProcurementState | 'STALLED' | 'CANCELLED';

export function DashboardPage() {
  const navigate = useNavigate();
  const [org, setOrg] = useState<UserOrganization | null>(null);
  const [subscription, setSubscription] = useState<OrganizationSubscription | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [requirements, setRequirements] = useState<OrganizationRequirementSummary[]>([]);
  const [selectedPhase, setSelectedPhase] = useState<MacroPhaseFilter>('ALL');
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedRequirement, setSelectedRequirement] = useState<OrganizationRequirementSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expressQuery, setExpressQuery] = useState('');
  const [isSubmittingExpress, setIsSubmittingExpress] = useState(false);
  const [expressError, setExpressError] = useState<string | null>(null);

  const handleExpressSubmit = async (queryText?: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (subscription?.isExpired) {
      setIsPaymentModalOpen(true);
      return;
    }
    const textToSubmit = (queryText ?? expressQuery).trim();
    if (!textToSubmit) return;

    setIsSubmittingExpress(true);
    setExpressError(null);

    const result = await fastTrackExpressIntake(textToSubmit);
    if (!result.ok || !result.rfqId) {
      setExpressError(result.error || 'Failed to auto-generate RFQ quotes.');
      setIsSubmittingExpress(false);
      return;
    }

    // Direct routing straight to Live RFQ Quote Comparison
    navigate(`/rfq/${result.rfqId}/quotes`);
  };

  const loadData = async () => {
    setIsLoading(true);
    const orgRes = await fetchUserOrganization();

    if (orgRes.ok) {
      setOrg(orgRes.org);
      const [reqRes, subRes] = await Promise.all([
        fetchOrganizationRequirements(orgRes.org.organizationId),
        fetchOrganizationSubscription(orgRes.org.organizationId),
      ]);

      if (reqRes.ok) {
        setRequirements(reqRes.requirements);
      }
      if (subRes.ok) {
        setSubscription(subRes.subscription);
      }
    }
    setIsLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const getGovernanceLabel = (orgType?: string) => {
    switch (orgType) {
      case 'INDIVIDUAL':
        return 'Individual · Fast-track Direct Governance';
      case 'MSME':
        return 'MSME · Dual-Partner Review (2x Voting Power)';
      case 'COMMUNITY':
        return 'Community / RWA · Democratic (Quorum >= 2, 3x)';
      case 'ENTERPRISE':
        return 'Enterprise · Multi-Tier Governance (4x)';
      case 'INSTITUTION':
        return 'Institution · Committee & Trustee (Quorum >= 2, 3x)';
      default:
        return 'Competitive Sourcing';
    }
  };

  const getRequirementCoreState = (req: OrganizationRequirementSummary): CoreProcurementState => {
    if (req.isSettled || req.effectiveStatus === 'COMPLETED') return 'SETTLED';
    if (
      req.poStatus === 'ISSUED' ||
      req.poStatus === 'ACCEPTED' ||
      req.poStatus === 'IN_PROGRESS' ||
      req.effectiveStatus === 'IN_PROGRESS'
    ) {
      return 'PO_ISSUED';
    }
    if (req.rfqStatus === 'AWARDED' || req.revealStatus === 'REVEALED' || req.effectiveStatus === 'AWARDED') {
      return 'AWARDED';
    }
    if (req.rfqStatus === 'EVALUATING' || req.rfqStatus === 'CLOSED' || req.effectiveStatus === 'EVALUATION') {
      return 'EVALUATING';
    }
    if (req.rfqStatus === 'OPEN' || req.effectiveStatus === 'QUOTING' || req.status === 'QUOTING') {
      return 'QUOTING';
    }
    return 'DRAFT';
  };

  const isRequirementStalled = (req: OrganizationRequirementSummary): boolean => {
    if (
      req.isSettled ||
      req.effectiveStatus === 'COMPLETED' ||
      req.effectiveStatus === 'CANCELLED' ||
      req.status === 'CANCELLED'
    ) {
      return false;
    }
    const createdMs = new Date(req.createdAt).getTime();
    const elapsedHours = (Date.now() - createdMs) / (1000 * 60 * 60);
    return elapsedHours > 24;
  };

  const getNextAction = (req: OrganizationRequirementSummary) => {
    if (req.isSettled || req.effectiveStatus === 'COMPLETED') {
      return {
        label: 'Order Settled ✓',
        to: '/purchase-orders',
        primary: false,
        actionRequired: false,
        actionNotice: 'Order 100% completed & settled',
      };
    }

    switch (req.status) {
      case 'DRAFT':
        return {
          label: 'Continue Draft →',
          to: `/requirements/${req.id}`,
          primary: true,
          actionRequired: true,
          actionNotice: 'Requirement draft ready for submission',
        };
      case 'SUBMITTED':
      case 'RFQ_CREATED':
        return {
          label: 'Invite Vendors →',
          to: `/requirements/${req.id}/discover`,
          primary: true,
          actionRequired: true,
          actionNotice: 'Needs supplier discovery & invitations',
        };
      case 'QUOTING':
        return {
          label: req.rfqId ? '🗳️ Vote & Room →' : 'View →',
          to: req.rfqId ? `/rfq/${req.rfqId}/committee` : `/requirements/${req.id}`,
          primary: true,
          actionRequired: true,
          actionNotice: `${req.quotesCount} quote(s) received · Open voting room`,
        };
      case 'EVALUATION':
        return {
          label: '🗳️ Cast Vote →',
          to: req.rfqId ? `/rfq/${req.rfqId}/committee` : `/requirements/${req.id}`,
          primary: true,
          actionRequired: true,
          actionNotice: 'Active voting room · Quorum decision awaiting vote',
        };
      case 'AWARDED':
        return req.revealStatus === 'REVEALED'
          ? {
              label: 'View PO & Track →',
              to: '/purchase-orders',
              primary: true,
              actionRequired: false,
              actionNotice: 'Winner revealed · PO active in fulfillment',
            }
          : {
              label: 'Reveal & Issue PO →',
              to: req.rfqId ? `/rfq/${req.rfqId}/reveal` : `/requirements/${req.id}`,
              primary: true,
              actionRequired: true,
              actionNotice: 'Award finalized · Unmask winner to issue PO',
            };
      case 'IN_PROGRESS':
        return {
          label: 'Track Order →',
          to: '/purchase-orders',
          primary: true,
          actionRequired: true,
          actionNotice: 'Work order in execution · Sign-off delivery',
        };
      case 'COMPLETED':
        return {
          label: 'Settlement ✓',
          to: '/purchase-orders',
          primary: false,
          actionRequired: false,
          actionNotice: 'Order 100% completed & settled',
        };
      case 'CANCELLED':
        return {
          label: 'Exit Audit →',
          to: `/requirements/${req.id}`,
          primary: false,
          actionRequired: false,
          actionNotice: 'Tender cancelled / Protected no-fault exit',
        };
      default:
        return {
          label: 'Open →',
          to: `/requirements/${req.id}`,
          primary: false,
          actionRequired: false,
          actionNotice: '',
        };
    }
  };

  const actionRequiredList = requirements.filter((r) => getNextAction(r).actionRequired);
  const actionRequired = actionRequiredList.length;

  const draftCount = requirements.filter(
    (r) => getRequirementCoreState(r) === 'DRAFT' && r.effectiveStatus !== 'CANCELLED',
  ).length;
  const quotingCount = requirements.filter(
    (r) => getRequirementCoreState(r) === 'QUOTING' && r.effectiveStatus !== 'CANCELLED',
  ).length;
  const evaluatingCount = requirements.filter(
    (r) => getRequirementCoreState(r) === 'EVALUATING' && r.effectiveStatus !== 'CANCELLED',
  ).length;
  const awardedCount = requirements.filter(
    (r) => getRequirementCoreState(r) === 'AWARDED' && r.effectiveStatus !== 'CANCELLED',
  ).length;
  const poIssuedCount = requirements.filter(
    (r) => getRequirementCoreState(r) === 'PO_ISSUED' && r.effectiveStatus !== 'CANCELLED',
  ).length;
  const invoicedCount = requirements.filter(
    (r) => getRequirementCoreState(r) === 'INVOICED' && r.effectiveStatus !== 'CANCELLED',
  ).length;
  const settledCount = requirements.filter(
    (r) => getRequirementCoreState(r) === 'SETTLED' && r.effectiveStatus !== 'CANCELLED',
  ).length;
  const stalledCount = requirements.filter(isRequirementStalled).length;

  const activeCount = requirements.filter(
    (r) => r.effectiveStatus !== 'CANCELLED' && !r.isSettled && r.effectiveStatus !== 'COMPLETED',
  ).length;

  const baseFilteredRequirements =
    selectedPhase === 'ACTION_REQUIRED'
      ? actionRequiredList
      : selectedPhase === 'ALL'
      ? requirements
      : selectedPhase === 'STALLED'
      ? requirements.filter(isRequirementStalled)
      : selectedPhase === 'CANCELLED'
      ? requirements.filter((r) => r.effectiveStatus === 'CANCELLED' || r.status === 'CANCELLED')
      : requirements.filter(
          (r) => getRequirementCoreState(r) === selectedPhase && r.effectiveStatus !== 'CANCELLED',
        );

  const filteredRequirements = baseFilteredRequirements.filter((r) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      (r.title && r.title.toLowerCase().includes(q)) ||
      (r.requirementType && r.requirementType.toLowerCase().includes(q)) ||
      (r.id && r.id.toLowerCase().includes(q))
    );
  });

  return (
    <div className="zero-scroll-container p-2 sm:p-3 max-w-7xl mx-auto w-full space-y-2">
      {/* 1. Cockpit Header: "What do you need to buy?" */}
      <section className="rounded-xl border bg-card p-3 sm:p-4 shadow-2xs shrink-0 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-sm sm:text-base md:text-lg font-extrabold text-foreground tracking-tight flex items-center gap-2">
              <span>What do you need to buy?</span>
              {org?.orgType && (
                <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full border">
                  {org.orgType}
                </span>
              )}
            </h1>
            <p className="text-xs text-muted-foreground">
              Instant sourcing with verified suppliers. Sealed quotes stay protected until you decide.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {subscription && (
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(true)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold border transition ${
                  subscription.isExpired
                    ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300 animate-pulse'
                    : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300'
                }`}
                title="View subscription status"
              >
                <span>{subscription.isExpired ? '🔒 Expired' : `⚡ ${subscription.daysRemaining}d plan`}</span>
              </button>
            )}
            <Link
              to="/requirements/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition"
              data-testid="create-requirement-link"
            >
              <span>+</span> Create Requirement
            </Link>
          </div>
        </div>

        {/* Express 1-Box Sourcing Input */}
        <form onSubmit={(e) => void handleExpressSubmit(undefined, e)} className="flex items-center gap-2 pt-0.5">
          <input
            type="text"
            value={expressQuery}
            disabled={isSubmittingExpress}
            onChange={(e) => setExpressQuery(e.target.value)}
            placeholder={subscription?.isExpired ? "Prepaid subscription expired..." : "e.g. Swimming pool renovation in Bengaluru within 14 days under ₹3.5L..."}
            className="flex-1 rounded-lg border border-primary/30 bg-background px-3 py-1.5 text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-2xs"
          />
          <button
            type="submit"
            disabled={!expressQuery.trim() || isSubmittingExpress}
            className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition disabled:opacity-40 shrink-0 flex items-center gap-1"
          >
            <span>⚡</span>
            <span>{isSubmittingExpress ? 'Matching…' : 'Get Quotes'}</span>
          </button>
        </form>

        {expressError && (
          <p className="text-[11px] font-bold text-red-600 bg-red-50 dark:bg-red-950/40 p-1.5 rounded border border-red-200">
            ⚠️ {expressError}
          </p>
        )}
      </section>

      {/* Subscription Expiry Banner if needed */}
      {subscription?.isExpired && (
        <div className="shrink-0">
          <SubscriptionExpiryBanner
            subscription={subscription}
            onRenewClick={() => setIsPaymentModalOpen(true)}
          />
        </div>
      )}

      {/* 2. Your Procurement Glance Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-card rounded-lg border p-2 text-xs shadow-2xs shrink-0">
        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
          <span>📋</span>
          <span>Your procurement:</span>
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedPhase('ALL')}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold transition ${
              selectedPhase === 'ALL'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <span>🟢</span>
            <span>{activeCount} Active</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedPhase('ACTION_REQUIRED')}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold transition ${
              selectedPhase === 'ACTION_REQUIRED'
                ? 'bg-amber-500 text-white shadow-2xs'
                : actionRequired > 0
                ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 border border-amber-300'
                : 'bg-muted/40 text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>🟡</span>
            <span>{actionRequired} Need your decision</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedPhase('SETTLED')}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold transition ${
              selectedPhase === 'SETTLED'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <span>⚪</span>
            <span>{settledCount} Completed</span>
          </button>
        </div>
      </div>

      {/* 3. Modular 2-Column Dashboard Grid */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2.5 overflow-hidden">
        {/* Left Column (8 cols): Job Cards List */}
        <div className="lg:col-span-8 flex flex-col min-h-0 rounded-lg border bg-card shadow-2xs overflow-hidden">
          {/* Header */}
          <div className="p-2 border-b shrink-0 flex flex-wrap items-center justify-between gap-1.5 bg-muted/20">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Active Tenders &amp; Orders
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search orders…"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="rounded border bg-background px-2 py-0.5 text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-28 sm:w-36"
              />
              <span className="text-[10px] text-muted-foreground">
                {filteredRequirements.length} / {requirements.length}
              </span>
            </div>
          </div>

          {/* Requirement Cards Container with Internal Scroll */}
          <div className="flex-1 min-h-0 overflow-y-auto zero-scroll-pane space-y-2 p-2">
            {isLoading ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
                Loading procurement requirements…
              </div>
            ) : filteredRequirements.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground space-y-2">
                <p className="text-xs font-semibold">
                  {selectedPhase === 'ACTION_REQUIRED'
                    ? '✓ All Caught Up! No pending actions awaiting your decision.'
                    : selectedPhase === 'STALLED'
                    ? '✓ Excellent! Zero stalled orders.'
                    : 'No orders found in this filter state.'}
                </p>
                <Link
                  to="/requirements/new"
                  className="inline-block rounded bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition"
                >
                  + Create Requirement
                </Link>
              </div>
            ) : (
              filteredRequirements.map((req) => {
                const action = getNextAction(req);
                const coreState = getRequirementCoreState(req);
                const desc = CORE_PROCUREMENT_STATES[coreState];
                const stalled = isRequirementStalled(req);

                // Simplified Status Badges (e.g. L1 · ₹8,800 · 2d or 3Q · Open)
                const shortStatus = (() => {
                  if (stalled) return '⚠️ Stalled · 24h+';
                  if (coreState === 'SETTLED') return 'Settled · ✓';
                  if (coreState === 'PO_ISSUED') return 'PO Active';
                  if (coreState === 'AWARDED') return 'Awarded · PO Ready';
                  if (coreState === 'EVALUATING') return `Vote · ${req.quotesCount} Quotes`;
                  if (coreState === 'QUOTING') return `${req.quotesCount}Q · Quoting`;
                  return 'Draft';
                })();

                return (
                  <div
                    key={req.id}
                    className={`p-3 rounded-xl border transition space-y-2 ${
                      action.actionRequired
                        ? 'border-amber-400/80 bg-amber-50/20 dark:bg-amber-950/20 shadow-2xs ring-1 ring-amber-400/20'
                        : 'bg-card hover:border-primary/40 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] text-muted-foreground bg-muted/40 px-1 rounded">
                            REQ-{req.id.slice(0, 6)}
                          </span>
                          <span className={`rounded px-1.5 py-0.2 text-[9px] font-bold ${desc.badgeClass}`}>
                            {shortStatus}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-foreground truncate mt-1">
                          {req.title}
                        </h3>
                      </div>

                      <span className="text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1">
                        <span>🔒</span>
                        <span className="hidden sm:inline">Supplier identities protected</span>
                        <span className="sm:hidden">Protected</span>
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/40 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2 text-[11px] flex-wrap">
                        <span className="rounded bg-muted/30 px-1.5 py-0.2 font-medium text-foreground border border-border/40">
                          🏷️ {req.requirementType}
                        </span>
                        <span className="font-semibold text-foreground">
                          💬 {req.quotesCount > 0 ? `${req.quotesCount} quote(s)` : 'Awaiting quotes'}
                        </span>
                        <span>•</span>
                        <span>📅 {formatDateIST(req.createdAt)}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedRequirement(req)}
                          className="rounded-lg border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition shadow-2xs"
                        >
                          Details
                        </button>
                        {req.rfqId && (
                          <Link
                            to={`/rfq/${req.rfqId}/quotes`}
                            className="rounded-lg border bg-card px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted transition shadow-2xs hidden sm:inline"
                          >
                            Matrix
                          </Link>
                        )}
                        <Link
                          to={action.to}
                          className={`rounded-lg px-3.5 py-1 text-xs font-bold shadow-2xs transition ${
                            action.primary
                              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                              : 'border bg-card hover:bg-muted text-foreground'
                          }`}
                        >
                          {action.label}
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column (4 cols): Command Center Side Panels */}
        <div className="lg:col-span-4 flex flex-col min-h-0 space-y-2 overflow-y-auto zero-scroll-pane">
          {/* Card 1: Pipeline Metrics */}
          <div className="rounded-lg border bg-card p-2.5 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-foreground flex items-center gap-1">
                <span>📊</span> Pipeline Summary
              </h3>
              <span className="rounded bg-primary/10 text-primary text-[9px] font-bold px-1.5 py-0.2 border border-primary/20">
                {org?.organizationName || 'Live'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <div className="rounded border bg-muted/20 p-2">
                <span className="text-[10px] text-muted-foreground block">Active Tenders</span>
                <span className="text-base font-bold text-foreground">{requirements.length}</span>
              </div>
              <div className="rounded border bg-muted/20 p-2">
                <span className="text-[10px] text-muted-foreground block">Action Required</span>
                <span className={`text-base font-bold ${actionRequired > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {actionRequired}
                </span>
              </div>
              <div className="rounded border bg-muted/20 p-2">
                <span className="text-[10px] text-muted-foreground block">In Execution</span>
                <span className="text-base font-bold text-foreground">{poIssuedCount}</span>
              </div>
              <div className="rounded border bg-muted/20 p-2">
                <span className="text-[10px] text-muted-foreground block">Completed</span>
                <span className="text-base font-bold text-foreground">{settledCount}</span>
              </div>
            </div>

            {actionRequired > 0 && (
              <button
                type="button"
                onClick={() => setSelectedPhase('ACTION_REQUIRED')}
                className="w-full rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-950 dark:text-amber-200 border border-amber-300 dark:border-amber-700 text-[11px] font-bold py-1.5 px-2 transition text-center shadow-2xs flex items-center justify-center gap-1"
              >
                <span>⚡</span> Review {actionRequired} Pending Action{actionRequired > 1 ? 's' : ''} →
              </button>
            )}
          </div>

          {/* Card 2: Recent Activity Feed */}
          <div className="rounded-lg border bg-card p-2.5 shadow-2xs space-y-2 flex-1 flex flex-col min-h-[160px]">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-foreground flex items-center gap-1">
                <span>⚡</span> Recent Activity
              </h3>
              <span className="text-[10px] text-muted-foreground">Live Feed</span>
            </div>

            <div className="space-y-1.5 overflow-y-auto zero-scroll-pane flex-1 text-xs divide-y divide-border/40">
              {requirements.slice(0, 5).map((r) => {
                const core = getRequirementCoreState(r);
                const action = getNextAction(r);
                return (
                  <div key={r.id} className="pt-1.5 first:pt-0 flex items-start justify-between gap-1.5">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate text-[11px]">{r.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {r.quotesCount > 0 ? `${r.quotesCount} quote(s) received` : 'Requirement registered'} · {formatDateIST(r.createdAt)}
                      </p>
                    </div>
                    <Link
                      to={action.to}
                      className="shrink-0 rounded bg-muted/60 hover:bg-muted text-[10px] font-bold px-1.5 py-0.5 text-foreground border transition"
                    >
                      {core === 'EVALUATING' ? 'Vote' : core === 'QUOTING' ? 'Quotes' : 'View'}
                    </Link>
                  </div>
                );
              })}
              {requirements.length === 0 && (
                <p className="text-center text-muted-foreground text-[11px] py-4">
                  No recent activity yet. Post your first requirement to begin.
                </p>
              )}
            </div>
          </div>

          {/* Card 3: Quick Management Links */}
          <div className="rounded-lg border bg-card p-2.5 shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-foreground">
              <span>⚙️ Workspace Tools</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Link
                to="/org/members"
                className="flex-1 rounded border bg-muted/20 hover:bg-muted p-1.5 text-center font-semibold text-foreground text-[10px] transition"
              >
                👥 Team ({org?.orgType || 'Members'})
              </Link>
              <Link
                to="/reports"
                className="flex-1 rounded border bg-muted/20 hover:bg-muted p-1.5 text-center font-semibold text-foreground text-[10px] transition"
              >
                📊 Sourcing Reports
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Progressive Detail Slide-over Side Drawer */}
      {selectedRequirement && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-card h-full shadow-2xl border-l flex flex-col p-4 overflow-y-auto animate-in slide-in-from-right space-y-3">
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-2 border-b">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-base">📋</span>
                <div className="min-w-0">
                  <span className="text-[10px] font-mono text-muted-foreground block">
                    REQ-{selectedRequirement.id.slice(0, 8)}
                  </span>
                  <h2 className="text-xs font-bold text-foreground truncate">
                    {selectedRequirement.title}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRequirement(null)}
                className="rounded border p-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition"
              >
                ✕ Close
              </button>
            </div>

            {/* Status & Core State */}
            <div className="rounded-lg border bg-muted/20 p-2.5 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Lifecycle State:</span>
                <span className="font-bold text-primary">
                  {CORE_PROCUREMENT_STATES[getRequirementCoreState(selectedRequirement)].title}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Category:</span>
                <span className="font-semibold text-foreground">{selectedRequirement.requirementType}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Created Date:</span>
                <span className="text-foreground">{formatDateIST(selectedRequirement.createdAt)}</span>
              </div>
            </div>

            {/* Specs & Description */}
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-foreground">Requirement Summary</h3>
              <p className="text-xs text-muted-foreground bg-card border rounded p-2.5 leading-relaxed">
                {selectedRequirement.title} — Verified requirement for {selectedRequirement.requirementType}.
              </p>
            </div>

            {/* Quoting & Evaluation Matrix Snippet */}
            <div className="rounded-lg border bg-card p-2.5 space-y-1.5 text-xs">
              <h3 className="text-xs font-bold text-foreground">Sourcing Status</h3>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded border bg-muted/20 p-1.5">
                  <span className="text-muted-foreground block">Quotes Received</span>
                  <span className="font-bold text-foreground text-xs">{selectedRequirement.quotesCount} quote(s)</span>
                </div>
                <div className="rounded border bg-muted/20 p-1.5">
                  <span className="text-muted-foreground block">Min Required</span>
                  <span className="font-bold text-foreground text-xs">{selectedRequirement.minQuotesRequired} required</span>
                </div>
              </div>
            </div>

            {/* Fast Action Shortcuts */}
            <div className="space-y-1.5 pt-2 border-t mt-auto">
              <h3 className="text-xs font-bold text-foreground">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Link
                  to={`/requirements/${selectedRequirement.id}`}
                  onClick={() => setSelectedRequirement(null)}
                  className="rounded border bg-card p-2 text-center font-semibold hover:bg-muted transition"
                >
                  📄 Full Specs
                </Link>
                {selectedRequirement.rfqId ? (
                  <Link
                    to={`/rfq/${selectedRequirement.rfqId}/quotes`}
                    onClick={() => setSelectedRequirement(null)}
                    className="rounded bg-primary text-primary-foreground p-2 text-center font-bold shadow-2xs hover:bg-primary/90 transition"
                  >
                    📊 Quote Matrix →
                  </Link>
                ) : (
                  <Link
                    to={`/requirements/${selectedRequirement.id}/discover`}
                    onClick={() => setSelectedRequirement(null)}
                    className="rounded bg-primary text-primary-foreground p-2 text-center font-bold shadow-2xs hover:bg-primary/90 transition"
                  >
                    🚀 Sourcing →
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Payment Modal */}
      {org && (
        <SubscriptionPaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          organizationId={org.organizationId}
          organizationName={org.organizationName}
          orgType={org.orgType}
          initialTierId={subscription?.tierId}
          initialCycle={subscription?.plan || 'MONTHLY'}
          onSuccess={() => {
            void loadData();
          }}
        />
      )}
    </div>
  );
}
