# OTP Current Architecture vs. Target Architecture (F5)
**Document Identifier:** `OTP-RECON-F5-ARCHITECTURE-COMPARE`  
**Version:** 1.0 (Golden Baseline)  
**Status:** AUTHORITATIVE ARCHITECTURAL SPECIFICATION  
**Working Root:** `G:/My Drive/otp`  
**North Star Invariant:** *"OTP does the procurement work. The customer makes the decision." (Constitution v1.0, Section 1 & 42)*

---

## 1. Executive Summary & Paradigm Shift

The fundamental mission of the OTP Golden Reconstruction is to **relocate procurement complexity from the user interface into the backend**, transforming an administrative-heavy tool into a delightful, mobile-first, 4-action customer experience:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        THE 4-ACTION TARGET CUSTOMER JOURNEY                            │
└────────────────────────────────────────────────────────────────────────────────────────┘

 1. TELL ────────────> Customer speaks, types, or uploads requirement (Intake)
        │
 2. REVIEW ──────────> Customer compares identity-protected offers (Evaluation Cockpit)
        │
 3. DECIDE ──────────> Customer votes (RWA Quorum) or approves spend (MSME/Individual)
        │
 4. TRACK ───────────> Customer monitors milestone progress, inspects delivery & settles PO
```

---

## 2. Comprehensive Layer-by-Layer Architectural Comparison

| Architectural Dimension | Current Architecture State (Pre-Reconstruction) | Target Architecture State (Golden Reconstruction) | Architectural Delta & Transformation |
| :--- | :--- | :--- | :--- |
| **Customer Experience & Cognitive Load** | Fragmented across 68 routes, exposed internal telemetry (e.g. 15-step linear status badges), multiple competing dashboard screens, and desktop-first comparison tables. | Streamlined into the **4-Action Golden Journey** (TELL $\rightarrow$ REVIEW $\rightarrow$ DECIDE $\rightarrow$ TRACK) housed within a strictly contained, mobile-first PWA shell. | Eliminates unnecessary procurement jargon; simplifies screens into clear, outcome-oriented buyer steps. |
| **Persona Separation & Multi-Context** | Inconsistent: creating a requirement auto-provisioned an organization via `ensure_buyer_organization()`, forcing Individuals into artificial organizations; persona authority blurred. | **Strict Persona Independence:** Person $\rightarrow$ Context (Individual, RWA, MSME, Supplier). Individuals operate personal accounts with zero committee overhead. RWAs have committee governance. MSMEs have spend delegation. | Separates personal buying from institutional governance. Respects multi-context boundaries. |
| **Routing & Screen Canonicalization** | 68 routes in `App.tsx`; 9 duplicate paths routing to `EvaluationDecisionCockpitPage`; legacy and duplicate page components in `apps/web/src/pages/`. | **Strict 1:1:1 Rule:** One Capability $\rightarrow$ One Canonical Route $\rightarrow$ One Canonical Screen. Total active customer routes reduced to 18 clean endpoints. | Eliminates route duplication; replaces alias sprawl with clean 301-style redirects and consolidated page components. |
| **Supplier Identity Protection** | Identity protection implemented in views, but prone to leakage via join queries, unredacted error payloads, or client props. Hardcoded pilot supplier names in demo panels. | **Cryptographic Zero-Leakage Boundary:** Enforced server-side via `rfq_quotes_identity_protected` views, `assertIdentityProtectedPayloadSafe` domain guards, and tokenized reveal RPCs. | Guarantees sealed supplier anonymity across DOM, network payloads, WebSockets, and error streams until post-award reveal gate. |
| **Supplier Lifecycle & Onboarding** | Historical flow allowed unverified suppliers to receive instant awards; risk of unverified payouts and broken delivery contracts. | **2-Stage Supplier Lifecycle:** Prospective suppliers quote via zero-login magic links (`/q/:token`). Awarded suppliers must pass Onboarding & Verification Gate (`/supplier/award-onboarding`) before mutual reveal and PO issuance. | Eliminates upfront quoting friction while guaranteeing 100% KYC, GST, and bank verification before contract execution. |
| **RWA Governance & Role Succession** | Role assignments stored as static strings on `organization_members.role`. Role handover rewrote historical audit records, attributing past decisions to new officers. | **Universal Effective-Dated Succession:** Managed via `org_role_assignments` (365-day term) and immutable `org_governance_action_audits`. Role continuity preserved without person continuity. | "Role $\neq$ Person". Historical votes remain immutably linked to the original actor; new officers receive current authority from effective date. |
| **MSME Delegation & Spend Controls** | Limited binary permissions (Owner vs Member); no time bounds or monetary spend limits. Anti-self-approval not universally enforced. | **Granular Spend Delegation Proxies:** `organization_delegations` enforces monetary spend caps (e.g. ₹50,000), UTC validity windows, and hard database anti-self-approval exceptions. | Enables safe operational procurement delegation for MSME business owners without loss of financial control. |
| **Address Handling & Snapshots** | Delivery address stored in ad-hoc string columns (`profiles.address`, `requirements.delivery_location`). Changing profile address retroactively altered past RFQs and POs. | **First-Class Address Architecture:** `buyer_addresses` table supporting Primary/Secondary addresses, Registered vs Delivery classification, and **frozen JSONB snapshots** on RFQs and POs. | Preserves historical legal and tax compliance; address changes never rewrite historical contracts. |
| **Financial Ledger & Settlement** | Single-sided transaction logs in early tables; separate wallet balances without full double-entry accounting. | **GAAP / IndAS Double-Entry Ledger:** `financial_ledger_entries` recording bilateral GST (CGST/SGST vs IGST), TDS withholding (194C/194Q), 0.50% supplier fee, and 0.10% buyer reward. | Provides institutional-grade auditability, automatic invoice reconciliation, and seamless ERP/Tally exports. |
| **Mobile-Shell Containment & Responsive UX** | Floating footers and walkthrough sheets obscuring primary action buttons on screens $<420\text{px}$; horizontal scrollbars on wide tables. | **Strict Responsive PWA Shell:** `max-w-md mx-auto` mobile container, bottom safe-area insets (`pb-24`), collapsible card accordions, touch-friendly 44px tap targets, zero horizontal overflow. | Flawless mobile smartphone experience across iOS and Android browsers. |
| **Demo & Test Artifact Isolation** | Demo providers (`DemoModeProvider`, `PilotProvider`) wrapped around root `App.tsx`; hardcoded pilot fallbacks ("10 HP Borewell Motor") in evaluation cockpit. | **4-Tier Demo Isolation:** Demo components mounted strictly under `/demo`; zero hardcoded pilot fallbacks in customer components; "Simulate Quotes" moved to Superadmin console. | 100% clean, professional production experience for genuine buyers and suppliers. |

---

## 3. The 4-Action Customer Journey Specification

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        TARGET 4-ACTION ARCHITECTURAL WORKFLOW                          │
└────────────────────────────────────────────────────────────────────────────────────────┘

 [ACTION 1: TELL — Multimodal Requirement Intake]
  ├── User inputs requirement via Voice Dictation, Text Prompt, Photo, or Form.
  ├── NLP/Rule-based parser extracts Title, Category, Quantity, Unit, Specs, and Location.
  ├── System auto-inherits primary delivery address from `buyer_addresses`.
  ├── User reviews 1-screen summary and clicks "Publish RFQ".
  └── Backend publishes RFQ and dispatches invitations to matched supplier pool.

 [ACTION 2: REVIEW — Identity-Protected Comparison]
  ├── Quoting suppliers submit sealed offers via unauthenticated magic links (`/q/:token`).
  ├── Buyer navigates to `/rfq/:id/evaluation` (Evaluation Decision Cockpit).
  ├── Displays masked cards: Supplier #01, #02, #03 with L1 Price, Delivery Days, Warranty, VMI score.
  ├── Interactive 4-Pillar comparison (Price, Delivery, Quality, Service SLA).
  └── Buyer selects preferred winning quote.

 [ACTION 3: DECIDE — Democratic Voting or Direct Approval]
  ├── IF Individual Buyer: 1-Click direct award confirmation (Instant Award Lock).
  ├── IF MSME Buyer: Direct approval if within spend delegation cap; else routes to Primary.
  ├── IF RWA Buyer: Routes to Committee Voting Room (`/rfq/:id/committee`).
  │     ├── Committee members declare Conflict of Interest (COI).
  │     ├── Democratic voting recorded until Quorum ($\ge 2$ votes) is achieved.
  │     └── Atomic RPC `lock_and_reveal_award_atomic` locks the award.
  └── Generates immutable, signed `DecisionReceipt` PDF snapshot.

 [ACTION 4: TRACK — Purchase Order, Milestone Inspections & Settlement]
  ├── Supplier Award Onboarding Gate: Winning supplier completes GST & Bank details.
  ├── Mutual Reveal: Legal identities, GSTINs, and contact numbers disclosed to both parties.
  ├── Bilateral PO Issued with SHA-256 contract hash and frozen delivery address snapshot.
  ├── 5-Point Milestone Inspections: Supplier submits progress photos; Buyer signs off on-site.
  └── Final Acceptance & Non-Custodial Settlement: Double-entry ledger postings reconciled.
```

