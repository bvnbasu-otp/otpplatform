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
                For independent property owners and facility managers.
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

              <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>Unlimited voice &amp; text RFQ broadcasts</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>Identity-protected sealed supplier comparison</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>Direct WhatsApp &amp; SMS vendor dispatch</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>Single-approver fast-track award lock</span>
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
                RWA, Housing Society &amp; MSME
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

              <ul className="mt-4 space-y-2 text-xs text-foreground/90">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span><strong>Everything in Individual</strong> for whole team</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>Multi-member voting room &amp; quorum controls</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>1-Tap preset decision justifications</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>Exportable statutory audit log &amp; GST Purchase Orders</span>
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

          {/* Card 3: Verified Supplier (Free Forever) */}
          <section className="rounded-2xl border bg-card p-5 flex flex-col justify-between shadow-2xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5">
                  Suppliers
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">Zero Fee</span>
              </div>
              <h2 className="text-lg font-bold mt-2 text-foreground">
                Verified Supplier Network
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                For contractors, fabricators, and local trade vendors.
              </p>

              <div className="mt-4 pb-4 border-b">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-foreground">₹0</span>
                  <span className="text-xs text-muted-foreground">/ Free Forever</span>
                </div>
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1 block">
                  ✓ ₹0 lead fees · 0% commission on contract value
                </span>
              </div>

              <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>15-Second mobile quoting via WhatsApp &amp; Web</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>Identity-protected fair merit evaluation</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>Automated Indian GST tax slab auto-calculation</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>Direct Purchase Orders and bank settlements</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 pt-2">
              <Link
                to="/signup?side=supplier"
                className="w-full block text-center rounded-xl border border-primary text-primary hover:bg-primary/5 font-bold px-4 py-2 text-xs transition"
              >
                Register as Verified Supplier
              </Link>
            </div>
          </section>
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
