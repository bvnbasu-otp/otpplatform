import React, { useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useAuth } from '@/features/auth';
import { useRoleContext } from '@/features/roles';
import { useSupplierRadarCapabilities } from '../hooks/use-supplier-radar';
import { SupplierCapabilityModal } from '../components/SupplierCapabilityModal';

export interface OpportunityItem {
  id: string;
  title: string;
  clientName: string;
  scopeType: 'Goods' | 'Services';
  category: string;
  daysLeft: number;
  isOpen: boolean;
  estimatedValue: string;
  quantity: string;
  timeline: string;
  location: string;
  suppliersCount: number;
  thumbnailIcon: string;
  thumbnailBg: string;
}

export const CANONICAL_OPPORTUNITIES: OpportunityItem[] = [
  {
    id: 'opp-hvac-01',
    title: 'HVAC Chilled Water System Overhaul',
    clientName: 'Tech Park Tower B',
    scopeType: 'Services',
    category: 'HVAC Repair & Maintenance',
    daysLeft: 6,
    isOpen: true,
    estimatedValue: '₹3,50,000 – ₹7,00,000',
    quantity: '2 Chillers',
    timeline: 'Within 7 days',
    location: 'Bengaluru',
    suppliersCount: 4,
    thumbnailIcon: 'ac_unit',
    thumbnailBg: 'bg-cyan-500/10 text-cyan-600',
  },
  {
    id: 'opp-electrical-plumbing-02',
    title: 'Electrical & Plumbing',
    clientName: 'Sunrise Community Assn.',
    scopeType: 'Goods',
    category: 'Electrical',
    daysLeft: 5,
    isOpen: true,
    estimatedValue: '₹1,50,000 – ₹3,00,000',
    quantity: 'Lot (Complete Spares)',
    timeline: 'Within 5 days',
    location: 'Bengaluru',
    suppliersCount: 8,
    thumbnailIcon: 'electrical_services',
    thumbnailBg: 'bg-amber-500/10 text-amber-600',
  },
  {
    id: 'opp-motor-01',
    title: 'LT Motor Rewinding & Servicing',
    clientName: 'Apex Manufacturing, Peenya',
    scopeType: 'Services',
    category: 'Motor Rewinding & Servicing',
    daysLeft: 4,
    isOpen: true,
    estimatedValue: '₹1,20,000 – ₹2,50,000',
    quantity: '15 HP Motor x 4',
    timeline: 'Within 4 days',
    location: 'Bengaluru',
    suppliersCount: 5,
    thumbnailIcon: 'sync',
    thumbnailBg: 'bg-blue-500/10 text-blue-600',
  },
  {
    id: 'opp-plumbing-01',
    title: 'Plumbing Services',
    clientName: 'Sunrise Community Assn.',
    scopeType: 'Services',
    category: 'Building',
    daysLeft: 5,
    isOpen: true,
    estimatedValue: '₹75,000 – ₹1,50,000',
    quantity: '1 Site',
    timeline: 'Within 10 days',
    location: 'Bengaluru',
    suppliersCount: 8,
    thumbnailIcon: 'build',
    thumbnailBg: 'bg-emerald-500/10 text-emerald-600',
  },
  {
    id: 'opp-office-furniture-01',
    title: 'Office Furniture & Supplies',
    clientName: 'Enterprise Hub, Koramangala',
    scopeType: 'Goods',
    category: 'Office Supplies',
    daysLeft: 3,
    isOpen: true,
    estimatedValue: '₹2,00,000 – ₹5,00,000',
    quantity: '50 Units',
    timeline: 'Within 7 days',
    location: 'Bengaluru',
    suppliersCount: 10,
    thumbnailIcon: 'chair',
    thumbnailBg: 'bg-blue-500/10 text-blue-600',
  },
  {
    id: 'opp-plumbing-03',
    title: 'Plumbing & Sanitary Services',
    clientName: 'Sunrise Apartments, Block A',
    scopeType: 'Services',
    category: 'Building',
    daysLeft: 4,
    isOpen: true,
    estimatedValue: '₹25,000 – ₹60,000',
    quantity: 'Full Campus Service',
    timeline: 'Within 3 days',
    location: 'Bengaluru',
    suppliersCount: 6,
    thumbnailIcon: 'plumbing',
    thumbnailBg: 'bg-cyan-500/10 text-cyan-600',
  },
  {
    id: 'opp-painting-04',
    title: 'Painting & Surface Treatment',
    clientName: 'Green Valley Enclave',
    scopeType: 'Services',
    category: 'Building',
    daysLeft: 7,
    isOpen: true,
    estimatedValue: '₹80,000 – ₹1,50,000',
    quantity: '2 Towers (Exterior)',
    timeline: 'Within 14 days',
    location: 'Bengaluru',
    suppliersCount: 5,
    thumbnailIcon: 'format_paint',
    thumbnailBg: 'bg-emerald-500/10 text-emerald-600',
  },
  {
    id: 'opp-cctv-05',
    title: 'CCTV Surveillance & Networking',
    clientName: 'Palm Meadows, Tower C',
    scopeType: 'Goods',
    category: 'IT & Tech',
    daysLeft: 4,
    isOpen: true,
    estimatedValue: '₹90,000 – ₹1,80,000',
    quantity: '32 IP Cameras + NVR',
    timeline: 'Within 7 days',
    location: 'Bengaluru',
    suppliersCount: 7,
    thumbnailIcon: 'videocam',
    thumbnailBg: 'bg-indigo-500/10 text-indigo-600',
  },
];

