# R2-29 — COMMERCIAL CORRECTION: PERSONA-SPECIFIC EXTRA RFQ PRICING & FULL PLATFORM SYNCHRONIZATION

**Product:** OTP — Open Trade & Procurement  
**Stage:** R2-29 Commercial Correction  
**Baseline Git Commit:** `f9be52a`  
**Execution Date:** Saturday, September 26, 2026  
**Auditor Mode:** Master Lead Auditor & Golden Reconstruction Architect  
**Operating Mode:** Production-Like Controlled Pilot Freeze  
**Database Migration Ceiling:** Strictly Locked at `00197` (`00197_universal_org_role_lifecycle_succession_and_audit.sql`)  
**Canonical Positioning:** *"OTP — Identity-Protected Competitive Sourcing"*  
**Supporting Customer Message:** *"Compare competing supplier quotes and make better procurement decisions."*  
**Operating Principle:** *"OTP connects. OTP facilitates. OTP records. OTP protects the integrity of the procurement process."*  

---

## 1. EXECUTIVE SUMMARY & COMMERCIAL CORRECTION OVERVIEW

Stage R2-29 Commercial Correction certifies the definitive migration from a flat top-up model to a **Persona-Specific Extra RFQ Pricing Model** across the entire OTP platform codebase, website views, entitlement evaluation engines, test suites, and audit documentation.

### Core Pricing & Entitlement Invariants
1. **Subscription Tiers:**
   - **Individual Buyer:** Monthly ₹199 + GST, Annual ₹1,999 + GST (3 RFQs/mo, Annual: 3 RFQs/mo + 1 quarterly bonus RFQ)
   - **RWA / Housing Society:** Monthly ₹1,499 + GST, Annual ₹14,999 + GST (3 RFQs/mo, Annual: 3 RFQs/mo + 1 quarterly bonus RFQ)
   - **MSME / Commercial Business:** Monthly ₹1,999 + GST, Annual ₹19,999 + GST (3 RFQs/mo, Annual: 3 RFQs/mo + 1 quarterly bonus RFQ)
2. **Authoritative Persona-Specific Extra RFQ Pricing:**
   - **Individual Extra RFQ:** **₹149 + GST** (₹26.82 GST, **₹175.82 total**)
   - **RWA Extra RFQ:** **₹999 + GST** (₹179.82 GST, **₹1,178.82 total**)
   - **MSME Extra RFQ:** **₹1,499 + GST** (₹269.82 GST, **₹1,768.82 total**)
   - *Strict Rule:* There is **NO single flat ₹149 Extra RFQ price** for all buyer contexts.
3. **Entitlement Consumption Order:**
   - Available Entitlement = Monthly Included (3) + Eligible Quarterly Bonus (1 on annual plans, expires quarter-end, zero carry-forward) - Consumed RFQs.
   - Extra RFQ Top-Ups are only purchasable/offered once available entitlement reaches 0.
4. **Security & Context Isolation:**
   - Server-authoritative context-based derivation. Client-supplied price or persona tampering is strictly rejected.
   - Non-cash wallet is strictly restricted to subscription renewals and top-ups (0 cash withdrawal).
   - Referral reward remains 10% on first actual subscription payment.

---

## 2. COMPREHENSIVE COMMERCIAL MATRIX

