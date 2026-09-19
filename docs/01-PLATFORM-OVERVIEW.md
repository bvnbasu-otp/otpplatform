# 01. OTP Platform Overview & Product Constitution

## 1. Mission & Category Definition

The **Open Trade & Procurement (OTP) Platform** is an **Identity-Protected Institutional Procurement Operating System**.

In India, residential societies (RWAs), housing cooperatives, educational trusts, hospitals, and MSMEs procure billions of rupees in goods, capital projects, and services annually through fragmented, informal channels:
- Informal WhatsApp groups and personal phone calls.
- Biased vendor selection driven by committee favoritism or kickbacks.
- Opaque price discovery where suppliers quote based on who the buyer is rather than the scope of work.
- Lack of immutable audit records, causing toxic society disputes and legal liabilities.

OTP solves this fundamentally by decoupling **technical merit and commercial pricing** from **supplier brand, reputation, and personal relationships**.

---

## 2. What OTP Is vs. What OTP Is NOT

| Feature / Aspect | ❌ What OTP Is NOT | ✅ What OTP IS |
| :--- | :--- | :--- |
| **Procurement Mode** | An open auction house, reverse auction, or speculative trading room | An **Identity-Protected Institutional Sourcing Platform** |
| **Evaluation Bias** | Prejudged based on who knows whom on the committee | **Merit-First Identity-Protected Evaluation** (specifications, price, and warranties evaluated in isolation under masked aliases) |
| **Supplier Identity** | Exposed publicly or sold to lead generators | **Cryptographically Sealed** until an immutable award decision is justified, approved, and locked |
| **Pricing Nature** | Volatile, auction-style penny-undercutting | **Formal, binding commercial quotations** aligned with Indian Standards (BIS, FSSAI, GST HSN/SAC) |
| **Decision Trail** | Informal WhatsApp chat logs or oral committee agreements | **Cryptographic Decision Receipt** backed by row-level immutable audit event chains and SHA-256 contract hashes |
| **Cost Model** | Expensive per-SMS charges or high SaaS subscription fees | **Zero-Cost Telephony Architecture** utilizing self-hosted WAHA WhatsApp and Gmail SMTP |
| **Financial Settlement** | Custodial escrow or middleman payment holding | **Non-Custodial Double-Entry Accounting Ledger** with transparent `0.50%` platform fee, `0.10%` buyer sourcing reward, and organization wallets |
| **Vendor Evaluation** | Subjective, unverified word-of-mouth recommendations | **Vendor Master Intelligence (VMI)** with 35/30/20/15 dimensional scorecard, performance tiering, and privacy-preserving badges |

---

## 3. The Three Pillars of OTP

### 🔐 Pillar 1: Identity Protection
- **Decoupled Evaluation**: Buyers and committee members evaluate quotations without knowing supplier business names, director identities, contact details, or exact street addresses.
- **Dynamic Anonymous Aliases**: Suppliers are identified solely by cryptographic, per-RFQ pseudonyms (e.g., `Supplier T74M`, `Supplier 9K2X`, `Supplier A7K3`) generated from a salted hash.
- **Automated Metadata Stripping**: Attachments uploaded by suppliers (brochures, datasheets, photos) automatically have EXIF GPS data, PDF author names, and camera signatures stripped before being viewable by the committee.
- **Bi-Directional Clarification Anonymization**: Buyers can query suppliers through in-app or WhatsApp threads; phone numbers, emails, and social media handles are automatically masked by a regex redaction engine.

### ⚖️ Pillar 2: Bias-Resistant Governance
- **Weighted Multi-Factor Scoring**: Default evaluation formula balanced for institutional integrity:
  - Commercial / Price: **50%**
  - Technical Specification & Compliance: **20%**
  - Delivery SLA & Warranty: **15%**
  - Vendor Master Intelligence (VMI Scorecard): **15%**
  - GST Compliance Bonus: **+5 Points**
- **Committee Quorum & Conflict-of-Interest Checks**: Committee members must submit explicit conflict-of-interest declarations prior to accessing the voting room. Votes cannot be finalized until a verifiable quorum is achieved.
- **Multi-Tier Enterprise Approval Matrix**: Configurable approval chains (<₹5L Tier 1 Manager, ₹5L–₹25L Tier 2 Dept Head/VP, >₹25L Tier 3 Executive) with strict anti-bypass invariants, self-approval prevention, and sequential sign-off gating.
- **Mandatory Award Justification Gate**: Managers and committee presidents cannot award a supplier without providing a formal justification (minimum character threshold and required institutional sentence starters).

### 🔎 Pillar 3: Auditable Decision Trail & One-Way Reveal
- **Commercial Commitment & Contract Gate**: Before the winner's identity is revealed, the buyer must execute a binding commercial commitment and complete the Step 11 Contract Gate with deterministic legal markdown contracts and SHA-256 document hashing.
- **One-Way Mutual Reveal**: Upon commitment, the winner's real corporate identity, GSTIN, and direct contact details are unmasked. Non-awarded suppliers receive automated outcome notifications while their identities remain permanently protected.
- **Decision Receipt**: A tamper-evident cryptographic receipt is generated, recording the hash of all competing quotes, the tally breakdown, voter signatures, and the justification.
- **Progressive Milestone Inspections & Exception Escalation**: 5-point quality checklists, digital signatures, photographic proof, and a 4-tier dispute resolution hierarchy (Direct, Committee, Executive, Legal) with strict SLA timers.

