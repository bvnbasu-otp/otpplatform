import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { SiteLayout } from '../components/SiteLayout';
import { RequirementPrompt } from '../components/RequirementPrompt';

export function LandingPage() {
  return (
    <SiteLayout>
      <div className="overflow-x-hidden max-w-full space-y-12 sm:space-y-16 pb-12">
        {/* SECTION 1: HERO & PRODUCT VISUAL */}
        <HeroSection />

        {/* SECTION 2: HOW OTP WORKS */}
        <HowItWorksSection />

        {/* SECTION 3: BUYERS & SUPPLIERS */}
        <BuyersAndSuppliersSection />

        {/* SECTION 4: PRICING */}
        <PricingSection />

        {/* SECTION 5: FAQ */}
        <FaqSection />

        {/* SECTION 6: ABOUT OTP */}
        <AboutSection />
      </div>
    </SiteLayout>
  );
}

// =============================================================================
// SECTION 1: HERO & PRODUCT VISUAL
// =============================================================================
function HeroSection() {
  const { user } = useAuth();

  return (
    <section className="relative pt-6 pb-4 sm:pt-10 sm:pb-8 border-b bg-gradient-to-b from-muted/40 via-background to-background">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* Text & CTAs */}
        <div className="text-center max-w-3xl mx-auto">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-0.5 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-primary shadow-2xs">
            <span>⚡</span>
            <span>OTP — Open Trade &amp; Procurement</span>
          </div>

          {/* Headline */}
          <h1 className="mt-3 text-2xl sm:text-4xl md:text-5xl font-extrabold leading-[1.15] tracking-tight text-foreground">
            Identity-Protected Competitive Sourcing
          </h1>

          {/* Supporting Message */}
          <p className="mt-3 text-xs sm:text-sm md:text-base text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Create a requirement, compare competing supplier quotes, and make better procurement decisions — without exposing identities during sourcing.
          </p>

          {/* Primary & Secondary Action CTAs */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            {user ? (
              <Link
                to="/dashboard"
                className="min-h-[48px] rounded-xl bg-primary px-6 py-3 text-xs sm:text-sm font-extrabold text-primary-foreground shadow-sm hover:opacity-90 active:scale-98 transition flex items-center justify-center gap-2"
              >
                <span>⚡ Go to Dashboard</span>
                <span>→</span>
              </Link>
            ) : (
              <Link
                to="/signup"
                className="min-h-[48px] rounded-xl bg-primary px-6 py-3 text-xs sm:text-sm font-extrabold text-primary-foreground shadow-sm hover:opacity-90 active:scale-98 transition flex items-center justify-center gap-2"
              >
                <span>Start Sourcing</span>
                <span>→</span>
              </Link>
            )}

            <a
              href="#how-it-works"
              className="min-h-[48px] rounded-xl border border-border bg-card px-5 py-3 text-xs sm:text-sm font-bold text-foreground hover:bg-muted active:scale-98 transition flex items-center justify-center gap-1.5"
            >
              <span>See How It Works</span>
              <span>↓</span>
            </a>
          </div>

          {/* Instant Intake Trigger */}
          <div className="mt-6 max-w-xl mx-auto text-left">
            <RequirementPrompt />
          </div>
        </div>

        {/* HERO PRODUCT VISUAL: REALISTIC QUOTE COMPARISON CARD */}
        <div className="mt-8 max-w-lg mx-auto">
          <HeroQuoteComparisonVisual />
        </div>

        {/* TRUST SIGNALS RIBBON */}
        <div className="mt-8 pt-6 border-t border-border/50">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 text-[11px] sm:text-xs font-semibold text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1">
              🔒 Identity Protected
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1">
              ⚖ Fair Competition
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1">
              📊 Comparable Quotes
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1">
              🗳 Transparent Decision
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1">
              🏆 Controlled Award
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1">
              📋 Complete Audit Trail
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Product Mockup Card representing live identity-protected quote comparison
 */
function HeroQuoteComparisonVisual() {
  const [selectedQuote, setSelectedQuote] = useState<number>(0);

  const quotes = [
    {
      alias: 'Supplier #01',
      code: 'Alias 7F2B',
      price: '₹42,000',
      turnaround: '5 Days',
      warranty: '12 Mo Warranty',
      score: '94.2 Score',
      badge: 'L1 Lowest Price',
      badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    },
    {
      alias: 'Supplier #02',
      code: 'Alias 9E4A',
      price: '₹45,500',
      turnaround: '4 Days',
      warranty: '18 Mo Warranty',
      score: '91.8 Score',
      badge: 'Fastest Delivery',
      badgeClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30',
    },
    {
      alias: 'Supplier #03',
      code: 'Alias 3C1D',
      price: '₹44,250',
      turnaround: '6 Days',
      warranty: '24 Mo Warranty',
      score: '93.5 Score',
      badge: 'Best Warranty',
      badgeClass: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30',
    },
  ];

  return (
    <div className="rounded-2xl border-2 border-primary/20 bg-card p-4 sm:p-5 shadow-lg shadow-primary/5 transition hover:shadow-xl">
      {/* Mockup Card Header */}
      <div className="flex items-start justify-between gap-2 border-b pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
              RFQ-2026-0842
            </span>
            <span className="text-[11px] font-semibold text-muted-foreground">
              3 Competitive Quotes
            </span>
          </div>
          <h2 className="mt-1 text-sm sm:text-base font-bold text-foreground">
            Borewell Motor Replacement (10 HP)
          </h2>
        </div>

        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-bold">
          🔒 Sealed Quotes
        </span>
      </div>

      {/* Quote Items */}
      <div className="mt-3 space-y-2.5">
        {quotes.map((q, idx) => {
          const isSelected = selectedQuote === idx;
          return (
            <div
              key={q.alias}
              onClick={() => setSelectedQuote(idx)}
              className={`rounded-xl border p-3 transition cursor-pointer flex items-center justify-between gap-3 ${
                isSelected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/20 shadow-2xs'
                  : 'border-border/60 bg-muted/20 hover:bg-muted/40'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-foreground">
                    {q.alias}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    ({q.code})
                  </span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${q.badgeClass}`}>
                    {q.badge}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{q.turnaround}</span>
                  <span>•</span>
                  <span>{q.warranty}</span>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-sm sm:text-base font-extrabold text-foreground tabular-nums">
                  {q.price}
                </div>
                <div className="text-[10px] font-semibold text-primary tabular-nums">
                  ★ {q.score}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Card Footer */}
      <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between gap-2 text-xs">
        <span className="text-[11px] text-muted-foreground">
          Identities revealed only upon final buyer award.
        </span>
        <Link
          to="/signup"
          className="rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-bold px-3 py-1.5 text-[11px] transition shrink-0"
        >
          Compare &amp; Award →
        </Link>
      </div>
    </div>
  );
}

// =============================================================================
// SECTION 2: HOW OTP WORKS
// =============================================================================
const CANONICAL_LIFECYCLE_STAGES = [
  'Requirement',
  'Discovery',
  'RFQ',
  'Identity-Protected Evaluation',
  'Market Intelligence',
  'Committee Vote',
  'Award',
  'Reveal',
  'PO',
  'Work Order',
  'Invoice',
  'Payment',
  'Performance',
  'Audit',
] as const;

function HowItWorksSection() {
  const steps = [
    {
      num: '01',
      icon: '✍️',
      title: 'Create Requirement',
      desc: 'Tell us what you need via text or regional voice.',
    },
    {
      num: '02',
      icon: '🔍',
      title: 'Find Suppliers',
      desc: 'Regional verified suppliers are matched instantly.',
    },
    {
      num: '03',
      icon: '⚡',
      title: 'Receive Quotes',
      desc: 'Suppliers submit competitive quotes under aliases.',
    },
    {
      num: '04',
      icon: '📊',
      title: 'Compare',
      desc: 'See comparable offers without identity bias.',
    },
    {
      num: '05',
      icon: '🗳️',
      title: 'Decide',
      desc: 'Vote with your committee, review and select.',
    },
    {
      num: '06',
      icon: '🏆',
      title: 'Award & Complete',
      desc: 'PO → Work Order → Invoice → Direct Settlement.',
    },
  ];

  return (
    <section id="how-it-works" className="scroll-mt-16 px-4 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            How OTP Works
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
            Six simple steps from requirement to completed work order.
          </p>
        </div>

        {/* Canonical 14-Stage Governed Lifecycle Strip */}
        <div className="mt-6 rounded-2xl border bg-card/60 p-3.5 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-action">
              Canonical Procurement Lifecycle
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">14 Governed Stages</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] font-medium">
            {CANONICAL_LIFECYCLE_STAGES.map((stage, idx) => (
              <span key={stage} className="flex items-center gap-1.5 shrink-0">
                <span className="shrink-0 rounded-lg border bg-muted/40 px-2.5 py-1 text-foreground shadow-2xs whitespace-nowrap">
                  <span className="text-muted-foreground font-mono text-[9px] mr-1">{(idx + 1).toString().padStart(2, '0')}</span>
                  {stage}
                </span>
                {idx < CANONICAL_LIFECYCLE_STAGES.length - 1 && (
                  <span className="text-muted-foreground/50 shrink-0">→</span>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* 6-Step Flow (Responsive Vertical on Mobile, Grid on Desktop) */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {steps.map((step) => (
            <div
              key={step.num}
              className="relative rounded-2xl border bg-card p-4 sm:p-5 shadow-2xs hover:shadow-xs transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-lg">
                    {step.icon}
                  </span>
                  <span className="font-mono text-xs font-extrabold text-muted-foreground/60">
                    STEP {step.num}
                  </span>
                </div>
                <h3 className="mt-3 text-sm sm:text-base font-bold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// SECTION 3: BUYERS & SUPPLIERS
// =============================================================================
function BuyersAndSuppliersSection() {
  return (
    <section className="px-4 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Designed for Buyers and Suppliers
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
            A level playing field where competition drives the best outcome for both sides.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {/* BUYERS CARD */}
          <div className="rounded-2xl border-2 border-primary/20 bg-card p-5 sm:p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-2xl">🏢</span>
                <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-[10px] font-bold">
                  FOR BUYERS
                </span>
              </div>
              <h3 className="mt-3 text-lg sm:text-xl font-extrabold text-foreground">
                Buyers
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                For Individuals, MSMEs, RWAs, and Procurement Teams.
              </p>

              <ul className="mt-4 space-y-2 text-xs text-foreground/90">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">✓</span>
                  <span>Create requirements in 30 seconds via voice or text</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">✓</span>
                  <span>Get competing quotes from verified regional suppliers</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">✓</span>
                  <span>Compare quotes fairly without relationship bias</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">✓</span>
                  <span>Make better, committee-backed procurement decisions</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">✓</span>
                  <span>Manage the full lifecycle from PO to direct invoice</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 pt-4 border-t border-border/50">
              <Link
                to="/signup"
                className="w-full min-h-[48px] rounded-xl bg-primary text-primary-foreground font-bold px-4 py-3 text-xs sm:text-sm flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-98 transition shadow-2xs"
              >
                <span>Start Sourcing</span>
                <span>→</span>
              </Link>
            </div>
          </div>

          {/* SUPPLIERS CARD */}
          <div className="rounded-2xl border-2 border-emerald-500/20 bg-card p-5 sm:p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-2xl">🚚</span>
                <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold">
                  FOR SUPPLIERS
                </span>
              </div>
              <h3 className="mt-3 text-lg sm:text-xl font-extrabold text-foreground">
                Suppliers
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                For Verified Contractors, Fabricators, and Vendors.
              </p>

              <ul className="mt-4 space-y-2 text-xs text-foreground/90">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>Discover relevant regional RFQs in your category</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>Quote competitively within 30 minutes with zero sales overhead</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>Compete fairly on price, turnaround, and warranty merit</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>Win verified commercial business without paying lead fees</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>Track purchase orders and receive direct buyer payments</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 pt-4 border-t border-border/50">
              <Link
                to="/signup?side=supplier"
                data-testid="cta-supplier"
                className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-3 text-xs sm:text-sm flex items-center justify-center gap-1.5 active:scale-98 transition shadow-2xs"
              >
                <span>Join as Supplier</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// SECTION 4: PRICING
// =============================================================================
function PricingSection() {
  return (
    <section id="pricing" className="scroll-mt-16 px-4 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Simple, Transparent Pricing
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
            Start free with your first requirement. Upgrade as your procurement scales.
          </p>
        </div>

        {/* 3 BUYER PRICING CARDS */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {/* INDIVIDUAL */}
          <div className="rounded-2xl border bg-card p-5 shadow-2xs flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Individual
              </span>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-extrabold text-foreground">
                  First RFQ FREE
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  ₹149 / additional RFQ
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                For property owners and individual buyers needing quick, competitive quotes.
              </p>

              <ul className="mt-4 space-y-2 text-xs text-foreground/80">
                <li className="flex items-center gap-2">✓ 1 Free Starter RFQ</li>
                <li className="flex items-center gap-2">✓ Identity-Protected Quoting</li>
                <li className="flex items-center gap-2">✓ Direct Supplier Settle on Award</li>
                <li className="flex items-center gap-2">✓ Instant WhatsApp Updates</li>
              </ul>
            </div>

            <div className="mt-6 pt-4 border-t">
              <Link
                to="/signup"
                className="w-full min-h-[44px] rounded-xl border border-primary text-primary hover:bg-primary/10 font-bold px-4 py-2.5 text-xs flex items-center justify-center transition"
              >
                Start Free
              </Link>
            </div>
          </div>

          {/* RWA / MSME (MOST POPULAR) */}
          <div className="rounded-2xl border-2 border-primary bg-card p-5 shadow-md relative flex flex-col justify-between">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary text-primary-foreground px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-wider shadow-2xs">
              Most Popular
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                RWA / MSME
              </span>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-extrabold text-foreground">
                  ₹999 <span className="text-xs font-normal text-muted-foreground">/ mo</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  ₹9,999 / year · 5 RFQs/mo included
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                For housing societies, facility managers, and growing businesses.
              </p>

              <ul className="mt-4 space-y-2 text-xs text-foreground/80">
                <li className="flex items-center gap-2">✓ 5 Included RFQs / month</li>
                <li className="flex items-center gap-2">✓ Committee Voting Room</li>
                <li className="flex items-center gap-2">✓ Weighted Scoring Rubrics</li>
                <li className="flex items-center gap-2">✓ PO &amp; Work Order Generation</li>
                <li className="flex items-center gap-2">✓ Complete Statutory Audit Trail</li>
              </ul>
            </div>

            <div className="mt-6 pt-4 border-t">
              <Link
                to="/signup"
                className="w-full min-h-[44px] rounded-xl bg-primary text-primary-foreground hover:opacity-90 font-bold px-4 py-2.5 text-xs flex items-center justify-center transition shadow-2xs"
              >
                Start Growing
              </Link>
            </div>
          </div>

          {/* ENTERPRISE */}
          <div className="rounded-2xl border bg-card p-5 shadow-2xs flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Enterprise
              </span>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-extrabold text-foreground">
                  Custom
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Tailored governance &amp; scale
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                For larger procurement operations, institutions, and multi-unit organizations.
              </p>

              <ul className="mt-4 space-y-2 text-xs text-foreground/80">
                <li className="flex items-center gap-2">✓ Unlimited Committee Members</li>
                <li className="flex items-center gap-2">✓ Custom Approval Workflows</li>
                <li className="flex items-center gap-2">✓ ERP &amp; Statutory Integration</li>
                <li className="flex items-center gap-2">✓ Dedicated Support &amp; SLAs</li>
              </ul>
            </div>

            <div className="mt-6 pt-4 border-t">
              <Link
                to="/about-us"
                className="w-full min-h-[44px] rounded-xl border border-border hover:bg-muted font-bold px-4 py-2.5 text-xs flex items-center justify-center transition"
              >
                Contact Us
              </Link>
            </div>
          </div>
        </div>

        {/* SUPPLIER PRICING BLOCK */}
        <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                Suppliers
              </span>
              <span className="rounded-full bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 px-2 py-0.2 text-[10px] font-extrabold">
                FREE TO JOIN
              </span>
            </div>
            <p className="text-xs sm:text-sm font-bold text-foreground">
              Suppliers pay when they win.
            </p>
            <p className="text-xs text-muted-foreground">
              Receive RFQs free · Submit quotes free · Success fee: 0.5% of confirmed transaction value upon award.
            </p>
          </div>

          <Link
            to="/signup?side=supplier"
            data-testid="cta-supplier-pricing"
            className="shrink-0 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 text-xs transition shadow-2xs"
          >
            Register as Supplier →
          </Link>
        </div>

        {/* PROCUREMENT REWARD CALLOUT */}
        <div className="mt-3 text-center text-xs text-muted-foreground font-medium">
          🎁 Buyers can earn a <span className="font-bold text-foreground">0.1% OTP Procurement Reward</span> on eligible completed transactions.
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// SECTION 5: FAQ ACCORDION
// =============================================================================
function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: 'What is OTP?',
      a: 'OTP (Open Trade & Procurement) is an identity-protected competitive sourcing platform where buyers and suppliers compete transparently on price, turnaround, and warranty.',
    },
    {
      q: 'Who can use OTP?',
      a: 'Individual buyers, MSMEs, Residential Welfare Associations (RWAs), communities, and enterprises looking for fair, verified vendor sourcing without middleman markups.',
    },
    {
      q: 'How does identity protection work?',
      a: 'Supplier and buyer identities are replaced with cryptographic aliases during quoting and evaluation to eliminate bias, favoritism, and kickbacks. Real identities are revealed only upon award.',
    },
    {
      q: 'How do suppliers participate?',
      a: 'Verified suppliers receive relevant regional RFQs via WhatsApp or email, review technical requirements, and submit competitive quotes within 30 minutes.',
    },
    {
      q: 'How much does OTP cost?',
      a: 'Buyers get their first RFQ free, with plans starting at ₹149/RFQ or ₹999/month for RWAs/MSMEs. Suppliers join for free and only pay a 0.5% success fee when they win a transaction.',
    },
    {
      q: 'When does the supplier pay?',
      a: 'Suppliers pay zero upfront lead fees or listing charges. The 0.5% success fee applies only after a purchase order is awarded and confirmed.',
    },
    {
      q: 'Can I use OTP for my RWA / MSME procurement?',
      a: 'Yes. OTP provides committee voting rooms, quorum governance, and statutory audit exports specifically designed for RWAs, housing societies, and MSMEs.',
    },
  ];

  return (
    <section id="faqs" className="scroll-mt-16 px-4 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Frequently Asked Questions
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
            Clear answers about identity-protected sourcing and platform governance.
          </p>
        </div>

        <div className="mt-8 space-y-2.5">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={faq.q}
                className="rounded-xl border bg-card overflow-hidden shadow-2xs transition"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  className="w-full text-left p-3.5 sm:p-4 text-xs sm:text-sm font-bold text-foreground flex items-center justify-between gap-3 min-h-[48px] hover:bg-muted/30 transition cursor-pointer"
                >
                  <span>{faq.q}</span>
                  <span className="text-base text-muted-foreground shrink-0 font-mono">
                    {isOpen ? '−' : '+'}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-3.5 sm:px-4 pb-3.5 sm:pb-4 text-xs text-muted-foreground leading-relaxed border-t border-border/40 pt-2.5 bg-muted/10">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// SECTION 6: ABOUT OTP
// =============================================================================
function AboutSection() {
  return (
    <section id="about" className="scroll-mt-16 px-4 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border bg-gradient-to-b from-card to-muted/30 p-6 sm:p-8 shadow-xs text-center space-y-4">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary">
            <span>🛡️</span>
            <span>About OTP</span>
          </div>

          <h2 className="text-lg sm:text-2xl font-extrabold text-foreground tracking-tight">
            Identity-Protected Competitive Sourcing
          </h2>

          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-xl mx-auto">
            OTP — Open Trade &amp; Procurement is a procurement platform designed to make competitive sourcing more transparent, fair, and efficient.
          </p>

          <p className="text-xs text-muted-foreground/90 max-w-lg mx-auto">
            Complexity in the engine. Simplicity in the cockpit.
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/signup"
              className="min-h-[48px] rounded-xl bg-primary text-primary-foreground font-bold px-5 py-2.5 text-xs hover:opacity-90 transition shadow-2xs flex items-center gap-1.5"
            >
              <span>Start Sourcing Free</span>
              <span>→</span>
            </Link>
            <Link
              to="/about-us"
              className="min-h-[48px] rounded-xl border border-border bg-card hover:bg-muted font-bold px-5 py-2.5 text-xs transition flex items-center gap-1.5"
            >
              <span>Learn More About OTP</span>
              <span>→</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
