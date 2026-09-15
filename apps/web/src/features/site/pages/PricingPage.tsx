import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PRODUCT_NAME } from '@/lib/brand';
import { SiteLayout } from '../components/SiteLayout';
import {
  SUBSCRIPTION_TIERS,
  type BillingCycle,
} from '@/features/subscription';

export function PricingPage() {
  const [cycle, setCycle] = useState<BillingCycle>('MONTHLY');

  return (
    <SiteLayout>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14 overflow-x-hidden">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <span className="rounded-full bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 px-3 py-1 text-xs font-bold border border-emerald-500/30">
            ⚡ Predictable Prepaid Access
          </span>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            30-day or 365-day prepaid access for buyers. Suppliers quote <strong>100% free forever</strong> with zero commissions.
          </p>

          {/* Billing Cycle Switcher */}
          <div className="pt-3 inline-flex items-center rounded-xl border bg-muted/40 p-1 text-xs">
            <button
              type="button"
              onClick={() => setCycle('MONTHLY')}
              className={`rounded-lg px-4 py-1.5 font-bold transition ${
                cycle === 'MONTHLY'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Monthly (30 Days)
            </button>
            <button
              type="button"
              onClick={() => setCycle('YEARLY')}
              className={`rounded-lg px-4 py-1.5 font-bold transition flex items-center gap-1.5 ${
                cycle === 'YEARLY'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>Yearly (365 Days)</span>
              <span className="rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-1.5 py-0.2 border border-emerald-400/40">
                Save ~17%
              </span>
            </button>
          </div>
        </div>

        {/* Clean 3-Card Structure: Individual, RWA/MSME, Enterprise */}
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {/* Card 1: Individual / Single Buyer */}
          <section className="rounded-2xl border bg-card p-5 flex flex-col justify-between shadow-2xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-blue-500/10 text-blue-800 dark:text-blue-300 text-[10px] font-bold px-2 py-0.5">
                  Individual
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">Solo Buyers</span>
              </div>
              <h2 className="text-lg font-bold mt-2 text-foreground">
                Individual &amp; Sole Proprietor
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                For independent property owners and solo facility managers.
              </p>

              <div className="mt-4 pb-4 border-b">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-foreground">
                    ₹{cycle === 'MONTHLY'
                      ? SUBSCRIPTION_TIERS.TIER_1_MSME.monthlyPrice.toLocaleString('en-IN')
                      : SUBSCRIPTION_TIERS.TIER_1_MSME.yearlyPrice.toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    / {cycle === 'MONTHLY' ? '30 days' : '365 days'}
                  </span>
                </div>
                {cycle === 'YEARLY' && (
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1 block">
                    ✓ Saves ₹{SUBSCRIPTION_TIERS.TIER_1_MSME.yearlySavings.toLocaleString('en-IN')} vs Monthly
                  </span>
                )}
              </div>

              <ul className="mt-4 space-y-2.5 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span><strong>Limits:</strong> 1 active RFQ at a time · 1 solo approver seat</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span><strong>Channel Access:</strong> WhatsApp &amp; SMS direct vendor dispatch</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span><strong>Top-Ups:</strong> ₹50 per additional concurrent RFQ burst</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>Identity-protected evaluation &amp; instant GST PO execution</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 pt-2">
              <Link
                to="/signup?side=buyer"
                className="w-full block text-center rounded-xl bg-primary text-primary-foreground font-bold px-4 py-2 text-xs hover:opacity-90 transition shadow-2xs"
              >
                Register as Individual
              </Link>
            </div>
          </section>

          {/* Card 2: RWA & MSME (Most Popular) */}
          <section className="rounded-2xl border-2 border-primary bg-card p-5 flex flex-col justify-between shadow-md relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary text-primary-foreground text-[10px] font-extrabold uppercase px-3 py-0.5 tracking-wider shadow-2xs">
              Most Popular for RWAs &amp; MSMEs
            </span>
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-purple-500/10 text-purple-800 dark:text-purple-300 text-[10px] font-bold px-2 py-0.5">
                  RWA / MSME
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">Committee Mode</span>
              </div>
              <h2 className="text-lg font-bold mt-2 text-foreground">
                RWA, Society &amp; MSME
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Democratic voting &amp; multi-member committee governance.
              </p>

              <div className="mt-4 pb-4 border-b">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-foreground">
                    ₹{cycle === 'MONTHLY'
                      ? SUBSCRIPTION_TIERS.TIER_2_ENTERPRISE.monthlyPrice.toLocaleString('en-IN')
                      : SUBSCRIPTION_TIERS.TIER_2_ENTERPRISE.yearlyPrice.toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    / {cycle === 'MONTHLY' ? '30 days' : '365 days'}
                  </span>
                </div>
                {cycle === 'YEARLY' && (
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1 block">
                    ✓ Saves ₹{SUBSCRIPTION_TIERS.TIER_2_ENTERPRISE.yearlySavings.toLocaleString('en-IN')} vs Monthly
                  </span>
                )}
              </div>

              <ul className="mt-4 space-y-2.5 text-xs text-foreground/90">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span><strong>Limits:</strong> Up to 5 active RFQs · 5 committee voter seats</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span><strong>Channel Access:</strong> WhatsApp, SMS, Verified Registry &amp; Direct Invites</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span><strong>Top-Ups:</strong> ₹200 for 5 extra active RFQs · ₹500 for concierge sourcing</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>Quorum meters, 1-tap decision chips &amp; exportable audit log</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 pt-2">
              <Link
                to="/signup?side=buyer"
                className="w-full block text-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 text-xs transition shadow-xs"
              >
                Register as RWA / MSME
              </Link>
            </div>
          </section>

          {/* Card 3: Enterprise & Multi-Branch Institutions */}
          <section className="rounded-2xl border bg-card p-5 flex flex-col justify-between shadow-2xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 text-[10px] font-bold px-2 py-0.5">
                  Enterprise
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">Multi-Branch</span>
              </div>
              <h2 className="text-lg font-bold mt-2 text-foreground">
                Enterprise &amp; Institutional
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                For manufacturing plants, developer chains &amp; educational trusts.
              </p>

              <div className="mt-4 pb-4 border-b">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-foreground">
                    ₹{cycle === 'MONTHLY' ? '5,000' : '50,000'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    / {cycle === 'MONTHLY' ? '30 days' : '365 days'}
                  </span>
                </div>
                {cycle === 'YEARLY' && (
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1 block">
                    ✓ Saves ₹10,000 vs Monthly
                  </span>
                )}
              </div>

              <ul className="mt-4 space-y-2.5 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span><strong>Limits:</strong> Unlimited active RFQs · Unlimited committee roles</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span><strong>Channel Access:</strong> WhatsApp, SMS, Registry, ONDC &amp; Custom API</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span><strong>Top-Ups:</strong> Dedicated SLA, ERP/SAP connector &amp; custom scoring</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>Multi-organization hierarchies &amp; legal compliance reports</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 pt-2">
              <Link
                to="/signup?side=buyer"
                className="w-full block text-center rounded-xl bg-primary text-primary-foreground font-bold px-4 py-2 text-xs hover:opacity-90 transition shadow-2xs"
              >
                Register as Enterprise
              </Link>
            </div>
          </section>
        </div>

        {/* Verified Supplier Free Quote Callout Banner */}
        <div className="mt-8 rounded-2xl border-2 border-emerald-500/40 bg-card p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xl font-bold">
              🚚
            </span>
            <div>
              <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                <span>Verified Supplier Network</span>
                <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold px-2 py-0.5">
                  ₹0 Free Forever
                </span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Suppliers quote 100% free with zero platform commission, zero lead fees, and direct buyer bank settlements.
              </p>
            </div>
          </div>
          <Link
            to="/signup?side=supplier"
            className="shrink-0 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 text-xs transition shadow-2xs"
          >
            Quote as a Supplier →
          </Link>
        </div>

        {/* Minimal Governance Note */}
        <div className="mt-8 rounded-xl border border-dashed p-4 bg-muted/20 text-center max-w-2xl mx-auto text-xs text-muted-foreground">
          <p>
            <strong>Direct Settlement Guarantee:</strong> {PRODUCT_NAME} facilitates neutral, identity-protected evaluation. Buyers settle directly with awarded vendors via RTGS/NEFT/UPI with zero intermediary fee deductions.
          </p>
        </div>
      </div>
    </SiteLayout>
  );
}
