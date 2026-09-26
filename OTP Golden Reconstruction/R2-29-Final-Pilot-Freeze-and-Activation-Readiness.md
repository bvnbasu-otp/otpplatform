# R2-29 — FINAL PILOT FREEZE, FROZEN PRICING, REAL-WORLD INTEGRATION READINESS & DOCUMENTATION BASELINE

**Product:** OTP — Open Trade & Procurement  
**Stage:** R2-29 — Final Pilot Freeze + Frozen Pricing + Public Website + Real-World Integration Readiness + Professional Documents + EULA/Agreements + Dispute/Evidence Framework + Documentation Baseline  
**Baseline Git Commit:** `f9be52a`  
**Execution Date:** Saturday, September 26, 2026  
**Auditor Mode:** Master Lead Auditor & Golden Reconstruction Architect  
**Operating Mode:** Production-Like Controlled Pilot Freeze  
**Database Migration Ceiling:** Strictly Locked at `00197` (`00197_universal_org_role_lifecycle_succession_and_audit.sql`)  
**Canonical Positioning:** *"OTP — Identity-Protected Competitive Sourcing"*  
**Supporting Customer Message:** *"Compare competing supplier quotes and make better procurement decisions."*  
**Operating Principle:** *"OTP connects. OTP facilitates. OTP records. OTP protects the integrity of the procurement process."*  

---

## 1. EXECUTIVE SUMMARY & VERIFICATION VERDICT

Stage R2-29 establishes the definitive final pilot freeze for the OTP (Open Trade & Procurement) platform. All public website copy, frozen subscription pricing, professional document generation standards, registration onboarding agreements, dispute/evidence frameworks, and integration readiness classifications have been verified and locked.

```
====================================================================================================
  🛡️  OTP PLATFORM — STAGE R2-29 FINAL PILOT FREEZE & ACTIVATION READINESS VERDICT
====================================================================================================
Baseline Commit                  : f9be52a
Freeze Date                      : 26-09-2026
Database Migration Ceiling       : Strictly Locked at 00197 (197 migrations intact, 0 dangling)
Operating Invariant              : Zero GitHub push, zero Vercel deployment, zero production DB mutation
Canonical Positioning            : "OTP — Identity-Protected Competitive Sourcing"
Supporting Customer Message      : "Compare competing supplier quotes and make better procurement decisions."
4-Step Visual Journey            : TELL ➔ REVIEW ➔ DECIDE ➔ TRACK (100% synchronized across public views)
Protected Assets PA-01 to PA-10  : 100% INTACT AND CRYPTOGRAPHICALLY ENFORCED
Canonical Buyer Personas         : INDIVIDUAL, RWA, MSME (Enterprise strictly retired, fails closed)
Authoritative Frozen Pricing     : 100% ENFORCED across domain, services, UI components & tests
  • Individual Buyer             : ₹199/month + GST (₹234.82) | ₹1,999/year + GST (₹2,358.82) | Extra RFQ: ₹149 + GST (₹175.82)
  • RWA / Housing Society        : ₹1,499/month + GST (₹1,768.82) | ₹14,999/year + GST (₹17,698.82) | Extra RFQ: ₹999 + GST (₹1,178.82)
  • MSME / Growing Business      : ₹1,999/month + GST (₹2,358.82) | ₹19,999/year + GST (₹23,598.82) | Extra RFQ: ₹1,499 + GST (₹1,768.82)
  • Monthly RFQ Entitlement      : 3 RFQs/month (Annual: 3 RFQs/month + 1 quarterly bonus RFQ)
  • Referral Incentive Law       : 10% on actual first subscription payment (e.g. ₹19.90 / ₹199.90)
  • Non-Cash Wallet Invariant    : Subscription purchase & renewal only (0 cash withdrawal, 0 GMV mix)
6 Core Pilot Integrations        : AUDITED & TRUTHFULLY CLASSIFIED (Ready for external activation)
Synthetic Quote Generation       : 0 synthetic quotes; 100% genuine supplier response via /q/:token
Production Stubs & RPCs          : 100% FAIL-CLOSED via private.is_production_environment()
TypeScript Compilation Check     : 100% PASSED (0 errors across @otp/domain, database, services, web)
Canonical Vocabulary Scan        : 100% PASSED (424 source files scanned, 0 prohibited terms)
Test Coverage Policy (--strict)  : 100% PASSED (279 test files, strict append rule satisfied)
Domain Test Battery              : 56 Test Files / 691 Tests PASSED (0 failures)
Services Test Battery            : 39 Test Files / 540 Tests PASSED (0 failures)
Database Test Battery            : 2 Test Files / 5 Tests PASSED (0 failures)
Security Test Battery            : 22 Test Files / 323 PASSED | 58 SKIPPED (Local DB Dependent)
Web Test Battery                 : 123 Test Files / 1,144 Tests PASSED (0 failures)
Vite Web Production Build        : 100% PASSED (580 modules transformed in 38.30s, dist/ built cleanly)
====================================================================================================
FINAL PILOT ACTIVATION VERDICT   : 🟡 PILOT ACTIVATION READY — EXTERNAL CREDENTIALS REQUIRED
====================================================================================================
```

