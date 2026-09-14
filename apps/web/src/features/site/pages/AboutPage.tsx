import { Link } from 'react-router-dom';
import { PRODUCT_FULL_NAME, PRODUCT_NAME } from '@/lib/brand';
import { SiteLayout } from '../components/SiteLayout';

export function AboutPage() {
  return (
    <SiteLayout>
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-action">About Us</p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold text-foreground leading-tight">
            Procurement decided on merit, backed by cryptographic proof
          </h1>
          <p className="mt-3 text-sm sm:text-base leading-relaxed text-muted-foreground">
            {PRODUCT_NAME} ({PRODUCT_FULL_NAME}) is an identity-protected, mobile-first procurement platform
            built for Indian MSMEs, Resident Welfare Associations (RWAs), institutions, and facility managers.
          </p>
        </div>

        {/* Core Mission & Pillars Grid */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4 shadow-2xs">
            <span className="text-lg">🛡️</span>
            <h2 className="text-sm font-bold mt-2 text-foreground">Zero-Bias Evaluation</h2>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
              Cryptographically masked aliases prevent favoritism, predatory pricing, and vendor lock-in. Quotes compete strictly on price, timeline, and warranty.
            </p>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-2xs">
            <span className="text-lg">📱</span>
            <h2 className="text-sm font-bold mt-2 text-foreground">Mobile-First Pipeline</h2>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
              7-Screen buyer workflow and 5-screen supplier pipeline optimized for rapid quotes on WhatsApp and seamless on-the-go approvals.
            </p>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-2xs">
            <span className="text-lg">⚖️</span>
            <h2 className="text-sm font-bold mt-2 text-foreground">Direct Settlement</h2>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
              Zero platform commissions, zero middleman custody. Buyers and suppliers contract directly with immutable audit trails.
            </p>
          </div>
        </div>

        {/* Problem vs Solution Summary */}
        <div className="mt-8 rounded-2xl border bg-muted/20 p-5 sm:p-6">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider text-action">
            Why We Built {PRODUCT_NAME}
          </h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 text-xs leading-relaxed">
            <div>
              <h3 className="font-bold text-foreground">Conventional Sourcing Pitfalls</h3>
              <ul className="mt-1.5 space-y-1.5 text-muted-foreground">
                <li>• Decisions often made socially before paperwork is filed</li>
                <li>• Quoting history scattered across fragmented WhatsApp chats and emails</li>
                <li>• Inability to prove to committee or auditors why a quote was selected</li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-foreground">{PRODUCT_NAME} Operating System</h3>
              <ul className="mt-1.5 space-y-1.5 text-muted-foreground">
                <li>• Database-enforced deadlines, sealed quotes, and anonymous comparisons</li>
                <li>• Democratic committee voting with recorded rationales</li>
                <li>• Instant GST Purchase Orders and verifiable delivery tracking</li>
              </ul>
            </div>
          </div>
        </div>

        {/* CTA Banner */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
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
            📱 Explore 7-Screen Mobile Pipeline
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
