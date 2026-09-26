import { useState } from 'react';
import { useRoleContext } from '@/features/roles';
import { useAuth } from '@/features/auth';
import { SupplierCapabilityModal } from '@/features/supplier';
import { ReferAndEarnCard } from '@/features/referral';
import {
  useSupplierHomeData,
  HomeContextBar,
  SupplierIdentityShieldBanner,
  SupplierOpportunityCard,
  SupplierActionCard,
  SupplierQuoteCard,
  HomeSkeleton,
} from '@/features/home';

export function SupplierDashboardPage() {
  const { context } = useRoleContext();
  const { user } = useAuth();
  const [isCapabilityModalOpen, setIsCapabilityModalOpen] = useState(false);

  const {
    profile,
    performance,
    newOpportunities,
    actionRequiredItems,
    activeQuotes,
    ordersSummary,
    isLoading,
    error,
    refresh,
  } = useSupplierHomeData();

  const greetingName =
    context.fullName?.trim().split(/\s+/)[0] ||
    (user?.user_metadata?.full_name as string | undefined)?.trim().split(/\s+/)[0] ||
    context.email?.split('@')[0] ||
    'Partner';

  const timeGreeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const businessName =
    performance?.supplierName ||
    context.organizationName ||
    (context.fullName ? `${context.fullName} Enterprises` : 'Supplier Workspace');

  return (
    <div
      className="w-full max-w-lg md:max-w-4xl mx-auto px-3 sm:px-4 py-3 space-y-4 overflow-x-hidden min-w-0 max-w-full"
      data-testid="supplier-dashboard"
    >
      {/* 1. Context Header: Greeting, Business Name, Role, Rating & Attention Indicator */}
      <HomeContextBar
        greeting={timeGreeting}
        name={greetingName}
        organizationName={businessName}
        roleLabel="Supplier"
        actionCount={actionRequiredItems.length}
        activeCount={newOpportunities.length + activeQuotes.length}
        isLoading={isLoading}
        onRefresh={refresh}
      />

      {/* 2. Identity-Protected Sourcing Hub & Scope Overview */}
      <SupplierIdentityShieldBanner
        profile={profile}
        opportunitiesCount={newOpportunities.length}
        actionCount={actionRequiredItems.length}
        activeQuotesCount={activeQuotes.length}
        activeOrdersCount={ordersSummary.activeCount}
        onEditScope={() => setIsCapabilityModalOpen(true)}
      />

      {/* Loading State */}
      {isLoading ? (
        <HomeSkeleton />
      ) : error ? (
        /* Error State */
        <div className="py-8 px-4 text-center bg-card rounded-2xl border border-destructive/40 shadow-2xs space-y-3">
          <span className="text-3xl block">⚠️</span>
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-foreground">Couldn't load your opportunities</h3>
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
        /* Streamlined Supplier Opportunity Cards */
        <div className="space-y-3">
          {/* Action Required Items */}
          {actionRequiredItems.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5 px-1">
                <span>⚡</span> Action Needed ({actionRequiredItems.length})
              </span>
              <div className="space-y-2.5">
                {actionRequiredItems.map((action) => (
                  <SupplierActionCard key={action.id} action={action} />
                ))}
              </div>
            </div>
          )}

          {/* New Opportunities */}
          {newOpportunities.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-300 flex items-center gap-1.5 px-1">
                <span>📢</span> New Opportunities ({newOpportunities.length})
              </span>
              <div className="space-y-2.5">
                {newOpportunities.map((opp) => (
                  <SupplierOpportunityCard key={opp.id} opportunity={opp} />
                ))}
              </div>
            </div>
          )}

          {/* Active Quotes */}
          {activeQuotes.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-300 flex items-center gap-1.5 px-1">
                <span>⚡</span> Active Quotes ({activeQuotes.length})
              </span>
              <div className="space-y-2.5">
                {activeQuotes.map((quote) => (
                  <SupplierQuoteCard key={quote.id} quote={quote} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Refer & Earn 10% Reward for Suppliers */}
      <ReferAndEarnCard
        identifier={context.organizationId || user?.id || user?.email}
        orgName={businessName}
        side="supplier"
      />

      {/* Quick Capability Editor Modal for Suppliers */}
      <SupplierCapabilityModal
        open={isCapabilityModalOpen}
        onClose={() => setIsCapabilityModalOpen(false)}
      />
    </div>
  );
}