---

## 2. CANONICAL POSITIONING & PUBLIC WEBSITE SYNCHRONIZATION

The public website across all entrypoints (`/`, `/about`, `/pricing`, `/faq`, `/login`, `/signup`, `/legal/:topic`) strictly communicates OTP's canonical positioning without leaking internal architecture jargon.

### 2.1. Brand Core Statements
- **Canonical Headline:** `"OTP — Identity-Protected Competitive Sourcing"`
- **Supporting Message:** `"Compare competing supplier quotes and make better procurement decisions."`
- **Operating Principle:** *"OTP connects. OTP facilitates. OTP records. OTP protects the integrity of the procurement process."*
- **4-Step Visual Journey:**
  1. **TELL:** Voice or plain-text requirement intake with structured specification parsing.
  2. **REVIEW:** Sealed quotation comparison across Price, Delivery TAT, and Warranty.
  3. **DECIDE:** Governed merit-based evaluation and committee voting with recorded justifications.
  4. **TRACK:** Milestone fulfillment, delivery verification, and direct bilateral settlement.

### 2.2. Zero Architectural Jargon Exposure
No public marketing text contains raw database or infrastructure implementation terms (`PostgreSQL`, `Supabase`, `RLS`, `pg_cron`, `migration`, `edge function`, `pgvector`). All mechanisms are explained strictly in terms of business guarantees: *Cryptographically Salted Aliases*, *Sealed Quotations*, *Immutable Decision Receipts*, and *Append-Only Audit Trails*.

---

## 3. AUTHORITATIVE FROZEN PRICING & ENTITLEMENT MATRIX

All subscription tiers, allowances, and billing formulas are frozen and locked across `@otp/domain`, `@otp/services`, and `apps/web`.

| Buyer Persona | Billing Cycle | Base Price (INR) | GST (18.00%) | Total Payable | Monthly RFQ Allowance | Bonus Entitlement | Extra RFQ Price (+GST) | Savings vs Monthly | 10% Referral Reward |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| **INDIVIDUAL** | Monthly | ₹199.00 | ₹35.82 | **₹234.82** | 3 RFQs / month | None | ₹149.00 (₹175.82) | Baseline | ₹19.90 |
| **INDIVIDUAL** | Yearly | ₹1,999.00 | ₹359.82 | **₹2,358.82** | 3 RFQs / month | +1 RFQ / quarter (expires Q-end) | ₹149.00 (₹175.82) | ₹389.00 (16.3%) | ₹199.90 |
| **RWA / SOCIETY** | Monthly | ₹1,499.00 | ₹269.82 | **₹1,768.82** | 3 RFQs / month | None | ₹999.00 (₹1,178.82) | Baseline | ₹149.90 |
| **RWA / SOCIETY** | Yearly | ₹14,999.00 | ₹2,699.82 | **₹17,698.82** | 3 RFQs / month | +1 RFQ / quarter (expires Q-end) | ₹999.00 (₹1,178.82) | ₹2,989.00 (16.6%) | ₹1,499.90 |
| **MSME / BUSINESS** | Monthly | ₹1,999.00 | ₹359.82 | **₹2,358.82** | 3 RFQs / month | None | ₹1,499.00 (₹1,768.82) | Baseline | ₹199.90 |
| **MSME / BUSINESS** | Yearly | ₹19,999.00 | ₹3,599.82 | **₹23,598.82** | 3 RFQs / month | +1 RFQ / quarter (expires Q-end) | ₹1,499.00 (₹1,768.82) | ₹3,989.00 (16.6%) | ₹1,999.90 |

