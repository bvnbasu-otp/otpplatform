import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import { BottomSheet } from '@/components/ui/BottomSheet';

type MacroPhaseFilter = 'ALL' | 'ACTION_REQUIRED' | CoreProcurementState | 'STALLED' | 'CANCELLED';

const POPULAR_QUICK_TILES = [
  { icon: '⚡', label: 'Motor Rewind', query: 'Motor rewinding & coil overhaul 15HP in Bengaluru within 7 days under ₹25k' },
  { icon: '🏊', label: 'Pool Overhaul', query: 'Swimming pool renovation & pump repair for apartment community in Bengaluru within 14 days under ₹3.5L' },
  { icon: '⚙️', label: 'CNC Machining', query: 'CNC shaft precision machining SS316 batch of 500 pcs in Coimbatore within 10 days' },
  { icon: '🏗️', label: 'Waterproofing', query: 'Terrace waterproofing & chemical treatment 10,000 sq ft within 15 days' },
  { icon: '📦', label: 'Packaging', query: 'Corrugated 5-ply shipping boxes 2000 units within 7 days' },
];

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

  const poIssuedCount = requirements.filter(
    (r) => getRequirementCoreState(r) === 'PO_ISSUED' && r.effectiveStatus !== 'CANCELLED',
  ).length;
  const settledCount = requirements.filter(
    (r) => getRequirementCoreState(r) === 'SETTLED' && r.effectiveStatus !== 'CANCELLED',
  ).length;
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
    <div className="w-full max-w-lg md:max-w-6xl mx-auto p-3 sm:p-4 space-y-3 sm:space-y-4 pb-8">
      {/* 1. Consumer Header: Org Status & Subscription */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-base">🏢</span>
          <div className="min-w-0">
            <span className="text-xs font-extrabold text-foreground truncate block">
              {org?.organizationName || 'My Organization'}
            </span>
            <span className="text-[10px] text-muted-foreground font-medium">
              {org?.orgType || 'Commercial'} · Bengaluru Sourcing Hub
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {subscription && (
            <button
              type="button"
              onClick={() => setIsPaymentModalOpen(true)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold border transition ${
                subscription.isExpired
                  ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300 animate-pulse'
                  : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300'
              }`}
            >
              <span>{subscription.isExpired ? '🔒 Plan Expired' : `⚡ ${subscription.daysRemaining}d Active`}</span>
            </button>
          )}
        </div>
      </div>

      {/* Subscription Expiry Alert */}
      {subscription?.isExpired && (
        <SubscriptionExpiryBanner
          subscription={subscription}
          onRenewClick={() => setIsPaymentModalOpen(true)}
        />
      )}

      {/* 2. Swiggy / PhonePe-Style Sourcing Hero Card */}
      <div className="rounded-2xl border bg-gradient-to-br from-card via-card to-primary/5 p-3.5 sm:p-4 shadow-sm space-y-3">
        <div className="space-y-0.5">
          <h1 className="text-base sm:text-lg font-black tracking-tight text-foreground flex items-center gap-1.5">
            <span>What do you need to buy?</span>
          </h1>
          <p className="text-xs text-muted-foreground">
            Get sealed, competitive quotes from verified suppliers in minutes.
          </p>
        </div>

        {/* 1-Box Search & Express Input */}
        <form onSubmit={(e) => void handleExpressSubmit(undefined, e)} className="relative flex items-center">
          <input
            type="text"
            value={expressQuery}
            disabled={isSubmittingExpress}
            onChange={(e) => setExpressQuery(e.target.value)}
            placeholder="e.g. Swimming pool renovation within 14 days under ₹3.5L…"
            className="w-full rounded-xl border-2 border-primary/30 bg-background pl-3.5 pr-24 py-2.5 text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition shadow-inner"
          />
          <button
            type="submit"
            disabled={!expressQuery.trim() || isSubmittingExpress}
            className="absolute right-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-extrabold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95 transition disabled:opacity-40 flex items-center gap-1"
          >
            <span>⚡</span>
            <span>{isSubmittingExpress ? 'Matching…' : 'Get Quotes'}</span>
          </button>
        </form>

        {expressError && (
          <p className="text-[11px] font-bold text-red-600 bg-red-50 dark:bg-red-950/40 p-2 rounded-lg border border-red-200">
            ⚠️ {expressError}
          </p>
        )}

        {/* Quick Sourcing 1-Tap Tiles (Swiggy / Zomato category pills rail) */}
        <div className="space-y-1.5 pt-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
            Popular 1-Tap Templates:
          </span>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {POPULAR_QUICK_TILES.map((tile) => (
              <button
                key={tile.label}
                type="button"
                onClick={() => {
                  setExpressQuery(tile.query);
                  void handleExpressSubmit(tile.query);
                }}
                disabled={isSubmittingExpress}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border bg-muted/30 hover:bg-muted text-[11px] font-semibold text-foreground whitespace-nowrap active:scale-95 transition shrink-0 shadow-2xs hover:border-primary/40"
              >
                <span>{tile.icon}</span>
                <span>{tile.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Filter & Glance Bar (Swiggy Order Status Style) */}
      <div className="flex items-center justify-between gap-1.5 bg-card rounded-xl border p-1.5 shadow-2xs overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setSelectedPhase('ALL')}
          className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-extrabold whitespace-nowrap transition ${
            selectedPhase === 'ALL'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
          }`}
        >
          <span>🟢</span>
          <span>{activeCount} Active</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedPhase('ACTION_REQUIRED')}
          className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-extrabold whitespace-nowrap transition ${
            selectedPhase === 'ACTION_REQUIRED'
              ? 'bg-amber-500 text-white shadow-sm'
              : actionRequired > 0
              ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 border border-amber-300'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
          }`}
        >
          <span>🟡</span>
          <span>{actionRequired} Needs Action</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedPhase('SETTLED')}
          className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-extrabold whitespace-nowrap transition ${
            selectedPhase === 'SETTLED'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
          }`}
        >
          <span>⚪</span>
          <span>{settledCount} Done</span>
        </button>
      </div>

      {/* 4. Active Procurement Cards Feed (Mobile-First Card Stack) */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            {selectedPhase === 'ACTION_REQUIRED'
              ? 'Pending Your Action'
              : selectedPhase === 'SETTLED'
              ? 'Completed Orders'
              : 'Your Procurement Tenders'}
          </h2>
          <input
            type="text"
            placeholder="Search…"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="rounded-lg border bg-background px-2.5 py-1 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 w-28 sm:w-36"
          />
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-xs text-muted-foreground bg-card rounded-2xl border">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
            Loading your tenders…
          </div>
        ) : filteredRequirements.length === 0 ? (
          <div className="py-10 text-center bg-card rounded-2xl border p-4 space-y-3">
            <span className="text-3xl block">📦</span>
            <p className="text-xs font-semibold text-foreground">
              {selectedPhase === 'ACTION_REQUIRED'
                ? 'All Caught Up! No pending actions awaiting your decision.'
                : 'No tenders found in this category.'}
            </p>
            <Link
              to="/requirements/new"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground shadow-sm hover:bg-primary/90 transition"
            >
              <span>+</span> Start Sourcing Now
            </Link>
          </div>
        ) : (
          filteredRequirements.map((req) => {
            const action = getNextAction(req);
            const coreState = getRequirementCoreState(req);
            const desc = CORE_PROCUREMENT_STATES[coreState];
            const stalled = isRequirementStalled(req);

            const shortStatus = (() => {
              if (stalled) return '⚠️ Stalled · 24h+';
              if (coreState === 'SETTLED') return 'Settled · ✓';
              if (coreState === 'PO_ISSUED') return '🚚 PO In Execution';
              if (coreState === 'AWARDED') return '🏆 Winner Decided · Issue PO';
              if (coreState === 'EVALUATING') return `🗳️ Voting · ${req.quotesCount} Quotes`;
              if (coreState === 'QUOTING') return `⚡ ${req.quotesCount} Quotes Received`;
              return '📝 Draft Requirement';
            })();

            return (
              <div
                key={req.id}
                className={`rounded-2xl border p-3.5 sm:p-4 space-y-3 transition ${
                  action.actionRequired
                    ? 'border-amber-400/90 bg-amber-50/30 dark:bg-amber-950/20 shadow-sm ring-1 ring-amber-400/30'
                    : 'bg-card shadow-2xs hover:border-primary/40'
                }`}
              >
                {/* Card Header: Ref & Status Pill */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-md font-bold">
                        REQ-{req.id.slice(0, 6)}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${desc.badgeClass}`}>
                        {shortStatus}
                      </span>
                    </div>
                    <h3 className="text-sm sm:text-base font-extrabold text-foreground truncate mt-1">
                      {req.title}
                    </h3>
                  </div>

                  <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1">
                    <span>🔒</span>
                    <span>Shielded</span>
                  </span>
                </div>

                {/* Key Metrics Row */}
                <div className="grid grid-cols-3 gap-1.5 py-1.5 px-2.5 rounded-xl bg-muted/20 border text-center">
                  <div>
                    <span className="text-[9px] text-muted-foreground block font-medium">Category</span>
                    <span className="text-[11px] font-bold text-foreground truncate block">
                      {req.requirementType}
                    </span>
                  </div>
                  <div className="border-x border-border/60">
                    <span className="text-[9px] text-muted-foreground block font-medium">Quotes</span>
                    <span className="text-[11px] font-extrabold text-primary block">
                      {req.quotesCount > 0 ? `${req.quotesCount} Received` : 'Awaiting'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-muted-foreground block font-medium">Date</span>
                    <span className="text-[11px] font-medium text-foreground block">
                      {formatDateIST(req.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Single Primary Action Button in Lower Thumb Zone (48px Touch Target) */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setSelectedRequirement(req)}
                    className="rounded-xl border bg-card px-3 py-2.5 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95 transition shadow-2xs shrink-0"
                  >
                    ℹ️ Details
                  </button>

                  <Link
                    to={action.to}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-black shadow-sm active:scale-98 transition ${
                      action.primary
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20'
                        : 'border bg-card hover:bg-muted text-foreground'
                    }`}
                  >
                    <span>{action.label}</span>
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 5. Mobile Slide-Up Bottom Sheet for Requirement Details */}
      {selectedRequirement && (
        <BottomSheet
          isOpen={Boolean(selectedRequirement)}
          onClose={() => setSelectedRequirement(null)}
          title={`REQ-${selectedRequirement.id.slice(0, 8)}`}
          subtitle={selectedRequirement.title}
          footer={
            <div className="flex items-center gap-2">
              <Link
                to={`/requirements/${selectedRequirement.id}`}
                onClick={() => setSelectedRequirement(null)}
                className="flex-1 rounded-xl border bg-card py-2.5 text-xs font-bold text-center text-foreground hover:bg-muted transition"
              >
                Full Scope Sheet
              </Link>
              {selectedRequirement.rfqId && (
                <Link
                  to={`/rfq/${selectedRequirement.rfqId}/quotes`}
                  onClick={() => setSelectedRequirement(null)}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-extrabold text-center text-primary-foreground shadow-sm hover:bg-primary/90 transition"
                >
                  Compare Quotes →
                </Link>
              )}
            </div>
          }
        >
          <div className="space-y-3 text-xs">
            {/* Status Card */}
            <div className="rounded-xl border bg-muted/20 p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Current Stage:</span>
                <span className="font-extrabold text-primary">
                  {CORE_PROCUREMENT_STATES[getRequirementCoreState(selectedRequirement)].title}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Category:</span>
                <span className="font-bold text-foreground">{selectedRequirement.requirementType}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Quotes Received:</span>
                <span className="font-extrabold text-foreground">{selectedRequirement.quotesCount} quote(s)</span>
              </div>
            </div>

            {/* Privacy Shield Info */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-start gap-2">
              <span className="text-base">🔒</span>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Identity-Protected Sourcing:</strong> All supplier identities remain cryptographically sealed until you finalize and award the winning offer.
              </p>
            </div>
          </div>
        </BottomSheet>
      )}

      {/* Payment / Subscription Modal */}
      {isPaymentModalOpen && org && (
        <SubscriptionPaymentModal
          organizationId={org.organizationId}
          organizationName={org.organizationName || 'My Organization'}
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            void loadData();
          }}
        />
      )}
    </div>
  );
}