| Buyer Persona | Billing Cycle | Base Price (INR) | GST (18.00%) | Total Payable | Monthly RFQs | Quarterly Bonus | Extra RFQ Base | Extra RFQ GST (18%) | Extra RFQ Total | Savings vs Monthly | 10% Referral |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| **INDIVIDUAL** | Monthly | ₹199.00 | ₹35.82 | **₹234.82** | 3 / mo | None | ₹149.00 | ₹26.82 | **₹175.82** | Baseline | ₹19.90 |
| **INDIVIDUAL** | Yearly | ₹1,999.00 | ₹359.82 | **₹2,358.82** | 3 / mo | +1 / quarter | ₹149.00 | ₹26.82 | **₹175.82** | ₹389.00 (16.3%) | ₹199.90 |
| **RWA / SOCIETY** | Monthly | ₹1,499.00 | ₹269.82 | **₹1,768.82** | 3 / mo | None | ₹999.00 | ₹179.82 | **₹1,178.82** | Baseline | ₹149.90 |
| **RWA / SOCIETY** | Yearly | ₹14,999.00 | ₹2,699.82 | **₹17,698.82** | 3 / mo | +1 / quarter | ₹999.00 | ₹179.82 | **₹1,178.82** | ₹2,989.00 (16.6%) | ₹1,499.90 |
| **MSME / BUSINESS** | Monthly | ₹1,999.00 | ₹359.82 | **₹2,358.82** | 3 / mo | None | ₹1,499.00 | ₹269.82 | **₹1,768.82** | Baseline | ₹199.90 |
| **MSME / BUSINESS** | Yearly | ₹19,999.00 | ₹3,599.82 | **₹23,598.82** | 3 / mo | +1 / quarter | ₹1,499.00 | ₹269.82 | **₹1,768.82** | ₹3,989.00 (16.6%) | ₹1,999.90 |

---

## 3. INVENTORY OF MODIFIED CODE & TESTS

1. **`packages/domain/src/types/pricing-entitlement.ts`:**
   - Defined `PERSONA_EXTRA_RFQ_PRICES` dictionary.
   - Defined `getExtraRfqPriceForTier(tierId)` helper.
   - Defined `computeExtraRfqPricing(tierId, gstRatePercent)` helper.
   - Updated `SUBSCRIPTION_TIERS` to map `additionalRfqPrice` to 149 (Individual), 999 (RWA), 1499 (MSME).
   - Dynamic rejection message generation in `evaluateRfqEntitlement` reflecting exact persona rate.
2. **`apps/web/src/features/subscription/types.ts`:**
   - Re-exported `PERSONA_EXTRA_RFQ_PRICES`, `getExtraRfqPriceForTier`, and `computeExtraRfqPricing`.
3. **`apps/web/src/features/site/pages/PricingPage.tsx`:**
   - Updated pricing cards for Individual, RWA, and MSME to display their exact top-up rates (`₹149`, `₹999`, `₹1,499` + GST).
4. **`packages/domain/src/types/pricing-entitlement.test.ts`:**
   - Updated all tier assertions and GST breakdown test cases for Individual, RWA, and MSME extra RFQ purchases.
   - Added quarterly bonus consumption ordering test prior to extra RFQ recharge requirement.
5. **`apps/web/src/features/subscription/subscription.test.ts`:**
   - Synchronized RWA and MSME `additionalRfqPrice` assertions.
6. **`apps/web/src/features/site/pricing-msme.test.tsx`:**
   - Validated canonical extra RFQ rates across all 3 tiers.
7. **`tests/security/pricing-entitlement-redteam.test.ts`:**
   - Added **Vector 25: Persona-Specific Extra RFQ Price Tampering & Security Isolation** asserting strict server derivation and rejecting cross-persona price requests.

---

## 4. VERIFICATION BATTERY & CERTIFICATION RESULTS

```
====================================================================================================
  🟢 STAGE R2-29 COMMERCIAL CORRECTION — VERIFICATION BATTERY
====================================================================================================
1. TypeScript Compilation Check    : PASSED (0 errors across all workspaces)
2. Canonical Vocabulary Scan       : PASSED (424 files checked, 0 prohibited terms)
3. Test Coverage Policy (--strict) : PASSED (Strict append-only rule satisfied)
4. Domain Test Battery             : 56 Test Files / 693 Tests PASSED (0 failures)
5. Services Test Battery           : 39 Test Files / 540 Tests PASSED (0 failures)
6. Database Test Battery           : 2 Test Files / 5 Tests PASSED (0 failures)
7. Security Red-Team Test Battery  : 22 Test Files / 324 PASSED (0 failures)
8. Web Test Battery                : 123 Test Files / 1,144 Tests PASSED (0 failures)
9. Production Build (apps/web)     : PASSED (Vite production bundle built cleanly)
====================================================================================================
FINAL STATUS: 🟢 COMMERCIAL CORRECTION CERTIFIED — READY FOR CODE FREEZE
====================================================================================================
```
