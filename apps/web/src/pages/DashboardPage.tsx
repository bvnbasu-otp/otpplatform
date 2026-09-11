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

  const filteredRequirements =
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

  return (
    <div className="zero-scroll-container p-2 sm:p-3 max-w-7xl mx-auto w-full">
      {/* 1. Header - Single Row High Density Bar */}
      <header className="rounded-lg border bg-card px-2.5 sm:px-3 py-1.5 shadow-2xs shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <h1 className="text-xs font-bold text-foreground truncate">
            {org ? org.organizationName : 'Buyer Procurement Workspace'}
          </h1>
          {org?.orgType && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.2 text-[10px] font-semibold text-muted-foreground border shrink-0">
              {org.orgType}
            </span>
          )}
          {subscription && (
            <button
              type="button"
              onClick={() => setIsPaymentModalOpen(true)}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.2 text-[10px] font-bold border transition shrink-0 ${
                subscription.isExpired
                  ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800 animate-pulse'
                  : subscription.daysRemaining <= 3
                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                  : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
              }`}
              title="Click to view subscription / renew"
            >
              <span>{subscription.isExpired ? '🔒 Expired' : `⚡ ${subscription.daysRemaining}d left`}</span>
              <span className="hidden sm:inline underline font-semibold">Renew</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {subscription?.isExpired ? (
            <button
              type="button"
              onClick={() => setIsPaymentModalOpen(true)}
              className="inline-flex items-center gap-1 rounded bg-rose-600 px-2.5 py-1 text-xs font-bold text-white shadow-2xs hover:bg-rose-700 transition"
            >
              <span>⚡</span> Renew Plan
            </button>
          ) : (
            <Link
              to="/requirements/new"
              className="inline-flex items-center gap-1 rounded bg-primary px-2.5 sm:px-3 py-1 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition"
              data-testid="create-requirement-link"
            >
              <span>+</span> New Requirement
            </Link>
          )}
        </div>
      </header>

      {/* Subscription Expiry Banner if needed */}
      {subscription?.isExpired && (
        <div className="mt-1.5 shrink-0">
          <SubscriptionExpiryBanner
            subscription={subscription}
            onRenewClick={() => setIsPaymentModalOpen(true)}
          />
        </div>
      )}

      {/* 2. Hero Action Focus: "What do you need?" 1-Box Express Sourcing */}
      <section className="mt-2 rounded-lg border border-primary/30 bg-gradient-to-r from-primary/5 via-card to-primary/5 p-2 shadow-2xs shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">⚡</span>
            <h2 className="text-xs font-bold text-foreground">
              What do you need?
            </h2>
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              Instant plain-English sourcing with auto-matched quotes
            </span>
          </div>
          <span className="rounded bg-primary/10 text-primary font-bold text-[9px] px-1.5 py-0.2 border border-primary/20">
            FAST-TRACK AI
          </span>
        </div>

        <form onSubmit={(e) => void handleExpressSubmit(undefined, e)} className="flex items-center gap-2">
          <input
            type="text"
            value={expressQuery}
            disabled={isSubmittingExpress}
            onChange={(e) => setExpressQuery(e.target.value)}
            placeholder={subscription?.isExpired ? "Prepaid subscription expired..." : "e.g., Need 200 ergonomic chairs in Pune delivered in 3 days under ₹2.5L..."}
            className="flex-1 rounded border border-primary/40 bg-background px-2.5 py-1 text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
          />
          <button
            type="submit"
            disabled={!expressQuery.trim() || isSubmittingExpress}
            className="rounded bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition disabled:opacity-40 shrink-0"
          >
            {isSubmittingExpress ? 'Matching…' : '⚡ Get Quotes →'}
          </button>
        </form>

        {expressError && (
          <p className="mt-1 text-[11px] font-bold text-red-600 bg-red-50 dark:bg-red-950/40 p-1 rounded border border-red-200">
            ⚠️ {expressError}
          </p>
        )}
      </section>

      {/* 3. Modular 2/3-Column Dashboard Grid */}
      <div className="mt-2 flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2.5 overflow-hidden">
        {/* Left Column (8 cols): Procurement Pipeline & Requirements Table */}
        <div className="lg:col-span-8 flex flex-col min-h-0 rounded-lg border bg-card shadow-2xs overflow-hidden">
          {/* Filter Bar Header */}
          <div className="p-2 border-b shrink-0 flex flex-wrap items-center justify-between gap-1.5 bg-muted/20">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Pipeline
              </span>
              <span className="text-[10px] text-muted-foreground">
                ({requirements.length} Active)
              </span>
            </div>

            {/* 8 Core Procurement State Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1 text-[10px]">
              <button
                type="button"
                onClick={() => setSelectedPhase('ALL')}
                className={`rounded px-1.5 py-0.5 font-semibold transition ${
                  selectedPhase === 'ALL'
                    ? 'bg-card text-foreground shadow-2xs font-bold border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All ({requirements.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedPhase('ACTION_REQUIRED')}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-bold transition ${
                  selectedPhase === 'ACTION_REQUIRED'
                    ? 'bg-amber-500 text-white shadow-2xs'
                    : 'text-amber-900 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200 border border-amber-200'
                }`}
              >
                <span>⚡ Action</span>
                <span className="rounded-full bg-amber-700 text-white px-1 text-[8px] font-mono">
                  {actionRequired}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedPhase('QUOTING')}
                className={`rounded px-1.5 py-0.5 font-semibold transition ${
                  selectedPhase === 'QUOTING'
                    ? 'bg-card text-purple-700 dark:text-purple-300 shadow-2xs font-bold border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Quoting ({quotingCount})
              </button>
              <button
                type="button"
                onClick={() => setSelectedPhase('EVALUATING')}
                className={`rounded px-1.5 py-0.5 font-semibold transition ${
                  selectedPhase === 'EVALUATING'
                    ? 'bg-card text-amber-700 dark:text-amber-300 shadow-2xs font-bold border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Vote ({evaluatingCount})
              </button>
              <button
                type="button"
                onClick={() => setSelectedPhase('AWARDED')}
                className={`rounded px-1.5 py-0.5 font-semibold transition ${
                  selectedPhase === 'AWARDED'
                    ? 'bg-card text-teal-700 dark:text-teal-300 shadow-2xs font-bold border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Awarded ({awardedCount})
              </button>
              <button
                type="button"
                onClick={() => setSelectedPhase('PO_ISSUED')}
                className={`rounded px-1.5 py-0.5 font-semibold transition ${
                  selectedPhase === 'PO_ISSUED'
                    ? 'bg-card text-blue-700 dark:text-blue-300 shadow-2xs font-bold border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                PO ({poIssuedCount})
              </button>
              <button
                type="button"
                onClick={() => setSelectedPhase('SETTLED')}
                className={`rounded px-1.5 py-0.5 font-semibold transition ${
                  selectedPhase === 'SETTLED'
                    ? 'bg-card text-emerald-700 dark:text-emerald-300 shadow-2xs font-bold border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Settled ({settledCount})
              </button>
              {stalledCount > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedPhase('STALLED')}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-bold transition ${
                    selectedPhase === 'STALLED'
                      ? 'bg-red-600 text-white shadow-2xs'
                      : 'text-red-900 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 border border-red-200'
                  }`}
                >
                  <span>⚠️ Stalled ({stalledCount})</span>
                </button>
              )}
            </div>
          </div>

          {/* Requirements Compact Table Container with Internal Scroll */}
          <div className="flex-1 min-h-0 overflow-y-auto zero-scroll-pane divide-y divide-border/60 p-1">
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
                    className={`flex flex-wrap items-center justify-between gap-2 py-1.5 px-2 rounded transition text-xs ${
                      action.actionRequired
                        ? 'bg-amber-50/30 dark:bg-amber-950/20 border-l-2 border-l-amber-500 my-0.5'
                        : stalled
                        ? 'bg-red-50/20 dark:bg-red-950/20 border-l-2 border-l-red-500 my-0.5'
                        : 'hover:bg-muted/30'
                    }`}
                  >
                    {/* Left: Ref, Simplified Tag & Title */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-[10px] text-muted-foreground shrink-0">
                          REQ-{req.id.slice(0, 6)}
                        </span>
                        <span className={`rounded px-1.5 py-0.2 text-[9px] font-bold shadow-2xs shrink-0 ${desc.badgeClass}`}>
                          {shortStatus}
                        </span>
                        <h3 className="text-xs font-bold text-foreground truncate min-w-0">
                          {req.title}
                        </h3>
                      </div>

                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground truncate">
                        <span>Type: {req.requirementType}</span>
                        <span>•</span>
                        <span>Quotes: <strong className="text-foreground">{req.quotesCount}</strong>/{req.minQuotesRequired}</span>
                        <span>•</span>
                        <span>Date: {formatDateIST(req.createdAt)}</span>
                      </div>
                    </div>

                    {/* Right: Quick Action Buttons & Slide-Over Drawer Trigger */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* ℹ️ Details Button (Opens Slide-over Drawer) */}
                      <button
                        type="button"
                        onClick={() => setSelectedRequirement(req)}
                        className="rounded border bg-card px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition shadow-2xs"
                        title="View full requirement details & scoring drawer"
                      >
                        ℹ️ Details
                      </button>

                      {req.rfqId && (
                        <Link
                          to={`/rfq/${req.rfqId}/quotes`}
                          className="rounded border bg-card px-2 py-0.5 text-[10px] font-semibold text-foreground hover:bg-muted transition shadow-2xs hidden sm:inline"
                          title="View quote matrix"
                        >
                          Matrix
                        </Link>
                      )}

                      <Link
                        to={action.to}
                        className={`rounded px-2.5 py-0.5 text-[10px] font-bold shadow-2xs transition ${
                          action.primary
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                            : 'border bg-card hover:bg-muted text-foreground'
                        }`}
                      >
                        {action.label}
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column (4 cols): Modular Buyer Summary Panels */}
        <div className="lg:col-span-4 flex flex-col min-h-0 space-y-2 overflow-y-auto zero-scroll-pane">
          {/* Card 1: Action Center & Health */}
          <div className="rounded-lg border bg-card p-2.5 shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-foreground flex items-center gap-1">
                <span>🎯</span> Sourcing Health
              </h3>
              <span className="rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[9px] font-bold px-1.5 py-0.2">
                ACTIVE
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <div className="rounded border bg-muted/20 p-1.5">
                <span className="text-[10px] text-muted-foreground block">Active Tenders</span>
                <span className="text-sm font-bold text-foreground">{requirements.length}</span>
              </div>
              <div className="rounded border bg-muted/20 p-1.5">
                <span className="text-[10px] text-muted-foreground block">Action Required</span>
                <span className={`text-sm font-bold ${actionRequired > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {actionRequired}
                </span>
              </div>
            </div>

            {actionRequired > 0 && (
              <button
                type="button"
                onClick={() => setSelectedPhase('ACTION_REQUIRED')}
                className="w-full rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-300 text-[10px] font-bold py-1 px-2 transition text-center"
              >
                ⚡ Review {actionRequired} Pending Action(s) →
              </button>
            )}
          </div>

          {/* Card 2: Governance & Voting Rules */}
          <div className="rounded-lg border bg-card p-2.5 shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-foreground flex items-center gap-1">
                <span>🏛️</span> Governance Profile
              </h3>
              <Link to="/org/members" className="text-[10px] text-primary hover:underline font-bold">
                Members →
              </Link>
            </div>

            <p className="text-[11px] text-muted-foreground leading-tight">
              {getGovernanceLabel(org?.orgType)}
            </p>

            <div className="rounded border bg-muted/20 p-1.5 text-[10px] text-muted-foreground space-y-0.5">
              <p>• Identity-Protected Quote Masking: <strong>Strictly Enforced</strong></p>
              <p>• Quorum Decision Model: <strong>Merit-Based Multi-Criteria</strong></p>
            </div>
          </div>

          {/* Card 3: Direct Settlement & Zero Fees */}
          <div className="rounded-lg border bg-muted/15 p-2.5 shadow-2xs space-y-1 text-xs">
            <div className="flex items-center gap-1 text-xs font-bold text-foreground">
              <span>🛡️</span> Zero-Fee Direct Settlement
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              {PRODUCT_NAME} never touches trade funds. All payments &amp; GST invoices settle directly between buyer and vendor with immutable audit trail.
            </p>
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
