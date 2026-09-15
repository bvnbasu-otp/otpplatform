import React, { useState, useCallback, useMemo } from 'react';
import { MobilePhoneFrame } from './MobilePhoneFrame';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';

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

export interface PhaseMapping {
  phaseNumber: number;
  label: string;
  screenIndices: number[];
  screensLabel: string;
}

export function MobileScreensShowcase() {
  const [pipelineMode, setPipelineMode] = useState<'buyer' | 'supplier'>('buyer');
  const [activeScreenIndex, setActiveScreenIndex] = useState(0);
  const [activePhoneTab, setActivePhoneTab] = useState<'home' | 'orders' | 'new' | 'audit' | 'profile'>('home');
  const [showSupplierCapabilityPreview, setShowSupplierCapabilityPreview] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('left');

  const handlePhoneTabClick = (tab: 'home' | 'orders' | 'new' | 'audit' | 'profile') => {
    setActivePhoneTab(tab);
    if (tab === 'new') {
      if (pipelineMode === 'buyer') {
        setShowSupplierCapabilityPreview(false);
        setActiveScreenIndex(1); // Screen 02: Voice Intake
      } else {
        setShowSupplierCapabilityPreview(true);
      }
    } else {
      setShowSupplierCapabilityPreview(false);
      if (tab === 'home') {
        setActiveScreenIndex(0);
      } else if (tab === 'orders') {
        setActiveScreenIndex(pipelineMode === 'buyer' ? 6 : 4);
      } else if (tab === 'audit') {
        setActiveScreenIndex(pipelineMode === 'buyer' ? 4 : 2);
      }
    }
  };

  const buyerScreens: MobileScreenDef[] = [
    {
      id: 'buyer-01',
      stepNumber: '01',
      tabLabel: 'Sourcing Cockpit',
      icon: '🏢',
      title: 'Mobile Sourcing Cockpit',
      tagline: '1-Tap requirement launch, voice search, and real-time order pulse.',
      badge: 'Screen 01 · Sourcing Cockpit',
      badgeColor: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-300',
      description: 'Zero desktop complexity. Post a procurement need in 10 seconds via voice or template chips.',
      component: <ScreenBuyerCockpit onNewRequirement={() => setActiveScreenIndex(1)} />,
    },
    {
      id: 'buyer-02',
      stepNumber: '02',
      tabLabel: 'Voice Intake',
      icon: '🎙️',
      title: 'Conversational Voice Intake',
      tagline: 'Regional voice dictation with automatic spec parsing and 1-tap city selection.',
      badge: 'Screen 02 · Voice Intake',
      badgeColor: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-300',
      description: 'Supports Tamil, Hindi, Kannada, and English. Extracts quantity, deadline, and technical SLAs automatically.',
      component: <ScreenBuyerVoiceIntake onNext={() => setActiveScreenIndex(2)} />,
    },
    {
      id: 'buyer-03',
      stepNumber: '03',
      tabLabel: 'Supplier Radar',
      icon: '📡',
      title: 'Multi-Channel Supplier Radar',
      tagline: 'Broadcasts sealed RFQ invitations across WhatsApp, ONDC, and SMS.',
      badge: 'Screen 03 · Supplier Radar',
      badgeColor: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300',
      description: 'Reaches local verified vendors without forcing them to create complicated portal accounts.',
      component: <ScreenBuyerSupplierRadar onNext={() => setActiveScreenIndex(3)} />,
    },
    {
      id: 'buyer-04',
      stepNumber: '04',
      tabLabel: 'Supplier Quoting',
      icon: '💬',
      title: '15-Second Mobile Quoting',
      tagline: 'WhatsApp & mobile-optimized 3-field numeric quote sheet with instant GST.',
      badge: 'Screen 04 · Supplier Quoting',
      badgeColor: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300',
      description: 'Suppliers quote in 15 seconds from their phones. All quotes remain cryptographically sealed.',
      component: <ScreenBuyerQuoting onNext={() => setActiveScreenIndex(4)} />,
    },
    {
      id: 'buyer-05',
      stepNumber: '05',
      tabLabel: 'Sealed Matrix',
      icon: '⚖️',
      title: '4-Pillar Sealed Matrix',
      tagline: 'Zero-bias cards comparing ₹ Price, Delivery TAT, Warranty, and Merit Score.',
      badge: 'Screen 05 · Sealed Matrix',
      badgeColor: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300',
      description: 'Vendor names are masked as Supplier A7K3, B2M9. Decisions are made 100% on commercial & technical merit.',
      component: <ScreenBuyerMatrix onNext={() => setActiveScreenIndex(5)} />,
    },
    {
      id: 'buyer-06',
      stepNumber: '06',
      tabLabel: 'Committee Vote',
      icon: '🗳️',
      title: '1-Tap Committee Decision Room',
      tagline: 'Preset rationale chips, live quorum meters, and fast-track solo approvals.',
      badge: 'Screen 06 · Committee Vote',
      badgeColor: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-300',
      description: 'Eliminates endless WhatsApp committee arguments with transparent 1-tap recorded justifications.',
      component: <ScreenBuyerVoting onNext={() => setActiveScreenIndex(6)} />,
    },
    {
      id: 'buyer-07',
      stepNumber: '07',
      tabLabel: 'Digital PO & Tracking',
      icon: '📦',
      title: 'Digital PO & Live Tracking',
      tagline: 'Instant GST Purchase Order execution and Swiggy-style milestone tracker.',
      badge: 'Screen 07 · Digital PO & Tracking',
      badgeColor: 'bg-emerald-600/10 text-emerald-800 dark:text-emerald-300 border-emerald-400',
      description: 'Unmask verified GST credentials, share PO via WhatsApp PDF, and track pickup to invoice settlement.',
      component: <ScreenBuyerOrderTracking onRestart={() => setActiveScreenIndex(0)} />,
    },
  ];

  const supplierScreens: MobileScreenDef[] = [
    {
      id: 'supplier-01',
      stepNumber: '01',
      tabLabel: 'Radar & Alerts',
      icon: '📡',
      title: 'Supplier Radar & Notification Hub',
      tagline: 'View incoming sealed RFQ alerts filtered by location, taxonomy, capacity.',
      badge: 'Screen 01 · Supplier Radar & Notification Hub',
      badgeColor: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300',
      description: 'Instant alerts received on WhatsApp and mobile app matched by domain taxonomy, HP rating, and radius.',
      component: <ScreenSupplierHub onNext={() => setActiveScreenIndex(1)} />,
    },
    {
      id: 'supplier-02',
      stepNumber: '02',
      tabLabel: '15-Sec Quoting',
      icon: '⚡',
      title: '15-Second Quoting Engine',
      tagline: 'Unit price + GST auto-split, TAT days, warranty SLA under masked alias.',
      badge: 'Screen 02 · 15-Second Quoting Engine',
      badgeColor: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300',
      description: 'Suppliers quote unit rates in seconds. Indian GST tax rates split automatically with zero complex account logins.',
      component: <ScreenSupplierQuotingEngine onNext={() => setActiveScreenIndex(2)} />,
    },
    {
      id: 'supplier-03',
      stepNumber: '03',
      tabLabel: 'Quote Status',
      icon: '📊',
      title: 'Quote Status & Active Quotes',
      tagline: 'Live status: Sealed, Under Review, Shortlisted, Outbid, with live revision controls.',
      badge: 'Screen 03 · Quote Status & Active Quotes',
      badgeColor: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-300',
      description: 'Real-time quote tracking under identity-protected alias. Edit commercial offers or delivery TAT prior to closing.',
      component: <ScreenSupplierQuoteStatus onNext={() => setActiveScreenIndex(3)} />,
    },
    {
      id: 'supplier-04',
      stepNumber: '04',
      tabLabel: 'PO Sign-off',
      icon: '📝',
      title: 'Award Notification & PO Sign-off',
      tagline: 'Unmasked buyer GST credentials, digital PO acceptance.',
      badge: 'Screen 04 · Award Notification & PO Sign-off',
      badgeColor: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300',
      description: 'Winning quote triggers unmasked institutional buyer details, milestone schedule, and 1-tap digital PO acceptance.',
      component: <ScreenSupplierPoSignoff onNext={() => setActiveScreenIndex(4)} />,
    },
    {
      id: 'supplier-05',
      stepNumber: '05',
      tabLabel: 'Milestone Tracker',
      icon: '🚚',
      title: 'Order Fulfillment & Milestone Tracker',
      tagline: 'Live status steps: Pickup Scheduled, In Progress, Ready for Delivery, Invoiced.',
      badge: 'Screen 05 · Order Fulfillment & Milestone Tracker',
      badgeColor: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-300',
      description: 'Update execution stages with 1-thumb touch. Auto-generates GST tax invoices and payment release requests.',
      component: <ScreenSupplierFulfillmentTracker onRestart={() => setActiveScreenIndex(0)} />,
    },
  ];

  const screens = pipelineMode === 'buyer' ? buyerScreens : supplierScreens;
  const currentScreen: MobileScreenDef = screens[activeScreenIndex] ?? screens[0]!;
  const nextScreen: MobileScreenDef = screens[(activeScreenIndex + 1) % screens.length] ?? screens[0]!;

  const buyerPhaseMappings: PhaseMapping[] = useMemo(() => [
    { phaseNumber: 1, label: 'Intake & Specs', screenIndices: [0, 1], screensLabel: 'Screens 01 & 02' },
    { phaseNumber: 2, label: 'Sourcing Radar', screenIndices: [2], screensLabel: 'Screen 03' },
    { phaseNumber: 3, label: 'Sealed Quoting', screenIndices: [3, 4], screensLabel: 'Screens 04 & 05' },
    { phaseNumber: 4, label: 'Committee Vote', screenIndices: [5], screensLabel: 'Screen 06' },
    { phaseNumber: 5, label: 'Digital PO & Tracking', screenIndices: [6], screensLabel: 'Screen 07' },
  ], []);

  const supplierPhaseMappings: PhaseMapping[] = useMemo(() => [
    { phaseNumber: 1, label: 'Radar & Alerts', screenIndices: [0], screensLabel: 'Screen 01' },
    { phaseNumber: 2, label: '15-Sec Quoting', screenIndices: [1], screensLabel: 'Screen 02' },
    { phaseNumber: 3, label: 'Quote Status', screenIndices: [2], screensLabel: 'Screen 03' },
    { phaseNumber: 4, label: 'Award & PO Sign-off', screenIndices: [3], screensLabel: 'Screen 04' },
    { phaseNumber: 5, label: 'Live Fulfillment', screenIndices: [4], screensLabel: 'Screen 05' },
  ], []);

  const phaseMappings: PhaseMapping[] = pipelineMode === 'buyer' ? buyerPhaseMappings : supplierPhaseMappings;
  const currentPhase: PhaseMapping = phaseMappings.find((p: PhaseMapping) => p.screenIndices.includes(activeScreenIndex)) || phaseMappings[0]!;

  const goToNextScreen = useCallback(() => {
    setSlideDirection('left');
    setActiveScreenIndex((prev) => (prev + 1) % screens.length);
  }, [screens.length]);

  const goToPrevScreen = useCallback(() => {
    setSlideDirection('right');
    setActiveScreenIndex((prev) => (prev - 1 + screens.length) % screens.length);
  }, [screens.length]);

  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: goToNextScreen,
    onSwipeRight: goToPrevScreen,
    minDelta: 50,
    horizontalDominanceRatio: 1.5,
  });

  return (
    <section className="py-12 sm:py-16 bg-gradient-to-b from-muted/30 via-background to-muted/20 border-y border-border/80 overflow-x-hidden max-w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-6 sm:mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-3">
            <span>📱</span>
            <span>Mobile-First Procurement Cockpit</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground tracking-tight">
            Built for Smartphones. Zero Squeezed Desktop.
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Experience how Indian building committees, MSMEs, and verified suppliers execute sourcing from their smartphones—via voice, WhatsApp, and 1-tap thumb interactions.
          </p>

          {/* Top-Level Dual Role Switcher Toggle */}
          <div className="mt-6 inline-flex items-center justify-center gap-2 p-1 bg-muted/70 rounded-2xl border border-border/80 shadow-2xs">
            <button
              type="button"
              onClick={() => {
                setPipelineMode('buyer');
                setActiveScreenIndex(0);
                setActivePhoneTab('home');
                setShowSupplierCapabilityPreview(false);
                setSlideDirection('left');
              }}
              className={`flex items-center gap-2 py-2 px-4 rounded-xl text-xs font-black transition mobile-touch-target cursor-pointer ${
                pipelineMode === 'buyer'
                  ? 'bg-card text-foreground shadow-xs ring-1 ring-border/80'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>🏢</span> Buyer View (7 Screens)
            </button>
            <button
              type="button"
              onClick={() => {
                setPipelineMode('supplier');
                setActiveScreenIndex(0);
                setActivePhoneTab('home');
                setShowSupplierCapabilityPreview(false);
                setSlideDirection('left');
              }}
              className={`flex items-center gap-2 py-2 px-4 rounded-xl text-xs font-black transition mobile-touch-target cursor-pointer ${
                pipelineMode === 'supplier'
                  ? 'bg-card text-foreground shadow-xs ring-1 ring-border/80'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>🚚</span> Supplier View (5 Screens)
            </button>
          </div>

          {/* High-Level 5-Step Overview Mapping Ribbon */}
          <div className="mt-5 max-w-2xl mx-auto rounded-2xl border border-primary/20 bg-primary/5 p-2.5 sm:p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
              <span className="font-extrabold text-foreground flex items-center gap-1.5">
                <span>🗺️</span>
                <span>{pipelineMode === 'buyer' ? '5-Step Executive Overview → 7-Screen Mobile Pipeline' : '5-Step Supplier Quoting to Fulfillment Journey'}</span>
              </span>
              <span className="rounded-full bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 text-[10px] font-black">
                Phase {currentPhase.phaseNumber} of 5 ({currentPhase.screensLabel})
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1 select-none">
              {phaseMappings.map((phase: PhaseMapping) => {
                const isPhaseActive = phase.screenIndices.includes(activeScreenIndex);
                return (
                  <button
                    key={phase.phaseNumber}
                    type="button"
                    onClick={() => {
                      setSlideDirection(phase.screenIndices[0]! >= activeScreenIndex ? 'left' : 'right');
                      setActiveScreenIndex(phase.screenIndices[0]!);
                    }}
                    className={`rounded-xl p-1.5 text-center transition mobile-touch-target cursor-pointer ${
                      isPhaseActive
                        ? 'bg-primary text-primary-foreground shadow-xs font-bold ring-1 ring-primary/50'
                        : 'bg-card/70 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50'
                    }`}
                  >
                    <span className="text-[10px] block font-black">0{phase.phaseNumber}</span>
                    <span className="text-[9px] block truncate font-medium">{phase.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Screen Selector Tabs Carousel */}
          <div className="mt-4 flex items-center justify-start sm:justify-center gap-2 overflow-x-auto pb-2 no-scrollbar scrollbar-none px-2 max-w-full">
            {screens.map((screen, idx) => {
              const isActive = idx === activeScreenIndex;
              return (
                <button
                  key={screen.id}
                  type="button"
                  onClick={() => {
                    setSlideDirection(idx >= activeScreenIndex ? 'left' : 'right');
                    setActiveScreenIndex(idx);
                  }}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shadow-2xs mobile-touch-target ${
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
          <div className="lg:col-span-5 space-y-5 text-left order-2 lg:order-1">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={`inline-block rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${currentScreen.badgeColor}`}>
                  {currentScreen.badge}
                </span>
                <span className="text-[11px] font-bold text-muted-foreground">
                  {pipelineMode === 'buyer' ? 'Post Request' : 'Submit 30 min Quote'}
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                {currentScreen.title}
              </h3>
              <p className="text-sm font-semibold text-primary">
                {currentScreen.tagline}
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pt-0.5">
                {currentScreen.description}
              </p>
            </div>

            {/* Dynamic Value Proposition Subtitle Banner */}
            <div className="rounded-xl bg-primary/5 border border-primary/20 px-3.5 py-2 flex items-center justify-between text-xs">
              <span className="font-bold text-foreground">
                {pipelineMode === 'buyer' ? '🎯 Buyer Objective:' : '⚡ Supplier Objective:'}
              </span>
              <span className="font-extrabold text-primary">
                {pipelineMode === 'buyer'
                  ? 'Post Request → Scored Quotes in 30 Min'
                  : 'Submit 30 min Quote → Win PO on Merit'}
              </span>
            </div>

            {/* Feature Highlights for Current Screen */}
            <div className="rounded-2xl border border-border/80 bg-card/60 backdrop-blur-xs p-4 space-y-3 shadow-xs">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                ✨ Key Mobile Ergonomics:
              </h4>
              <ul className="space-y-2 text-xs text-foreground/90">
                {pipelineMode === 'buyer' ? (
                  <>
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
                  </>
                ) : (
                  <>
                    {activeScreenIndex === 0 && (
                      <>
                        <li className="flex items-start gap-2">
                          <span className="text-emerald-500 font-bold">✓</span>
                          <span><strong>Proximity &amp; Category Filters:</strong> Instant alerts matching verified PIN codes and capacity limits.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-emerald-500 font-bold">✓</span>
                          <span><strong>WhatsApp Deep Link:</strong> Tap once from WhatsApp alert directly into instant quoting interface.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-emerald-500 font-bold">✓</span>
                          <span><strong>Sealed Identity Protection:</strong> Buyer sees only your anonymous alias and score metrics pre-award.</span>
                        </li>
                      </>
                    )}
                    {activeScreenIndex === 1 && (
                      <>
                        <li className="flex items-start gap-2">
                          <span className="text-emerald-500 font-bold">✓</span>
                          <span><strong>15-Second Flow:</strong> Fill unit price, delivery days, and warranty in 3 numeric inputs.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-emerald-500 font-bold">✓</span>
                          <span><strong>Automated GST Calculation:</strong> Instant +0%, +18%, +28% chips calculate tax without accounting software.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-emerald-500 font-bold">✓</span>
                          <span><strong>Zero App Install Friction:</strong> Quote directly in responsive mobile browser with cryptographic security.</span>
                        </li>
                      </>
                    )}
                    {activeScreenIndex === 2 && (
                      <>
                        <li className="flex items-start gap-2">
                          <span className="text-emerald-500 font-bold">✓</span>
                          <span><strong>Live Status Pipeline:</strong> Instant badge indicators (Sealed, Under Review, Shortlisted, Outbid).</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-emerald-500 font-bold">✓</span>
                          <span><strong>Revision Controls:</strong> Modify pricing or TAT terms prior to tender closure.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-emerald-500 font-bold">✓</span>
                          <span><strong>Transparent Position:</strong> Clear feedback on commercial competitiveness without buyer bias.</span>
                        </li>
                      </>
                    )}
                    {activeScreenIndex === 3 && (
                      <>
                        <li className="flex items-start gap-2">
                          <span className="text-emerald-500 font-bold">✓</span>
                          <span><strong>Unmasked Buyer Credentials:</strong> Verified buyer GSTIN, phone, and delivery site contact unmasked.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-emerald-500 font-bold">✓</span>
                          <span><strong>1-Tap PO Sign-off:</strong> Direct digital acceptance with immediate contract lock.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-emerald-500 font-bold">✓</span>
                          <span><strong>Instant PDF Generation:</strong> Download legally binding GST Purchase Order instantly.</span>
                        </li>
                      </>
                    )}
                    {activeScreenIndex === 4 && (
                      <>
                        <li className="flex items-start gap-2">
                          <span className="text-emerald-500 font-bold">✓</span>
                          <span><strong>4-Stage Mobile Stepper:</strong> Pickup Scheduled → In Progress → Ready for Delivery → Invoiced.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-emerald-500 font-bold">✓</span>
                          <span><strong>Proof Uploads:</strong> Attach delivery receipts, challans, or test certificates with phone camera.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-emerald-500 font-bold">✓</span>
                          <span><strong>Direct Settlement Release:</strong> Buyer signs off delivery for immediate direct escrow/bank transfer.</span>
                        </li>
                      </>
                    )}
                  </>
                )}
              </ul>
            </div>

            {/* Step Navigation Controls */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={activeScreenIndex === 0}
                onClick={goToPrevScreen}
                className="px-4 py-2 rounded-xl border bg-card text-xs font-bold text-foreground hover:bg-muted disabled:opacity-40 transition mobile-touch-target"
              >
                ← Previous Screen
              </button>
              <button
                type="button"
                onClick={goToNextScreen}
                className="flex-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-md hover:bg-primary/90 transition text-center mobile-touch-target"
              >
                {activeScreenIndex === screens.length - 1 ? `↻ Replay ${pipelineMode === 'buyer' ? 'Buyer' : 'Supplier'} Pipeline` : `Next: ${nextScreen.tabLabel} →`}
              </button>
            </div>
          </div>

          {/* Right Column: Realistic iPhone Device Mockup Rendering the Current Screen with Touch Swipe */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center order-1 lg:order-2">
            <div className="relative flex items-center justify-center w-full">
              {/* Left Mobile Chevron Button */}
              <button
                type="button"
                onClick={goToPrevScreen}
                disabled={activeScreenIndex === 0}
                aria-label="Previous step screen"
                className="hidden sm:flex absolute -left-4 lg:-left-6 z-40 w-10 h-10 rounded-full bg-card border border-border shadow-md items-center justify-center text-foreground hover:bg-muted disabled:opacity-30 transition active:scale-95"
              >
                ‹
              </button>

              {/* Phone Frame */}
              <MobilePhoneFrame
                title={showSupplierCapabilityPreview ? 'Quick Capability Editor' : currentScreen.title}
                badge={showSupplierCapabilityPreview ? 'Screen 00 · Radar Scope & Capabilities' : currentScreen.badge}
                badgeColor={
                  showSupplierCapabilityPreview
                    ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-300'
                    : currentScreen.badgeColor
                }
                activeTab={activePhoneTab}
                onTabClick={handlePhoneTabClick}
                size="md"
              >
                <div
                  className={`w-full h-full flex flex-col touch-pan-y relative ${
                    slideDirection === 'left'
                      ? 'animate-in slide-in-from-right-4 fade-in duration-200'
                      : 'animate-in slide-in-from-left-4 fade-in duration-200'
                  }`}
                  key={`${pipelineMode}-${activeScreenIndex}-${showSupplierCapabilityPreview}`}
                  {...swipeHandlers.handlers}
                >
                  {showSupplierCapabilityPreview ? (
                    <ScreenSupplierCapabilityPreview onClose={() => setShowSupplierCapabilityPreview(false)} />
                  ) : (
                    currentScreen.component
                  )}
                </div>
              </MobilePhoneFrame>

              {/* Right Mobile Chevron Button */}
              <button
                type="button"
                onClick={goToNextScreen}
                aria-label="Next step screen"
                className="hidden sm:flex absolute -right-4 lg:-right-6 z-40 w-10 h-10 rounded-full bg-card border border-border shadow-md items-center justify-center text-foreground hover:bg-muted transition active:scale-95"
              >
                ›
              </button>
            </div>

            {/* Visual Navigation Indicators (Dots & Step Progress & Swipe Hint) */}
            <div className="mt-4 flex flex-col items-center gap-2 w-full max-w-sm px-2 select-none">
              {/* Step Label & Interactive Dot Indicators */}
              <div className="flex items-center justify-between w-full px-2 text-xs">
                <button
                  type="button"
                  onClick={goToPrevScreen}
                  disabled={activeScreenIndex === 0}
                  className="sm:hidden px-2.5 py-1 rounded-lg border bg-card text-foreground hover:bg-muted disabled:opacity-30 transition text-xs font-bold"
                >
                  ‹ Prev
                </button>

                <div className="flex flex-col items-center mx-auto">
                  <span className="text-[11px] font-bold text-foreground">
                    Step {activeScreenIndex + 1} of {screens.length} · {currentScreen.tabLabel}
                  </span>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {screens.map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setSlideDirection(idx >= activeScreenIndex ? 'left' : 'right');
                          setActiveScreenIndex(idx);
                        }}
                        aria-label={`Go to step ${idx + 1}`}
                        className={`transition-all rounded-full ${
                          idx === activeScreenIndex
                            ? 'w-6 h-2 bg-primary shadow-xs'
                            : 'w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/60'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={goToNextScreen}
                  className="sm:hidden px-2.5 py-1 rounded-lg border bg-card text-foreground hover:bg-muted transition text-xs font-bold"
                >
                  Next ›
                </button>
              </div>

              {/* Visual Swipe Hint */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/60 border border-border/70 text-[10px] text-muted-foreground font-semibold">
                <span>👈</span>
                <span>Swipe left / right on phone screen to navigate steps</span>
                <span>👉</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
 * 7 HIGH-FIDELITY BUYER SCREENS
 * ========================================================================= */

// Buyer Screen 1: Sourcing Cockpit
function ScreenBuyerCockpit({ onNewRequirement }: { onNewRequirement: () => void }) {
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

// Buyer Screen 2: Voice Intake
function ScreenBuyerVoiceIntake({ onNext }: { onNext: () => void }) {
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

// Buyer Screen 3: Supplier Radar
function ScreenBuyerSupplierRadar({ onNext }: { onNext: () => void }) {
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

// Buyer Screen 4: Supplier Quoting
function ScreenBuyerQuoting({ onNext }: { onNext: () => void }) {
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

// Buyer Screen 5: Sealed Matrix
function ScreenBuyerMatrix({ onNext }: { onNext: () => void }) {
  return (
    <div className="p-3.5 space-y-3 text-left text-foreground">
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

// Buyer Screen 6: Committee Vote
function ScreenBuyerVoting({ onNext }: { onNext: () => void }) {
  return (
    <div className="p-3.5 space-y-3.5 text-left text-foreground">
      <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/30 p-2.5 flex items-center justify-between">
        <div>
          <span className="text-[9px] font-bold uppercase tracking-wider text-cyan-800 dark:text-cyan-300 block">
            Committee Quorum Status
          </span>
          <h5 className="text-xs font-black text-foreground">3 of 3 Votes Cast (100%)</h5>
        </div>
        <span className="text-base">🏛️</span>
      </div>

      <div className="rounded-xl border border-primary/30 bg-primary/5 p-2.5 space-y-1">
        <span className="text-[9px] font-bold text-muted-foreground block">Your Recommended Candidate:</span>
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs font-black text-foreground">Supplier A7K3 (L1)</span>
          <span className="text-xs font-black text-emerald-600">₹8,200 · ★ 9.4</span>
        </div>
      </div>

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

// Buyer Screen 7: Digital PO & Tracking
function ScreenBuyerOrderTracking({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="p-3.5 space-y-3.5 text-left text-foreground">
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

      <div className="rounded-xl border bg-card p-2.5 flex items-center justify-between">
        <div>
          <span className="text-[9px] text-muted-foreground block font-bold">Purchase Order Issued:</span>
          <span className="text-xs font-black text-foreground">PO-2026-0842 · ₹8,200</span>
        </div>
        <span className="rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] px-2 py-1 border border-emerald-500/30">
          📄 PDF Ready
        </span>
      </div>

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
        ↻ Back to Screen 01 (Cockpit Overview)
      </button>
    </div>
  );
}

/* =========================================================================
 * 5 HIGH-FIDELITY SUPPLIER SCREENS
 * ========================================================================= */

// Supplier Screen 1: Supplier Radar & Notification Hub
function ScreenSupplierHub({ onNext }: { onNext: () => void }) {
  return (
    <div className="p-3.5 space-y-3 text-left text-foreground">
      {/* Top Profile Summary */}
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
            ⚡
          </div>
          <div>
            <h4 className="text-xs font-bold text-foreground">Sri Vinayaka Works</h4>
            <span className="text-[10px] text-muted-foreground">Whitefield · Rewinding &amp; Pumps</span>
          </div>
        </div>
        <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[9px] font-bold border border-emerald-500/30">
          ⭐ 4.9 Verified
        </span>
      </div>

      {/* Filter Chips Bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px]">
        <span className="bg-primary text-white px-2 py-0.5 rounded-md font-bold shrink-0">📍 &lt; 10 km</span>
        <span className="bg-muted text-foreground px-2 py-0.5 rounded-md font-medium shrink-0">⚡ 5-25 HP</span>
        <span className="bg-muted text-foreground px-2 py-0.5 rounded-md font-medium shrink-0">🟢 Live RFQs (2)</span>
      </div>

      {/* Incoming Sealed RFQ Card */}
      <div className="rounded-2xl border-2 border-primary/40 bg-card p-3 space-y-2 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30 px-2 py-0.5 text-[9px] font-bold">
            ⚡ New Sealed Opportunity
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">4.2 km away</span>
        </div>
        <div>
          <h5 className="text-xs font-bold text-foreground">10 HP Submersible Motor Rewind</h5>
          <p className="text-[10px] text-muted-foreground">Palm Meadows RWA · Requires 6-month warranty</p>
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-[10px] bg-muted/30 p-2 rounded-xl">
          <div>
            <span className="text-muted-foreground block text-[9px]">Submission Window:</span>
            <span className="font-bold text-amber-600">⏳ Closes in 4 hrs</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[9px]">Protection:</span>
            <span className="font-bold text-primary">🔒 Identity Sealed</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onNext}
          className="w-full rounded-xl bg-primary py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition text-center flex items-center justify-center gap-1.5"
        >
          <span>⚡ Quote Now in 15s →</span>
        </button>
      </div>
    </div>
  );
}

// Supplier Screen 2: 15-Second Quoting Engine
function ScreenSupplierQuotingEngine({ onNext }: { onNext: () => void }) {
  return (
    <div className="p-3.5 space-y-3 text-left text-foreground">
      {/* Privacy Masking Banner */}
      <div className="rounded-xl bg-primary/10 border border-primary/20 p-2 text-[10px] flex items-center justify-between">
        <span className="font-bold text-primary flex items-center gap-1">
          <span>🔒</span> Masked as Supplier A7K3
        </span>
        <span className="text-muted-foreground">Zero Bias Evaluation</span>
      </div>

      {/* 3-Field Numeric Input Sheet */}
      <div className="space-y-2">
        <div>
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            1. Base Quoted Amount (₹ INR):
          </label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-foreground">₹</span>
            <input
              type="text"
              readOnly
              value="8,200"
              className="w-full rounded-xl border border-primary/40 bg-card pl-7 pr-3 py-2 text-sm font-black text-foreground shadow-2xs"
            />
          </div>
        </div>

        <div>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            2. GST Tax Split:
          </span>
          <div className="grid grid-cols-3 gap-1 mt-1">
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

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[9px] font-bold text-muted-foreground block">3. Delivery TAT:</label>
            <input
              type="text"
              readOnly
              value="3 Days"
              className="w-full rounded-lg border bg-card p-1.5 text-xs font-bold text-foreground mt-0.5"
            />
          </div>
          <div>
            <label className="text-[9px] font-bold text-muted-foreground block">Warranty SLA:</label>
            <input
              type="text"
              readOnly
              value="6 Months"
              className="w-full rounded-lg border bg-card p-1.5 text-xs font-bold text-foreground mt-0.5"
            />
          </div>
        </div>
      </div>

      {/* Net Total Summary */}
      <div className="rounded-xl border bg-muted/30 p-2 flex items-center justify-between text-xs">
        <span className="font-bold text-muted-foreground">Total with GST:</span>
        <span className="font-black text-emerald-600 text-sm">₹9,676</span>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full rounded-xl bg-emerald-700 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-800 transition text-center flex items-center justify-center gap-1.5"
      >
        <span>🔒 Seal &amp; Transmit Quote →</span>
      </button>
    </div>
  );
}

// Supplier Screen 3: Quote Status & Active Quotes
function ScreenSupplierQuoteStatus({ onNext }: { onNext: () => void }) {
  return (
    <div className="p-3.5 space-y-3 text-left text-foreground">
      <div className="flex items-center justify-between">
        <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          My Active Sealed Quotes (2)
        </h5>
        <span className="text-[10px] text-emerald-600 font-bold">● Live Updates</span>
      </div>

      {/* Active Quote 1: Shortlisted */}
      <div className="rounded-2xl border-2 border-emerald-500/40 bg-card p-3 space-y-2 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-bold">
            🟢 Shortlisted · L1 Rank
          </span>
          <span className="text-[9px] font-mono text-muted-foreground">RFQ #0842</span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h6 className="text-xs font-bold text-foreground">10 HP Borewell Motor</h6>
            <span className="text-[10px] text-muted-foreground">Alias: Supplier A7K3</span>
          </div>
          <span className="text-xs font-black text-foreground">₹8,200 (+18%)</span>
        </div>

        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-1.5 text-[10px] text-emerald-800 dark:text-emerald-300">
          ✓ Quorum voting active in buyer committee. Merit Score: <strong>★ 9.4</strong>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            className="flex-1 py-1.5 rounded-lg border text-[10px] font-semibold text-muted-foreground hover:bg-muted text-center"
          >
            ✏️ Revise Terms
          </button>
          <button
            type="button"
            onClick={onNext}
            className="flex-1 py-1.5 rounded-lg bg-primary text-white text-[10px] font-bold text-center"
          >
            View Stage →
          </button>
        </div>
      </div>

      {/* Active Quote 2: Sealed Under Review */}
      <div className="rounded-xl border bg-muted/20 p-2.5 space-y-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[9px] font-bold">
            🟡 Under Review
          </span>
          <span className="text-[9px] text-muted-foreground">RFQ #0839</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-foreground text-[11px]">CNC Precision Spindle</span>
          <span className="font-bold text-muted-foreground text-[11px]">₹14,500</span>
        </div>
      </div>
    </div>
  );
}

// Supplier Screen 4: Award Notification & PO Sign-off
function ScreenSupplierPoSignoff({ onNext }: { onNext: () => void }) {
  return (
    <div className="p-3.5 space-y-3 text-left text-foreground">
      {/* Award Banner */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-3 space-y-1 shadow-md">
        <span className="text-[9px] font-black uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
          🏆 Tender Awarded to You
        </span>
        <h5 className="text-xs font-black">
          PO Issued: PO-2026-0842 (₹9,676 Incl. GST)
        </h5>
        <p className="text-[10px] text-white/90">
          Buyer identity unmasked for execution.
        </p>
      </div>

      {/* Unmasked Buyer Credentials Card */}
      <div className="rounded-xl border bg-card p-2.5 space-y-1.5 text-xs">
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
          Client Entity &amp; Site Details:
        </span>
        <div className="space-y-0.5">
          <h6 className="font-bold text-foreground">Palm Meadows Residents Welfare Association</h6>
          <p className="text-[10px] text-muted-foreground font-mono">GSTIN: 29AAAAA0000A1Z5</p>
          <p className="text-[10px] text-muted-foreground">📍 Pump House #2, Phase 1, Whitefield, Bengaluru</p>
          <p className="text-[10px] text-primary font-semibold">📞 Site Incharge: +91 98450 11223</p>
        </div>
      </div>

      {/* Milestone Terms */}
      <div className="rounded-xl border bg-muted/30 p-2 space-y-1 text-[10px]">
        <span className="font-bold block">Agreed Terms:</span>
        <div className="flex justify-between text-muted-foreground">
          <span>Turnaround Time:</span>
          <span className="font-bold text-foreground">3 Days</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Warranty:</span>
          <span className="font-bold text-foreground">6 Months (On-Site)</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-700 transition text-center flex items-center justify-center gap-1.5"
      >
        <span>⚡ Accept PO &amp; Commit Delivery →</span>
      </button>
    </div>
  );
}

// Supplier Screen 5: Order Fulfillment & Milestone Tracker
function ScreenSupplierFulfillmentTracker({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="p-3.5 space-y-3 text-left text-foreground">
      {/* Order Header */}
      <div className="flex items-center justify-between border-b pb-2">
        <div>
          <span className="text-[9px] font-mono text-muted-foreground">PO-2026-0842</span>
          <h5 className="text-xs font-bold text-foreground">10 HP Borewell Motor</h5>
        </div>
        <span className="rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-[9px] font-bold border border-blue-500/30">
          In Execution (50%)
        </span>
      </div>

      {/* Interactive Milestone Stepper */}
      <div className="rounded-2xl border bg-card p-3 space-y-2.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
          Execution Milestones:
        </span>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between text-emerald-600 font-bold">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px]">✓</span>
              <span>1. Pickup Scheduled &amp; Received</span>
            </div>
            <span className="text-[9px] text-muted-foreground font-mono">10:30 AM</span>
          </div>

          <div className="flex items-center justify-between text-emerald-600 font-bold">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px]">✓</span>
              <span>2. Coil Rewinding in Progress</span>
            </div>
            <span className="text-[9px] text-muted-foreground font-mono">02:15 PM</span>
          </div>

          <div className="flex items-center justify-between text-primary font-black animate-pulse">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center text-[10px]">⚙️</span>
              <span>3. Ready for Delivery &amp; Testing</span>
            </div>
            <span className="text-[9px] bg-primary/20 px-1.5 py-0.2 rounded text-primary">Pending</span>
          </div>

          <div className="flex items-center justify-between text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px]">○</span>
              <span>4. Invoiced &amp; Final Settlement</span>
            </div>
            <span className="text-[9px] text-muted-foreground">₹9,676</span>
          </div>
        </div>
      </div>

      {/* Action Button: Update Milestone */}
      <button
        type="button"
        className="w-full rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition text-center flex items-center justify-center gap-1.5"
      >
        <span>📸 Mark Ready for Delivery &amp; Upload Slip →</span>
      </button>

      <button
        type="button"
        onClick={onRestart}
        className="w-full rounded-xl border border-border bg-card py-2 text-xs font-bold text-foreground hover:bg-muted transition text-center"
      >
        ↻ Back to Screen 01 (Radar Hub)
      </button>
    </div>
  );
}

// Quick Capability Editor Mockup for Phone Showcase
function ScreenSupplierCapabilityPreview({ onClose }: { onClose: () => void }) {
  const [selectedCats, setSelectedCats] = useState([
    'HVAC Repair',
    'Motor Rewind',
    'CNC Machining',
  ]);
  const [radius, setRadius] = useState('50 km');
  const [saved, setSaved] = useState(false);

  return (
    <div className="p-3.5 space-y-3 text-left text-foreground animate-in slide-in-from-bottom duration-200">
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">📡</span>
          <h5 className="text-xs font-bold text-foreground">Quick Capability Editor</h5>
        </div>
        <span className="text-[9px] bg-purple-500/20 text-purple-700 dark:text-purple-300 font-bold px-2 py-0.5 rounded-full">
          Radar Match
        </span>
      </div>

      <div className="rounded-xl bg-gradient-to-br from-purple-900 to-indigo-950 text-white p-2.5 space-y-1 text-xs">
        <div className="flex justify-between items-center text-[10px] font-bold text-purple-200">
          <span>RADAR MATCH READINESS</span>
          <span className="text-emerald-400">★ 98% Visibility</span>
        </div>
        <p className="text-[10px] text-purple-100">
          Surfacing ~14 RFQ alerts within {radius} of Whitefield.
        </p>
      </div>

      <div className="space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Categories &amp; Services:
        </span>
        <div className="flex flex-wrap gap-1">
          {[
            'HVAC Repair',
            'Motor Rewind',
            'CNC Machining',
            'Raw Metals',
            'IT Services',
          ].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() =>
                setSelectedCats((prev) =>
                  prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
                )
              }
              className={`rounded-lg px-2 py-1 text-[10px] font-semibold transition ${
                selectedCats.includes(cat)
                  ? 'bg-purple-600 text-white shadow-2xs'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {selectedCats.includes(cat) ? `✓ ${cat}` : `+ ${cat}`}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Operating Radius:
        </span>
        <div className="flex gap-1 text-[10px]">
          {['5 km', '15 km', '50 km', 'Pan-India'].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRadius(r)}
              className={`flex-1 rounded-lg py-1 font-bold transition ${
                radius === r ? 'bg-primary text-white shadow-2xs' : 'bg-muted text-muted-foreground'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          SLA &amp; Trust Badges:
        </span>
        <div className="flex flex-wrap gap-1 text-[9px] font-bold">
          <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-400/40 px-1.5 py-0.5 rounded">
            ✓ 24h SLA
          </span>
          <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-400/40 px-1.5 py-0.5 rounded">
            ✓ GST Verified
          </span>
          <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-400/40 px-1.5 py-0.5 rounded">
            ✓ MSME ZED
          </span>
        </div>
      </div>

      {saved && (
        <div className="rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 p-1.5 text-[10px] font-bold text-center">
          ✓ Radar match recalculated!
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setSaved(true);
          setTimeout(() => {
            setSaved(false);
            onClose();
          }, 600);
        }}
        className="w-full rounded-xl bg-purple-600 hover:bg-purple-700 text-white py-2 text-xs font-bold transition shadow-md text-center cursor-pointer"
      >
        💾 Save &amp; Recalculate Radar →
      </button>
    </div>
  );
}

