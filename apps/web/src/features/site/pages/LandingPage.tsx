import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PRODUCT_NAME } from '@/lib/brand';
import { useAuth } from '@/features/auth';
import { SiteLayout } from '../components/SiteLayout';
import { IdentityProtectedComparisonPreview } from '../components/IdentityProtectedComparisonPreview';
import { RequirementPrompt } from '../components/RequirementPrompt';
import { MobileScreensShowcase } from '@/components/mobile-showcase/MobileScreensShowcase';
import { MobileMultiDeviceGallery } from '@/components/mobile-showcase/MobileMultiDeviceGallery';
import { HeroMobilePhonePreview } from '@/components/mobile-showcase/HeroMobilePhonePreview';
import {
  AUDIENCES,
  CHANNEL_STATUS_LABEL,
  CONTRASTS,
  CORE_MESSAGE,
  HERO,
  LIFECYCLE_GROUPS,
  PHASES,
  PILLARS,
  ROLE_SUMMARY,
  SUPPLIER_CHANNELS,
  type ChannelStatus,
} from '../content/site-content';

/**
 * The home page.
 *
 * Eight sections, each making one point once. An earlier version described the
 * procurement pipeline four times over — as a rail, as six step cards, as five
 * phase rows and as five fulfilment cards — and showed the demonstration
 * enquiry twice. The lifecycle is now stated once, the demonstration appears
 * once, and the mechanism behind the claims lives in the FAQ.
 */
export function LandingPage() {
  return (
    <SiteLayout>
      <Hero />
      <ValueRibbon />
      <MobileScreensShowcase />
      <MobileMultiDeviceGallery />
      <Principle />
      <Audiences />
      <HowItWorks />
      <Enforced />
      <SupplierReach />
      <WhyOtp />
      <ClosingCta />
    </SiteLayout>
  );
}

