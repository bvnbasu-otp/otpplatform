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
}

const TEMPLATE_CHIPS = [
  {
    icon: '⚡',
    label: '10 HP Borewell Motor',
    city: 'Bengaluru',
    query: 'Require 10 HP submersible borewell motor rewinding in Bengaluru within 5 days with 6 months warranty',
  },
  {
    icon: '🎨',
    label: '5000 Sq Ft Painting',
    city: 'Chennai',
    query: 'Exterior acrylic emulsion painting 5000 sq ft for residential society in Chennai within 14 days',
  },
  {
    icon: '⚙️',
    label: 'DG Set AMC 125 kVA',
    city: 'Coimbatore',
    query: 'Annual maintenance contract AMC for 125 kVA Cummins diesel generator in Coimbatore with quarterly servicing',
  },
  {
    icon: '📹',
    label: 'CCTV 32 IP Cam',
    city: 'Pune',
    query: 'Supply and installation of 32 IP CCTV surveillance cameras with 30 days NVR backup in Pune',
  },
  {
    icon: '🧹',
    label: 'Commercial Deep Cleaning',
    city: 'Mumbai',
    query: 'Commercial building deep cleaning and floor scrubbing 8000 sq ft in Mumbai within 3 days',
  },
  {
    icon: '🏗️',
    label: 'Terrace Waterproofing',
    city: 'Hyderabad',
    query: 'Terrace elastomeric membrane waterproofing 4500 sq ft in Hyderabad with 5-year leak warranty',
  },
];

const COMMERCIAL_STAGES = [
  { num: '01', name: 'Intake & Specs', icon: '🎙️' },
  { num: '02', name: 'Supplier Radar', icon: '📡' },
  { num: '03', name: 'Sealed Matrix', icon: '⚖️' },
  { num: '04', name: 'Committee Vote', icon: '🗳️' },
  { num: '05', name: 'Award Lock', icon: '🏆' },
  { num: '06', name: 'PO & Ledger', icon: '📦' },
];