---

## 4. Architectural Transformation & Migration Roadmap

To transition the repository from the current state to the golden target architecture without service disruption, the reconstruction proceeds in 4 phases:

```text
  Phase 1: Canonical Boundary Enforcement
  ├── Remove `<DemoModeProvider>` and `<PilotProvider>` from root `App.tsx`.
  ├── Purge duplicate routes and establish 301 redirects to the 18 canonical routes.
  └── Remove Enterprise registration options from `BuyerRegisterForm.tsx` and `PricingPage.tsx`.

  Phase 2: Frontend Component Consolidation & Mobile Shell
  ├── Unify intake into `UnifiedThreeTierIntake.tsx` with address book auto-inheritance.
  ├── Clean `EvaluationDecisionCockpit.tsx` of all hardcoded pilot fallbacks and demo simulation buttons.
  └── Enforce mobile-first CSS containment (`max-w-md`, safe-area bottom padding, zero horizontal scroll).

  Phase 3: Service Refactoring & Shared Governance
  ├── Refactor `EnterpriseApprovalMatrixService` -> `SpendApprovalGovernanceService`.
  ├── Connect MSME spend delegation proxies and RWA multi-signatory approvals to the shared engine.
  └── Integrate 2-stage supplier award onboarding gate into the post-award workflow.

  Phase 4: Verification & Golden Baseline Certification
  ├── Run the 1,514+ automated test battery across domain, database, services, and web.
  ├── Validate all 22 Formal Failure Paths in `failure-paths-regression.test.ts`.
  └── Confirm zero prohibited vocabulary violations via `verify-vocabulary.ts`.
```

---
*End of Current Architecture vs. Target Architecture (F5)*
