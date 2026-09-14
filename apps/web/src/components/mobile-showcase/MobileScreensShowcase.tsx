import React, { useState } from 'react';
import { MobilePhoneFrame } from './MobilePhoneFrame';

export interface MobileScreenDef {
  id: string;
  stepNumber: string;
  tabLabel: string;
  icon: string;
  title: string;
  tagline: string;
  badge: string;
  badgeColor: string;
  description: string;
  component: React.ReactNode;
}

export function MobileScreensShowcase() {
  const [activeScreenIndex, setActiveScreenIndex] = useState(0);
  const [activePhoneTab, setActivePhoneTab] = useState<'home' | 'orders' | 'new' | 'audit' | 'profile'>('home');

  const screens: MobileScreenDef[] = [
    {
      id: 'home',
      stepNumber: '01',
      tabLabel: 'Buyer Cockpit',
      icon: '🏢',
      title: 'Mobile Sourcing Cockpit',
      tagline: '1-Tap requirement launch, voice search, and real-time order pulse.',
      badge: 'Step 1 · Home Cockpit',
      badgeColor: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-300',
      description: 'Zero desktop complexity. Post a procurement need in 10 seconds via voice or template chips.',
      component: <ScreenHomeCockpit onNewRequirement={() => setActiveScreenIndex(1)} />,
    },
    {
      id: 'intake',
      stepNumber: '02',
      tabLabel: 'Voice Intake',
      icon: '🎙️',
      title: 'Conversational Intake Wizard',
      tagline: 'Regional voice dictation with automatic spec parsing and 1-tap city pills.',
      badge: 'Step 2 · Instant Intake',
      badgeColor: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-300',
      description: 'Supports Tamil, Hindi, Kannada, and English. Extracts quantity, deadline, and technical SLAs automatically.',
      component: <ScreenIntakeWizard onNext={() => setActiveScreenIndex(2)} />,
    },
    {
      id: 'radar',
      stepNumber: '03',
      tabLabel: 'Supplier Radar',
      icon: '📡',
      title: 'Multi-Channel Supplier Radar',
      tagline: 'Broadcasts sealed RFQ invitations across WhatsApp, ONDC, and SMS.',
      badge: 'Step 3 · Multi-Channel Reach',
      badgeColor: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300',
      description: 'Reaches local verified vendors without forcing them to create complicated portal accounts.',
      component: <ScreenSupplierRadar onNext={() => setActiveScreenIndex(3)} />,
    },
    {
      id: 'quote',
      stepNumber: '04',
      tabLabel: 'Supplier Quoting',
      icon: '💬',
      title: '1-Tap Supplier Rupee Quoting',
      tagline: 'WhatsApp & mobile-optimized 3-field numeric quote sheet with instant GST.',
      badge: 'Step 4 · Sealed Quoting',
      badgeColor: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300',
      description: 'Suppliers quote in 15 seconds from their phones. All quotes remain cryptographically sealed.',
      component: <ScreenSupplierQuoting onNext={() => setActiveScreenIndex(4)} />,
    },
    {
      id: 'comparison',
      stepNumber: '05',
      tabLabel: 'Sealed Matrix',
      icon: '⚖️',
      title: '4-Pillar Sealed Comparison Matrix',
      tagline: 'Zero-bias cards comparing ₹ Price, Delivery TAT, Warranty, and Merit Score.',
      badge: 'Step 5 · Zero-Bias Matrix',
      badgeColor: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300',
      description: 'Vendor names are masked as Supplier A7K3, B2M9. Decisions are made 100% on commercial & technical merit.',
      component: <ScreenComparisonMatrix onNext={() => setActiveScreenIndex(5)} />,
    },
    {
      id: 'voting',
      stepNumber: '06',
      tabLabel: 'Committee Vote',
      icon: '🗳️',
      title: '1-Tap Committee Decision Room',
      tagline: 'Preset rationale chips, live quorum meters, and fast-track solo approvals.',
      badge: 'Step 6 · Governance',
      badgeColor: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-300',
      description: 'Eliminates endless WhatsApp committee arguments with transparent 1-tap recorded justifications.',
      component: <ScreenCommitteeVoting onNext={() => setActiveScreenIndex(6)} />,
    },
    {
      id: 'fulfillment',
      stepNumber: '07',
      tabLabel: 'Digital PO & Tracking',
      icon: '📦',
      title: 'Winner Unmask & Live Tracking',
      tagline: 'Instant GST Purchase Order execution and Swiggy-style milestone tracker.',
      badge: 'Step 7 · Procure-to-Pay',
      badgeColor: 'bg-emerald-600/10 text-emerald-800 dark:text-emerald-300 border-emerald-400',
      description: 'Unmask verified GST credentials, share PO via WhatsApp PDF, and track pickup to invoice settlement.',
      component: <ScreenOrderFulfillment onRestart={() => setActiveScreenIndex(7)} />,
    },
    {
      id: 'notifications',
      stepNumber: '14',
      tabLabel: 'Activity & Audit',
      icon: '🔔',
      title: 'Activity Feed & Audit Ledger',
      tagline: 'Real-time pipeline changes with 1-tap deep links and cryptographic audit proofs.',
      badge: 'Screen 14 · Activity & Audit',
      badgeColor: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-300',
      description: 'Unified segmented feed tracking quotes, committee votes, and immutable SHA-256 state transitions.',
      component: <ScreenActivityNotifications onNext={() => setActiveScreenIndex(8)} />,
    },
    {
      id: 'profile',
      stepNumber: '15',
      tabLabel: 'Profile & Settings',
      icon: '👤',
      title: 'User Profile & Team Governance',
      tagline: 'Verified WhatsApp/Email identity, role governance, and appearance customization.',
      badge: 'Screen 15 · Profile & Workspace',
      badgeColor: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-300',
      description: 'Manage workspace identity, team roles (Admin, Approver, Viewer), and multi-channel notification toggles.',
      component: <ScreenProfileSettings onRestart={() => setActiveScreenIndex(0)} />,
    },
  ];

  const currentScreen: MobileScreenDef = screens[activeScreenIndex] ?? screens[0]!;
  const nextScreen: MobileScreenDef = screens[(activeScreenIndex + 1) % screens.length] ?? screens[0]!;

  return (
    <section className="py-12 sm:py-16 bg-gradient-to-b from-muted/30 via-background to-muted/20 border-y border-border/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-3">
            <span>📱</span>
            <span>Mobile-First Procurement Cockpit</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground tracking-tight">
            Built for Smartphones. Zero Squeezed Desktop.
          </h2>
          <p className="mt-2.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Experience how Indian building committees, MSMEs, and facility managers execute sourcing from their smartphones—via voice, WhatsApp, and 1-tap thumb interactions.
          </p>

          {/* Interactive Screen Selector Tabs (PhonePe / Swiggy Carousel Pills) */}
          <div className="mt-6 flex items-center justify-start sm:justify-center gap-2 overflow-x-auto pb-2 scrollbar-none px-2">
            {screens.map((screen, idx) => {
              const isActive = idx === activeScreenIndex;
              return (
                <button
                  key={screen.id}
                  type="button"
                  onClick={() => setActiveScreenIndex(idx)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shadow-2xs ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm scale-105 ring-2 ring-primary/40'
                      : 'bg-card text-muted-foreground hover:bg-muted border border-border/70 hover:text-foreground'
                  }`}
                >
                  <span className="text-sm">{screen.icon}</span>
                  <span>{screen.tabLabel}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'}`}>
                    {screen.stepNumber}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Interactive Presentation: Left Overview / Right Phone Mockup */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Screen Explanation & Interactive Walkthrough Points */}
          <div className="lg:col-span-5 space-y-6 text-left order-2 lg:order-1">
            <div className="space-y-2">
              <span className={`inline-block rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${currentScreen.badgeColor}`}>
                {currentScreen.badge}
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                {currentScreen.title}
              </h3>
              <p className="text-sm font-semibold text-primary">
                {currentScreen.tagline}
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pt-1">
                {currentScreen.description}
              </p>
            </div>

            {/* Feature Highlights for Current Screen */}
            <div className="rounded-2xl border border-border/80 bg-card/60 backdrop-blur-xs p-4 space-y-3 shadow-xs">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                ✨ Key Mobile Ergonomics:
              </h4>
              <ul className="space-y-2 text-xs text-foreground/90">
                {activeScreenIndex === 0 && (
                  <>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>10-Second Intake:</strong> 1-Tap popular tiles like 10HP Motor Rewind, CNC Shafts, and Waterproofing.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>Glance Bar Filter:</strong> Filter active orders with a single thumb tap (Active, Action, Settled).</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>Zero Desktop Clutter:</strong> Clean vertical cards with high-contrast primary CTA buttons.</span>
                    </li>
                  </>
                )}
                {activeScreenIndex === 1 && (
                  <>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>Regional Voice Dictation:</strong> Speak naturally in Tamil, Hindi, or English.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>1-Tap City Selection:</strong> Instant pills for Bengaluru, Chennai, Coimbatore, Hyderabad.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>Smart Weight Defaults:</strong> Eliminates tedious multi-slider math on mobile screens.</span>
                    </li>
                  </>
                )}
                {activeScreenIndex === 2 && (
                  <>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>WhatsApp Direct Channel:</strong> Dispatches quotes to local suppliers on WhatsApp.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>ONDC Network Gateway:</strong> Open network interoperability without app install lock-in.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>Regional Radar:</strong> Scans verified suppliers within 15 km of delivery site.</span>
                    </li>
                  </>
                )}
                {activeScreenIndex === 3 && (
                  <>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>3-Field Numeric Flow:</strong> Quoting takes under 15 seconds on a smartphone keyboard.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>Instant GST Calculator:</strong> 1-Tap chips for +0%, +18%, or +28% GST calculations.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>Zero Portal Login Required:</strong> Quoting link sent directly to verified phone number.</span>
                    </li>
                  </>
                )}
                {activeScreenIndex === 4 && (
                  <>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>4-Pillar Visual Metric Cards:</strong> ₹ Rupee, Delivery TAT, Warranty, and Merit Score.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>Zero Horizontal Scrolling:</strong> Clean vertical stack replacing wide 12-column tables.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>Guaranteed Identity Protection:</strong> Aliases like Supplier A7K3 prevent bias.</span>
                    </li>
                  </>
                )}
                {activeScreenIndex === 5 && (
                  <>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>1-Tap Justification Chips:</strong> Select reasons like "Optimal Price-Quality" in 1 second.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>Solo Fast-Track:</strong> Automatically bypasses committee quorum for individual owners.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>Immutable Vote Record:</strong> Cryptographic audit trail for society compliance.</span>
                    </li>
                  </>
                )}
                {activeScreenIndex === 6 && (
                  <>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>1-Click Winner Unmask:</strong> Reveals verified GSTIN, phone, and MSME badges.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>Instant PDF/WhatsApp PO:</strong> Direct legally compliant GST Purchase Order.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>Live Delivery Stepper:</strong> Swiggy/Zomato style tracking from pickup to invoice sign-off.</span>
                    </li>
                  </>
                )}
                {activeScreenIndex === 7 && (
                  <>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>Segmented Activity Switcher:</strong> Instantly toggle between Notifications Feed and Cryptographic Audit Trail.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>1-Tap Deep Link Actions:</strong> Route directly to RFQs, Committee Ballots, and PO Deliveries with a single tap.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>Cryptographic Verification Badges:</strong> SHA-256 sealed proofs for immutable state auditing.</span>
                    </li>
                  </>
                )}
                {activeScreenIndex === 8 && (
                  <>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>Verified Identity &amp; WhatsApp:</strong> Instant OTP linking for real-time mobile procurement notifications.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>Role-Based Team Management:</strong> Invite colleagues as Admin, Approver, or Viewer in seconds.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>Multi-Channel Preferences:</strong> Granular WhatsApp, Email, and In-App notification toggles.</span>
                    </li>
                  </>
                )}
              </ul>
            </div>

            {/* Step Navigation Controls */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={activeScreenIndex === 0}
                onClick={() => setActiveScreenIndex((prev) => Math.max(0, prev - 1))}
                className="px-4 py-2 rounded-xl border bg-card text-xs font-bold text-foreground hover:bg-muted disabled:opacity-40 transition"
              >
                ← Previous Screen
              </button>
              <button
                type="button"
                onClick={() => setActiveScreenIndex((prev) => (prev + 1) % screens.length)}
                className="flex-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-md hover:bg-primary/90 transition text-center"
              >
                {activeScreenIndex === screens.length - 1 ? '↻ Replay from Step 1' : `Next: ${nextScreen.tabLabel} →`}
              </button>
            </div>
          </div>

          {/* Right Column: Realistic iPhone Device Mockup Rendering the Current Screen */}
          <div className="lg:col-span-7 flex justify-center items-center order-1 lg:order-2">
            <MobilePhoneFrame
              title={currentScreen.title}
              badge={currentScreen.badge}
              badgeColor={currentScreen.badgeColor}
              activeTab={activePhoneTab}
              onTabClick={(tab) => setActivePhoneTab(tab)}
              size="md"
            >
              {currentScreen.component}
            </MobilePhoneFrame>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
 * 7 HIGH-FIDELITY MOBILE SCREENS (COMPONENTS)
 * ========================================================================= */

// Screen 1: Home Cockpit
function ScreenHomeCockpit({ onNewRequirement }: { onNewRequirement: () => void }) {
  return (
    <div className="p-3.5 space-y-3.5 text-left text-foreground">
      {/* Org Header Pill */}
      <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs">
            🏢
          </div>
          <div>
            <h4 className="text-xs font-bold text-foreground">Palm Meadows RWA</h4>
            <span className="text-[10px] text-muted-foreground">Whitefield, Bengaluru · 450 Units</span>
          </div>
        </div>
        <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-bold">
          🟢 Verified
        </span>
      </div>

      {/* High-Impact Sourcing Prompt Card */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-card to-primary/5 border border-primary/20 p-3 space-y-2 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
            <span>⚡</span> What do you need to buy?
          </span>
          <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
            1-Tap Sourcing
          </span>
        </div>

        <div className="relative flex items-center">
          <input
            type="text"
            readOnly
            value="10 HP Submersible Borewell Motor Rewind"
            className="w-full rounded-xl border border-primary/30 bg-card px-3 py-2 text-xs font-medium text-foreground pr-8 shadow-2xs"
          />
          <button
            type="button"
            className="absolute right-2 text-primary text-sm hover:scale-110 transition"
            title="Voice Input"
          >
            🎙️
          </button>
        </div>

        {/* 1-Tap Template Chips */}
        <div className="flex flex-wrap gap-1 pt-1">
          {['⚡ Motor Rewind', '🏊 Pool Overhaul', '⚙️ CNC Machining', '🏗️ Waterproofing'].map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={onNewRequirement}
              className="rounded-lg bg-card border border-border/80 px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:text-primary hover:border-primary/50 transition"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* 3-Pill Glance Bar */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-2 text-center">
          <span className="block text-sm font-black text-primary">3</span>
          <span className="text-[9px] font-bold text-foreground">🟢 Active</span>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2 text-center">
          <span className="block text-sm font-black text-amber-700 dark:text-amber-400">1</span>
          <span className="text-[9px] font-bold text-foreground">🟡 Action</span>
        </div>
        <div className="rounded-xl border border-muted bg-muted/40 p-2 text-center">
          <span className="block text-sm font-black text-muted-foreground">12</span>
          <span className="text-[9px] font-bold text-foreground">⚪ Settled</span>
        </div>
      </div>

      {/* Active Requirement Card */}
      <div className="rounded-2xl border border-border bg-card p-3 space-y-2 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full">
            Voting in Progress
          </span>
          <span className="text-[10px] text-muted-foreground">RFQ #0842</span>
        </div>
        <h5 className="text-xs font-bold text-foreground">10 HP Borewell Motor Rewind</h5>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/50">
          <span>3 Sealed Quotes</span>
          <span className="font-bold text-emerald-600">L1: ₹8,200</span>
        </div>
        <button
          type="button"
          onClick={onNewRequirement}
          className="w-full rounded-xl bg-primary py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition text-center flex items-center justify-center gap-1.5"
        >
          <span>🗳️ Review &amp; Cast Vote →</span>
        </button>
      </div>
    </div>
  );
}

// Screen 2: Voice & Conversational Intake
function ScreenIntakeWizard({ onNext }: { onNext: () => void }) {
  return (
    <div className="p-3.5 space-y-3.5 text-left text-foreground">
      {/* Wizard Step Progress */}
      <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
        <span className="text-primary">Step 1 of 3: Scope &amp; Logistics</span>
        <span>65% Auto-Filled</span>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
        <div className="bg-primary h-full rounded-full w-2/3" />
      </div>

      {/* Voice Prompt Box */}
      <div className="rounded-2xl border border-primary/40 bg-card p-3 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
            <span>✨</span> Speak or Type Requirement:
          </label>
          <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            AI Parser Ready
          </span>
        </div>
        <textarea
          rows={3}
          readOnly
          value="Require 12.5 HP submersible borewell motor rewinding in Bengaluru 560001 within 5 days with 6 months warranty."
          className="w-full rounded-xl border border-border bg-muted/20 p-2 text-xs font-medium text-foreground resize-none leading-relaxed"
        />
      </div>

      {/* 1-Tap City Selection */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Delivery Location (1-Tap):
        </span>
        <div className="flex flex-wrap gap-1">
          {['Bengaluru ✓', 'Chennai', 'Coimbatore', 'Hyderabad', 'Mumbai'].map((city, idx) => (
            <button
              key={city}
              type="button"
              className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition ${
                idx === 0
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted'
              }`}
            >
              {city}
            </button>
          ))}
        </div>
      </div>

      {/* Smart Weights */}
      <div className="rounded-xl border bg-muted/30 p-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-foreground">Scoring Weights (Auto-Optimized):</span>
          <span className="text-[9px] text-primary font-bold">Standard Merit</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="rounded bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-300 px-1.5 py-0.5 font-bold">
            💰 Price 40%
          </span>
          <span className="rounded bg-blue-500/10 text-blue-800 dark:text-blue-300 border border-blue-300 px-1.5 py-0.5 font-bold">
            🚚 Speed 35%
          </span>
          <span className="rounded bg-purple-500/10 text-purple-800 dark:text-purple-300 border border-purple-300 px-1.5 py-0.5 font-bold">
            🛡️ SLA 25%
          </span>
        </div>
      </div>

      {/* Primary Sticky CTA */}
      <button
        type="button"
        onClick={onNext}
        className="w-full rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition text-center"
      >
        Publish Sealed RFQ →
      </button>
    </div>
  );
}

// Screen 3: Multi-Channel Supplier Radar
function ScreenSupplierRadar({ onNext }: { onNext: () => void }) {
  return (
    <div className="p-3.5 space-y-3.5 text-left text-foreground">
      {/* Radar Pulse Banner */}
      <div className="rounded-2xl bg-slate-950 text-white p-3.5 space-y-2 relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <h5 className="text-xs font-bold">Supplier Discovery Radar</h5>
          </div>
          <span className="text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-full">
            14 Nearby
          </span>
        </div>
        <p className="text-[10px] text-slate-300 leading-relaxed">
          Broadcasting sealed requirement to verified motor rewinding vendors within 15 km of Whitefield, Bengaluru.
        </p>
      </div>

      {/* Multi-Channel Distribution List */}
      <div className="space-y-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Broadcast Channels Active:
        </span>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">💬</span>
            <div>
              <h6 className="text-xs font-bold text-foreground">WhatsApp Direct Quoting</h6>
              <span className="text-[9px] text-muted-foreground">8 Verified Regional Vendors</span>
            </div>
          </div>
          <span className="text-[10px] font-bold text-emerald-600">✓ Sent</span>
        </div>

        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">🌐</span>
            <div>
              <h6 className="text-xs font-bold text-foreground">ONDC Sourcing Protocol</h6>
              <span className="text-[9px] text-muted-foreground">4 B2B Network Providers</span>
            </div>
          </div>
          <span className="text-[10px] font-bold text-blue-600">✓ Synced</span>
        </div>

        <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">📱</span>
            <div>
              <h6 className="text-xs font-bold text-foreground">Supplier PWA Instant Alerts</h6>
              <span className="text-[9px] text-muted-foreground">2 Direct Push Notifications</span>
            </div>
          </div>
          <span className="text-[10px] font-bold text-purple-600">✓ Pushed</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition text-center"
      >
        View Incoming Sealed Quotes →
      </button>
    </div>
  );
}

// Screen 4: 1-Tap Supplier Rupee Quoting
function ScreenSupplierQuoting({ onNext }: { onNext: () => void }) {
  return (
    <div className="p-3.5 space-y-3 text-left text-foreground">
      {/* Supplier Top Badge */}
      <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">🔒</span>
          <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
            Sealed Quote submission
          </span>
        </div>
        <span className="text-[9px] text-muted-foreground">RFQ #0842</span>
      </div>

      <h5 className="text-xs font-black text-foreground">
        10 HP Submersible Motor Rewind
      </h5>

      {/* Numeric Rupee Price Field */}
      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Total Base Price (₹ INR):
        </label>
        <div className="relative flex items-center">
          <span className="absolute left-3 text-sm font-bold text-foreground">₹</span>
          <input
            type="text"
            readOnly
            value="8,200"
            className="w-full rounded-xl border border-primary/40 bg-card pl-7 pr-3 py-2 text-sm font-black text-foreground shadow-2xs"
          />
        </div>
      </div>

      {/* Instant GST Chips */}
      <div className="space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          GST Calculation:
        </span>
        <div className="grid grid-cols-3 gap-1">
          <button type="button" className="rounded-lg border bg-muted/40 p-1.5 text-center text-[10px] font-semibold text-muted-foreground">
            +0% Exempt
          </button>
          <button type="button" className="rounded-lg border border-primary bg-primary/10 p-1.5 text-center text-[10px] font-bold text-primary">
            +18% (₹1,476)
          </button>
          <button type="button" className="rounded-lg border bg-muted/40 p-1.5 text-center text-[10px] font-semibold text-muted-foreground">
            +28%
          </button>
        </div>
      </div>

      {/* Delivery TAT & Warranty */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border bg-card p-2">
          <span className="text-[9px] text-muted-foreground block font-bold">Delivery TAT:</span>
          <span className="text-xs font-bold text-foreground">⚡ 3 Days</span>
        </div>
        <div className="rounded-xl border bg-card p-2">
          <span className="text-[9px] text-muted-foreground block font-bold">Warranty:</span>
          <span className="text-xs font-bold text-foreground">🛡️ 6 Months</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full rounded-xl bg-emerald-700 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-800 transition text-center flex items-center justify-center gap-1.5"
      >
        <span>🔒 Submit Sealed Quote</span>
      </button>
    </div>
  );
}

// Screen 5: 4-Pillar Sealed Comparison Matrix
function ScreenComparisonMatrix({ onNext }: { onNext: () => void }) {
  return (
    <div className="p-3.5 space-y-3 text-left text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h5 className="text-xs font-black text-foreground flex items-center gap-1">
          <span>🔒</span> 3 Sealed Quotes
        </h5>
        <span className="text-[9px] bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full">
          Identity Protected
        </span>
      </div>

      {/* Candidate Card 1 (L1 Winner) */}
      <div className="rounded-2xl border-2 border-primary bg-primary/5 p-3 space-y-2 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-[10px]">
              L1
            </span>
            <span className="font-mono text-xs font-bold text-foreground">Supplier A7K3</span>
          </div>
          <span className="text-[9px] bg-primary text-primary-foreground font-bold px-1.5 py-0.5 rounded">
            ⚡ Lowest Price
          </span>
        </div>

        {/* 4-Pillar Metric Grid */}
        <div className="grid grid-cols-4 gap-1 bg-card rounded-xl p-2 border border-primary/20 text-center">
          <div>
            <span className="text-[8px] text-muted-foreground uppercase font-bold block">₹ Total</span>
            <span className="text-xs font-black text-foreground">₹8,200</span>
          </div>
          <div>
            <span className="text-[8px] text-muted-foreground uppercase font-bold block">Delivery</span>
            <span className="text-xs font-bold text-foreground">3 Days</span>
          </div>
          <div>
            <span className="text-[8px] text-muted-foreground uppercase font-bold block">Warranty</span>
            <span className="text-xs font-bold text-foreground">6 Mo</span>
          </div>
          <div>
            <span className="text-[8px] text-muted-foreground uppercase font-bold block">Score</span>
            <span className="text-xs font-black text-emerald-600">★ 9.4</span>
          </div>
        </div>
      </div>

      {/* Candidate Card 2 */}
      <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center font-bold text-[10px]">
              2
            </span>
            <span className="font-mono text-xs font-bold text-foreground">Supplier B2M9</span>
          </div>
          <span className="text-[9px] text-muted-foreground font-semibold">Fastest Turnaround</span>
        </div>

        <div className="grid grid-cols-4 gap-1 bg-muted/30 rounded-xl p-2 text-center text-xs">
          <div>
            <span className="text-[8px] text-muted-foreground uppercase font-bold block">₹ Total</span>
            <span className="font-bold text-foreground">₹8,900</span>
          </div>
          <div>
            <span className="text-[8px] text-muted-foreground uppercase font-bold block">Delivery</span>
            <span className="font-bold text-foreground">2 Days</span>
          </div>
          <div>
            <span className="text-[8px] text-muted-foreground uppercase font-bold block">Warranty</span>
            <span className="font-bold text-foreground">12 Mo</span>
          </div>
          <div>
            <span className="text-[8px] text-muted-foreground uppercase font-bold block">Score</span>
            <span className="font-bold text-foreground">★ 9.1</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition text-center"
      >
        Proceed to Committee Decision Room →
      </button>
    </div>
  );
}

// Screen 6: 1-Tap Committee Voting & Decision Room
function ScreenCommitteeVoting({ onNext }: { onNext: () => void }) {
  return (
    <div className="p-3.5 space-y-3.5 text-left text-foreground">
      {/* Quorum Header */}
      <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/30 p-2.5 flex items-center justify-between">
        <div>
          <span className="text-[9px] font-bold uppercase tracking-wider text-cyan-800 dark:text-cyan-300 block">
            Committee Quorum Status
          </span>
          <h5 className="text-xs font-black text-foreground">3 of 3 Votes Cast (100%)</h5>
        </div>
        <span className="text-base">🏛️</span>
      </div>

      {/* Selected Recommendation */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-2.5 space-y-1">
        <span className="text-[9px] font-bold text-muted-foreground block">Your Recommended Candidate:</span>
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs font-black text-foreground">Supplier A7K3 (L1)</span>
          <span className="text-xs font-black text-emerald-600">₹8,200 · ★ 9.4</span>
        </div>
      </div>

      {/* 1-Tap Preset Rationale Chips */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Decision Justification (1-Tap):
        </span>
        <div className="flex flex-wrap gap-1">
          {['Optimal Price-Quality ✓', '3-Day Turnaround ✓', 'Compliant Spec ✓', 'Verified Track Record'].map((chip, idx) => (
            <button
              key={chip}
              type="button"
              className={`rounded-lg px-2 py-1 text-[10px] font-bold transition ${
                idx < 3
                  ? 'bg-primary/20 text-primary border border-primary/40'
                  : 'bg-muted/60 text-muted-foreground'
              }`}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition text-center flex items-center justify-center gap-1.5"
      >
        <span>🔒 Lock Award &amp; Unmask Winner →</span>
      </button>
    </div>
  );
}

// Screen 7: Winner Reveal, Digital PO & Live Order Tracker
function ScreenOrderFulfillment({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="p-3.5 space-y-3.5 text-left text-foreground">
      {/* Unmask Announcement */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-3 space-y-1.5 shadow-md">
        <span className="text-[9px] font-black uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
          🎉 Winning Supplier Unmasked
        </span>
        <h5 className="text-xs font-black leading-snug">
          Sri Vinayaka Electricals &amp; Rewinding Works
        </h5>
        <div className="flex items-center gap-2 text-[10px] text-white/90 pt-0.5">
          <span>✓ GST: 29ABCDE1234F1Z5</span>
          <span>·</span>
          <span>📞 +91 98450 12345</span>
        </div>
      </div>

      {/* Digital PO Summary */}
      <div className="rounded-xl border bg-card p-2.5 flex items-center justify-between">
        <div>
          <span className="text-[9px] text-muted-foreground block font-bold">Purchase Order Issued:</span>
          <span className="text-xs font-black text-foreground">PO-2026-0842 · ₹8,200</span>
        </div>
        <span className="rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] px-2 py-1 border border-emerald-500/30">
          📄 PDF Ready
        </span>
      </div>

      {/* Swiggy/Zomato Style Delivery Stepper */}
      <div className="rounded-2xl border bg-card p-3 space-y-2.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
          Live Order Fulfillment Tracker:
        </span>

        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2 text-emerald-600 font-bold">
            <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px]">✓</span>
            <span>PO Accepted by Supplier (10:15 AM)</span>
          </div>
          <div className="flex items-center gap-2 text-emerald-600 font-bold">
            <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px]">✓</span>
            <span>Motor Collected from Site (02:30 PM)</span>
          </div>
          <div className="flex items-center gap-2 text-primary font-black animate-pulse">
            <span className="w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center text-[10px]">⚙️</span>
            <span>Copper Coil Rewinding in Progress</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="w-4 h-4 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px]">○</span>
            <span>Testing &amp; Site Re-Installation</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onRestart}
        className="w-full rounded-xl border border-border bg-card py-2 text-xs font-bold text-foreground hover:bg-muted transition text-center"
      >
        ↻ Back to Screen 1 (Cockpit Overview)
      </button>
    </div>
  );
}

// Screen 14: Activity Feed & Audit Ledger
function ScreenActivityNotifications({ onNext }: { onNext: () => void }) {
  const [activeTab, setActiveTab] = useState<'notifications' | 'audit'>('notifications');

  return (
    <div className="p-3.5 space-y-3 text-left text-foreground">
      {/* Segmented Tab Switcher */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1 border border-border">
        <button
          type="button"
          onClick={() => setActiveTab('notifications')}
          className={`py-1.5 text-xs font-bold rounded-lg transition ${
            activeTab === 'notifications'
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          🔔 Notifications (2)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`py-1.5 text-xs font-bold rounded-lg transition ${
            activeTab === 'audit'
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          🛡️ Audit Trail (6)
        </button>
      </div>

      {activeTab === 'notifications' ? (
        <div className="space-y-2.5">
          {/* Notification Card 1: Quote Received */}
          <div className="rounded-2xl border border-primary/40 bg-primary/5 p-3 space-y-1.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 text-[9px] font-bold px-2 py-0.2">
                🟢 Quote Submitted
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">2m ago</span>
            </div>
            <h5 className="text-xs font-bold text-foreground">
              New Sealed Quote: ₹8,200 for 10HP Motor Rewind
            </h5>
            <p className="text-[11px] text-muted-foreground">
              Supplier A7K3 submitted a sealed quote with 12-month warranty.
            </p>
            <div className="pt-1 flex items-center justify-between border-t border-border/40">
              <span className="text-[10px] text-muted-foreground font-mono">Via WhatsApp</span>
              <span className="text-[10px] font-bold text-primary">Review Quotation →</span>
            </div>
          </div>

          {/* Notification Card 2: Vote Requested */}
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3 space-y-1.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 text-[9px] font-bold px-2 py-0.2">
                🗳️ Vote Requested
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">14m ago</span>
            </div>
            <h5 className="text-xs font-bold text-foreground">
              Committee Ballot: DG Set Annual Maintenance
            </h5>
            <p className="text-[11px] text-muted-foreground">
              2 of 3 votes recorded. Your approval is required to establish quorum.
            </p>
            <div className="pt-1 flex items-center justify-between border-t border-border/40">
              <span className="text-[10px] text-muted-foreground font-mono">Quorum 67%</span>
              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">Cast Vote →</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2 text-xs flex items-center justify-between">
            <span className="font-bold text-emerald-800 dark:text-emerald-300 text-[11px]">
              🛡️ SHA-256 State Ledger
            </span>
            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-mono">✓ Verified</span>
          </div>

          <div className="rounded-xl border bg-card p-2.5 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-foreground text-[11px]">Quote · Submitted</span>
              <span className="text-[9px] text-muted-foreground">10:45 AM</span>
            </div>
            <p className="text-[10px] font-mono text-muted-foreground truncate">
              Proof: 0x8a91f42e · RFQ #0842
            </p>
          </div>

          <div className="rounded-xl border bg-card p-2.5 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-foreground text-[11px]">Vote · Quorum Verified</span>
              <span className="text-[9px] text-muted-foreground">11:00 AM</span>
            </div>
            <p className="text-[10px] font-mono text-muted-foreground truncate">
              Proof: 0x3f1c99ba · Quorum 100%
            </p>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onNext}
        className="w-full rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition text-center"
      >
        Next: Screen 15 (Profile &amp; Settings) →
      </button>
    </div>
  );
}

// Screen 15: Profile, Role & Organization Settings
function ScreenProfileSettings({ onRestart }: { onRestart: () => void }) {
  const [activeTab, setActiveTab] = useState<'profile' | 'team' | 'preferences'>('profile');

  return (
    <div className="p-3.5 space-y-3 text-left text-foreground">
      {/* 3-Way Segmented Control */}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1 border border-border text-[11px]">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`py-1.5 font-bold rounded-lg transition ${
            activeTab === 'profile' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'
          }`}
        >
          👤 Profile
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('team')}
          className={`py-1.5 font-bold rounded-lg transition ${
            activeTab === 'team' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'
          }`}
        >
          🏢 Team
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('preferences')}
          className={`py-1.5 font-bold rounded-lg transition ${
            activeTab === 'preferences' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'
          }`}
        >
          ⚙️ Settings
        </button>
      </div>

      {activeTab === 'profile' && (
        <div className="space-y-2.5">
          {/* Identity Card */}
          <div className="rounded-2xl border border-border bg-card p-3 flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/15 text-primary font-black text-sm flex items-center justify-center shrink-0">
              BL
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold truncate">Baskar Loganathan</span>
                <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[8px] font-bold px-1.5 py-0.2">
                  Buyer Lead
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground truncate">Durgha Rainbow Apartments RWA</p>
            </div>
          </div>

          {/* Verified Channels */}
          <div className="rounded-xl border bg-muted/20 p-2.5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">Primary Email:</span>
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[9px] font-bold px-2 py-0.2 border border-emerald-300">
                ✓ bvnbasu@yahoo.com
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">WhatsApp:</span>
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[9px] font-bold px-2 py-0.2 border border-emerald-300">
                ✓ +91 98400 12345
              </span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'team' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground">Colleagues (3)</span>
            <span className="text-[10px] text-primary font-bold">+ Invite</span>
          </div>

          {[
            { name: 'Baskar Loganathan (You)', role: 'Buyer Admin', badge: 'bg-primary/10 text-primary' },
            { name: 'Subramanian R.', role: 'Approver', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
            { name: 'Karthik V.', role: 'Viewer', badge: 'bg-muted text-muted-foreground' },
          ].map((m) => (
            <div key={m.name} className="flex items-center justify-between p-2 rounded-xl border bg-card text-xs">
              <span className="font-semibold text-[11px] truncate">{m.name}</span>
              <span className={`text-[9px] font-bold px-2 py-0.2 rounded-full ${m.badge}`}>
                {m.role}
              </span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'preferences' && (
        <div className="space-y-2.5 text-xs">
          {/* Notification Toggles */}
          <div className="rounded-xl border bg-card p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold">📱 WhatsApp Channel</span>
              <span className="text-[9px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.2 rounded font-bold">
                Active
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold">✉️ Email Alerts</span>
              <span className="text-[9px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.2 rounded font-bold">
                Active
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold">🔔 In-App Live Feed</span>
              <span className="text-[9px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.2 rounded font-bold">
                Active
              </span>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onRestart}
        className="w-full rounded-xl border border-border bg-card py-2 text-xs font-bold text-foreground hover:bg-muted transition text-center"
      >
        ↻ Back to Screen 1 (Cockpit Overview)
      </button>
    </div>
  );
}