export function BuyerSourcingCockpitCard({
  onExpressSubmit,
  activeRfqsCount = 0,
  pendingVotesCount = 0,
  settledOrdersCount = 0,
  isExpressSubmitting = false,
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
      className="rounded-2xl border-2 border-primary/30 bg-gradient-to-b from-card via-card to-primary/5 p-4 sm:p-5 shadow-sm space-y-4"
      data-testid="buyer-sourcing-cockpit-card"
    >
      {/* Top Cockpit Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary text-base font-bold shadow-2xs">
            ⚡
          </span>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-sm sm:text-base font-black text-foreground tracking-tight">
                Mobile Sourcing Cockpit
              </h2>
              <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[10px] font-extrabold shrink-0">
                Live Radar &amp; Voice Intake
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Launch competitive sealed RFQs in 10 seconds via voice or template chips
            </p>
          </div>
        </div>

        {/* Identity Protected Sourcing Badge */}
        <span className="inline-flex items-center gap-1 rounded-full bg-muted/80 border border-border/80 px-2.5 py-1 text-[10px] font-bold text-foreground shrink-0 shadow-2xs">
          <span>🔒</span>
          <span>Identity-Protected Sourcing</span>
        </span>
      </div>

      {/* Voice & Text Requirement Launch Bar */}
      <div className="space-y-2">
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
            placeholder="What do you need? e.g. 10 HP borewell motor rewinding in Bengaluru..."
            className="w-full min-h-[50px] rounded-xl border-2 border-primary/25 bg-background px-3.5 py-2.5 pr-14 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-inner transition"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <VoiceRequirementDictation
              compact
              onTranscript={handleVoiceTranscript}
            />
          </div>
        </div>

        {/* Sourcing Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => handleExpressTrigger()}
            disabled={isExpressSubmitting}
            className="min-h-[48px] flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 text-xs font-black shadow-sm active:scale-98 transition shadow-primary/20 cursor-pointer disabled:opacity-50"
          >
            <span>⚡</span>
            <span>{isExpressSubmitting ? 'Generating Quotes…' : '1-Tap Express Sourcing'}</span>
            <span>→</span>
          </button>

          <button
            type="button"
            onClick={() => handleStartRequirement()}
            className="min-h-[48px] inline-flex items-center justify-center gap-1 rounded-xl border border-border/80 bg-card hover:bg-muted text-foreground px-4 py-2.5 text-xs font-bold shadow-2xs active:scale-98 transition shrink-0 cursor-pointer"
          >
            <span>📋 Guided Wizard</span>
          </button>
        </div>
      </div>

      {/* 1-Tap Template Chips Row */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground font-semibold">
          <span>⚡ Popular 1-Tap Sourcing Templates:</span>
          <span className="text-[10px]">Tap to Auto-Fill</span>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none snap-x">
          {TEMPLATE_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => {
                setPromptText(chip.query);
                handleExpressTrigger(chip.query);
              }}
              className="snap-start shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-card border border-border/80 px-3 py-1.5 text-xs font-bold text-foreground hover:border-primary/50 hover:bg-primary/5 active:scale-95 transition shadow-2xs cursor-pointer"
            >
              <span>{chip.icon}</span>
              <span>{chip.label}</span>
              <span className="text-[10px] text-muted-foreground font-medium bg-muted/50 px-1 rounded">
                {chip.city}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Glance KPI Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-border/60">
        <div className="rounded-xl bg-card border border-border/80 p-2.5 text-center shadow-2xs">
          <span className="text-[9px] uppercase font-bold text-muted-foreground block">
            Active RFQs
          </span>
          <span className="text-base sm:text-lg font-black text-primary block mt-0.5">
            {activeRfqsCount}
          </span>
          <span className="text-[9px] text-muted-foreground block">In Market Radar</span>
        </div>

        <div className="rounded-xl bg-card border border-border/80 p-2.5 text-center shadow-2xs">
          <span className="text-[9px] uppercase font-bold text-amber-700 dark:text-amber-400 block">
            Pending Votes
          </span>
          <span className="text-base sm:text-lg font-black text-amber-700 dark:text-amber-400 block mt-0.5">
            {pendingVotesCount}
          </span>
          <span className="text-[9px] text-muted-foreground block">Committee Quorum</span>
        </div>

        <div className="rounded-xl bg-card border border-border/80 p-2.5 text-center shadow-2xs">
          <span className="text-[9px] uppercase font-bold text-emerald-700 dark:text-emerald-400 block">
            Completed Orders
          </span>
          <span className="text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-400 block mt-0.5">
            {settledOrdersCount}
          </span>
          <span className="text-[9px] text-muted-foreground block">Settled via Ledger</span>
        </div>

        <div className="rounded-xl bg-card border border-border/80 p-2.5 text-center shadow-2xs">
          <span className="text-[9px] uppercase font-bold text-muted-foreground block">
            Quoting TAT
          </span>
          <span className="text-base sm:text-lg font-black text-foreground block mt-0.5">
            &lt; 30 Mins
          </span>
          <span className="text-[9px] text-muted-foreground block">Sealed Multi-Channel</span>
        </div>
      </div>

      {/* Canonical 6-Stage Commercial Workflow Tracker */}
      <div className="pt-1 border-t border-border/60">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-2">
          <span>6-Stage Commercial Procurement Lifecycle:</span>
          <Link to="/faqs#workflow" className="text-primary hover:underline">
            Workflow Guide →
          </Link>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-center">
          {COMMERCIAL_STAGES.map((stage) => (
            <div
              key={stage.num}
              className="rounded-lg border border-border/60 bg-muted/20 p-1.5 space-y-0.5"
            >
              <div className="text-xs">{stage.icon}</div>
              <div className="font-mono text-[9px] font-extrabold text-muted-foreground">
                {stage.num}
              </div>
              <div className="text-[10px] font-bold text-foreground truncate">
                {stage.name}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
