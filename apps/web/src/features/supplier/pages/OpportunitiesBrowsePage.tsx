import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/features/auth';

export interface OpportunityItem {
  id: string;
  title: string;
  clientName: string;
  category: 'Building' | 'Electrical' | 'IT & Tech' | 'Painting' | 'Plumbing' | 'Cleaning';
  daysLeft: number;
  isOpen: boolean;
  estimatedValue?: string;
  location?: string;
  thumbnailIcon: string;
  thumbnailBg: string;
}

export const CANONICAL_OPPORTUNITIES: OpportunityItem[] = [
  {
    id: 'opp-plumbing-01',
    title: 'Plumbing Services',
    clientName: 'RWA - Sunrise Apartments',
    category: 'Building',
    daysLeft: 3,
    isOpen: true,
    estimatedValue: '₹10,000 - ₹25,000',
    location: 'Sunrise Apartments, Block A',
    thumbnailIcon: 'plumbing',
    thumbnailBg: 'bg-blue-500/10 text-blue-600',
  },
  {
    id: 'opp-electrical-02',
    title: 'Electrical Repair',
    clientName: 'Community Hall',
    category: 'Electrical',
    daysLeft: 5,
    isOpen: true,
    estimatedValue: '₹15,000 - ₹35,000',
    location: 'Green Glen Layout, Outer Ring Road',
    thumbnailIcon: 'electrical_services',
    thumbnailBg: 'bg-amber-500/10 text-amber-600',
  },
  {
    id: 'opp-painting-03',
    title: 'Painting Work',
    clientName: 'RWA - Green Valley',
    category: 'Building',
    daysLeft: 7,
    isOpen: true,
    estimatedValue: '₹40,000 - ₹80,000',
    location: 'Green Valley Enclave, Phase 2',
    thumbnailIcon: 'format_paint',
    thumbnailBg: 'bg-emerald-500/10 text-emerald-600',
  },
  {
    id: 'opp-cleaning-04',
    title: 'Cleaning Services',
    clientName: 'Office Complex',
    category: 'Building',
    daysLeft: 5,
    isOpen: true,
    estimatedValue: '₹20,000 - ₹45,000',
    location: 'Tech Park Zone, Whitefield',
    thumbnailIcon: 'cleaning_services',
    thumbnailBg: 'bg-purple-500/10 text-purple-600',
  },
  {
    id: 'opp-cctv-05',
    title: 'CCTV & Network Setup',
    clientName: 'RWA - Palm Meadows',
    category: 'IT & Tech',
    daysLeft: 4,
    isOpen: true,
    estimatedValue: '₹30,000 - ₹60,000',
    location: 'Palm Meadows, Tower C',
    thumbnailIcon: 'videocam',
    thumbnailBg: 'bg-indigo-500/10 text-indigo-600',
  },
];

export function OpportunitiesBrowsePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'All' | 'Building' | 'Electrical' | 'IT & Tech'>('All');

  const filteredOpportunities = useMemo(() => {
    return CANONICAL_OPPORTUNITIES.filter((opp) => {
      const matchesSearch =
        opp.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        opp.clientName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        selectedCategory === 'All' || opp.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  return (
    <div
      className="p-3 sm:p-4 max-w-2xl mx-auto w-full space-y-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] overflow-x-hidden"
      data-testid="screen-4-browse-opportunities"
    >
      {/* 1. Header matching Infographic Screen 4 */}
      <header className="flex items-center gap-3 border-b border-border/60 pb-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl border border-border/80 bg-card hover:bg-muted text-foreground flex items-center justify-center transition cursor-pointer"
          aria-label="Back"
        >
          <Icon name="arrow_back" size={20} />
        </button>
        <h1 className="text-base sm:text-lg font-black text-foreground">
          Find Opportunities
        </h1>
      </header>

      {/* 2. Search Field matching Infographic Screen 4 */}
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
          placeholder="Search (e.g. plumbing, electrical...)"
          className="w-full min-h-[48px] rounded-xl border border-border/80 bg-card pl-10 pr-4 text-xs font-medium text-foreground placeholder:text-muted-foreground shadow-2xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition"
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

      {/* 3. Category Filter Chips matching Infographic Screen 4 */}
      <div
        className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5"
        role="tablist"
        aria-label="Category Filters"
      >
        {(['All', 'Building', 'Electrical', 'IT & Tech'] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={selectedCategory === cat}
            onClick={() => setSelectedCategory(cat)}
            className={`min-h-[38px] px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition cursor-pointer ${
              selectedCategory === cat
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-card border border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 4. Opportunity Cards List matching Infographic Screen 4 */}
      <div className="space-y-2.5" data-testid="opportunities-list">
        {filteredOpportunities.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/80 bg-card p-6 text-center space-y-2">
            <span className="text-3xl block">🔍</span>
            <h3 className="text-sm font-bold text-foreground">No matching opportunities found</h3>
            <p className="text-xs text-muted-foreground">Try clearing your search or selecting &quot;All&quot; categories.</p>
          </div>
        ) : (
          filteredOpportunities.map((opp) => (
            <Link
              key={opp.id}
              to={`/supplier/rfq/${opp.id}`}
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
                    {opp.clientName}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.2 text-[9px] font-bold">
                      Open
                    </span>
                    <span className="text-[10px] text-muted-foreground font-semibold">
                      · {opp.daysLeft} days left
                    </span>
                  </div>
                </div>
              </div>
              <Icon
                name="chevron_right"
                size={20}
                className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition shrink-0"
              />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
