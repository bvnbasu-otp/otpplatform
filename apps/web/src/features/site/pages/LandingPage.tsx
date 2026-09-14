import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PRODUCT_NAME } from '@/lib/brand';
import { useAuth } from '@/features/auth';
import { SiteLayout } from '../components/SiteLayout';
import { IdentityProtectedComparisonPreview } from '../components/IdentityProtectedComparisonPreview';
import { RequirementPrompt } from '../components/RequirementPrompt';
import { MobileScreensShowcase } from '@/components/mobile-showcase/MobileScreensShowcase';
import { HeroMobilePhonePreview } from '@/components/mobile-showcase/HeroMobilePhonePreview';
import {
  AUDIENCES,
  CHANNEL_STATUS_LABEL,
  CONTRASTS,
  HERO,
  PILLARS,
  ROLE_SUMMARY,
  SUPPLIER_CHANNELS,
  type ChannelStatus,
} from '../content/site-content';

export function LandingPage() {
  return (
    <SiteLayout>
      <div className="overflow-x-hidden max-w-full">
        <Hero />
        <ValueRibbon />
        <MobileScreensShowcase />
        <SupplierShowcase />
        <Audiences />
        <HowItWorksSummary />
        <Enforced />
        <SupplierReach />
        <WhyOtp />
        <ClosingCta />
      </div>
    </SiteLayout>
  );
}

/**
 * Value Ribbon: 5-Step high-level overview clearly showing mapping to the 7-Screen End-to-End Mobile Pipeline
 */
