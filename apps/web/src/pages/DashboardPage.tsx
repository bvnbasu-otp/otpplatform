import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRoleContext } from '@/features/roles';
import { useAuth } from '@/features/auth';
import {
  SubscriptionPaymentModal,
  SubscriptionExpiryBanner,
  OtpWalletCreditsWidget,
  validateOrganizationSourcingAccess,
} from '@/features/subscription';
import { fastTrackExpressIntake } from '@/features/intake/api/fast-track-intake';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { formatDateIST } from '@/lib/date-utils';
import type { OrganizationRequirementSummary } from '@/features/requirement/api/requirements';
import {
  useBuyerHomeData,
  HomeContextBar,
  HomeSection,
  BuyerActionCard,
  BuyerProcurementCard,
  BuyerSourcingCockpitCard,
  HomeActivityTimeline,
  HomeEmptyState,
  HomeSkeleton,
} from '@/features/home';

export function DashboardPage() {
  const navigate = useNavigate();
  const { context } = useRoleContext();
  const { user } = useAuth();

  const {
    org,
    subscription,
    requirements,
    actionRequiredItems,
    activeProcurements,
    recentActivity,
    stats,
    isLoading,
    error,
    refresh,
  } = useBuyerHomeData({
    organizationId: context.organizationId,
    organizationName: context.organizationName,
    orgRole: context.orgRole,
  });

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedRequirement, setSelectedRequirement] = useState<OrganizationRequirementSummary | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'action' | 'active' | 'settled'>('all');
  const [isExpressModalOpen, setIsExpressModalOpen] = useState(false);
  const [expressQuery, setExpressQuery] = useState('');
  const [isSubmittingExpress, setIsSubmittingExpress] = useState(false);
  const [expressError, setExpressError] = useState<string | null>(null);

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

    // DEF-001: Validate credits via atomic backend RPC calls without relying on loose client-side fallbacks
    const targetOrgId = org?.organizationId || context.organizationId;
    if (targetOrgId) {
      const accessCheck = await validateOrganizationSourcingAccess(targetOrgId);
      if (!accessCheck.hasAccess) {
        setIsSubmittingExpress(false);
        setExpressError(accessCheck.reason || 'Sourcing credits exhausted. Please renew subscription to create fast-track RFQs.');
        setIsPaymentModalOpen(true);
        return;
      }
    } else if (subscription?.isExpired && (!subscription.freeRfqCredits || subscription.freeRfqCredits <= 0)) {
      setIsSubmittingExpress(false);
      setIsPaymentModalOpen(true);
      return;
    }

    const result = await fastTrackExpressIntake(textToSubmit);
    if (!result.ok || !result.rfqId) {
      setExpressError(result.error || 'Failed to auto-generate RFQ quotes.');
      setIsSubmittingExpress(false);
      return;
    }

    setIsExpressModalOpen(false);
    navigate(`/rfq/${result.rfqId}/quotes`);
  };

  return (
    <div
      className="w-full max-w-lg md:max-w-4xl mx-auto px-3 sm:px-4 py-3 space-y-4 overflow-x-hidden min-w-0 max-w-full"
      data-testid="buyer-dashboard"
    >
      {/* 1. Compact Context Header: Greeting, Org, Role, Attention Indicator */}
      <HomeContextBar
        greeting={timeGreeting}
        name={greetingName}
        organizationName={org?.organizationName}
        roleLabel="Buyer"
        actionCount={actionRequiredItems.length}
        activeCount={activeProcurements.length}
        isLoading={isLoading}
        onRefresh={refresh}
        subscriptionExpired={subscription?.isExpired}
        freeCredits={subscription?.freeRfqCredits}
        onRenewClick={() => setIsPaymentModalOpen(true)}
      />

      {/* Subscription Expiry & Starter Credit Banner */}
      {subscription && (
        <SubscriptionExpiryBanner
          subscription={subscription}
          onRenewClick={() => setIsPaymentModalOpen(true)}
        />
      )}

      {/* OTP Wallet & Sourcing Rewards Widget */}
      {org?.organizationId && (
        <OtpWalletCreditsWidget
          organizationId={org.organizationId}
          onApplyRenewal={() => setIsPaymentModalOpen(true)}
        />
      )}

      {/* 2. Interactive Sourcing Cockpit: Voice & Text Intake + Template Chips + Live KPI Grid (Screen 06) */}
      <BuyerSourcingCockpitCard
        onExpressSubmit={(query) => handleExpressSubmit(query)}
        activeRfqsCount={activeProcurements.length}
        pendingVotesCount={actionRequiredItems.length}
        settledOrdersCount={stats.settled || 0}
        isExpressSubmitting={isSubmittingExpress}
        organizationName={org?.organizationName || (context.organizationName ? context.organizationName : 'Palm Meadows RWA')}
        organizationDetails={context.organizationName ? `${context.organizationName} · 450 Units` : 'Whitefield, Bengaluru · 450 Units'}
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
      ) : requirements.length === 0 ? (
        /* Brand New Buyer / Empty State (adhering to Section 24) */
        <HomeEmptyState
          icon="📦"
          title="Nothing here yet"
          description="Post your first procurement requirement to get sealed, competitive quotes from verified suppliers."
          actionLabel="Start your first requirement"
          actionUrl="/requirements/new"
        />
      ) : (
        /* Standard Procurement Cockpit Hierarchy filtered by Glance Bar */
        <div className="space-y-4">
          {/* LEVEL 1: Action Required (Highest Priority) */}
          {(activeFilter === 'all' || activeFilter === 'action') && actionRequiredItems.length > 0 && (
            <HomeSection
              title="Action Required"
              icon="⚡"
              count={actionRequiredItems.length}
              badge="High Priority"
              badgeColor="bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800"
            >
              <div className="space-y-2.5">
                {actionRequiredItems.map((action) => (
                  <BuyerActionCard
                    key={action.id}
                    action={action}
                    onInspect={() => setSelectedRequirement(action.requirement)}
                  />
                ))}
              </div>
            </HomeSection>
          )}

          {/* LEVEL 2: Active Procurement (Ongoing Tenders) */}
          {(activeFilter === 'all' || activeFilter === 'active') && (
            <HomeSection
              title="Active Procurement"
              icon="🟢"
              count={activeProcurements.length}
              actionText={stats.total > activeProcurements.length ? `All (${stats.total})` : undefined}
              actionUrl="/purchase-orders"
            >
              {activeProcurements.length === 0 ? (
                <div className="py-6 text-center bg-card rounded-2xl border border-border/70 p-4 space-y-1 text-xs text-muted-foreground">
                  <span className="text-xl block">✓</span>
                  <p className="font-semibold text-foreground">No active procurements right now.</p>
                  <p>All previous procurements have been completed and settled.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {activeProcurements.map((procurement) => (
                    <BuyerProcurementCard
                      key={procurement.id}
                      procurement={procurement}
                      onInspect={() => setSelectedRequirement(procurement.requirement)}
                    />
                  ))}
                </div>
              )}
            </HomeSection>
          )}

          {/* LEVEL 3: Recent Activity / Settled */}
          {(activeFilter === 'all' || activeFilter === 'settled') && recentActivity.length > 0 && (
            <HomeSection
              title="Recent Activity"
              icon="🕒"
              actionText="View Orders Ledger →"
              actionUrl="/purchase-orders"
            >
              <HomeActivityTimeline events={recentActivity} />
            </HomeSection>
          )}

          {/* LEVEL 4: Discoverability CTA (Compact Secondary Entry Point) */}
          <div className="pt-1 flex items-center justify-between gap-2 bg-muted/20 border border-border/70 rounded-2xl p-3">
            <div className="min-w-0 flex-1">
              <span className="text-xs font-bold text-foreground block truncate">
                Need to procure materials or services?
              </span>
              <span className="text-[11px] text-muted-foreground block truncate">
                Launch sealed RFQs with identity protection
              </span>
            </div>
            <Link
              to="/requirements/new"
              className="min-h-[48px] inline-flex items-center justify-center gap-1 rounded-xl bg-card border border-border/80 hover:bg-muted text-foreground px-4 py-2.5 text-xs font-bold shadow-2xs active:scale-95 transition shrink-0 mobile-touch-target"
            >
              <span>+ Start Requirement</span>
            </Link>
          </div>
        </div>
      )}

      {/* Subscription Payment & Renewal Modal */}
      {subscription && (
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
