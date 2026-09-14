import { Link } from 'react-router-dom';
import { PRODUCT_FULL_NAME, PRODUCT_NAME } from '@/lib/brand';
import { SiteLayout } from '../components/SiteLayout';

export function AboutPage() {
  return (
    <SiteLayout>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14 overflow-x-hidden">
        {/* Header */}
        <div className="max-w-2xl space-y-2">
          <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.18em] text-action">About Us</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground leading-tight tracking-tight">
            Procurement Decided on Merit, Sealed by Cryptographic Proof
          </h1>
          <p className="text-xs sm:text-sm md:text-base leading-relaxed text-muted-foreground">
            {PRODUCT_NAME} ({PRODUCT_FULL_NAME}) is an identity-protected, mobile-first procurement operating system built for Indian MSMEs, RWAs, and facility managers.
          </p>
        </div>

        {/* 3 Core Metric / Pillar Badges */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border bg-card p-4 shadow-2xs space-y-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary text-base">
              🛡️
            </span>
            <h2 className="text-sm font-bold text-foreground">Zero-Bias Protocol</h2>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Cryptographically salted aliases mask vendor names until award lock. Quotes compete strictly on price, delivery speed, and warranty.
            </p>
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-2xs space-y-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 text-purple-700 dark:text-purple-300 text-base">
              📱
            </span>
            <h2 className="text-sm font-bold text-foreground">Mobile-First Pipeline</h2>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              7-Screen buyer workflow and 5-screen supplier pipeline optimized for rapid voice dictation, WhatsApp quoting, and 1-tap voting.
            </p>
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-2xs space-y-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-base">
              ⚖️
            </span>
            <h2 className="text-sm font-bold text-foreground">Direct Settlement</h2>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              0% platform commission, zero lead fees. Buyers contract and pay suppliers directly with immutable audit trails.
            </p>
          </div>
        </div>

        {/* Tactical Overview: MSMEs & RWAs */}
        <div className="mt-8 rounded-2xl border bg-muted/20 p-5 sm:p-6 space-y-3">
          <h2 className="text-xs font-bold text-foreground uppercase tracking-wider text-action">
            OTP Core Mission for India
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 text-xs leading-relaxed">
            <div className="space-y-1.5">
              <h3 className="font-bold text-foreground">For Housing Societies &amp; RWAs</h3>
              <p className="text-muted-foreground text-[11px]">
                Eliminates committee disputes and kickback allegations with transparent, multi-member voting rooms, recorded justifications, and tamper-proof decision trails.
              </p>
            </div>
            <div className="space-y-1.5">
              <h3 className="font-bold text-foreground">For MSMEs &amp; Facility Managers</h3>
              <p className="text-muted-foreground text-[11px]">
                Slashes procurement turnaround from weeks to 30 minutes. Instant voice intake broadcasts RFQs across WhatsApp and local supplier networks with auto-split GST.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Actions */}
        <div className="mt-8 flex flex-wrap items-center gap-3 pt-2">
          <Link
            to="/signup"
            className="rounded-xl bg-action px-5 py-2.5 text-xs font-bold text-action-foreground hover:bg-action-hover shadow-xs"
          >
            Register Your Organisation →
          </Link>
          <Link
            to="/showcase"
            className="rounded-xl border bg-card px-5 py-2.5 text-xs font-bold text-foreground hover:bg-muted"
          >
            📱 Mobile Simulator
          </Link>
          <Link
            to="/faqs"
            className="rounded-xl border border-transparent px-4 py-2.5 text-xs font-bold text-action hover:underline"
          >
            Read FAQs &amp; Architecture
          </Link>
        </div>
      </div>
    </SiteLayout>
  );
}
