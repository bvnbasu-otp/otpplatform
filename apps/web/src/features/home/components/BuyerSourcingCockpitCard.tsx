import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
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
  orgRole?: string | null;
  activeFilter?: 'action' | 'active' | 'settled' | null;
  onFilterChange?: (filter: 'action' | 'active' | 'settled' | null) => void;
}

export function BuyerSourcingCockpitCard({
  onExpressSubmit,
  activeRfqsCount = 0,
  pendingVotesCount = 0,
  settledOrdersCount = 0,
  isExpressSubmitting = false,
  organizationName,
  organizationDetails,
  orgRole,
  activeFilter = null,
  onFilterChange,
}: BuyerSourcingCockpitCardProps) {
  const navigate = useNavigate();
  const [promptText, setPromptText] = useState('');

  const isEstateManager = orgRole === 'ESTATE_MANAGER';
  const isPresident = orgRole === 'PRESIDENT';
  const isSecretary = orgRole === 'SECRETARY';
  const isTreasurer = orgRole === 'TREASURER';
  const isPrimary = orgRole === 'PRIMARY' || orgRole === 'OWNER' || orgRole === 'DIRECTOR';
  const isMsmeManager = orgRole === 'MANAGER' || orgRole === 'OPERATIONS_MANAGER' || orgRole === 'PROCUREMENT_LEAD';
  const isDelegate = orgRole === 'DELEGATE';
  const isMember = orgRole === 'MEMBER' || orgRole === 'BUYER';

  const roleLabel = isPresident
    ? 'President'
    : isSecretary
    ? 'Secretary'
    : isTreasurer
    ? 'Treasurer'
    : isEstateManager
    ? 'Estate Manager'
    : isPrimary
    ? 'Admin'
    : isMsmeManager
    ? 'Operations Manager'
    : isDelegate
    ? 'Delegate'
    : isMember
    ? 'Team Member'
    : orgRole
    ? `Officer (${orgRole})`
    : 'Personal Account';

  const handleStartRequirement = (customQuery?: string) => {
    const textToUse = (customQuery ?? promptText).trim();
    if (textToUse) {
      sessionStorage.setItem(REQUIREMENT_PROMPT_KEY, textToUse);
      navigate(`/intake?q=${encodeURIComponent(textToUse)}`);
    } else {
      navigate('/intake');
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
              {organizationDetails || roleLabel}
            </span>
          </div>
        </div>
        <span className="rounded-full bg-muted text-muted-foreground border border-border px-2 py-0.5 text-[9px] font-bold shrink-0">
          Buyer workspace
        </span>
      </div>

      {isEstateManager && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/70 dark:bg-blue-950/40 p-2.5 text-xs flex items-center justify-between text-blue-950 dark:text-blue-200">
          <div className="flex items-center gap-1.5">
            <span>🏢</span>
            <span className="font-semibold">Estate Manager Mode: Operational drafting &amp; inspection enabled.</span>
          </div>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-200 dark:bg-blue-900">
            Review &amp; Inspect
          </span>
        </div>
      )}

      {/* 2. High-Impact Sourcing Prompt Card (Screen 06) */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-card to-primary/5 border border-primary/20 p-3 sm:p-3.5 space-y-2.5 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-xs sm:text-sm font-extrabold text-foreground flex items-center gap-1.5">
              <span>✨</span> What do you need today?
            </span>
            <p className="text-[10px] text-muted-foreground">Ask in plain words · Get verified local quotes</p>
          </div>
          <span className="text-[9px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
            Fast Quote
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
            placeholder="e.g. RO water servicing, painting, electrical repair..."
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
            { icon: 'build' as const, label: 'Home Repairs', query: 'Home repair and maintenance services in Bengaluru' },
            { icon: 'electrical_services' as const, label: 'Electrical & Plumbing', query: 'Electrical wiring and plumbing repairs in Bengaluru' },
            { icon: 'water_drop' as const, label: 'Drinking Water', query: 'Drinking water supply and RO purification servicing in Bengaluru' },
            { icon: 'cleaning_services' as const, label: 'Cleaning & Maintenance', query: 'Facility cleaning, housekeeping and pest control in Bengaluru' },
            { icon: 'chair' as const, label: 'Office Furniture', query: 'Ergonomic office chairs and modular workstations' },
            { icon: 'inventory_2' as const, label: 'Office Supplies', query: 'Essential office stationery and printing supplies' },
          ].map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => {
                setPromptText(chip.query);
                handleExpressTrigger(chip.query);
              }}
              className="inline-flex items-center rounded-lg bg-card border border-border/80 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-primary hover:border-primary/50 transition cursor-pointer"
            >
              <Icon name={chip.icon} size={14} className="mr-1 text-primary shrink-0" />
              <span>{chip.label}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <Link
            to="/intake"
            data-testid="cockpit-open-intake-wizard"
            className="min-h-[44px] flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 transition mobile-touch-target focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Start New Request →
          </Link>
          <button
            type="button"
            onClick={() => handleExpressTrigger()}
            disabled={isExpressSubmitting || !promptText.trim()}
            className="min-h-[44px] flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-card text-xs font-bold text-foreground hover:bg-muted transition disabled:opacity-50 mobile-touch-target cursor-pointer"
          >
            {isExpressSubmitting ? 'Sending…' : 'Get Quotes →'}
          </button>
        </div>
      </div>

      {/* 3. 3-Pill Glance Bar (Screen 06) */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          aria-expanded={activeFilter === 'active'}
          aria-controls="buyer-count-active"
          onClick={() => onFilterChange?.(activeFilter === 'active' ? null : 'active')}
          className={`rounded-xl border p-2 text-center transition cursor-pointer ${
            activeFilter === 'active'
              ? 'bg-primary/20 border-primary ring-2 ring-primary/40'
              : 'border-primary/30 bg-primary/10 hover:bg-primary/15'
          }`}
        >
          <span className="block text-sm sm:text-base font-black text-primary">{activeRfqsCount}</span>
          <span className="text-[10px] font-bold text-foreground">🟢 Open</span>
        </button>

        <button
          type="button"
          aria-expanded={activeFilter === 'action'}
          aria-controls="buyer-count-action"
          onClick={() => onFilterChange?.(activeFilter === 'action' ? null : 'action')}
          className={`rounded-xl border p-2 text-center transition cursor-pointer ${
            activeFilter === 'action'
              ? 'bg-amber-500/20 border-amber-500 ring-2 ring-amber-500/40'
              : 'border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15'
          }`}
        >
          <span className="block text-sm sm:text-base font-black text-amber-700 dark:text-amber-400">{pendingVotesCount}</span>
          <span className="text-[10px] font-bold text-foreground">🟡 Needs You</span>
        </button>

        <button
          type="button"
          aria-expanded={activeFilter === 'settled'}
          aria-controls="buyer-count-settled"
          onClick={() => onFilterChange?.(activeFilter === 'settled' ? null : 'settled')}
          className={`rounded-xl border p-2 text-center transition cursor-pointer ${
            activeFilter === 'settled'
              ? 'bg-muted border-foreground/30 ring-2 ring-muted-foreground/40'
              : 'border-muted bg-muted/40 hover:bg-muted/60'
          }`}
        >
          <span className="block text-sm sm:text-base font-black text-muted-foreground">{settledOrdersCount}</span>
          <span className="text-[10px] font-bold text-foreground">⚪ Completed</span>
        </button>
      </div>
    </section>
  );
}
