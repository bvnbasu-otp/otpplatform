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
      <div className="mx-auto max-w-6xl px-4 py-14">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto">
          <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-3 py-1 text-xs font-bold border border-emerald-300 dark:border-emerald-700">
            ⚡ Transparent Prepaid Subscription Plans
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold mt-3 tracking-tight text-foreground">
            Simple, Predictable Institutional Pricing
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {PRODUCT_NAME} operates on a transparent <strong>30-day / 365-day prepaid access cycle</strong> for buyers.
            Suppliers are <strong>100% free forever</strong> with zero commissions and no lead fees.
          </p>

          {/* Billing Cycle Switcher (Strictly Monthly or Yearly) */}
          <div className="mt-8 inline-flex items-center rounded-xl border bg-muted/40 p-1 text-xs">
            <button
              type="button"
              onClick={() => setCycle('MONTHLY')}
              className={`rounded-lg px-4 py-2 font-bold transition ${
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
              className={`rounded-lg px-4 py-2 font-bold transition flex items-center gap-1.5 ${
                cycle === 'YEARLY'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>Yearly (365 Days)</span>
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-1.5 py-0.2 border border-emerald-300 dark:border-emerald-700">
                Save ~17%
              </span>
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            * Strict prepaid cycles (30 days or 365 days). No quarterly or half-yearly commitments.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {/* Tier 1: Individuals & MSME */}
          <section className="rounded-2xl border-2 border-border bg-card p-6 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-[10px] font-bold px-2 py-0.5">
                  Tier 1
                </span>
                <span className="text-xs text-muted-foreground font-mono">MSME / Single</span>
              </div>
              <h2 className="text-xl font-bold mt-2 text-foreground">
                {SUBSCRIPTION_TIERS.TIER_1_MSME.name}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {SUBSCRIPTION_TIERS.TIER_1_MSME.tagline}
              </p>

              <div className="mt-5 pb-5 border-b">
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
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1 block">
                    ✓ Saves ₹{SUBSCRIPTION_TIERS.TIER_1_MSME.yearlySavings.toLocaleString('en-IN')} vs Monthly
                  </span>
                )}
              </div>

              <ul className="mt-5 space-y-2.5 text-xs text-muted-foreground">
                {SUBSCRIPTION_TIERS.TIER_1_MSME.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 pt-4">
              <Link
                to="/signup?side=buyer"
                className="w-full block text-center rounded-xl bg-primary text-primary-foreground font-bold px-4 py-2.5 text-xs hover:opacity-90 transition shadow-xs"
              >
                Register as Tier 1 Buyer
              </Link>
            </div>
          </section>

          {/* Tier 2: RWAs & Institutional Committees */}
          <section className="rounded-2xl border-2 border-primary bg-card p-6 flex flex-col justify-between shadow-md relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary text-primary-foreground text-[10px] font-extrabold uppercase px-3 py-0.5 tracking-wider shadow-xs">
              Most Popular for RWAs &amp; Trusts
            </span>
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 text-[10px] font-bold px-2 py-0.5">
                  Tier 2
                </span>
                <span className="text-xs text-muted-foreground font-mono">Committee Governance</span>
              </div>
              <h2 className="text-xl font-bold mt-2 text-foreground">
                {SUBSCRIPTION_TIERS.TIER_2_ENTERPRISE.name}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {SUBSCRIPTION_TIERS.TIER_2_ENTERPRISE.tagline}
              </p>

              <div className="mt-5 pb-5 border-b">
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
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1 block">
                    ✓ Saves ₹{SUBSCRIPTION_TIERS.TIER_2_ENTERPRISE.yearlySavings.toLocaleString('en-IN')} vs Monthly
                  </span>
                )}
              </div>

              <ul className="mt-5 space-y-2.5 text-xs text-muted-foreground">
                {SUBSCRIPTION_TIERS.TIER_2_ENTERPRISE.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                    <span className="font-medium text-foreground">{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 pt-4">
              <Link
                to="/signup?side=buyer"
                className="w-full block text-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 text-xs transition shadow-md"
              >
                Register as Tier 2 Institution
              </Link>
            </div>
          </section>

          {/* Supplier Free Access */}
          <section className="rounded-2xl border-2 border-border bg-card p-6 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5">
                  Suppliers
                </span>
                <span className="text-xs text-muted-foreground font-mono">Zero Commission</span>
              </div>
              <h2 className="text-xl font-bold mt-2 text-foreground">
                Supplier Quoting Access
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                For Contractors, Fabricators, Service Providers &amp; Vendors
              </p>

              <div className="mt-5 pb-5 border-b">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-foreground">₹0</span>
                  <span className="text-xs text-muted-foreground">/ Free Forever</span>
                </div>
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1 block">
                  ✓ No lead fees · No cut of contract value
                </span>
              </div>

              <ul className="mt-5 space-y-2.5 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>100% Free to register and quote on live RFQs</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>Verified GSTIN &amp; PAN seller badge recognition</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>Automated Indian GST tax slab auto-calculation</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>Direct Purchase Orders and payment settlements</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  <span>WhatsApp &amp; Web instant notification channels</span>
                </li>
              </ul>
            </div>

            <div className="mt-8 pt-4">
              <Link
                to="/signup?side=supplier"
                className="w-full block text-center rounded-xl border-2 border-primary text-primary hover:bg-primary/5 font-bold px-4 py-2.5 text-xs transition"
              >
                Register as Verified Supplier
              </Link>
            </div>
          </section>
        </div>

        {/* Operating System Note */}
        <section className="mt-12 rounded-2xl border border-dashed p-6 bg-muted/20 text-center max-w-3xl mx-auto">
          <h3 className="text-sm font-bold text-foreground">
            Identity-Protected Institutional Procurement
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            The Open Trade &amp; Procurement (OTP) Platform is an Identity-Protected Institutional
            Procurement Operating System. It prevents corruption, committee bias, and kickbacks by
            cryptographically decoupling technical merit and commercial pricing from supplier identity.
          </p>
        </section>
      </div>
    </SiteLayout>
  );
}