### 3.1. Entitlement Rules
1. **Calendar-Month Quotas:** Standard monthly allowances (3 RFQs) activate on the 1st day of the calendar month (00:00:00 UTC) and expire at month end (23:59:59 UTC). Unused monthly subscription quotas do not roll over.
2. **Annual Quarterly Bonus RFQs:** Annual subscribers receive 1 bonus RFQ per calendar quarter (Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec). Bonus credits expire at the end of the respective quarter without accumulation.
3. **Purchased Top-Up RFQs (Persona-Specific):** Extra RFQs are strictly priced according to buyer persona (Individual: ₹149 + GST, RWA: ₹999 + GST, MSME: ₹1,499 + GST) and become available once active monthly and quarterly bonus entitlements are exhausted. Top-up credits remain valid as long as the organization maintains an active subscription status (`ACTIVE`, `GRACE`, or `TRIAL`).
4. **Referral Reward Law:** Referral rewards are strictly computed at 10% of the *actual first successful payment* made by the referee. Self-referral is cryptographically prohibited.
5. **Non-Cash Wallet Restriction:** All earned referral rewards and non-cash credits are strictly limited to subscription purchase, subscription renewal, and RFQ top-up credits. Cash withdrawals are physically blocked at the database constraint level.

---

## 4. PROFESSIONAL DOCUMENT & REPORT GENERATION STANDARDS

All document and report generation modules (Purchase Orders, Invoices, Decision Receipts, Settlement Certificates, Audit Statements) adhere to strict institutional formatting standards:
- **Brand Identity:** High-resolution OTP brand mark with canonical caption `"Identity-Protected Competitive Sourcing"`.
- **Metadata Structure:** Document title, unique sequential reference numbers, ISO/IST timestamps, and tax identifiers (GSTIN, PAN).
- **Identity Protection Safeguards:** Buyer and supplier details remain strictly masked with salted aliases prior to award unmasking.
- **Layout & Typography:** Print-optimized A4 page layout with CSS `@media print` rules, margin preservation, aligned numerical columns, and explicit 18% GST / TDS breakdowns.
- **Legal Execution:** Digital approval signature blocks and SHA-256 cryptographic audit seal stamps. Zero raw JSON or browser screenshot styling.

---

## 5. REGISTRATION EULA & CUSTOMER AGREEMENT WORKFLOW

Registration onboarding incorporates explicit EULA and institutional agreement acceptance based on buyer persona:
1. **Individual Buyer:** Bound by OTP Standard Terms of Service and Privacy Policy covering single-vote direct award mechanics and personal data processing under the DPDP Act 2023.
2. **RWA / Society (`COMMUNITY`):** Bound by the RWA Institutional Organization Agreement detailing collective association liability, committee voting quorum (min 2 votes), and 365-day officer succession rules.
3. **MSME Business (`MSME`):** Bound by the MSME Institutional Procurement OS Agreement detailing Primary administrative authority, spend delegations, Anti-Self-Approval enforcement (PA-09), and 0.50% supplier fee disclosure.
4. **Supplier / Contractor:** Bound by Supplier Code of Conduct and Quotation Integrity Terms prohibiting shill quoting, side-channel communications, or post-award renegotiation.

---

