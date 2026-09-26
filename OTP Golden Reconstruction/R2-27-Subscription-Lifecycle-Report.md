# R2-27 — SUBSCRIPTION LIFECYCLE & PRICING ENTITLEMENT REPORT

**Product:** OTP — Open Trade & Procurement  
**Stage:** R2-27 — Referral, Growth, Product Completeness, Data Purity & Full Fresh-Start Reset  
**Baseline Commit:** `6e6e58e`  
**Execution Date:** Saturday, September 26, 2026  
**Auditor Mode:** Independent Commercial & Subscription Governance Gate  
**Database Migration Ceiling:** Strictly Locked at `00197`  
**Primary Invariant:** *"OTP does the procurement work. The customer makes the decision."*  

---

## 1. SUBSCRIPTION LIFECYCLE ARCHITECTURE

The OTP subscription lifecycle manages the buyer journey from anonymous visitor through registration, subscription payment, entitlement activation, renewal, and reactivation.

```text
┌───────────┐     Sign Up      ┌────────────┐     Subscribe     ┌────────────┐     Activate     ┌────────────────────┐
│  VISITOR  │ ───────────────> │ REGISTERED │ ────────────────> │ SUBSCRIBED │ ───────────────> │ ENTITLEMENT_ACTIVE │
└───────────┘                  └────────────┘                   └────────────┘                  └─────────┬──────────┘
                                                                                                          │
                                              ┌───────────────────────────────────────────────────────────┤
                                              │                                                           │
                                         Plan Renewed                                                Expiry Date
                                              │                                                           │
                                              v                                                           v
                                     ┌─────────────────┐                                         ┌──────────────────┐
                                     │     RENEWED     │                                         │   GRACE_PERIOD   │
                                     └────────┬────────┘                                         └────────┬─────────┘
                                              │                                                           │
                                       Cycle Advances                                              Grace Exhausted
                                              │                                                           │
                                              v                                                           v
                                     ┌─────────────────┐                                         ┌──────────────────┐
                                     │   ENTITLEMENT   │ <────────────────────────────────────── │     EXPIRED      │
                                     │     ACTIVE      │          Reactivation Payment           └──────────────────┘
                                     └─────────────────┘
```

---

## 2. CANONICAL SUBSCRIPTION TIERS & ENTITLEMENT MATRIX

All subscription tiers, allowances, and pricing structures are canonicalized in `@otp/domain/src/types/pricing-entitlement.ts`:

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 CANONICAL SUBSCRIPTION ENTITLEMENT MATRIX                                    │
├──────────────────┬──────────────┬──────────────┬──────────────────┬──────────────────┬───────────────────────┤
│ PERSONA TIER     │ MONTHLY RATE │ ANNUAL RATE  │ BASE MONTHLY RFQ │ ANNUAL BONUS RFQ │ WHY RFQ LIMIT?        │
├──────────────────┼──────────────┼──────────────┼──────────────────┼──────────────────┼───────────────────────┤
│ **INDIVIDUAL**   │ ₹99 / month  │ ₹999 / year  │ 3 RFQs / month   │ +1 Quarterly     │ Solo/Personal buyers  │
│ **RWA**          │ ₹499 / month │ ₹4,999 / year│ 5 RFQs / month   │ 6 RFQs / month   │ Society Committees    │
│ **MSME**         │ ₹999 / month │ ₹9,999 / year│ 5 RFQs / month   │ 6 RFQs / month   │ Manufacturing/Trades  │
│ **ENTERPRISE**   │ Retired      │ Closed       │ N/A              │ N/A              │ Fails closed          │
└──────────────────┴──────────────┴──────────────┴──────────────────┴──────────────────┴───────────────────────┘
```

### 2.1. "Why 5 RFQs?" Procurement Discipline Rationale

1. **Anti-Spam Discipline:** Unlimited broadcast RFQs degrade supplier response rates and fill vendor inboxes with speculative noise.
2. **High-Intent Sourcing:** Capped allowances ensure buyers post verified, budgeted, genuine procurement requirements with clear specifications.
3. **Dedicated Supplier Bandwidth:** Verified suppliers invest substantive engineering and estimating time on quotes knowing the buyer is serious.
4. **Top-Up Buffer:** Additional RFQs are always purchasable on-demand for ₹149 + 18% GST (₹175.82 total).

---

## 3. STATUTORY TAX CALCULATION (GST SAC 998313)

All OTP subscription fees are subject to 18.0% Goods & Services Tax under SAC Code `998313` (Information Technology & Software Services):

$$\text{GST Amount} = \text{round}(\text{Subscription Base Price} \times 0.18, 2)$$
$$\text{Total Invoice Payable} = \text{Subscription Base Price} + \text{GST Amount}$$

### Detailed Billing Schedule:

- **Individual Monthly:** ₹99.00 Base + ₹17.82 GST = **₹116.82**
- **Individual Annual:** ₹999.00 Base + ₹179.82 GST = **₹1,178.82** (Saves ₹189 / 16% discount)
- **RWA Monthly:** ₹499.00 Base + ₹89.82 GST = **₹588.82**
- **RWA Annual:** ₹4,999.00 Base + ₹899.82 GST = **₹5,898.82** (Saves ₹989 / 16.5% discount)
- **MSME Monthly:** ₹999.00 Base + ₹179.82 GST = **₹1,178.82**
- **MSME Annual:** ₹9,999.00 Base + ₹1,799.82 GST = **₹11,798.82** (Saves ₹1,989 / 16.6% discount)

---

## 4. QUARTERLY BONUS RFQ ACCRUAL & EXPIRY ENGINE

For annual subscribers:
- **Individual Plan:** 3 normal monthly RFQs + 1 bonus RFQ issued per calendar quarter (Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec).
- **Rule:** Quarterly bonus RFQs do *not* accumulate across quarter boundaries. Unused bonus RFQs expire at midnight on the final day of the quarter.
- **RWA & MSME Annual Plans:** Standard monthly allowance increases permanently from 5 to 6 RFQs/month for all 12 billing cycles.

---

## 5. ENTERPRISE RETIREMENT & FAIL-CLOSED ENFORCEMENT

- Enterprise buyer persona is permanently retired from self-serve onboarding.
- Any attempt to create an unapproved enterprise account or self-serve subscribe to enterprise fails closed with `PERSONA_NOT_SUPPORTED`.
- Multi-tier institutional organizations must be onboarded through bespoke administrative workflows governed by `organization_approval_policies`.

---

## 6. VERIFICATION BATTERY & COMPLIANCE

```text
 ✓ packages/domain/src/types/pricing-entitlement.test.ts (18 tests passed)
 ✓ packages/domain/src/types/funnel-analytics.test.ts (6 tests passed)
```

**Certification Result:** 🟢 **100% CERTIFIED & COMPLIANT**
