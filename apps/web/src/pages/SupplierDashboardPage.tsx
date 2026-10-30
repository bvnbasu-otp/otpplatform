import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { useRoleContext } from '@/features/roles';
import { useAuth } from '@/features/auth';
import { SupplierCapabilityModal } from '@/features/supplier';
import { ReferAndEarnCard } from '@/features/referral';
import { useWalletEntitlement } from '@/features/subscription';
import {
  useSupplierHomeData,
  SupplierIdentityShieldBanner,
  SupplierOpportunityCard,
  SupplierActionCard,
  SupplierQuoteCard,
  HomeSkeleton,
} from '@/features/home';

export function SupplierDashboardPage() {
  const navigate = useNavigate();
  const { context } = useRoleContext();
  const { user } = useAuth();
  const [isCapabilityModalOpen, setIsCapabilityModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { entitledWalletOrgId, referSide, referIdentifier, referOrgName } = useWalletEntitlement();

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
    'Supplier Workspace';

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      navigate(`/opportunities?q=${encodeURIComponent(q)}`);
    } else {
      navigate('/opportunities');
    }
  }

  return (
    <div
      className="w-full max-w-lg mx-auto px-4 py-4 space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] overflow-x-hidden min-w-0"
      data-testid="supplier-dashboard"
    >
      {/* Screen 9 Greeting & Notification Header */}
      <div className="flex items-center justify-between" data-testid="screen-9-mobile-header">
        <div>
          <h1 className="text-xl font-black text-foreground tracking-tight">
            {timeGreeting}, {greetingName}
          </h1>
          <p className="text-xs text-muted-foreground font-medium mt-0.5">
            Find what you need, when you need it
          </p>
        </div>
        <Link
          to="/notifications"
          className="relative w-10 h-10 rounded-full bg-card border border-border/80 flex items-center justify-center text-foreground hover:bg-muted transition shadow-2xs"
          aria-label="Notifications"
        >
          <Icon name="notifications" size={20} />
          {actionRequiredItems.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center shadow-xs">
              {actionRequiredItems.length}
            </span>
          )}
        </Link>
      </div>

      {/* Screen 9 Search Bar */}
      <form onSubmit={handleSearchSubmit} className="relative">
        <Icon
          name="search"
          size={18}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search goods, services, suppliers…"
          className="w-full min-h-[46px] rounded-2xl border border-border/80 bg-card pl-10 pr-10 text-xs font-medium text-foreground placeholder:text-muted-foreground shadow-2xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs font-bold"
          >
            ✕
          </button>
        )}
      </form>

      {/* Find Opportunities Banner */}
      <div
        data-testid="find-opportunities-banner"
        className="rounded-2xl bg-gradient-to-r from-primary/15 via-primary/10 to-card border border-primary/25 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
      >
        <div className="space-y-1 min-w-0">
          <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-primary">
            <Icon name="search" size={16} />
            <span>Find Opportunities</span>
          </span>
          <h2 className="text-sm sm:text-base font-extrabold text-foreground">
            What work would you like to take up today?
          </h2>
          <p className="text-xs text-muted-foreground">
            Explore open tenders, RFQs and direct community sourcing needs matching your trade.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCapabilityModalOpen(true)}
          className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 text-xs font-extrabold shadow-sm active:scale-98 transition shrink-0 mobile-touch-target cursor-pointer"
        >
          <span>Update Trade Scope →</span>
        </button>
      </div>

      {/* Screen 9 / Infographic Action Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5" data-testid="supplier-action-grid">
        <Link
          to="/supplier/quotes"
          className="rounded-2xl border border-border/80 bg-card p-3 flex flex-col items-center justify-center text-center hover:border-primary/40 hover:bg-muted/40 transition shadow-2xs group"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-1.5 group-hover:scale-105 transition">
            <Icon name="request_quote" size={22} />
          </div>
          <span className="text-xs font-bold text-foreground">My Quotes</span>
          <span className="text-[10px] text-muted-foreground font-semibold mt-0.5">
            {activeQuotes.length} Active
          </span>
        </Link>

        <Link
          to="/purchase-orders"
          className="rounded-2xl border border-border/80 bg-card p-3 flex flex-col items-center justify-center text-center hover:border-primary/40 hover:bg-muted/40 transition shadow-2xs group"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-1.5 group-hover:scale-105 transition">
            <Icon name="local_shipping" size={22} />
          </div>
          <span className="text-xs font-bold text-foreground">My Orders</span>
          <span className="text-[10px] text-muted-foreground font-semibold mt-0.5">
            {ordersSummary.activeCount} Active
          </span>
        </Link>

        <Link
          to="/notifications"
          className="rounded-2xl border border-border/80 bg-card p-3 flex flex-col items-center justify-center text-center hover:border-primary/40 hover:bg-muted/40 transition shadow-2xs group"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-1.5 group-hover:scale-105 transition">
            <Icon name="notifications" size={22} />
          </div>
          <span className="text-xs font-bold text-foreground">Notifications</span>
          <span className="text-[10px] text-muted-foreground font-semibold mt-0.5">
            {actionRequiredItems.length} Alerts
          </span>
        </Link>

        <Link
          to="/profile"
          className="rounded-2xl border border-border/80 bg-card p-3 flex flex-col items-center justify-center text-center hover:border-primary/40 hover:bg-muted/40 transition shadow-2xs group"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-1.5 group-hover:scale-105 transition">
            <Icon name="person" size={22} />
          </div>
          <span className="text-xs font-bold text-foreground">Profile</span>
          <span className="text-[10px] text-muted-foreground font-semibold mt-0.5">
            Scope &amp; KYB
          </span>
        </Link>
      </div>

      {/* Identity-Protected Sourcing Hub & Scope Overview */}
      <SupplierIdentityShieldBanner
        businessName={businessName}
        profile={profile}
        opportunitiesCount={newOpportunities.length}
        actionCount={actionRequiredItems.length}
        activeQuotesCount={activeQuotes.length}
        activeOrdersCount={ordersSummary.activeCount}
        onEditScope={() => setIsCapabilityModalOpen(true)}
      />

      {/* Loading / Content */}
      {isLoading ? (
        <HomeSkeleton />
      ) : error ? (
        <div className="py-8 px-4 text-center bg-card rounded-2xl border border-destructive/40 shadow-2xs space-y-3">
          <span className="text-3xl block">⚠️</span>
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-foreground">Couldn&apos;t load your opportunities</h3>
            <p className="text-xs text-muted-foreground">Please check your connection and try again.</p>
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
        <div className="space-y-3">
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

      {/* Refer & Earn */}
      <ReferAndEarnCard
        identifier={entitledWalletOrgId || referIdentifier || user?.id || user?.email}
        orgName={businessName || referOrgName}
        side={referSide}
      />

      {/* Quick Capability Editor Modal */}
      <SupplierCapabilityModal
        open={isCapabilityModalOpen}
        onClose={() => setIsCapabilityModalOpen(false)}
      />
    </div>
  );
}