function ValueRibbon() {
  return (
    <section className="border-b bg-card/95 backdrop-blur-xs py-3 px-3 shadow-2xs overflow-x-auto no-scrollbar">
      <div className="mx-auto max-w-6xl flex items-center justify-between gap-3 text-xs whitespace-nowrap min-w-max">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-black">
            1
          </span>
          <div>
            <p className="font-bold text-foreground text-xs">1. Post Need</p>
            <p className="text-[10px] text-muted-foreground">Screens 01–02: Cockpit &amp; Voice</p>
          </div>
        </div>

        <span className="text-muted-foreground/40 font-bold">➔</span>

        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-black">
            2
          </span>
          <div>
            <p className="font-bold text-foreground text-xs">2. Sealed Quoting</p>
            <p className="text-[10px] text-muted-foreground">Screens 03–04: Radar &amp; 15s Quote</p>
          </div>
        </div>

        <span className="text-muted-foreground/40 font-bold">➔</span>

        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-black">
            3
          </span>
          <div>
            <p className="font-bold text-foreground text-xs">3. Compare Anonymously</p>
            <p className="text-[10px] text-muted-foreground">Screen 05: Sealed Matrix</p>
          </div>
        </div>

        <span className="text-muted-foreground/40 font-bold">➔</span>

        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-black">
            4
          </span>
          <div>
            <p className="font-bold text-foreground text-xs">4. Committee Vote</p>
            <p className="text-[10px] text-muted-foreground">Screen 06: Consensus Voting</p>
          </div>
        </div>

        <span className="text-muted-foreground/40 font-bold">➔</span>

        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-black">
            5
          </span>
          <div>
            <p className="font-bold text-emerald-700 dark:text-emerald-400 text-xs">5. Reveal &amp; Issue PO</p>
            <p className="text-[10px] text-muted-foreground">Screen 07: Digital PO &amp; Tracking</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Hero() {
  const { user } = useAuth();
  const [previewMode, setPreviewMode] = useState<'phone' | 'matrix'>('phone');

  return (
    <section className="border-b bg-gradient-to-b from-muted/50 to-background">
      <div className="mx-auto grid max-w-6xl gap-6 sm:gap-8 lg:gap-10 px-4 py-6 sm:py-8 md:py-10 lg:py-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.16em] text-action">
            {HERO.eyebrow}
          </p>
          <h1 className="mt-1 sm:mt-2 text-xl sm:text-2xl md:text-3xl lg:text-4xl font-extrabold leading-[1.15] sm:leading-[1.1] tracking-tight text-foreground">
            Tell us what you need. Get scored, identity-protected quotes in 30 Minutes
          </h1>
          <p className="mt-2 text-xs sm:text-sm md:text-base font-semibold text-foreground/90">
            {HERO.tagline}
          </p>
          <p className="mt-1 sm:mt-1.5 max-w-xl text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {HERO.body}
          </p>

          <div className="mt-3 sm:mt-5 max-w-xl">
            <RequirementPrompt />
          </div>

          <p className="mt-3 text-[10px] sm:text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
            <span>Start Free</span>
            <span>·</span>
            <Link to="/showcase" className="font-semibold text-action hover:underline">
              📱 View Mobile Simulator
            </Link>
            <span>·</span>
            <Link to="/faqs#workflow" className="font-medium text-action hover:underline">
              How It Works
            </Link>
            <span>·</span>
            {user ? (
              <Link to="/dashboard" className="font-semibold text-action hover:underline">
                Return to Dashboard →
              </Link>
            ) : (
              <>
                <Link
                  to="/signup?side=supplier"
                  data-testid="cta-supplier"
                  className="font-medium text-action hover:underline"
                >
                  Quote as a Supplier
                </Link>
                <span>·</span>
                <Link to="/login" className="font-medium text-action hover:underline">
                  Log In
                </Link>
              </>
            )}
          </p>
        </div>

        {/* Right Column: Interactive Phone Mockup with View Mode Switcher */}
        <div className="flex flex-col items-center">
          <div className="mb-2 flex items-center gap-1.5 bg-card/80 border rounded-full p-1 shadow-2xs text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setPreviewMode('phone')}
              className={`px-3 py-1 rounded-full transition ${
                previewMode === 'phone'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              📱 Mobile App View
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('matrix')}
              className={`px-3 py-1 rounded-full transition ${
                previewMode === 'matrix'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              📊 Table View
            </button>
          </div>

          {previewMode === 'phone' ? (
            <HeroMobilePhonePreview />
          ) : (
            <IdentityProtectedComparisonPreview />
          )}

          {/* Fallback hidden element for automated test assertions */}
          <div className="sr-only">
            <IdentityProtectedComparisonPreview />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Dedicated Supplier Showcase section with high-impact CTAs
 */
function SupplierShowcase() {
  return (
    <section className="border-y bg-gradient-to-b from-card to-muted/30 py-14">
      <div className="mx-auto max-w-6xl px-4">
        <div className="max-w-3xl">
          <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-3 py-1 text-xs font-bold border border-emerald-300 dark:border-emerald-700">
            🚚 Supplier &amp; Contractor Network
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold mt-3 tracking-tight text-foreground">
            Are You a Verified Supplier, Contractor, or Fabricator?
          </h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Win institutional purchase orders based 100% on price, turnaround, and warranty merit.
            Zero commission, zero lead fees, and direct settlement with the buyer.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between">
            <div>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary text-sm font-bold">
                ⚡
              </span>
              <h3 className="text-sm font-bold mt-3 text-foreground">15-Second Quoting</h3>
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                Receive RFQ alerts via WhatsApp or email. Submit quotes in 15 seconds with auto-split GST and firm delivery dates.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              ✓ No App Install Required
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between">
            <div>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary text-sm font-bold">
                🛡️
              </span>
              <h3 className="text-sm font-bold mt-3 text-foreground">Identity-Protected Evaluation</h3>
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                Evaluators review your quote as an anonymous alias. No favoritism, no vendor lock-in, pure merit-based selection.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              ✓ 100% Fair Competition
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between">
            <div>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary text-sm font-bold">
                💰
              </span>
              <h3 className="text-sm font-bold mt-3 text-foreground">Direct PO &amp; Settlement</h3>
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                Upon award, receive unmasked buyer credentials and official GST Purchase Orders. Contract and settle directly with zero middleman cuts.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              ✓ ₹0 Platform Commission
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            to="/signup?side=supplier"
            className="rounded-xl bg-primary text-primary-foreground font-bold px-5 py-2.5 text-xs hover:opacity-90 transition shadow-xs"
          >
            Quote as a Supplier →
          </Link>
          <Link
            to="/supplier/register"
            className="rounded-xl border border-border bg-card hover:bg-muted font-bold px-5 py-2.5 text-xs transition"
          >
            Join Supplier Network
          </Link>
          <Link
            to="/login"
            className="rounded-xl border border-transparent text-action hover:underline font-bold px-4 py-2.5 text-xs"
          >
            Supplier Portal Log In
          </Link>
        </div>
      </div>
    </section>
  );
}

function Audiences() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">Who {PRODUCT_NAME} is for</h2>
        <p className="text-xs text-muted-foreground">{HERO.eyebrow}.</p>
      </div>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="audiences">
        {AUDIENCES.map((audience) => (
          <li key={audience.name} className="rounded-xl border bg-card p-4 shadow-2xs">
            <span aria-hidden="true" className="block h-1 w-6 rounded bg-action" />
            <h3 className="mt-2.5 text-sm font-bold text-foreground">{audience.name}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {audience.body}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HowItWorksSummary() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-y bg-muted/40 py-12">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-action">
              5-Step Procurement Architecture
            </p>
            <h2 className="mt-1 text-xl sm:text-2xl font-bold text-foreground">
              How {PRODUCT_NAME} Works
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              From plain-text requirement to delivered order and GST Purchase Order.
            </p>
          </div>
          <Link
            to="/faqs#workflow"
            className="text-xs font-bold text-action hover:underline shrink-0"
          >
            Detailed 7-Screen Architecture in FAQ →
          </Link>
        </div>

        <ol className="mt-6 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
          <li className="rounded-xl border bg-card p-4 flex flex-col justify-between shadow-2xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-black">
                  01
                </span>
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Step 1</span>
              </div>
              <h3 className="mt-2.5 text-xs font-bold text-foreground">Tell us what you need</h3>
              <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                Describe in plain words or voice. Instant intake extracts specs, location, and deadline.
              </p>
            </div>
            <div className="mt-3 border-t pt-2 text-[10px] text-action font-semibold">
              Instant Intake →
            </div>
          </li>

          <li className="rounded-xl border bg-card p-4 flex flex-col justify-between shadow-2xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-black">
                  02
                </span>
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Step 2</span>
              </div>
              <h3 className="mt-2.5 text-xs font-bold text-foreground">Suppliers compete privately</h3>
              <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                Verified regional vendors submit sealed quotes with firm turnaround, pricing, and warranty.
              </p>
            </div>
            <div className="mt-3 border-t pt-2 text-[10px] text-action font-semibold">
              Sealed Quotations →
            </div>
          </li>

          <li className="rounded-xl border bg-card p-4 flex flex-col justify-between shadow-2xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-black">
                  03
                </span>
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Step 3</span>
              </div>
              <h3 className="mt-2.5 text-xs font-bold text-foreground">Compare the offers</h3>
              <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                Side-by-side comparison on merit: cost, delivery speed, and warranty SLAs under protected aliases.
              </p>
            </div>
            <div className="mt-3 border-t pt-2 text-[10px] text-action font-semibold">
              Zero-Bias Matrix →
            </div>
          </li>

          <li className="rounded-xl border bg-card p-4 flex flex-col justify-between shadow-2xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-black">
                  04
                </span>
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Step 4</span>
              </div>
              <h3 className="mt-2.5 text-xs font-bold text-foreground">Your team decides</h3>
              <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                Fast-track solo approval or democratic committee voting with recorded decision rationales.
              </p>
            </div>
            <div className="mt-3 border-t pt-2 text-[10px] text-action font-semibold">
              Governance &amp; Vote →
            </div>
          </li>

          <li className="rounded-xl border bg-card p-4 flex flex-col justify-between shadow-2xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-black">
                  05
                </span>
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">Step 5</span>
              </div>
              <h3 className="mt-2.5 text-xs font-bold text-foreground">Award and execute</h3>
              <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                Winning vendor is unmasked, GST Purchase Order issued directly, and order progress tracked to completion.
              </p>
            </div>
            <div className="mt-3 border-t pt-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
              Direct PO &amp; Delivery ✓
            </div>
          </li>
        </ol>
      </div>
    </section>
  );
}

function Enforced() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">What the Platform Enforces</h2>
        <Link to="/faqs" className="text-xs font-medium text-action hover:underline">
          How it works underneath →
        </Link>
      </div>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="value-pillars">
        {PILLARS.map((pillar, index) => (
          <li key={pillar.title} className="rounded-xl border bg-card p-4 shadow-2xs">
            <span
              aria-hidden="true"
              className="text-xs font-bold tabular-nums text-action"
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <h3 className="mt-1.5 text-sm font-bold text-foreground">{pillar.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{pillar.body}</p>
          </li>
        ))}
      </ul>

      <p className="mt-5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
        {ROLE_SUMMARY.headline} {ROLE_SUMMARY.body}
      </p>
    </section>
  );
}

const STATUS_CLASS: Record<ChannelStatus, string> = {
  LIVE: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  PILOT: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  PLANNED: 'border-border bg-muted text-muted-foreground',
};

function SupplierReach() {
  return (
    <section className="border-y bg-muted/40 py-12">
      <div className="mx-auto max-w-6xl px-4">
        <div className="max-w-2xl">
          <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-action">
            Multi-Channel Sourcing Architecture
          </p>
          <h2 className="mt-1 text-xl sm:text-2xl font-bold text-foreground">
            Reach suppliers wherever they are
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            One requirement, several supplier channels — so sourcing does not depend on every
            supplier having joined one marketplace first. Each channel says where it stands today.
          </p>
        </div>

        <ul
          className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="supplier-channels"
        >
          {SUPPLIER_CHANNELS.map((channel) => (
            <li
              key={channel.name}
              className="flex flex-col justify-between rounded-xl border bg-card p-4 shadow-2xs transition hover:shadow-xs"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {channel.badgeIcon && <span className="text-sm">{channel.badgeIcon}</span>}
                    <h3 className="font-bold text-foreground text-xs">{channel.name}</h3>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold shrink-0 ${
                      STATUS_CLASS[channel.status]
                    }`}
                  >
                    {CHANNEL_STATUS_LABEL[channel.status]}
                  </span>
                </div>
                {channel.description && (
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    {channel.description}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function WhyOtp() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">Why Identity Protection Matters</h2>
        <p className="text-xs text-muted-foreground">
          Sourcing on merit instead of relationships.
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <ContrastColumn
          title="Conventional Sourcing Challenges"
          items={CONTRASTS.conventional}
          marker="—"
        />
        <ContrastColumn
          title={`Institutional Sourcing on ${PRODUCT_NAME}`}
          items={CONTRASTS.otp}
          marker="✓"
          accent
        />
      </div>
    </section>
  );
}

function ContrastColumn({
  title,
  items,
  marker,
  accent,
}: {
  title: string;
  items: string[];
  marker: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${accent ? 'border-action/40 bg-action-soft' : 'bg-muted/30'}`}
    >
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      <ul className="mt-2.5 space-y-1.5 text-xs">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span
              aria-hidden="true"
              className={`mt-px shrink-0 font-bold ${accent ? 'text-action' : 'text-muted-foreground'}`}
            >
              {marker}
            </span>
            <span className={accent ? 'text-foreground' : 'text-muted-foreground'}>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClosingCta() {
  const { user } = useAuth();

  return (
    <section className="mx-auto max-w-6xl px-4 pb-14">
      <div className="rounded-2xl border bg-card p-6 sm:p-8 text-center shadow-xs">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">Start With One Requirement</h2>
        <p className="mx-auto mt-2 max-w-xl text-xs sm:text-sm leading-relaxed text-muted-foreground">
          Describe the job in a sentence and let the quotes come back scored and unnamed.{' '}
          {PRODUCT_NAME} is a facilitation platform: you contract and settle directly with the
          other side.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3 text-xs">
          {user && (
            <Link
              to="/dashboard"
              className="rounded-xl bg-action px-5 py-2.5 font-bold text-action-foreground hover:bg-action-hover shadow-xs"
            >
              Go to your Dashboard →
            </Link>
          )}
          <Link
            to="/requirements/new"
            data-testid="cta-create-requirement"
            className={`rounded-xl px-5 py-2.5 font-bold ${
              user
                ? 'border hover:bg-muted text-foreground'
                : 'bg-action text-action-foreground hover:bg-action-hover shadow-xs'
            }`}
          >
            Create requirement
          </Link>
          <Link
            to="/pricing"
            className="rounded-xl border px-5 py-2.5 font-bold hover:bg-muted text-foreground"
          >
            Plans and pricing
          </Link>
          <Link
            to="/faqs"
            className="rounded-xl px-5 py-2.5 font-bold text-action hover:bg-muted"
          >
            Read the FAQs
          </Link>
        </div>
      </div>
    </section>
  );
}
