import { Link } from 'react-router-dom';
import { PRODUCT_NAME } from '@/lib/brand';
import { useAuth } from '@/features/auth';
import { SiteLayout } from '../components/SiteLayout';
import { RequirementPrompt } from '../components/RequirementPrompt';
import { MobileScreensShowcase } from '@/components/mobile-showcase/MobileScreensShowcase';
import { HERO } from '../content/site-content';

export function LandingPage() {
  return (
    <SiteLayout>
      <div className="overflow-x-hidden max-w-full">
        <Hero />
        <MobileScreensShowcase />
        <MetricBadgesRibbon />
        <SupplierNetworkHighlight />
        <ClosingCta />
      </div>
    </SiteLayout>
  );
}

/**
 * 100% Mobile-First Hero Section spotlighting:
 * - Direct value proposition headline
 * - Instant intake RequirementPrompt
 * - Quick action pathways leading directly into the Mobile Showcase below
 */
function Hero() {
  const { user } = useAuth();

  return (
    <section className="border-b bg-gradient-to-b from-muted/50 via-background to-background pt-8 pb-10 sm:pt-12 sm:pb-14">
      <div className="mx-auto max-w-4xl px-4 text-center">
        {/* Eyebrow Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-primary shadow-2xs">
          <span>⚡</span>
          <span>{HERO.eyebrow}</span>
        </div>

        {/* Product-Led Hero Headline */}
        <h1 className="mt-3 text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold leading-[1.15] tracking-tight text-foreground">
          Tell us what you need. Get scored, identity-protected quotes in 30 Minutes
        </h1>

        {/* Crisp Sub-headline */}
        <p className="mx-auto mt-3 max-w-2xl text-xs sm:text-sm md:text-base text-muted-foreground leading-relaxed">
          Zero platform commission, zero relationship bias. Post your requirement in seconds via voice or text and receive sealed, merit-scored quotations directly on your smartphone.
        </p>

        {/* Quick Requirement Prompt / Intake Trigger */}
        <div className="mx-auto mt-6 max-w-xl text-left">
          <RequirementPrompt />
        </div>

        {/* Quick Navigation & Persona Pathways */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] sm:text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Start Free</span>
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
            <Link to="/dashboard" className="font-bold text-action hover:underline">
              Return to Dashboard →
            </Link>
          ) : (
            <>
              <Link
                to="/signup?side=supplier"
                data-testid="cta-supplier"
                className="font-semibold text-action hover:underline"
              >
                Quote as a Supplier
              </Link>
              <span>·</span>
              <Link to="/login" className="font-medium text-action hover:underline">
                Log In
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * High-impact metric badges ribbon highlighting the 4 core guarantees:
 * - 30-Min Quoting
 * - 0% Platform Commission
 * - 100% Identity Protected
 * - Direct Settlement
 */
function MetricBadgesRibbon() {
  const metrics = [
    {
      icon: '⚡',
      title: '30-Min Quoting',
      description: 'Instant regional RFQ broadcast & 15-second mobile quote responses.',
      badgeColor: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300/40',
    },
    {
      icon: '💰',
      title: '0% Platform Commission',
      description: 'Zero middleman cut, ₹0 lead fees, completely free for verified suppliers.',
      badgeColor: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300/40',
    },
    {
      icon: '🛡️',
      title: '100% Identity Protected',
      description: 'Cryptographic vendor aliases until award lock to eliminate bias & kickbacks.',
      badgeColor: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-300/40',
    },
    {
      icon: '🤝',
      title: 'Direct Settlement',
      description: 'Direct buyer-supplier GST contracting, PO execution, and bank transfers.',
      badgeColor: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-300/40',
    },
  ];

  return (
    <section className="border-b bg-card/60 backdrop-blur-xs py-8 sm:py-10">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((metric) => (
            <div
              key={metric.title}
              className="flex flex-col justify-between rounded-2xl border bg-card p-4 sm:p-5 shadow-2xs hover:shadow-xs transition"
            >
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-base font-bold shrink-0">
                    {metric.icon}
                  </span>
                  <h3 className="text-sm font-bold text-foreground">{metric.title}</h3>
                </div>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  {metric.description}
                </p>
              </div>
              <div className="mt-3 pt-2.5 border-t border-border/50">
                <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${metric.badgeColor}`}>
                  ✓ Guaranteed Protocol
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Minimal Supplier Network highlight with direct CTAs
 */
function SupplierNetworkHighlight() {
  return (
    <section className="border-b bg-gradient-to-b from-card to-muted/30 py-10 sm:py-14">
      <div className="mx-auto max-w-6xl px-4">
        <div className="max-w-3xl">
          <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-3 py-1 text-xs font-bold border border-emerald-300 dark:border-emerald-700">
            🚚 Supplier &amp; Contractor Network
          </span>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold mt-3 tracking-tight text-foreground">
            Are You a Verified Supplier, Contractor, or Fabricator?
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Win institutional purchase orders based 100% on price, turnaround, and warranty merit.
            Zero sales commission, zero lead fees, and direct settlement with the buyer.
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4 shadow-2xs flex flex-col justify-between">
            <div>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold">
                ⚡
              </span>
              <h3 className="text-xs sm:text-sm font-bold mt-2.5 text-foreground">15-Second Quoting</h3>
              <p className="mt-1 text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
                Receive RFQ alerts via WhatsApp or email. Submit quotes in 15 seconds with auto-split GST and firm delivery dates.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              ✓ No App Install Required
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-2xs flex flex-col justify-between">
            <div>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold">
                🛡️
              </span>
              <h3 className="text-xs sm:text-sm font-bold mt-2.5 text-foreground">Identity-Protected Evaluation</h3>
              <p className="mt-1 text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
                Evaluators review your quote as an anonymous alias. No favoritism, no vendor lock-in, pure merit-based selection.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              ✓ 100% Fair Competition
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-2xs flex flex-col justify-between">
            <div>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold">
                💰
              </span>
              <h3 className="text-xs sm:text-sm font-bold mt-2.5 text-foreground">Direct PO &amp; Settlement</h3>
              <p className="mt-1 text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
                Upon award, receive unmasked buyer credentials and official GST Purchase Orders. Contract and settle directly with zero middleman cuts.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              ✓ ₹0 Platform Commission
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            to="/signup?side=supplier"
            data-testid="cta-supplier"
            className="rounded-xl bg-primary text-primary-foreground font-bold px-5 py-2.5 text-xs hover:opacity-90 transition shadow-2xs"
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

/**
 * Minimal Closing CTA Section
 */
function ClosingCta() {
  const { user } = useAuth();

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <div className="rounded-2xl border bg-card p-6 sm:p-8 text-center shadow-xs">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">Start With One Requirement</h2>
        <p className="mx-auto mt-2 max-w-xl text-xs sm:text-sm leading-relaxed text-muted-foreground">
          Describe the job in a sentence and let quotes come back scored and unnamed.{' '}
          {PRODUCT_NAME} is a facilitation platform: you contract and settle directly with the other side.
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
            Create Requirement →
          </Link>
          <Link
            to="/pricing"
            className="rounded-xl border px-5 py-2.5 font-bold hover:bg-muted text-foreground"
          >
            Plans and Pricing
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
