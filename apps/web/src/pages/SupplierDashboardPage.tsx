import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRoleContext } from '@/features/roles';
import { useAuth } from '@/features/auth';
import { SupplierCapabilityModal } from '@/features/supplier';
import {
  useSupplierHomeData,
  HomeContextBar,
  HomeSection,
  SupplierOpportunityCard,
  SupplierActionCard,
  SupplierQuoteCard,
  SupplierOrdersSummaryCard,
  HomeActivityTimeline,
  HomeEmptyState,
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
    recentActivity,
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
        /* Supplier Opportunity Cockpit Hierarchy */
        <div className="space-y-4">
          {/* LEVEL 1: New Opportunities (Primary Supplier Priority) */}
          <HomeSection
            title="New Opportunities"
            icon="📢"
            count={newOpportunities.length}
            badge={newOpportunities.length > 0 ? 'RFQs' : undefined}
            badgeColor="bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/80 dark:text-purple-300 dark:border-purple-800"
          >
            {newOpportunities.length === 0 ? (
              <HomeEmptyState
                icon="🎯"
                title="No new opportunities yet"
                description="When buyers broadcast RFQs matching your categories, new sealed opportunities will appear here."
                actionLabel="Update Radar Capabilities"
                actionOnClick={() => setIsCapabilityModalOpen(true)}
              />
            ) : (
              <div className="space-y-2.5">
                {newOpportunities.map((opp) => (
                  <SupplierOpportunityCard key={opp.id} opportunity={opp} />
                ))}
              </div>
            )}
          </HomeSection>

          {/* LEVEL 2: Action Required (PO acceptances, Closing deadlines) */}
          {actionRequiredItems.length > 0 && (
            <HomeSection
              title="Action Required"
              icon="⚡"
              count={actionRequiredItems.length}
              badge="Action Needed"
              badgeColor="bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800"
            >
              <div className="space-y-2.5">
                {actionRequiredItems.map((action) => (
                  <SupplierActionCard key={action.id} action={action} />
                ))}
              </div>
            </HomeSection>
          )}

          {/* LEVEL 3: Active Quotes (Under Evaluation / Submitted) */}
          {activeQuotes.length > 0 && (
            <HomeSection
              title="Active Quotes"
              icon="⚡"
              count={activeQuotes.length}
            >
              <div className="space-y-2.5">
                {activeQuotes.map((quote) => (
                  <SupplierQuoteCard key={quote.id} quote={quote} />
                ))}
              </div>
            </HomeSection>
          )}

          {/* LEVEL 4: Orders / Business Summary */}
          <HomeSection
            title="Orders &amp; Business"
            icon="💼"
            actionText="View Orders →"
            actionUrl="/supplier/purchase-orders"
          >
            <SupplierOrdersSummaryCard
              activeCount={ordersSummary.activeCount}
              totalAmount={ordersSummary.totalAmount}
              pendingAcceptanceCount={ordersSummary.pendingAcceptanceCount}
              completedCount={ordersSummary.completedCount}
              ratingAvg={ordersSummary.ratingAvg}
            />
          </HomeSection>

          {/* LEVEL 5: Recent Activity */}
          {recentActivity.length > 0 && (
            <HomeSection
              title="Recent Activity"
              icon="🕒"
            >
              <HomeActivityTimeline events={recentActivity} />
            </HomeSection>
          )}

          {/* Radar Scope Summary & Capability Quick Trigger */}
          <div className="pt-1 flex items-center justify-between gap-2 bg-purple-500/5 border border-purple-500/20 rounded-2xl p-3">
            <div className="min-w-0 flex-1">
              <span className="text-xs font-bold text-purple-950 dark:text-purple-300 block truncate">
                Discovery Radar · {profile.categories.length} {profile.categories.length === 1 ? 'Category' : 'Categories'}
              </span>
              <span className="text-[11px] text-muted-foreground block truncate">
                📍 {profile.isPanIndia ? 'Pan-India matching' : `${profile.radiusKm} km radius (${profile.baseCity})`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsCapabilityModalOpen(true)}
              data-testid="dashboard-supplier-capabilities-btn"
              className="min-h-[48px] inline-flex items-center justify-center gap-1 rounded-xl bg-card border border-purple-300 dark:border-purple-800 hover:bg-muted text-purple-900 dark:text-purple-300 px-4 py-2.5 text-xs font-bold shadow-2xs active:scale-95 transition shrink-0 cursor-pointer mobile-touch-target"
            >
              <span>⚙️ Edit Scope</span>
            </button>
          </div>
        </div>
      )}

      {/* Quick Capability Editor Modal for Suppliers */}
      <SupplierCapabilityModal
        open={isCapabilityModalOpen}
        onClose={() => setIsCapabilityModalOpen(false)}
      />
    </div>
  );
}