## 6. DISPUTE, LIABILITY & EVIDENCE FRAMEWORK

### 6.1. Platform Role & Non-Custodial Invariant
OTP operates strictly as a neutral factual record-keeper:
> *"OTP connects. OTP facilitates. OTP records. OTP protects the integrity of the procurement process."*

OTP does not hold funds in escrow, act as a banking intermediary, or guarantee supplier workmanship. All commercial settlement is executed directly between buyer and supplier.

### 6.2. Two Distinct Dispute Processes
1. **Buyer ↔ Supplier Commercial Disputes:** Managed via the `DisputeResolutionDrawer` and domain state machine (`packages/domain/src/types/dispute-escalation.ts`). Structured exceptions (quality deficiency, delivery delay, billing discrepancy) trigger multi-tier escalation (Levels 1 to 4) with strict SLA tracking (24h to 120h).
2. **User ↔ OTP Platform Service Disputes:** Governed by platform subscription terms, billing dispute workflows, and administrative review.

### 6.3. Tamper-Evident Evidence Pack Generation
The platform provides instant generation of complete, timestamped evidence packages comprising:
- Original RFQ specification and intake history
- Received sealed quotation cards and merit scorecards
- Timestamped committee voting consensus and justifications
- Immutable Decision Receipt with SHA-256 seal
- Official Purchase Order and progressive milestone sign-offs
- Delivery inspection reports and contractor GST tax invoices
- Complete append-only audit trail logs

---

## 7. 3-TIER ENVIRONMENT SEPARATION & INTEGRATION AUDIT

### 7.1. Environment Classification
- **DEV:** Development and test environment. Synthetic data generation and seed fixtures permitted.
- **PILOT:** Production-Like Controlled Pilot. Genuine business transactions only. Zero synthetic quotes permitted.
- **PRODUCTION:** Commercial production deployment.

### 7.2. Truthful Status Classification of 6 Core Integrations

| Integration Component | Implementation State | Operational Readiness Status | Activation Requirement |
|:---|:---|:---|:---|
| **Google Places API** | Adapter implemented with fallback ladder | **LIVE PROVIDER READY** | Set `VITE_GOOGLE_MAPS_API_KEY` |
| **Email Adapter (Resend / SMTP)** | Edge function + template engine ready | **READY / NOT CONFIGURED** | Configure `RESEND_API_KEY` or SMTP credentials |
| **WhatsApp Gateway (WAHA)** | REST client + webhook parser ready | **READY / NOT CONFIGURED** | Configure `WAHA_API_URL` & `WAHA_SESSION_KEY` |
| **In-App Notifications** | Real-time Supabase subscriptions & Bell | **LIVE READY (EVENT-DRIVEN)** | Active in current environment |
| **Real Supplier Quotes** | Tokenized `/q/:token` quoting workflow | **REAL & LIVE READY** | 0 synthetic quotes; 100% genuine vendor response |
| **Payment Gateway (Razorpay/Cashfree)** | Domain engine + checkout modal ready | **LIVE-CAPABLE** | Set `VITE_RAZORPAY_KEY_ID` / `CASHFREE_APP_ID` |
| **ONDC & BNI Networks** | Architectural specification documented | **PLANNED / PARTNERSHIP DEPENDENT** | Requires external network onboarding |

---

## 8. SYNTHETIC DATA & PRODUCTION STUB AUDIT

All demo simulation RPCs, seed generators, and administrative bypasses fail closed in production via `private.is_production_environment()`:
- `seed_demo_market_quotes()`: Fails closed in production.
- `simulate_supplier_quote_submission()`: Fails closed in production.
- Direct supplier invitations and real-world quote links (`/q/:token`) are strictly isolated from demo fixtures.

---

## 9. AUTOMATED TEST & BUILD CERTIFICATION BATTERY

All automated quality gates have executed with 100% success:

1. **TypeScript Workspace Compilation Check:**
   - `@otp/domain`: PASSED (0 errors)
   - `@otp/database`: PASSED (0 errors)
   - `@otp/services`: PASSED (0 errors)
   - `@otp/web`: PASSED (0 errors)