/**
 * X2O Screen 10: Opportunities & Details.
 *
 * Implements:
 * - Search by category, product...
 * - Filter pills: All | Goods | Services
 * - Opportunity cards with suppliers count, days left, location
 * - Opportunity Details BottomSheet with Estimated Value, Quantity, Timeline, and Submit RFQ action
 */
export function OpportunitiesBrowsePage() {
  const { context } = useRoleContext();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialQuery = params.get('q') || '';
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [filterType, setFilterType] = useState<'All' | 'Goods' | 'Services'>('All');
  const [selectedOpportunity, setSelectedOpportunity] = useState<OpportunityItem | null>(null);
  const [isCapabilityModalOpen, setIsCapabilityModalOpen] = useState(false);

  const { profile } = useSupplierRadarCapabilities();

  // Redirect buyers back to dashboard (Opportunities is only applicable for suppliers)
  if (context.email && context.side !== 'SUPPLIER') {
    return <Navigate to="/dashboard" replace />;
  }

  const filteredOpportunities = useMemo(() => {
    // 1. Radar Scope & Capabilities Filter
    const declaredCategories = profile?.categories || [];
    const scopeOpportunities = CANONICAL_OPPORTUNITIES.filter((opp) => {
      if (declaredCategories.length === 0) return true;
      const title = opp.title.toLowerCase();
      const cat = opp.category.toLowerCase();
      return declaredCategories.some((declaredCat) => {
        const dLower = declaredCat.toLowerCase();
        if (title.includes(dLower) || cat.includes(dLower)) return true;
        const keywords = dLower.split(/[\s&,/]+/).filter((w) => w.length > 2 && !['and', 'the', 'for', 'repair', 'hardware'].includes(w));
        return keywords.some((k) => title.includes(k) || cat.includes(k));
      });
    });

    // 2. Search & Scope Type Filter
    return scopeOpportunities.filter((opp) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        opp.title.toLowerCase().includes(q) ||
        opp.clientName.toLowerCase().includes(q) ||
        opp.category.toLowerCase().includes(q) ||
        opp.location.toLowerCase().includes(q);
      const matchesType =
        filterType === 'All' || opp.scopeType === filterType;
      return matchesSearch && matchesType;
    });
  }, [profile?.categories, searchQuery, filterType]);

  return (
    <div
      className="p-3 sm:p-4 max-w-lg mx-auto w-full space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] overflow-x-hidden"
      data-testid="screen-4-browse-opportunities"
    >
      {/* 1. Screen 10 Header with Back Navigation */}
      <header className="flex items-center gap-3 border-b border-border/60 pb-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-xl border border-border/80 bg-card hover:bg-muted text-foreground flex items-center justify-center transition cursor-pointer shadow-2xs"
          aria-label="Back"
        >
          <Icon name="arrow_back" size={20} />
        </button>
        <div>
          <h1 className="text-lg font-black text-foreground">
            Opportunities
          </h1>
          <p className="text-[11px] text-muted-foreground font-medium">
            Explore live procurement requests and requirements
          </p>
        </div>
      </header>

      {/* 2. Active Radar Scope & Capabilities Banner */}
      <div
        className="rounded-2xl bg-gradient-to-r from-primary/15 via-primary/10 to-card border border-primary/25 p-3.5 flex items-center justify-between gap-3 shadow-2xs"
        data-testid="radar-scope-banner"
      >
        <div className="space-y-0.5 min-w-0">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-primary">
            <Icon name="radar" size={14} />
            <span>Radar Scope Active</span>
          </span>
          <p className="text-xs font-bold text-foreground truncate">
            {profile.categories.length} {profile.categories.length === 1 ? 'Trade Category' : 'Trade Categories'} Covered
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {profile.baseCity} · {profile.radiusKm} km Radius
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCapabilityModalOpen(true)}
          className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-border/80 bg-card hover:bg-muted text-foreground text-xs font-bold shadow-2xs active:scale-95 transition shrink-0 cursor-pointer"
        >
          Edit Scope ⚙️
        </button>
      </div>

      {/* 2. Screen 10 Search Bar */}
      <div className="relative">
        <Icon
          name="search"
          size={18}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by category, product…"
          className="w-full min-h-[46px] rounded-2xl border border-border/80 bg-card pl-10 pr-10 text-xs font-medium text-foreground placeholder:text-muted-foreground shadow-2xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition"
          data-testid="opportunities-search-input"
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
      </div>

      {/* 3. Filter Chips: All | Goods | Services */}
      <div
        className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5"
        role="tablist"
        aria-label="Scope Type Filters"
      >
        {(['All', 'Goods', 'Services'] as const).map((type) => (
          <button
            key={type}
            type="button"
            role="tab"
            aria-selected={filterType === type}
            onClick={() => setFilterType(type)}
            className={`min-h-[36px] px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition cursor-pointer ${
              filterType === type
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-card border border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* 4. Opportunity Cards List */}
      <div className="space-y-2.5" data-testid="opportunities-list">
        {filteredOpportunities.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/80 bg-card p-6 text-center space-y-2">
            <span className="text-3xl block">🔍</span>
            <h3 className="text-sm font-bold text-foreground">No matching opportunities found</h3>
            <p className="text-xs text-muted-foreground">Try clearing your search or selecting &quot;All&quot;.</p>
          </div>
        ) : (
          filteredOpportunities.map((opp) => (
            <div
              key={opp.id}
              onClick={() => setSelectedOpportunity(opp)}
              className="rounded-2xl border border-border/80 bg-card p-3 sm:p-3.5 flex items-center justify-between gap-3 shadow-2xs hover:border-primary/50 hover:bg-muted/20 transition cursor-pointer group"
              data-testid={`opportunity-card-${opp.id}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${opp.thumbnailBg} group-hover:scale-105 transition`}
                >
                  <Icon name={opp.thumbnailIcon} size={24} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-bold text-foreground truncate">
                    {opp.title}
                  </h3>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {opp.scopeType} · {opp.location} · {opp.suppliersCount} suppliers
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.2 text-[9px] font-bold">
                      Open · {opp.daysLeft} days left
                    </span>
                  </div>
                </div>
              </div>
              <Icon
                name="chevron_right"
                size={20}
                className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition shrink-0"
              />
            </div>
          ))
        )}
      </div>

      {/* Screen 10: OPPORTUNITY DETAILS BottomSheet */}
      {selectedOpportunity && (
        <BottomSheet
          isOpen={Boolean(selectedOpportunity)}
          onClose={() => setSelectedOpportunity(null)}
          title="OPPORTUNITY DETAILS"
          subtitle={selectedOpportunity.title}
          footer={
            <div className="flex items-center gap-2 w-full">
              <button
                type="button"
                onClick={() => setSelectedOpportunity(null)}
                className="min-h-[46px] flex-1 rounded-xl border border-border bg-card py-2 text-xs font-bold text-center text-foreground hover:bg-muted transition cursor-pointer"
              >
                Close
              </button>
              <Link
                to={`/requirements/new?category=${encodeURIComponent(selectedOpportunity.category)}`}
                onClick={() => setSelectedOpportunity(null)}
                className="min-h-[46px] flex-1 rounded-xl bg-primary text-primary-foreground py-2 text-xs font-extrabold text-center hover:bg-primary/90 flex items-center justify-center transition shadow-2xs"
              >
                Submit RFQ
              </Link>
            </div>
          }
        >
          <div className="space-y-3.5 text-xs">
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-muted/40 border border-border/60">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${selectedOpportunity.thumbnailBg}`}>
                <Icon name={selectedOpportunity.thumbnailIcon} size={24} />
              </div>
              <div>
                <h4 className="font-bold text-sm text-foreground">{selectedOpportunity.title}</h4>
                <p className="text-[11px] text-muted-foreground">
                  {selectedOpportunity.scopeType} supplies · {selectedOpportunity.location} · {selectedOpportunity.suppliersCount} suppliers
                </p>
                <span className="inline-block mt-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                  Closes in {selectedOpportunity.daysLeft} days
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-card border border-border/80">
                <span className="text-[10px] text-muted-foreground uppercase font-black block tracking-wider">
                  Estimated Value
                </span>
                <span className="font-extrabold text-xs text-foreground mt-0.5 block">
                  {selectedOpportunity.estimatedValue}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-card border border-border/80">
                <span className="text-[10px] text-muted-foreground uppercase font-black block tracking-wider">
                  Quantity
                </span>
                <span className="font-extrabold text-xs text-foreground mt-0.5 block">
                  {selectedOpportunity.quantity}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-card border border-border/80">
              <span className="text-[10px] text-muted-foreground uppercase font-black block tracking-wider">
                Expected Timeline
              </span>
              <span className="font-extrabold text-xs text-foreground mt-0.5 block">
                {selectedOpportunity.timeline}
              </span>
            </div>
          </div>
        </BottomSheet>
      )}

      {/* Quick Capability Editor Modal */}
      <SupplierCapabilityModal
        open={isCapabilityModalOpen}
        onClose={() => setIsCapabilityModalOpen(false)}
      />
    </div>
  );
}
