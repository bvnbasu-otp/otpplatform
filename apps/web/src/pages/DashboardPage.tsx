import { useEffect, useState, useMemo } from 'react';
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
import { MobileGlanceBar } from '@/components/ui/MobileGlanceBar';
import { useRoleContext } from '@/features/roles';
import { useAuth } from '@/features/auth';

import { RoleModeToggle } from '@/components/ui/RoleModeToggle';

type GlanceFilter = 'ALL' | 'ACTIVE' | 'ACTION_REQUIRED' | 'COMPLETED';

const POPULAR_QUICK_TILES = [
  { icon: '⚡', label: 'Motor Rewind', query: 'Motor rewinding & coil overhaul 15HP in Bengaluru within 7 days under ₹25k' },
  { icon: '🏊', label: 'Pool Overhaul', query: 'Swimming pool renovation & pump repair for apartment community in Bengaluru within 14 days under ₹3.5L' },
  { icon: '⚙️', label: 'CNC Machining', query: 'CNC shaft precision machining SS316 batch of 500 pcs in Coimbatore within 10 days' },
  { icon: '🏗️', label: 'Waterproofing', query: 'Terrace waterproofing & chemical treatment 10,000 sq ft within 15 days' },
  { icon: '📦', label: 'Packaging', query: 'Corrugated 5-ply shipping boxes 2000 units within 7 days' },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const { context } = useRoleContext();
  const { user } = useAuth();

  const [org, setOrg] = useState<UserOrganization | null>(null);
  const [subscription, setSubscription] = useState<OrganizationSubscription | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [requirements, setRequirements] = useState<OrganizationRequirementSummary[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<GlanceFilter>('ALL');
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedRequirement, setSelectedRequirement] = useState<OrganizationRequirementSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expressQuery, setExpressQuery] = useState('');
  const [isSubmittingExpress, setIsSubmittingExpress] = useState(false);
  const [expressError, setExpressError] = useState<string | null>(null);
  const [isExpressModalOpen, setIsExpressModalOpen] = useState(false);

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

    setIsExpressModalOpen(false);
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
        priorityTag: null,
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
          priorityTag: 'Draft Ready',
        };
      case 'SUBMITTED':
      case 'RFQ_CREATED':
        return {
          label: 'Invite Suppliers →',
          to: `/requirements/${req.id}/discover`,
          primary: true,
          actionRequired: true,
          actionNotice: 'Needs supplier discovery & invitations',
          priorityTag: 'Suppliers Needed',
        };
      case 'QUOTING':
        if (req.quotesCount >= (req.minQuotesRequired || 3)) {
          return {
            label: req.rfqId ? '⚡ Compare Quotes →' : 'View RFQ →',
            to: req.rfqId ? `/rfq/${req.rfqId}/quotes` : `/requirements/${req.id}`,
            primary: true,
            actionRequired: true,
            actionNotice: `${req.quotesCount} quotes received · Quorum reached for review`,
            priorityTag: 'Quotes Ready',
          };
        }
        return {
          label: req.rfqId ? '🗳️ Voting Room →' : 'View RFQ →',
          to: req.rfqId ? `/rfq/${req.rfqId}/committee` : `/requirements/${req.id}`,
          primary: true,
          actionRequired: req.quotesCount > 0,
          actionNotice: req.quotesCount > 0
            ? `${req.quotesCount} quote(s) received · Sourcing open`
            : 'Awaiting supplier quotes',
          priorityTag: req.quotesCount > 0 ? 'Quotes Arrived' : null,
        };
      case 'EVALUATION':
        return {
          label: '🗳️ Cast Vote →',
          to: req.rfqId ? `/rfq/${req.rfqId}/committee` : `/requirements/${req.id}`,
          primary: true,
          actionRequired: true,
          actionNotice: 'Active voting room · Quorum vote pending',
          priorityTag: 'Vote Required',
        };
      case 'AWARDED':
        return req.revealStatus === 'REVEALED'
          ? {
              label: 'View PO & Track →',
              to: '/purchase-orders',
              primary: true,
              actionRequired: false,
              actionNotice: 'Winner revealed · PO active in fulfillment',
              priorityTag: 'PO Active',
            }
          : {
              label: 'Reveal & Issue PO →',
              to: req.rfqId ? `/rfq/${req.rfqId}/reveal` : `/requirements/${req.id}`,
              primary: true,
              actionRequired: true,
              actionNotice: 'Award finalized · Unmask winner to issue PO',
              priorityTag: 'Action Needed',
            };
      case 'IN_PROGRESS':
        return {
          label: 'Track Order →',
          to: '/purchase-orders',
          primary: true,
          actionRequired: (req.workOrderProgressPercent ?? 0) >= 100,
          actionNotice: (req.workOrderProgressPercent ?? 0) >= 100
            ? 'Delivery finished · Sign-off & settlement pending'
            : `Work order in execution (${req.workOrderProgressPercent ?? 0}% completed)`,
          priorityTag: (req.workOrderProgressPercent ?? 0) >= 100 ? 'Sign-Off Due' : null,
        };
      case 'COMPLETED':
        return {
          label: 'Settlement ✓',
          to: '/purchase-orders',
          primary: false,
          actionRequired: false,
          actionNotice: 'Order 100% completed & settled',
          priorityTag: null,
        };
      case 'CANCELLED':
        return {
          label: 'Exit Audit →',
          to: `/requirements/${req.id}`,
          primary: false,
          actionRequired: false,
          actionNotice: 'Tender cancelled / Protected no-fault exit',
          priorityTag: null,
        };
      default:
        return {
          label: 'Open →',
          to: `/requirements/${req.id}`,
          primary: false,
          actionRequired: false,
          actionNotice: '',
          priorityTag: null,
        };
    }
  };

  const getStatusChip = (req: OrganizationRequirementSummary, coreState: CoreProcurementState, stalled: boolean) => {
    if (stalled) {
      return {
        label: 'Stalled · 24h+',
        icon: '⚠️',
        className: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
      };
    }
    if (req.isSettled || req.effectiveStatus === 'COMPLETED') {
      return {
        label: 'Settled ✓',
        icon: '🟢',
        className: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      };
    }
    if (coreState === 'PO_ISSUED' || req.poStatus === 'ISSUED' || req.poStatus === 'ACCEPTED' || req.poStatus === 'IN_PROGRESS') {
      const pct = req.workOrderProgressPercent ?? 0;
      return {
        label: pct >= 100 ? 'Delivery Ready · Sign-off' : `PO In Execution · ${pct}%`,
        icon: '🚚',
        className: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
      };
    }
    if (coreState === 'AWARDED' || req.rfqStatus === 'AWARDED') {
      return req.revealStatus === 'REVEALED'
        ? {
            label: 'Winner Revealed · PO Active',
            icon: '🏆',
            className: 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
          }
        : {
            label: 'Award Finalized · Issue PO',
            icon: '🏆',
            className: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
          };
    }
    if (coreState === 'EVALUATING' || req.rfqStatus === 'EVALUATING' || req.rfqStatus === 'CLOSED') {
      return {
        label: `Voting · ${req.quotesCount} Quotes`,
        icon: '🗳️',
        className: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800',
      };
    }
    if (coreState === 'QUOTING' || req.rfqStatus === 'OPEN' || req.status === 'QUOTING') {
      return {
        label: req.quotesCount > 0 ? `${req.quotesCount} Quotes Received` : 'Awaiting Quotes',
        icon: req.quotesCount > 0 ? '🟢' : '⏳',
        className: req.quotesCount > 0
          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
          : 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      };
    }
    if (req.status === 'SUBMITTED' || req.status === 'RFQ_CREATED') {
      return {
        label: 'Invite Suppliers',
        icon: '📢',
        className: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
      };
    }
    return {
      label: 'Draft Requirement',
      icon: '📝',
      className: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    };
  };

  const actionRequiredList = useMemo(
    () => requirements.filter((r) => getNextAction(r).actionRequired),
    [requirements],
  );

  const activeSourcingList = useMemo(
    () =>
      requirements.filter(
        (r) =>
          r.effectiveStatus !== 'CANCELLED' &&
          r.status !== 'CANCELLED' &&
          !r.isSettled &&
          r.effectiveStatus !== 'COMPLETED' &&
          getRequirementCoreState(r) !== 'PO_ISSUED' &&
          getRequirementCoreState(r) !== 'SETTLED',
      ),
    [requirements],
  );

  const settledList = useMemo(
    () =>
      requirements.filter(
        (r) =>
          r.isSettled ||
          r.effectiveStatus === 'COMPLETED' ||
          getRequirementCoreState(r) === 'SETTLED' ||
          getRequirementCoreState(r) === 'PO_ISSUED',
      ),
    [requirements],
  );

  const activeCount = activeSourcingList.length;
  const actionRequiredCount = actionRequiredList.length;
  const settledCount = settledList.length;

  const displayedRequirements = useMemo(() => {
    let baseList = requirements;
    if (selectedFilter === 'ACTION_REQUIRED') {
      baseList = actionRequiredList;
    } else if (selectedFilter === 'ACTIVE') {
      baseList = activeSourcingList;
    } else if (selectedFilter === 'COMPLETED') {
      baseList = settledList;
    }

    if (!searchFilter.trim()) return baseList;
    const q = searchFilter.toLowerCase().trim();
    return baseList.filter(
      (r) =>
        (r.title && r.title.toLowerCase().includes(q)) ||
        (r.requirementType && r.requirementType.toLowerCase().includes(q)) ||
        (r.id && r.id.toLowerCase().includes(q)),
    );
  }, [requirements, selectedFilter, actionRequiredList, activeSourcingList, settledList, searchFilter]);

  const greetingName =
    context.fullName?.trim().split(/\s+/)[0] ||
    (user?.user_metadata?.full_name as string | undefined)?.trim().split(/\s+/)[0] ||
    context.email?.split('@')[0] ||
    'there';

  const timeGreeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const renderRequirementCard = (req: OrganizationRequirementSummary, isHighPriorityHighlight = false) => {
    const action = getNextAction(req);
    const coreState = getRequirementCoreState(req);
    const stalled = isRequirementStalled(req);
    const chip = getStatusChip(req, coreState, stalled);

    return (
      <div
        key={req.id}
        className={`rounded-2xl border p-3.5 sm:p-4 space-y-3 transition-all ${
          isHighPriorityHighlight || action.actionRequired
            ? 'border-amber-400/90 bg-amber-50/40 dark:bg-amber-950/25 shadow-xs ring-1 ring-amber-400/30'
            : 'border-border/80 bg-card shadow-2xs hover:border-primary/40'
        }`}
      >
        {/* Top Meta Row: ID, Category & Identity-Protection Shield */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-[10px] text-muted-foreground bg-muted/70 px-1.5 py-0.5 rounded-md font-bold shrink-0">
                REQ-{req.id.slice(0, 6)}
              </span>
              <span className="text-[10px] font-bold text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full truncate max-w-[120px]">
                {req.requirementType || 'Procurement'}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border flex items-center gap-1 shrink-0 ${chip.className}`}>
                <span>{chip.icon}</span>
                <span>{chip.label}</span>
              </span>
            </div>

            <h3 className="text-sm sm:text-base font-extrabold text-foreground leading-snug mt-1.5 line-clamp-2">
              {req.title}
            </h3>
          </div>

          <span
            title="Identity-Protected sealed sourcing"
            className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1"
          >
            <span>🔒</span>
            <span>Sealed</span>
          </span>
        </div>

        {/* Key Metrics Row (44px touch-friendly glance) */}
        <div className="grid grid-cols-3 gap-1.5 py-1.5 px-2.5 rounded-xl bg-muted/30 border border-border/60 text-center select-none">
          <div className="min-w-0">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">Quotes</span>
            <span className="text-xs font-black text-primary truncate block mt-0.5">
              {req.quotesCount > 0 ? `${req.quotesCount} Received` : '0 Quotes'}
            </span>
          </div>
          <div className="border-x border-border/60 min-w-0 px-1">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">Quorum Target</span>
            <span className="text-xs font-bold text-foreground truncate block mt-0.5">
              {req.minQuotesRequired || 3} Min
            </span>
          </div>
          <div className="min-w-0">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">Created</span>
            <span className="text-xs font-medium text-foreground truncate block mt-0.5">
              {formatDateIST(req.createdAt)}
            </span>
          </div>
        </div>

        {/* Action Notice Strip when Action is Required */}
        {action.actionNotice && (
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold ${
            action.actionRequired
              ? 'bg-amber-100/70 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 border border-amber-300/60 dark:border-amber-800/60'
              : 'bg-muted/40 text-muted-foreground'
          }`}>
            <span className="shrink-0">{action.actionRequired ? '⚡' : 'ℹ️'}</span>
            <span className="truncate">{action.actionNotice}</span>
          </div>
        )}

        {/* Ergonomic Action Cluster (Touch target >= 44px) */}
        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => setSelectedRequirement(req)}
            className="min-h-[44px] rounded-xl border border-border/80 bg-card px-3.5 py-2.5 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95 transition shadow-2xs shrink-0 flex items-center justify-center gap-1"
          >
            <span>ℹ️</span>
            <span>Details</span>
          </button>

          <Link
            to={action.to}
            className={`min-h-[44px] flex-1 flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-black shadow-sm active:scale-98 transition ${
              action.primary
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20'
                : 'border border-border/80 bg-card hover:bg-muted text-foreground'
            }`}
          >
            <span>{action.label}</span>
          </Link>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-lg md:max-w-4xl mx-auto px-3 sm:px-4 py-3 space-y-3.5 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] overflow-x-hidden">
      {/* 1. Header & Greeting: Personal, Compact, Action Summary */}
      <div className="rounded-2xl border border-border/80 bg-card p-3 sm:p-4 shadow-2xs space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-sm font-black border border-primary/20 shadow-2xs">
              {greetingName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-black text-foreground truncate">
                {timeGreeting}, {greetingName}
              </h1>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium truncate">
                <span>🏢 {org?.organizationName || 'My Organization'}</span>
                <span>•</span>
                <span className="capitalize">{org?.orgType || 'Commercial'}</span>
              </div>
            </div>
          </div>

          {/* Subscription Status Pill & Role Mode Switcher */}
          <div className="flex items-center gap-1.5 shrink-0">
            <RoleModeToggle size="sm" />
            {subscription && (
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(true)}
                className={`min-h-[38px] inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-black border transition active:scale-95 shrink-0 mobile-touch-target ${
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

        {/* Attention Summary Bar */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60 text-xs">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            {actionRequiredCount > 0 ? (
              <>
                <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                <span className="text-amber-700 dark:text-amber-400 font-extrabold">
                  {actionRequiredCount} {actionRequiredCount === 1 ? 'action requires' : 'actions require'} your attention
                </span>
              </>
            ) : (
              <>
                <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                <span className="text-muted-foreground font-semibold">
                  All caught up • {activeCount} active sourcing {activeCount === 1 ? 'tender' : 'tenders'}
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => void loadData()}
            disabled={isLoading}
            className="text-[11px] font-bold text-muted-foreground hover:text-foreground transition disabled:opacity-50 shrink-0"
            title="Refresh dashboard"
          >
            {isLoading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Subscription Expiry Alert */}
      {subscription?.isExpired && (
        <SubscriptionExpiryBanner
          subscription={subscription}
          onRenewClick={() => setIsPaymentModalOpen(true)}
        />
      )}

      {/* 2. 3-Pill Mobile Glance Bar (Active, Action, Settled) */}
      <MobileGlanceBar
        activeCount={activeCount}
        actionRequiredCount={actionRequiredCount}
        completedCount={settledCount}
        selectedFilter={selectedFilter}
        onSelectFilter={(filter) => setSelectedFilter(filter)}
      />

      {/* 3. Quick Action Bar: 1-Tap Sourcing & Smart Search */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {/* Smart Search Input */}
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">🔍</span>
            <input
              type="text"
              placeholder="Search enquiries by title, category, or ID…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-border/80 bg-card pl-8 pr-8 py-2.5 text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-2xs transition"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter('')}
                className="min-h-[44px] min-w-[32px] absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>

          {/* Primary CTA: + New Sourcing */}
          <Link
            to="/requirements/new"
            className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-xs hover:bg-primary/90 active:scale-95 transition shrink-0"
          >
            <span>+</span>
            <span className="hidden xs:inline">New Requirement</span>
            <span className="xs:hidden">New</span>
          </Link>
        </div>

        {/* Express Sourcing Fast-Track Banner */}
        <button
          type="button"
          onClick={() => setIsExpressModalOpen(true)}
          className="w-full min-h-[44px] flex items-center justify-between gap-2 p-2.5 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 active:scale-98 transition text-left select-none"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base shrink-0">⚡</span>
            <div className="min-w-0">
              <span className="text-xs font-extrabold text-foreground block truncate">
                Express Sourcing in Minutes
              </span>
              <span className="text-[10px] text-muted-foreground block truncate">
                Get sealed quotes from verified suppliers in 1 tap
              </span>
            </div>
          </div>
          <span className="text-xs font-bold text-primary shrink-0">
            Start →
          </span>
        </button>
      </div>

      {/* Filter Reset Strip (if filter is active) */}
      {selectedFilter !== 'ALL' && (
        <div className="flex items-center justify-between bg-muted/40 rounded-xl px-3 py-1.5 border border-border/60 text-xs">
          <span className="font-bold text-foreground flex items-center gap-1.5">
            <span>Filter:</span>
            <span className="text-primary font-black">
              {selectedFilter === 'ACTION_REQUIRED'
                ? '🟡 Needs Action'
                : selectedFilter === 'ACTIVE'
                ? '🟢 Active Sourcing'
                : '⚪ Settled / Completed'}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setSelectedFilter('ALL')}
            className="text-[11px] font-bold text-primary hover:underline"
          >
            Show All ({requirements.length})
          </button>
        </div>
      )}

      {/* 4. Categorized Procurement Feed */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="py-12 text-center text-xs text-muted-foreground bg-card rounded-2xl border space-y-2">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="font-semibold">Loading your procurement enquiries…</p>
          </div>
        ) : requirements.length === 0 ? (
          <div className="py-12 text-center bg-card rounded-2xl border p-5 space-y-3.5">
            <span className="text-4xl block">📦</span>
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-foreground">No Procurement Enquiries Yet</h3>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Post your first requirement to get sealed, competitive quotes from verified suppliers.
              </p>
            </div>
            <Link
              to="/requirements/new"
              className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-sm hover:bg-primary/90 transition"
            >
              <span>+</span> Start Sourcing Now
            </Link>
          </div>
        ) : selectedFilter !== 'ALL' || searchFilter.trim() ? (
          /* Filtered View */
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                {selectedFilter === 'ACTION_REQUIRED'
                  ? 'Pending Your Action'
                  : selectedFilter === 'COMPLETED'
                  ? 'Settled Orders'
                  : selectedFilter === 'ACTIVE'
                  ? 'Active Sourcing'
                  : 'Search Results'}
              </h2>
              <span className="text-[11px] font-bold text-muted-foreground">
                {displayedRequirements.length} {displayedRequirements.length === 1 ? 'enquiry' : 'enquiries'}
              </span>
            </div>

            {displayedRequirements.length === 0 ? (
              <div className="py-8 text-center bg-card rounded-2xl border p-4 space-y-2">
                <span className="text-2xl block">🔍</span>
                <p className="text-xs font-semibold text-foreground">
                  No matching enquiries found for this filter.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFilter('ALL');
                    setSearchFilter('');
                  }}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  Clear search & filters
                </button>
              </div>
            ) : (
              displayedRequirements.map((req) => renderRequirementCard(req, selectedFilter === 'ACTION_REQUIRED'))
            )}
          </div>
        ) : (
          /* Standard Unfiltered Hierarchy: Action Required -> Active Sourcing -> Recent Activity/Settled */
          <div className="space-y-4">
            {/* SECTION 1: Action Required (High Priority) */}
            {actionRequiredList.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    <h2 className="text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
                      Action Required ({actionRequiredList.length})
                    </h2>
                  </div>
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950 px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-800">
                    High Priority
                  </span>
                </div>

                <div className="space-y-2.5">
                  {actionRequiredList.map((req) => renderRequirementCard(req, true))}
                </div>
              </section>
            )}

            {/* SECTION 2: Active Sourcing */}
            <section className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">🟢</span>
                  <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                    Active Sourcing ({activeSourcingList.length})
                  </h2>
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Ongoing RFQs
                </span>
              </div>

              {activeSourcingList.length === 0 ? (
                <div className="py-6 text-center bg-card rounded-2xl border p-3 text-xs text-muted-foreground">
                  No other active sourcing enquiries.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {activeSourcingList.map((req) => renderRequirementCard(req, false))}
                </div>
              )}
            </section>

            {/* SECTION 3: Recent Activity / Settled */}
            {settledList.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">⚪</span>
                    <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                      Recent Activity &amp; Settled ({settledList.length})
                    </h2>
                  </div>
                  <Link
                    to="/purchase-orders"
                    className="text-[11px] font-bold text-primary hover:underline"
                  >
                    View All Orders →
                  </Link>
                </div>

                <div className="space-y-2.5">
                  {settledList.slice(0, 5).map((req) => renderRequirementCard(req, false))}
                </div>
              </section>
            )}
          </div>
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
                className="min-h-[44px] flex-1 rounded-xl border border-border/80 bg-card py-2.5 text-xs font-bold text-center text-foreground hover:bg-muted flex items-center justify-center transition"
              >
                Full Scope Sheet
              </Link>
              {selectedRequirement.rfqId && (
                <Link
                  to={`/rfq/${selectedRequirement.rfqId}/quotes`}
                  onClick={() => setSelectedRequirement(null)}
                  className="min-h-[44px] flex-1 rounded-xl bg-primary py-2.5 text-xs font-extrabold text-center text-primary-foreground shadow-sm hover:bg-primary/90 flex items-center justify-center transition"
                >
                  Compare Quotes →
                </Link>
              )}
            </div>
          }
        >
          <div className="space-y-3 text-xs">
            {/* Status Details */}
            <div className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Current Stage:</span>
                <span className="font-black text-primary">
                  {CORE_PROCUREMENT_STATES[getRequirementCoreState(selectedRequirement)].title}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Category:</span>
                <span className="font-bold text-foreground">{selectedRequirement.requirementType}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Quotes Received:</span>
                <span className="font-black text-foreground">{selectedRequirement.quotesCount} quote(s)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Quorum Requirement:</span>
                <span className="font-semibold text-foreground">Min {selectedRequirement.minQuotesRequired || 3} quotes</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Created:</span>
                <span className="font-medium text-foreground">{formatDateIST(selectedRequirement.createdAt)}</span>
              </div>
            </div>

            {/* Privacy Shield Info */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-start gap-2">
              <span className="text-base shrink-0">🔒</span>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Identity-Protected Sourcing:</strong> All supplier identities and commercial quotes remain cryptographically sealed until you finalize and award the winning offer.
              </p>
            </div>
          </div>
        </BottomSheet>
      )}

      {/* 6. Express Sourcing Bottom Sheet */}
      <BottomSheet
        isOpen={isExpressModalOpen}
        onClose={() => {
          setIsExpressModalOpen(false);
          setExpressError(null);
        }}
        title="⚡ What do you need to procure?"
        subtitle="Get sealed, competitive quotes from verified suppliers in minutes."
      >
        <div className="space-y-4 text-xs">
          <form onSubmit={(e) => void handleExpressSubmit(undefined, e)} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                Describe your procurement requirement
              </label>
              <textarea
                rows={3}
                value={expressQuery}
                disabled={isSubmittingExpress}
                onChange={(e) => setExpressQuery(e.target.value)}
                placeholder="e.g. Swimming pool renovation within 14 days under ₹3.5L…"
                className="w-full rounded-xl border border-border/80 bg-background p-3 text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition shadow-inner"
              />
            </div>

            {expressError && (
              <p className="text-[11px] font-bold text-red-600 bg-red-50 dark:bg-red-950/40 p-2 rounded-lg border border-red-200">
                ⚠️ {expressError}
              </p>
            )}

            <button
              type="submit"
              disabled={!expressQuery.trim() || isSubmittingExpress}
              className="min-h-[44px] w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-xs font-black text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95 transition disabled:opacity-40"
            >
              <span>⚡</span>
              <span>{isSubmittingExpress ? 'Matching Verified Suppliers…' : 'Get Quotes Now →'}</span>
            </button>
          </form>

          <div className="pt-2 border-t border-border/80 space-y-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">
              Popular 1-Tap Templates:
            </span>
            <div className="space-y-1.5">
              {POPULAR_QUICK_TILES.map((tile) => (
                <button
                  key={tile.label}
                  type="button"
                  onClick={() => {
                    setExpressQuery(tile.query);
                    void handleExpressSubmit(tile.query);
                  }}
                  disabled={isSubmittingExpress}
                  className="min-h-[44px] w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-border/80 bg-muted/30 hover:bg-muted text-left transition active:scale-95 text-foreground"
                >
                  <span className="text-base shrink-0">{tile.icon}</span>
                  <div className="min-w-0 flex-1">
                    <span className="font-bold block truncate text-xs">{tile.label}</span>
                    <span className="text-[10px] text-muted-foreground line-clamp-1">{tile.query}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* 7. Payment / Subscription Modal */}
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
