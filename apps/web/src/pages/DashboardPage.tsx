import { useState, useEffect } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useRoleContext } from '@/features/roles';
import { useAuth } from '@/features/auth';
import {
  SubscriptionPaymentModal,
  SubscriptionExpiryBanner,
  useWalletEntitlement,
} from '@/features/subscription';
import { ReferAndEarnCard } from '@/features/referral';
import { usePilotAllowance } from '@/features/intake/hooks/use-pilot-allowance';
import { formatRfqBalanceSummary } from '@/features/requirement/components/PilotAllowanceText';
import { checkPilotAllowanceBeforePublish } from '@/features/intake/api/pilot-allowance';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { formatDateIST } from '@/lib/date-utils';
import type { OrganizationRequirementSummary } from '@/features/requirement/api/requirements';
import {
  useBuyerHomeData,
  HomeContextBar,
  BuyerActionCard,
  BuyerProcurementCard,
  BuyerSourcingCockpitCard,
  HomeSkeleton,
  HomeEmptyState,
} from '@/features/home';
import { fetchBuyerAddresses } from '@/features/profile/api/buyer-addresses';
import { resolveBuyerPersonaFromContext } from '@otp/domain';

export function DashboardPage() {
  const navigate = useNavigate();
  const { context } = useRoleContext();
  const { user } = useAuth();

  const {
    org,
    subscription,
    actionRequiredItems,
    activeProcurements,
    stats,
    isLoading,
    error,
    refresh,
  } = useBuyerHomeData({
    organizationId: context.organizationId,
    organizationName: context.organizationName,
    orgRole: context.orgRole,
  });

  const { entitledWalletOrgId, referSide, referIdentifier, referOrgName } = useWalletEntitlement();

  const pilotAllowance = usePilotAllowance(org?.organizationId || context.organizationId);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedRequirement, setSelectedRequirement] = useState<OrganizationRequirementSummary | null>(null);
  const [activeFilter, setActiveFilter] = useState<'action' | 'active' | 'settled' | null>(null);
  const [isExpressModalOpen, setIsExpressModalOpen] = useState(false);
  const [expressQuery, setExpressQuery] = useState('');
  const [isSubmittingExpress, setIsSubmittingExpress] = useState(false);
  const [expressError, setExpressError] = useState<string | null>(null);

  const [hasCheckedAddress, setHasCheckedAddress] = useState(false);
  const [hasSavedAddress, setHasSavedAddress] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const persona = resolveBuyerPersonaFromContext({
      buyerType: context.buyerType,
      organizationId: context.organizationId,
      organizations: context.organizations,
    });
    void fetchBuyerAddresses(context.organizationId, persona).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setHasSavedAddress(res.addresses.length > 0);
      }
      setHasCheckedAddress(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, context.organizationId, context.buyerType, context.organizations]);

  const buyerPersona = resolveBuyerPersonaFromContext({
    buyerType: context.buyerType,
    organizationId: context.organizationId,
    organizations: context.organizations,
  });

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

  const handleExpressSubmit = async (queryText?: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const textToSubmit = (queryText ?? expressQuery).trim();
    if (!textToSubmit) return;

    setIsSubmittingExpress(true);
    setExpressError(null);

    const targetOrgId = org?.organizationId || context.organizationId;
    const allowanceCheck = await checkPilotAllowanceBeforePublish(targetOrgId ?? null);
    if (!allowanceCheck.ok) {
      setIsSubmittingExpress(false);
      setExpressError(allowanceCheck.error);
      return;
    }

    setIsExpressModalOpen(false);
    setIsSubmittingExpress(false);
    // Route to intake wizard so buyer can inspect, validate, and customize specifications before publishing
    navigate(`/intake?q=${encodeURIComponent(textToSubmit)}`);
  };

  const isInternal =
    Boolean(context.isPlatformAdmin) ||
    Boolean(context.isFounder) ||
    context.side === 'CONSOLE';

  if (isInternal) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div
      className="w-full max-w-lg md:max-w-4xl mx-auto px-3 sm:px-4 py-3 space-y-4 overflow-x-hidden min-w-0 max-w-full"
      data-testid="buyer-dashboard"
    >
      {/* Mobile Screen 9 Greeting & Quick Actions Header */}
      <div className="block sm:hidden space-y-3 pb-1" data-testid="screen-9-mobile-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-foreground">
              {timeGreeting}, {greetingName}
            </h1>
            <p className="text-xs text-muted-foreground font-medium">
              Find what you need, when you need it
            </p>
          </div>
          <Link
            to="/notifications"
            className="relative w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center text-foreground hover:bg-muted transition"
            aria-label="Notifications"
          >
            <Icon name="notifications" size={20} />
            {actionRequiredItems.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center">
                {actionRequiredItems.length}
              </span>
            )}
          </Link>
        </div>

        {/* 3x2 Quick Action Grid (Screen 9) */}
        <div className="grid grid-cols-3 gap-2" data-testid="screen-9-quick-actions">
          <Link
            to="/requirements/new"
            className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-border/80 bg-card hover:border-primary/50 text-center transition group shadow-2xs"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-1 group-hover:scale-105 transition">
              <Icon name="add" size={20} />
            </div>
            <span className="text-[11px] font-bold text-foreground leading-tight">Create RFQ</span>
          </Link>

          <Link
            to="/requirements"
            className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-border/80 bg-card hover:border-primary/50 text-center transition group shadow-2xs"
          >
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center mb-1 group-hover:scale-105 transition">
              <Icon name="description" size={20} />
            </div>
            <span className="text-[11px] font-bold text-foreground leading-tight">My Requirements</span>
          </Link>

          <Link
            to="/requirements"
            className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-border/80 bg-card hover:border-primary/50 text-center transition group shadow-2xs"
          >
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center mb-1 group-hover:scale-105 transition">
              <Icon name="request_quote" size={20} />
            </div>
            <span className="text-[11px] font-bold text-foreground leading-tight">My Quotes</span>
          </Link>

          <Link
            to="/purchase-orders"
            className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-border/80 bg-card hover:border-primary/50 text-center transition group shadow-2xs"
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-1 group-hover:scale-105 transition">
              <Icon name="receipt_long" size={20} />
            </div>
            <span className="text-[11px] font-bold text-foreground leading-tight">My Orders</span>
          </Link>

          <Link
            to="/notifications"
            className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-border/80 bg-card hover:border-primary/50 text-center transition group shadow-2xs"
          >
            <div className="w-9 h-9 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center mb-1 group-hover:scale-105 transition">
              <Icon name="notifications" size={20} />
            </div>
            <span className="text-[11px] font-bold text-foreground leading-tight">Notifications</span>
          </Link>

          <Link
            to="/profile"
            className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-border/80 bg-card hover:border-primary/50 text-center transition group shadow-2xs"
          >
            <div className="w-9 h-9 rounded-lg bg-slate-500/10 text-slate-600 flex items-center justify-center mb-1 group-hover:scale-105 transition">
              <Icon name="person" size={20} />
            </div>
            <span className="text-[11px] font-bold text-foreground leading-tight">Profile</span>
          </Link>
        </div>
      </div>
      {/* 1. Context header (all breakpoints) + mobile-first start panel */}
      <div>
        <HomeContextBar
          greeting={timeGreeting}
          name={greetingName}
          organizationName={org?.organizationName || context.organizationName || undefined}
          roleLabel={
            context.orgRole === 'PRESIDENT'
              ? 'President'
              : context.orgRole === 'SECRETARY'
              ? 'Secretary'
              : context.orgRole === 'TREASURER'
              ? 'Treasurer'
              : context.orgRole === 'ESTATE_MANAGER' || context.orgRole === 'MANAGER'
              ? 'Estate Manager'
              : context.orgRole && context.orgRole.toUpperCase() !== 'BUYER'
              ? context.orgRole
              : undefined
          }
          actionCount={actionRequiredItems.length}
          activeCount={activeProcurements.length}
          isLoading={isLoading}
          onRefresh={refresh}
          subscriptionExpired={subscription?.isExpired}
          freeCredits={subscription?.freeRfqCredits}
          onRenewClick={() => setIsPaymentModalOpen(true)}
          rfqBalance={{
            status: pilotAllowance.status,
            label: pilotAllowance.allowance?.label ?? null,
            summary:
              pilotAllowance.status === 'ready' && pilotAllowance.allowance
                ? formatRfqBalanceSummary(pilotAllowance.allowance)
                : null,
          }}
        />
      </div>

      {/* Requirement 1: First-Time Buyer Address Prompt */}
      {hasCheckedAddress && !hasSavedAddress && context.side !== 'SUPPLIER' && (
        <div
          data-testid="address-completion-prompt"
          className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/40 p-3.5 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-start gap-2.5">
            <span className="text-xl shrink-0">📍</span>
            <div>
              <p className="font-bold text-amber-950 dark:text-amber-200">
                Action Required: Complete your delivery / operational address
              </p>
              <p className="text-amber-900/80 dark:text-amber-300/80 text-[11px] mt-0.5 leading-relaxed">
                {context.organizationId
                  ? 'Add your organization’s registered operational premises to enable automatic SNE local supplier matching and statutory compliance.'
                  : 'Add your primary personal address (Home, Office, or Other) to enable 1-click RFQ dispatch and local supplier matching.'}
              </p>
            </div>
          </div>
          <Link
            to="/profile?tab=addresses"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition shadow-2xs shrink-0 min-h-[38px] mobile-touch-target"
          >
            <span>+</span>
            <span>Set Up Address</span>
          </Link>
        </div>
      )}

      {/* Subscription Expiry & Starter Credit Banner */}
      {subscription && !context.isPlatformAdmin && !context.isFounder && (
        <SubscriptionExpiryBanner
          subscription={subscription}
          onRenewClick={() => setIsPaymentModalOpen(true)}
        />
      )}

      {/* 2. Interactive Sourcing Cockpit: Voice & Text Intake + Template Chips + Live KPI Grid (Screen 06) */}
      <BuyerSourcingCockpitCard
        onExpressSubmit={(query) => handleExpressSubmit(query)}
        activeRfqsCount={activeProcurements.length}
        pendingVotesCount={actionRequiredItems.length}
        settledOrdersCount={stats.settled || 0}
        isExpressSubmitting={isSubmittingExpress}
        organizationName={org?.organizationName || context.organizationName || 'Personal Workspace'}
        organizationDetails={
          context.organizationName
            ? `${context.organizationName} · Active Member`
            : 'Independent Buyer · Personal Procurement'
        }
        orgRole={context.orgRole}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />

      {/* Loading State */}
      {isLoading ? (
        <HomeSkeleton />
      ) : error ? (
        /* Error State (adhering to Section 26) */
        <div className="py-8 px-4 text-center bg-card rounded-2xl border border-destructive/40 shadow-2xs space-y-3">
          <span className="text-3xl block">⚠️</span>
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-foreground">Couldn't load your workspace</h3>
            <p className="text-xs text-muted-foreground">
              Please check your connection and try again.
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="min-h-[48px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2.5 text-xs font-extrabold shadow-sm active:scale-98 transition shadow-primary/20 cursor-pointer"
          >
            <span>↻ Retry</span>
          </button>
        </div>
      ) : (
        /* Actionable and Active Cards filtered by Glance Bar */
        <div className="space-y-3">
          {/* Action Required Items (Highest Priority) */}
          {activeFilter === 'action' && actionRequiredItems.length > 0 && (
            <div id="buyer-count-action" className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5 px-1">
                <span>⚡</span> Action Needed ({actionRequiredItems.length})
              </span>
              <div className="space-y-2.5">
                {actionRequiredItems.map((action) => (
                  <BuyerActionCard
                    key={action.id}
                    action={action}
                    onInspect={() => setSelectedRequirement(action.requirement)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Active Purchases (Ongoing) */}
          {activeFilter === 'active' && activeProcurements.length > 0 && (
            <div id="buyer-count-active" className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 px-1">
                <span>🟢</span> Active Purchases ({activeProcurements.length})
              </span>
              <div className="space-y-2.5">
                {activeProcurements.map((procurement) => (
                  <BuyerProcurementCard
                    key={procurement.id}
                    procurement={procurement}
                    onInspect={() => setSelectedRequirement(procurement.requirement)}
                  />
                ))}
              </div>
            </div>
          )}

          {activeFilter === null &&
            actionRequiredItems.length === 0 &&
            activeProcurements.length === 0 && (
              <HomeEmptyState
                data-testid="buyer-dashboard-empty"
                icon="📋"
                title="No open procurements yet"
                description="Your drafts, live requests, and orders will appear here as you move through Tell, Review, Decide, and Track."
              />
            )}

          {activeFilter === 'action' && actionRequiredItems.length === 0 && (
            <HomeEmptyState
              icon="✅"
              title="Nothing needs your attention right now"
              description="When a draft, invitation, quote comparison, or approval needs you, it will show under Action Needed."
            />
          )}

          {activeFilter === 'settled' && (
            <div id="buyer-count-settled" className="rounded-xl border bg-card p-3 text-xs text-muted-foreground">
              <p className="font-bold text-foreground">{stats.settled || 0} settled</p>
              <p>This is the settled count returned with the workspace. OTP does not list orders here.</p>
            </div>
          )}

          {activeFilter === 'active' && activeProcurements.length === 0 && (
            <HomeEmptyState
              icon="🟢"
              title="No active purchases in progress"
              description="Published requirements and open RFQs that are still in flight will appear here."
            />
          )}
        </div>
      )}

      {/* Refer & Earn 10% Reward Widget */}
      <ReferAndEarnCard
        identifier={entitledWalletOrgId || referIdentifier || user?.id || user?.email}
        orgName={org?.organizationName || referOrgName || context.organizationName}
        side={referSide}
      />

      {/* Subscription Payment & Renewal Modal */}
      {subscription && !context.isPlatformAdmin && !context.isFounder && (
        <SubscriptionPaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          organizationId={org?.organizationId || ''}
          organizationName={org?.organizationName || 'Organization'}
          orgType={org?.orgType}
          onSuccess={() => void refresh()}
        />
      )}

      {/* Express Sourcing Fast-Track Modal */}
      {isExpressModalOpen && (
        <BottomSheet
          isOpen={isExpressModalOpen}
          onClose={() => setIsExpressModalOpen(false)}
          title="⚡ Express Sourcing Fast-Track"
          subtitle="Generate sealed RFQ quotes in 1 tap"
        >
          <form onSubmit={(e) => void handleExpressSubmit(undefined, e)} className="space-y-3.5 text-xs">
            <p className="text-muted-foreground">
              Enter your requirement or pick a popular query to auto-generate competitive RFQs instantly.
            </p>
            <input
              type="text"
              placeholder="e.g. 15HP motor rewinding in Bengaluru within 7 days…"
              value={expressQuery}
              onChange={(e) => setExpressQuery(e.target.value)}
              className="w-full min-h-[48px] rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 outline-none"
            />
            {expressError && <p className="text-rose-500 font-semibold">{expressError}</p>}
            <button
              type="submit"
              disabled={isSubmittingExpress || !expressQuery.trim()}
              className="w-full min-h-[48px] rounded-xl bg-primary text-primary-foreground font-extrabold hover:bg-primary/90 transition active:scale-98 disabled:opacity-50 flex items-center justify-center cursor-pointer"
            >
              {isSubmittingExpress ? 'Auto-Generating…' : 'Generate Sealed Quotes →'}
            </button>
          </form>
        </BottomSheet>
      )}

      {/* Slide-Up Bottom Sheet for Quick Requirement Scope Inspection */}
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
                className="min-h-[48px] flex-1 rounded-xl border border-border/80 bg-card py-2.5 text-xs font-bold text-center text-foreground hover:bg-muted flex items-center justify-center transition"
              >
                Full Scope Sheet
              </Link>
              {selectedRequirement.rfqId && (
                <Link
                  to={`/rfq/${selectedRequirement.rfqId}/quotes`}
                  onClick={() => setSelectedRequirement(null)}
                  className="min-h-[48px] flex-1 rounded-xl bg-primary text-primary-foreground py-2.5 text-xs font-extrabold text-center hover:bg-primary/90 flex items-center justify-center transition"
                >
                  View RFQ &amp; Quotes →
                </Link>
              )}
            </div>
          }
        >
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-xl bg-muted/40 border">
                <span className="text-[10px] text-muted-foreground uppercase font-bold block">Status</span>
                <span className="font-extrabold text-foreground">{selectedRequirement.status}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-muted/40 border">
                <span className="text-[10px] text-muted-foreground uppercase font-bold block">Quotes Received</span>
                <span className="font-black text-primary">{selectedRequirement.quotesCount} Quotes</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-muted/20 border text-muted-foreground text-[11px]">
              <span>Created on {formatDateIST(selectedRequirement.createdAt)}</span>
              {selectedRequirement.publishedAt && (
                <span> · Published {formatDateIST(selectedRequirement.publishedAt)}</span>
              )}
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