---

## 4. Canonical Procurement Vocabulary Standard

To maintain institutional neutrality, the following terminology standards are strictly enforced across the entire OTP Platform codebase, UI, database schemas, and documentation:

- ❌ **Do NOT use**: `blind` ➔ ✅ **Use**: `identity-protected`, `masked`, `anonymized`, or `confidential`
- ❌ **Do NOT use**: `bid` or `bids` ➔ ✅ **Use**: `quote`, `quotation`, `commercial proposal`, or `offer`
- ❌ **Do NOT use**: `bidder` or `bidders` ➔ ✅ **Use**: `supplier`, `qualified vendor`, or `candidate`
- ❌ **Do NOT use**: `bidding` ➔ ✅ **Use**: `quoting`, `sourcing window`, or `evaluation`

### 4.1 Canonical Procurement Lifecycle Sequence

The platform presents a streamlined **6-Stage Commercial Procurement Lifecycle** across all public touchpoints and user-facing views:

**1. Requirement & Specification (`DRAFT`) → 2. Sourcing & Quotes (`QUOTING`) → 3. Evaluation & Decision (`EVALUATING`) → 4. Contract & Award (`AWARDED`) → 5. Fulfillment & Inspection (`PO_ISSUED`) → 6. Invoicing & Settlement (`SETTLED`)**

- **Public & Commercial Cleanliness**: All internal 15-step linear pipeline details and prototype telemetry are scrubbed from public views (enforced via `ux-telemetry-abstraction.test.ts`), presenting clean, enterprise-grade commercial progress.
- **Admin Control Engine**: The full **15-Step Strict Monotonic Engine** (`STEP_1_SPEC_SUBMITTED` $\rightarrow$ `STEP_15_STAR_RATING_JUSTIFICATION`) is gated strictly behind administrative capability (`role === 'admin'`).
- **Market Intelligence**: Explicitly integrated between Evaluation and Committee Deliberation to provide fair-market pricing benchmarks before awarding.
- **Final Settlement & Audit**: The lifecycle culminates at comprehensive double-entry accounting settlement, performance scorecard updates, and immutable audit logs.

---

## 5. Phase 7.1 Certified Innovations & System Milestones

OTP embodies several proprietary algorithms and procedural innovations validated through Phase 7.1 Re-Certification:
1. **Phase 7.1 Closure & Human Defect Resolution**:
   - **Baseline:** `01198bc` | **Final Certified Commit:** `c5c97ca`
   - **Certification Status:** **CERTIFIED — UPGRADE RESILIENT** & **PHASE 7.1 FULLY CERTIFIED — PHASE 8 PILOT READINESS GATE OPEN**
   - **Closed Defects (P1/P2):** Migration 00185 (`joined_at` column in `list_org_members` RPC), local UUID syntax guard for attachments and voice notes, guest unauthenticated draft review & login sourcing redirect, resilient workspace loading with persistent subscription/wallet visibility, single authoritative role header (duplicate badge removal), and removal of obsolete binary toggles from profile preferences.
2. **22 Formal Failure Paths Regression Suite (`failure-paths-regression.test.ts`)**: 32/32 tests passed verifying all edge cases and boundary rejection conditions (F01–F22).
3. **UX Telemetry Abstraction Regression Suite (`ux-telemetry-abstraction.test.ts`)**: Enforces clean 6-Stage commercial presentation across all user-facing views.
4. **15-Step Strict Monotonic State Machine Engine**: Enforces sequential step transitions from `STEP_1_SPEC_SUBMITTED` to `STEP_15_STAR_RATING_JUSTIFICATION` (admin gated) with zero duplicate steps and zero out-of-order jumps.
5. **Salting-Based Anonymous Supplier Label Generator**: Generates unlinkable, deterministic pseudonyms per RFQ so suppliers cannot be fingerprinted across inquiries.
6. **Vendor Master Intelligence (VMI) 35/30/20/15 Scorecard**: Aggregates Quality (35%), Delivery (30%), SLA & Disputes (20%), and Commercial consistency (15%) into coarse performance tiers and anonymized badges.
7. **Non-Custodial Double-Entry Ledger**: Balanced multi-party accounting tracking `0.50%` platform fees, `0.10%` buyer sourcing rewards, TDS (194C/194J/194Q), and GST splits without custodial money holding.
8. **Tamper-Evident Contract Gate (Step 11)**: Deterministic markdown compilation, bilateral digital signature hashes, and automated liquidated damages calculations.
9. **Intelligent Multimodal Buyer Intake**: Voice, Text, Document, and Photo intake governed by a strict **Buyer Confirmation Authority Boundary** where AI suggests but the buyer retains exclusive confirmation authority.
10. **Device & Privacy Hardening**: Hardware track teardown for cameras/microphones, geolocation fallback, and universal metadata sanitization.
11. **Technology Currency & Upgrade Resilience**: Node >=20 (tested 20.x, 22.x, 24.x LTS), TypeScript 5.6.3, React 19.2.8, React Router 7.18.2, Vite 6.4.3, Vitest 5.0.0, Tailwind CSS 3.4.19, Supabase JS 2.112.4, with 185 contiguous SQL migrations and 1,514+ automated verifications across 12 layers.
