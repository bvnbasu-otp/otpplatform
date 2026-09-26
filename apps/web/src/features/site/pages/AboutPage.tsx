import { Link } from 'react-router-dom';
import { PRODUCT_FULL_NAME, PRODUCT_NAME } from '@/lib/brand';
import { SiteLayout } from '../components/SiteLayout';

export function AboutPage() {
  return (
    <SiteLayout>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14 overflow-x-hidden">
        {/* Header */}
        <div className="max-w-2xl space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.18em] text-action">About Us</p>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground font-medium">Last updated: 26 September 2026</span>
          </div>
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
              6-Stage commercial procurement workflow and 5-screen supplier pipeline optimized for rapid voice dictation, WhatsApp quoting, and 1-tap voting.
            </p>
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-2xs space-y-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-base">
              ⚖️
            </span>
            <h2 className="text-sm font-bold text-foreground">Direct Settlement</h2>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              0% platform commission, zero lead fees. Buyers contract and pay suppliers directly with end-to-end audit trails.
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

        {/* Real-World Case Study: Durga Rainbow RWA */}
        <div className="mt-8 rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div>
              <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                Case Study · Housing Society Governance
              </span>
              <h2 className="mt-1 text-base sm:text-lg font-bold text-foreground">
                Durga Rainbow Flat Owner Welfare Association, Mahadevapura
              </h2>
            </div>
            <span className="text-[11px] font-medium text-muted-foreground">
              141 Residential Units · Bengaluru
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 text-xs leading-relaxed">
            <div className="space-y-1">
              <h3 className="font-bold text-foreground flex items-center gap-1.5">
                <span>⚠️</span> Sourcing Challenge
              </h3>
              <p className="text-muted-foreground text-[11px]">
                Urgent requirement for a 10 HP submersible borewell motor rewinding with a tight 3-day turnaround, needing committee consensus without allegations of vendor favoritism.
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-foreground flex items-center gap-1.5">
                <span>🛡️</span> OTP Solution
              </h3>
              <p className="text-muted-foreground text-[11px]">
                1-Tap broadcast to verified local engineering suppliers with identity-protected sealed comparison, automated GST breakdown, and digital committee quorum voting.
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-foreground flex items-center gap-1.5">
                <span>🏆</span> Governance Outcome
              </h3>
              <p className="text-muted-foreground text-[11px]">
                Procurement completed in 48 hours with 100% audit compliance, transparent price discovery, and mutual identity reveal upon digital PO issuance.
              </p>
            </div>
          </div>
        </div>

        {/* Product Leadership & Ownership */}
        <div className="mt-8 rounded-2xl border bg-card p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center gap-2 border-b border-border/60 pb-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary text-sm">
              👤
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-action">Product Leadership &amp; Provenance</p>
              <h2 className="text-base font-bold text-foreground">Executive Architecture &amp; Ownership</h2>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 text-xs">
            <div className="rounded-xl border bg-muted/20 p-3 space-y-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Product Creator &amp; Author</span>
              <p className="font-extrabold text-foreground text-sm">Baskar Loganathan</p>
              <p className="text-[11px] text-muted-foreground">Original concept, domain architecture, and cryptographic protocol design.</p>
            </div>

            <div className="rounded-xl border bg-muted/20 p-3 space-y-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Product Manager</span>
              <p className="font-extrabold text-foreground text-sm">Baskar Loganathan</p>
              <p className="text-[11px] text-muted-foreground">Product roadmap, feature specifications, and canonical procurement governance.</p>
            </div>

            <div className="rounded-xl border bg-muted/20 p-3 space-y-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">CEO / Founder</span>
              <p className="font-extrabold text-foreground text-sm">Baskar Loganathan</p>
              <p className="text-[11px] text-muted-foreground">Executive direction, commercial pilot execution, and platform leadership.</p>
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