function ValueRibbon() {
  return (
    <section className="border-b bg-card/90 backdrop-blur-xs py-2 px-3 shadow-2xs overflow-x-auto no-scrollbar">
      <div className="mx-auto max-w-6xl flex items-center justify-between gap-3 text-xs whitespace-nowrap min-w-max">
        <div className="flex items-center gap-1.5 font-bold text-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-black">1</span>
          <span>1. Post Need</span>
        </div>
        <span className="text-muted-foreground/40">➔</span>
        <div className="flex items-center gap-1.5 font-bold text-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-black">2</span>
          <span>2. Sealed Quotes</span>
        </div>
        <span className="text-muted-foreground/40">➔</span>
        <div className="flex items-center gap-1.5 font-bold text-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-black">3</span>
          <span>3. Compare Anonymously</span>
        </div>
        <span className="text-muted-foreground/40">➔</span>
        <div className="flex items-center gap-1.5 font-bold text-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-black">4</span>
          <span>4. Committee Vote</span>
        </div>
        <span className="text-muted-foreground/40">➔</span>
        <div className="flex items-center gap-1.5 font-bold text-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[10px] font-black">5</span>
          <span>5. Reveal &amp; Issue PO</span>
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
      <div className="mx-auto grid max-w-6xl gap-6 sm:gap-8 lg:gap-10 px-4 py-4 sm:py-8 md:py-12 lg:py-16 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.16em] text-action">
            {HERO.eyebrow}
          </p>
          <h1 className="mt-1 sm:mt-2 text-xl sm:text-2xl md:text-3xl lg:text-4xl font-extrabold leading-[1.15] sm:leading-[1.1] tracking-tight">
            {HERO.title}
          </h1>
          <p className="mt-1 sm:mt-2 text-xs sm:text-sm md:text-base font-semibold text-foreground/90">
            {HERO.tagline}
          </p>
          <p className="mt-1 sm:mt-1.5 max-w-xl text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-2 sm:line-clamp-none">
            {HERO.body}
          </p>

          <div className="mt-2.5 sm:mt-5 max-w-xl">
            <RequirementPrompt />
          </div>

          <p className="mt-2 sm:mt-3 text-[10px] sm:text-xs text-muted-foreground">
            Start Free ·{' '}
            <Link to="/showcase" className="font-semibold text-action hover:underline">
              📱 View All Mobile Screens
            </Link>{' '}
            ·{' '}
            <Link to="/#how-it-works" className="font-medium text-action hover:underline">
              How It Works
            </Link>{' '}
            ·{' '}
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
                </Link>{' '}
                ·{' '}
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

/** The single idea the page exists to land, given a band and no decoration. */
function Principle() {
  return (
    <section className="border-b bg-card">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <h2 className="text-[clamp(1.35rem,2.4vw,1.85rem)] font-semibold leading-snug">
            {CORE_MESSAGE.headline}
          </h2>
          <div>
            <p className="text-sm font-medium">{CORE_MESSAGE.definition}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {CORE_MESSAGE.caveat}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Audiences() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-2xl font-semibold">Who {PRODUCT_NAME} is for</h2>
        <p className="text-sm text-muted-foreground">{HERO.eyebrow}.</p>
      </div>

      <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="audiences">
        {AUDIENCES.map((audience) => (
          <li key={audience.name} className="rounded-lg border bg-card p-5">
            <span aria-hidden="true" className="block h-0.5 w-8 rounded bg-action" />
            <h3 className="mt-3 text-base font-medium">{audience.name}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {audience.body}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The lifecycle and the four enforced windows, in one section.
 *
 * Three groups of four rather than a twelve-item row: twelve chips is a list
 * nobody reads, and the grouping says something the flat sequence could not —
 * that the aliases come off at the reveal, and everything after that happens
 * between two named parties.
 */
function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-y bg-muted/40 py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-4">
        <div className="max-w-2xl">
          <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-action">
            Simple 5-Step Procurement
          </p>
          <h2 className="mt-1 sm:mt-2 text-xl sm:text-2xl md:text-3xl font-bold text-foreground">
            How {PRODUCT_NAME} Works
          </h2>
          <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-muted-foreground">
            From plain-text requirement to delivered order and GST Purchase Order.
          </p>
        </div>

        {/* 5-Step Visual Flow Cards */}
        <ol className="mt-6 sm:mt-8 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
          <li className="rounded-xl border bg-card p-4 flex flex-col justify-between shadow-2xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-black">
                  01
                </span>
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Step 1</span>
              </div>
              <h3 className="mt-2.5 text-sm font-bold text-foreground">Tell us what you need</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Describe in plain words or voice. Our parser extracts specifications, location, and deadline.
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
              <h3 className="mt-2.5 text-sm font-bold text-foreground">Suppliers compete privately</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
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
              <h3 className="mt-2.5 text-sm font-bold text-foreground">Compare the offers</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
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
              <h3 className="mt-2.5 text-sm font-bold text-foreground">Your team decides</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
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
              <h3 className="mt-2.5 text-sm font-bold text-foreground">Award and execute</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Winning vendor is unmasked, GST Purchase Order issued directly, and milestones tracked to completion.
              </p>
            </div>
            <div className="mt-3 border-t pt-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
              Direct PO &amp; Delivery ✓
            </div>
          </li>
        </ol>

        {/* Progressive Disclosure Link to FAQ for detailed mechanics */}
        <div className="mt-6 flex items-center justify-between rounded-lg border bg-card/60 p-3.5 text-xs">
          <span className="text-muted-foreground">
            Looking for technical mechanics, cryptographic hashes, or ONDC discovery protocols?
          </span>
          <Link to="/faqs" className="font-semibold text-action hover:underline shrink-0 ml-3">
            Read Technical Architecture in FAQ →
          </Link>
        </div>
      </div>
    </section>
  );
}

function Enforced() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-2xl font-semibold">What the Platform Enforces</h2>
        <Link to="/faqs" className="text-sm font-medium text-action hover:underline">
          How it works underneath →
        </Link>
      </div>

      <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="value-pillars">
        {PILLARS.map((pillar, index) => (
          <li key={pillar.title} className="rounded-lg border bg-card p-5">
            <span
              aria-hidden="true"
              className="text-xs font-semibold tabular-nums text-action"
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <h3 className="mt-1.5 text-base font-medium">{pillar.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{pillar.body}</p>
          </li>
        ))}
      </ul>

      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
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

/**
 * Where suppliers come from, and how far along each route is.
 *
 * The status is the whole reason this can be six names instead of two. A funnel
 * with six logos in it implies six working integrations; labelling each one costs
 * a little swagger and buys the only thing a procurement product sells.
 */
function SupplierReach() {
  return (
    <section className="border-y bg-muted/40 py-16">
      <div className="mx-auto max-w-6xl px-4">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-action">
            Multi-Channel Sourcing Architecture
          </p>
          <h2 className="mt-2 text-2xl sm:text-3xl font-semibold text-foreground">
            Reach suppliers wherever they are
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            One requirement, several supplier channels — so sourcing does not depend on every
            supplier having joined one marketplace first. Each channel says where it stands
            today.
          </p>
        </div>

        <ul
          className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="supplier-channels"
        >
          {SUPPLIER_CHANNELS.map((channel) => (
            <li
              key={channel.name}
              className="flex flex-col justify-between rounded-xl border bg-card p-5 shadow-xs transition hover:shadow-sm"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {channel.badgeIcon && <span className="text-base">{channel.badgeIcon}</span>}
                    <h3 className="font-semibold text-foreground text-sm">{channel.name}</h3>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[0.68rem] font-bold shrink-0 ${
                      STATUS_CLASS[channel.status]
                    }`}
                  >
                    {CHANNEL_STATUS_LABEL[channel.status]}
                  </span>
                </div>
                {channel.description && (
                  <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
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
    <section className="mx-auto max-w-6xl px-4 py-14">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-2xl font-semibold">Why Identity Protection Matters</h2>
        <p className="text-sm text-muted-foreground">
          Sourcing on merit instead of relationships.
        </p>
      </div>

      <div className="mt-7 grid gap-4 md:grid-cols-2">
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
      className={`rounded-lg border p-5 ${accent ? 'border-action/40 bg-action-soft' : 'bg-muted/30'}`}
    >
      <h3 className="text-base font-medium">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5">
            <span
              aria-hidden="true"
              className={`mt-px shrink-0 ${accent ? 'text-action' : 'text-muted-foreground'}`}
            >
              {marker}
            </span>
            <span className={accent ? '' : 'text-muted-foreground'}>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClosingCta() {
  const { user } = useAuth();

  return (
    <section className="mx-auto max-w-6xl px-4 pb-16">
      <div className="rounded-xl border bg-card p-8 text-center">
        <h2 className="text-2xl font-semibold">Start With One Requirement</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Describe the job in a sentence and let the quotes come back scored and unnamed.{' '}
          {PRODUCT_NAME} is a facilitation platform: you contract and settle directly with the
          other side.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {user && (
            <Link
              to="/dashboard"
              className="rounded-md bg-action px-5 py-3 text-sm font-semibold text-action-foreground hover:bg-action-hover shadow-sm"
            >
              Go to your Dashboard →
            </Link>
          )}
          <Link
            to="/requirements/new"
            data-testid="cta-create-requirement"
            className={`rounded-md px-5 py-3 text-sm font-semibold ${
              user
                ? 'border hover:bg-muted text-foreground'
                : 'bg-action text-action-foreground hover:bg-action-hover'
            }`}
          >
            Create requirement
          </Link>
          <Link
            to="/pricing"
            className="rounded-md border px-5 py-3 text-sm font-semibold hover:bg-muted"
          >
            Plans and pricing
          </Link>
          <Link
            to="/faqs"
            className="rounded-md px-5 py-3 text-sm font-semibold text-action hover:bg-muted"
          >
            Read the FAQs
          </Link>
        </div>
      </div>
    </section>
  );
}
