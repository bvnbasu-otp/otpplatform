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

  const indTier = SUBSCRIPTION_TIERS.INDIVIDUAL;
  const rwaTier = SUBSCRIPTION_TIERS.RWA;
  const msmeTier = SUBSCRIPTION_TIERS.MSME;

  return (
    <SiteLayout>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14 overflow-x-hidden">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-full bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 px-3 py-1 text-xs font-bold border border-emerald-500/30">
              ⚡ Predictable Prepaid Access
            </span>
            <span className="text-[10px] text-muted-foreground font-medium">Institutional Procurement OS</span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            30-day or 365-day prepaid access for buyers. Suppliers quote <strong>100% free forever</strong> with zero listing fees.
          </p>

          {/* Billing Cycle Switcher */}
          <div className="pt-3 inline-flex items-center rounded-xl border bg-muted/40 p-1 text-xs">
            <button
              type="button"
              onClick={() => setCycle('MONTHLY')}
              className={`rounded-lg px-4 py-1.5 font-bold transition cursor-pointer ${
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
              className={`rounded-lg px-4 py-1.5 font-bold transition flex items-center gap-1.5 cursor-pointer ${
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

        {/* Clean 3-Card Structure: Individual, RWA, MSME */}
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {/* Card 1: Individual Buyer */}
          <section className="rounded-2xl border bg-card p-5 flex flex-col justify-between shadow-2xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-blue-500/10 text-blue-800 dark:text-blue-300 text-[10px] font-bold px-2 py-0.5">
                  Individual
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">Solo Buyers</span>
              </div>
              <h2 className="text-lg font-bold mt-2 text-foreground">
                Individual Buyer
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                For independent property owners, solo buyers &amp; personal procurement.
              </p>

              <div className="mt-4 pb-4 border-b border-border">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-foreground">
                    ₹{cycle === 'MONTHLY'
                      ? indTier.monthlyPrice.toLocaleString('en-IN')
                      : indTier.yearlyPrice.toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    / {cycle === 'MONTHLY' ? '30 days' : '365 days'}
                  </span>
                </div>
                {cycle === 'YEARLY' && (
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1 block">
                    ✓ Saves ₹{indTier.yearlySavings.toLocaleString('en-IN')} vs Monthly
                  </span>
                )}
              </div>

              <ul className="mt-4 space-y-2.5 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span><strong>Allowance:</strong> 3 High-intent RFQs/month included</span>
                </li>
                {cycle === 'YEARLY' && (
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                    <span><strong>Bonus:</strong> +1 Bonus RFQ per calendar quarter</span>
                  </li>
                )}
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span><strong>Decision:</strong> 1-Click direct award &amp; zero committee overhead</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span><strong>Evaluation:</strong> 4-Pillar sealed quotation comparison</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span><strong>Top-Ups:</strong> ₹{indTier.additionalRfqPrice} per additional RFQ</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 pt-2">
              <Link
                to="/signup?side=buyer"
                className="w-full block text-center rounded-xl bg-primary text-primary-foreground font-bold px-4 py-2 text-xs hover:opacity-90 transition shadow-2xs min-h-[44px] flex items-center justify-center"
              >
                Register as Individual
              </Link>
            </div>
          </section>

          {/* Card 2: RWA & Housing Society (Most Popular) */}
          <section className="rounded-2xl border-2 border-primary bg-card p-5 flex flex-col justify-between shadow-md relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary text-primary-foreground text-[10px] font-extrabold uppercase px-3 py-0.5 tracking-wider shadow-2xs">
              Most Popular for Societies
            </span>
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-purple-500/10 text-purple-800 dark:text-purple-300 text-[10px] font-bold px-2 py-0.5">
                  RWA &amp; Society
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">Committee Governance</span>
              </div>
              <h2 className="text-lg font-bold mt-2 text-foreground">
                RWA &amp; Housing Society
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Democratic voting, quorum tracking &amp; 365-day annual officer terms.
              </p>

              <div className="mt-4 pb-4 border-b border-border">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-foreground">
                    ₹{cycle === 'MONTHLY'
                      ? rwaTier.monthlyPrice.toLocaleString('en-IN')
                      : rwaTier.yearlyPrice.toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    / {cycle === 'MONTHLY' ? '30 days' : '365 days'}
                  </span>
                </div>
                {cycle === 'YEARLY' && (
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1 block">
                    ✓ Saves ₹{rwaTier.yearlySavings.toLocaleString('en-IN')} vs Monthly
                  </span>
                )}
              </div>

              <ul className="mt-4 space-y-2.5 text-xs text-foreground/90">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span><strong>Allowance:</strong> 3 High-intent RFQs/month included</span>
                </li>
                {cycle === 'YEARLY' && (
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                    <span><strong>Bonus:</strong> +1 Bonus RFQ per calendar quarter</span>
                  </li>
                )}
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span><strong>Roles:</strong> President, Secretary, Treasurer, Estate Manager, Committee</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span><strong>Voting Room:</strong> Sealed ballots, quorum meters ($\ge 2$), COI clearance</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span><strong>Compliance:</strong> Immutable AGM audit logs &amp; legal society records</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 pt-2">
              <Link
                to="/signup?side=buyer"
                className="w-full block text-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 text-xs transition shadow-xs min-h-[44px] flex items-center justify-center"
              >
                Register as RWA / Society
              </Link>
            </div>
          </section>

          {/* Card 3: MSME & Commercial Business */}
          <section className="rounded-2xl border bg-card p-5 flex flex-col justify-between shadow-2xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 text-[10px] font-bold px-2 py-0.5">
                  MSME Business
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">Spend Governance</span>
              </div>
              <h2 className="text-lg font-bold mt-2 text-foreground">
                MSME &amp; Commercial
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                For workshops, plants, service firms &amp; commercial teams.
              </p>

              <div className="mt-4 pb-4 border-b border-border">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-foreground">
                    ₹{cycle === 'MONTHLY'
                      ? msmeTier.monthlyPrice.toLocaleString('en-IN')
                      : msmeTier.yearlyPrice.toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    / {cycle === 'MONTHLY' ? '30 days' : '365 days'}
                  </span>
                </div>
                {cycle === 'YEARLY' && (
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1 block">
                    ✓ Saves ₹{msmeTier.yearlySavings.toLocaleString('en-IN')} vs Monthly
                  </span>
                )}
              </div>

              <ul className="mt-4 space-y-2.5 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span><strong>Allowance:</strong> 3 High-intent RFQs/month included</span>
                </li>
                {cycle === 'YEARLY' && (
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                    <span><strong>Bonus:</strong> +1 Bonus RFQ per calendar quarter</span>
                  </li>
                )}
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span><strong>Governance:</strong> Primary Owner, Manager &amp; Delegated spend proxies</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span><strong>Controls:</strong> Strict Anti-Self-Approval (PA-09) &amp; spend caps</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span><strong>Integration:</strong> GST split, Tally / Zoho ERP export &amp; double-entry ledger</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 pt-2">
              <Link
                to="/signup?side=buyer"
                className="w-full block text-center rounded-xl bg-primary text-primary-foreground font-bold px-4 py-2 text-xs hover:opacity-90 transition shadow-2xs min-h-[44px] flex items-center justify-center"
              >
                Register as MSME Business
              </Link>
            </div>
          </section>
        </div>

        {/* Product-Led Buyer Rewards Banner */}
        <div className="mt-8 rounded-2xl border border-border bg-gradient-to-r from-amber-500/10 via-primary/10 to-amber-500/10 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xl font-bold">
              🎁
            </span>
            <div>
              <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                <span>Product-Led Buyer Rewards</span>
                <span className="rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-extrabold px-2 py-0.5">
                  OTP Wallet Credits
                </span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Complete transactions on OTP to earn OTP Wallet Credits toward subscription renewals and RFQ top-ups.
              </p>
            </div>
          </div>
          <Link
            to="/dashboard"
            className="shrink-0 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 text-xs transition shadow-2xs min-h-[44px] flex items-center justify-center"
          >
            View Wallet Balance →
          </Link>
        </div>

        {/* Verified Supplier Free Quote Callout Banner */}
        <div className="mt-6 rounded-2xl border-2 border-emerald-500/40 bg-card p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xl font-bold">
              🚚
            </span>
            <div>
              <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                <span>Verified Supplier Network</span>
                <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold px-2 py-0.5">
                  ₹0 Free Registration
                </span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Free registration, discovery, and quote submission. Simple 0.50% Platform Fulfillment Fee only on confirmed Purchase Order awards.
              </p>
            </div>
          </div>
          <Link
            to="/signup?side=supplier"
            className="shrink-0 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 text-xs transition shadow-2xs min-h-[44px] flex items-center justify-center"
          >
            Register as Supplier (Free) →
          </Link>
        </div>
      </div>
    </SiteLayout>
  );
}