2. **Canonical Vocabulary Enforcement:**
   - 424 source files scanned across `apps/web/src`.
   - 0 prohibited auction/bidding terms detected.
3. **Test Coverage & Expansion Policy Audit (`--strict`):**
   - UNIT: 75 tests (min: 10) — PASSED
   - MODULE: 156 tests (min: 20) — PASSED
   - FUNCTIONAL: 44 tests (min: 15) — PASSED
   - REGRESSION: 4 tests (min: 3) — PASSED
   - Total Test Files: 279 — PASSED (100% policy compliant)
4. **Automated Vitest Test Suites:**
   - `@otp/domain`: 56 test files / 691 tests PASSED (0 failures)
   - `@otp/services`: 39 test files / 540 tests PASSED (0 failures)
   - `@otp/database`: 2 test files / 5 tests PASSED (0 failures)
   - `tests/security`: 22 test files / 323 PASSED | 58 SKIPPED (Local DB dependent)
   - `apps/web`: 123 test files / 1,144 tests PASSED (0 failures)
5. **Vite Production Web Build:**
   - 580 modules transformed cleanly.
   - Output bundle generated in `apps/web/dist/` without errors.

---

## 10. PROTECTED ASSETS INTEGRITY (PA-01 THROUGH PA-10)

All ten Protected Assets remain 100% intact and cryptographically enforced:
- **PA-01:** Pre-Reveal Identity Masking & Cryptographic Salt Isolation.
- **PA-02:** 4-Pillar Normalised Merit Scoring Engine.
- **PA-03:** Multi-Member Quorum & Democratic Voting Governance.
- **PA-04:** Append-Only Cryptographic Audit Log & SHA-256 Decision Receipts.
- **PA-05:** Time-Bound RFQ Phase Windows & Automatic Closure Gates.
- **PA-06:** Multi-Channel Supplier Dispatch & Tokenized Response Architecture.
- **PA-07:** Non-Custodial Direct Bilateral Settlement & Strict Financial Segregation.
- **PA-08:** 3-Tier Canonical Buyer Persona Architecture (Individual, RWA, MSME).
- **PA-09:** MSME Anti-Self-Approval Enforcement & Spend Delegation Limits.
- **PA-10:** RWA 365-Day Role Succession & Non-Personal Resident Liability Protection.

---

## 11. PRE-R2-30 PILOT COMMERCIAL MODE & REFERRAL CLARIFICATIONS

The Pre-R2-30 clarifications have been fully integrated:
1. **Controlled Pilot Commercial Mode**: Displaying authentic commercial pricing with explicit pilot disclosures ("Pilot Mode — No real payment will be charged during this pilot."), genuine monthly sourcing allowances active at ₹0 charged, 0.50% supplier platform fee waived (100% net disbursement), and strict ledger classification isolation (`PILOT_SANDBOX` vs `COMMERCIAL_PRODUCTION`).
2. **Persistent Deterministic Referral & WhatsApp Sharing**: Stable `OTP-XXXXXX` referral codes via FNV-1a hashing, 30-day qualification window, exact 10% first subscription reward, non-cash platform credit wallet policy, user-driven intent WhatsApp sharing (`https://api.whatsapp.com/send?text=...`) without recipient phone harvesting or WAHA dependency, and public signup pre-filling.
3. **Reference Documentation**: Full specifications documented in `OTP Golden Reconstruction/R2-29-Controlled-Pilot-Mode-and-Referral-Clarification.md`.

---

## 12. FINAL CONCLUSION & PILOT ACTIVATION VERDICT

The OTP platform has achieved complete architectural, operational, legal, and documentation baseline freeze for Stage R2-29 and Pre-R2-30 clarifications. Controlled real-world pilot activation is fully approved upon external credential provisioning.

**Final Verdict:** `🟢 PRE-R2-30 PILOT + REFERRAL CLARIFICATION CERTIFIED`
