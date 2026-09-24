import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { VoiceRequirementDictation } from '@/features/intake/components/VoiceRequirementDictation';
import { REQUIREMENT_PROMPT_KEY } from '@/features/site/components/RequirementPrompt';

interface BuyerSourcingCockpitCardProps {
  onExpressSubmit?: (query: string) => void;
  activeRfqsCount?: number;
  pendingVotesCount?: number;
  settledOrdersCount?: number;
  isExpressSubmitting?: boolean;
  organizationName?: string;
  organizationDetails?: string;
  activeFilter?: 'all' | 'action' | 'active' | 'settled';
  onFilterChange?: (filter: 'all' | 'action' | 'active' | 'settled') => void;
}

export function BuyerSourcingCockpitCard({
  onExpressSubmit,
  activeRfqsCount = 0,
  pendingVotesCount = 0,
  settledOrdersCount = 0,
  isExpressSubmitting = false,
  organizationName,
  organizationDetails,
  activeFilter = 'all',
  onFilterChange,
}: BuyerSourcingCockpitCardProps) {
  const navigate = useNavigate();
  const [promptText, setPromptText] = useState('');

  const handleStartRequirement = (customQuery?: string) => {
    const textToUse = (customQuery ?? promptText).trim();
    if (textToUse) {
      sessionStorage.setItem(REQUIREMENT_PROMPT_KEY, textToUse);
      navigate(`/requirements/new?q=${encodeURIComponent(textToUse)}`);
    } else {
      navigate('/requirements/new');
    }
  };

  const handleExpressTrigger = (customQuery?: string) => {
    const textToUse = (customQuery ?? promptText).trim();
    if (onExpressSubmit && textToUse) {
      onExpressSubmit(textToUse);
    } else {
      handleStartRequirement(textToUse);
    }
  };

  const handleVoiceTranscript = (dictated: string) => {
    setPromptText(dictated);
    if (dictated.trim().length > 8) {
      handleExpressTrigger(dictated);
    }
  };

  return (
    <section
      className="rounded-2xl border border-border/80 bg-card p-3.5 sm:p-4 shadow-sm space-y-3.5"
      data-testid="buyer-sourcing-cockpit-card"
    >
      {/* 1. Org Header Pill (Screen 06) */}
      <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
            👤
          </div>
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-bold text-foreground truncate">
              {organizationName || 'Personal Workspace'}
            </h4>
            <span className="text-[10px] text-muted-foreground block truncate">
              {organizationDetails || 'Independent Buyer · Personal Procurement'}
            </span>
          </div>
        </div>
        <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-bold shrink-0">
          🟢 Verified
        </span>
      </div>

      {/* 2. High-Impact Sourcing Prompt Card (Screen 06) */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-card to-primary/5 border border-primary/20 p-3 sm:p-3.5 space-y-2.5 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
            <span>⚡</span> What do you need to buy?
          </span>
          <span className="text-[9px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
            1-Tap Sourcing
          </span>
        </div>

        <div className="relative flex items-center">
          <input
            type="text"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleExpressTrigger();
              }
            }}
            placeholder="10 HP Submersible Borewell Motor Rewind..."
            className="w-full min-h-[48px] rounded-xl border border-primary/30 bg-card px-3.5 py-2 text-xs font-medium text-foreground placeholder:text-muted-foreground pr-10 shadow-2xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
            <VoiceRequirementDictation
              compact
              onTranscript={handleVoiceTranscript}
            />
          </div>
        </div>

        {/* 1-Tap Category Pills */}
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {[
            { label: '⚡ Motor Rewind', query: 'Require 10 HP submersible borewell motor rewinding in Bengaluru within 5 days with 6 months warranty' },
            { label: '🏊 Pool Overhaul', query: 'Swimming pool filtration overhaul and pump maintenance in Bengaluru' },
            { label: '⚙️ CNC Machining', query: 'Precision CNC machining for stainless steel shafts tolerance 0.02mm' },
            { label: '🏗️ Waterproofing', query: 'Terrace elastomeric membrane waterproofing 4500 sq ft in Bengaluru with 5-year leak warranty' },
          ].map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => {
                setPromptText(chip.query);
                handleExpressTrigger(chip.query);
              }}
              className="rounded-lg bg-card border border-border/80 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-primary hover:border-primary/50 transition cursor-pointer"
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. 3-Pill Glance Bar (Screen 06) */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => onFilterChange?.(activeFilter === 'active' ? 'all' : 'active')}
          className={`rounded-xl border p-2 text-center transition cursor-pointer ${
            activeFilter === 'active'
              ? 'bg-primary/20 border-primary ring-2 ring-primary/40'
              : 'border-primary/30 bg-primary/10 hover:bg-primary/15'
          }`}
        >
          <span className="block text-sm sm:text-base font-black text-primary">{activeRfqsCount}</span>
          <span className="text-[10px] font-bold text-foreground">🟢 Active</span>
        </button>

        <button
          type="button"
          onClick={() => onFilterChange?.(activeFilter === 'action' ? 'all' : 'action')}
          className={`rounded-xl border p-2 text-center transition cursor-pointer ${
            activeFilter === 'action'
              ? 'bg-amber-500/20 border-amber-500 ring-2 ring-amber-500/40'
              : 'border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15'
          }`}
        >
          <span className="block text-sm sm:text-base font-black text-amber-700 dark:text-amber-400">{pendingVotesCount}</span>
          <span className="text-[10px] font-bold text-foreground">🟡 Action</span>
        </button>

        <button
          type="button"
          onClick={() => onFilterChange?.(activeFilter === 'settled' ? 'all' : 'settled')}
          className={`rounded-xl border p-2 text-center transition cursor-pointer ${
            activeFilter === 'settled'
              ? 'bg-muted border-foreground/30 ring-2 ring-muted-foreground/40'
              : 'border-muted bg-muted/40 hover:bg-muted/60'
          }`}
        >
          <span className="block text-sm sm:text-base font-black text-muted-foreground">{settledOrdersCount}</span>
          <span className="text-[10px] font-bold text-foreground">⚪ Settled</span>
        </button>
      </div>
    </section>
  );
}
