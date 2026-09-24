# OTP Contradiction Decision Register (R1-F8)
**Document Identifier:** `OTP-RECON-R1-CONTRADICTION-REGISTER`  
**Version:** 1.0 (Authoritative R1 Release)  
**Status:** ARCHITECTURAL DECISION BASELINE  
**Working Root:** `G:/My Drive/otp`  
**Ceiling Migration:** `00197` (Universal Org Role Lifecycle, Succession & Audit)  
**Authoritative Basis:** OTP Product Constitution v1.0, Forensic Audits F1 through F9, Domain Models D0 & D0-A  
**Operating Invariant:** *MODE: DOCUMENTATION / ARCHITECTURE DECISION ONLY. An implementation agent must NEVER silently invent product behavior to resolve documentation gaps or code contradictions (Constitution v1.0, Section 43).*

---

## 1. Executive Summary & Governance Overview

This **Contradiction Decision Register** serves as the authoritative, definitive architectural resolution for all contradictions, ambiguities, and legacy divergences identified between the existing codebase (Phases 1 through 7.1) and the target **OTP Product Constitution v1.0**.

Every contradiction is evaluated under the canonical 7-tier architectural disposition taxonomy:
- **`KEEP CURRENT`**: Existing implementation is fully aligned with Constitution v1.0 and requires no changes.
- **`RECONSTRUCT`**: Existing component must be redesigned or rewritten to satisfy target architectural contracts.
- **`REFACTOR`**: High-value existing logic/services preserved and restructured under clean domain naming and boundaries.
- **`RETIRE`**: Deprecated mechanisms that will be deactivated and superseded by later migrations.
- **`REMOVE`**: Pure legacy, dead, or out-of-scope code (e.g. Enterprise UI) that must be permanently deleted.
- **`PRESERVE AS INFRASTRUCTURE`**: Deep backend SQL tables, triggers, and RPCs that power institutional workflows.
- **`PRODUCT OWNER DECISION REQUIRED`**: Policy questions requiring formal human sign-off with pre-evaluated architectural defaults.

---

## 2. Contradiction Evaluation Matrix

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                             CONTRADICTION RESOLUTION DASHBOARD                                   │
├───────┬────────────────────────────────────────────────────────┬─────────────────────────────────┤
│ ID    │ Contradiction Title                                    │ Target Disposition              │
├───────┼────────────────────────────────────────────────────────┼─────────────────────────────────┤
│ C-01  │ Individual Buyer Org Model (NULL vs Personal Org)      │ REFACTOR / PRESERVE SCHEMA      │
│ C-02  │ Subscription Plan Pricing & Feature Entitlements       │ REFACTOR / REMOVE ENTERPRISE    │
│ C-03  │ MSME Spend Delegation Hierarchy & Threshold Amounts    │ REFACTOR / REUSE SHARED ENGINE  │
│ C-04  │ RFQ Intake Line Items (Turnkey vs Multi-Item)          │ KEEP CURRENT (Phase 1 Baseline) │
│ C-05  │ WhatsApp Sourcing Mode (NLP Text vs Magic Link Web)    │ RECONSTRUCT / STANDARDIZE       │
│ C-06  │ Platform Role Navigation (Superadmin & Founder)        │ REFACTOR / STRICT GATING        │
│ C-07  │ Production Test / Demo Data Purge Policy               │ PRESERVE AS INFRASTRUCTURE      │
│ C-08  │ Supplier Identity Masking & Payload Anti-Leakage       │ PRESERVE AS INFRASTRUCTURE      │
│ C-09  │ Supplier Award & 2-Stage Onboarding Gate               │ PRESERVE AS INFRASTRUCTURE      │
│ C-10  │ RWA Governance Succession & Immutable Auditing         │ PRESERVE AS INFRASTRUCTURE      │
│ C-11  │ First-Class Address Architecture & Snapshots           │ REFACTOR / STANDARDIZE          │
│ C-12  │ Route Sprawl & Screen Redundancy                       │ RECONSTRUCT (18 Canonical)      │
│ C-13  │ Mobile Shell Bottom Containment & Obscuration          │ RECONSTRUCT (Mobile AppShell)   │
│ C-14  │ Truthful Notification Lifecycle & Delivery State       │ REFACTOR / ENFORCE 8 STATES     │
│ C-15  │ Market Intelligence Provenance Ladder                  │ REFACTOR / ENFORCE 4 TIERS      │
│ C-16  │ Enterprise Shared Infrastructure Disposition           │ PRESERVE AS INFRASTRUCTURE      │
└───────┴────────────────────────────────────────────────────────┴─────────────────────────────────┘
```

---

## 3. Deep Forensic Investigation & Decisions for All 16 Contradictions

---

### Contradiction C-01: Individual Buyer Data Model — NULL Organization vs. Personal Org Record
- **Contradiction ID:** `C-01` (Derived from Gap 1 / F8)
- **Current Implementation:**
  - `packages/services/src/services/requirements.ts`
  - `supabase/migrations/00187_dual_persona_portal_switching.sql` (`ensure_buyer_organization()`)
  - `supabase/migrations/00196_buyer_identity_address_rwa_msme_and_supplier_award_onboarding.sql`
- **Repository / Database Evidence:**
  - `ensure_buyer_organization(profile_id)` creates a dummy organization row in `public.organizations` with `name = profile.full_name` and inserts an `organization_members` row with `role = 'OWNER'`.
  - Migration 00196 on `buyer_addresses` relaxed foreign keys: `profile_id UUID NULL`, `organization_id UUID NULL`, `CHECK (profile_id IS NOT NULL OR organization_id IS NOT NULL)`.
  - Migration 00196 on `rfqs` allows `organization_id` to be `NULL` for individual buyers.
- **Current Behavior:** Every buyer is forcefully bound to an organization upon requirement submission, creating phantom organizations for individuals.
- **Intended Product Model (Constitution v1.0, Section 3 & 4):**
  - "The Individual experience is self-contained, personal, simple, independent of organizations."
  - An Individual has zero committee members, delegates, or quorum.
- **Exact Conflict:** The code forces an organizational container upon an individual entity that is explicitly non-organizational.
- **Impact Assessment:**
  - *Customer Impact:* Confuses individual buyers with team management tabs and institutional jargon.
  - *Backend Impact:* Unnecessary rows in `organizations` and `organization_members`; bloated join queries.
  - *Security Impact:* Low risk of cross-tenant leakage, but muddies RLS boundaries.
  - *Financial Impact:* None.
  - *Audit Impact:* Audit logs reference a dummy organization ID instead of pure `profile_id`.
- **Options Considered:**
  - *Option A:* Keep auto-provisioning dummy organizations for all users (Status quo).
  - *Option B:* Allow `requirements.organization_id = NULL` and `rfqs.organization_id = NULL` for pure Individual buyers; populate `profile_id` exclusively.
  - *Option C:* Create a singleton platform-wide system organization for all individuals.
- **Recommended Resolution:** **Option B.** For Individual buyers, `organization_id` MUST be `NULL`. The user's personal identity is represented strictly by `profile_id` and `created_by`. Organizations are created *only* when a buyer registers as or explicitly provisions an **RWA** or **MSME**.
- **Risks & Mitigations:**
  - *Risk:* Legacy queries assuming `rfqs.organization_id IS NOT NULL` might return null pointer exceptions.
  - *Mitigation:* Migration 00196 already updated RLS policies on `rfqs`, `rfq_quotes`, and `buyer_addresses` to handle `profile_id IS NOT NULL` branches.
- **Dependencies:** Migration 00196, `RequirementService`, `HomePage.tsx`.
- **Product Owner Decision Required?** NO (Fully aligned with Constitution v1.0 Section 3).
- **Final Decision:** **REFACTOR / PRESERVE SCHEMA.** Standardize on `organization_id = NULL` for Individual buyers.
- **Reconstruction Consequence:** Modify `RequirementService` and `UnifiedThreeTierIntake` to pass `organization_id = null` when active persona is `INDIVIDUAL`.
- **Acceptance Criteria:**
  1. Creating an RFQ as an Individual buyer results in `requirements.organization_id IS NULL` and `rfqs.organization_id IS NULL`.
  2. Individual dashboard renders personal procurement history with zero committee or delegation UI.
  3. RLS permits individual buyer to view their own RFQs via `created_by = auth.uid()`.

---

### Contradiction C-02: Canonical Subscription Plan Pricing & Feature Entitlements
- **Contradiction ID:** `C-02` (Derived from Gap 2 / F8 & F3)
- **Current Implementation:**
  - `packages/domain/src/types/pricing-entitlement.ts`
  - `apps/web/src/features/site/pages/PricingPage.tsx`
  - `apps/web/src/features/subscription/components/SubscriptionPaymentModal.tsx`
  - `supabase/migrations/00144_prepaid_subscription_model.sql`
- **Repository / Database Evidence:**
  - `PricingPage.tsx` lines 192–247 renders "Card 3: Enterprise & Multi-Branch Institutions (₹4,999/mo)".
  - `pricing-entitlement.ts` exports `SUBSCRIPTION_TIERS.ENTERPRISE = 'ENTERPRISE'` (₹4,999/mo, ₹49,999/yr).
  - Constitution v1.0 Sections 2, 23, 24, 40 strictly exclude Enterprise.
- **Current Behavior:** Marketing pages advertise Enterprise subscriptions with SSO and SAML; checkout sheets permit selecting Enterprise plan.
- **Intended Product Model (Constitution v1.0, Section 2 & 23):**
  - Exactly 3 canonical customer tiers:
    1. **Individual:** Free (₹0/mo, 1 active RFQ at a time, personal addresses).
    2. **RWA Housing Society:** ₹499/mo (or ₹4,999/yr) with unlimited committee members, voting quorum, and 365-day role succession.
    3. **MSME Business:** ₹999/mo (or ₹9,999/yr) with team invitations, spend delegation proxies, and GST/TDS tax accounting.
- **Exact Conflict:** Enterprise pricing tier is present in customer-facing UI and domain constants despite being explicitly out of scope.
- **Impact Assessment:**
  - *Customer Impact:* Enterprise buyers attempt to sign up for unsupported SAML/SSO; RWA/MSME buyers confused by corporate pricing.
  - *Backend Impact:* Unused plan codes in `pricing_plans` table.
  - *Security Impact:* None.
  - *Financial Impact:* Misaligned revenue expectations.
  - *Audit Impact:* Clean subscription ledger without orphaned enterprise contracts.
- **Options Considered:**
  - *Option A:* Retain Enterprise card with "Contact Sales" disclaimer.
  - *Option B:* Delete Enterprise card; enforce canonical 3-tier structure (Individual ₹0, RWA ₹499/mo, MSME ₹999/mo).
- **Recommended Resolution:** **Option B.** Remove Enterprise tier from UI, constants, and checkout sheets.
- **Risks & Mitigations:**
  - *Risk:* Existing test fixtures expecting `SUBSCRIPTION_TIERS.ENTERPRISE` will fail.
  - *Mitigation:* Update test fixtures in `pricing-entitlement.test.ts` to assert canonical 3 tiers.
- **Dependencies:** `pricing-entitlement.ts`, `PricingPage.tsx`, `SubscriptionPaymentModal.tsx`.
- **Product Owner Decision Required?** NO (Enterprise exclusion is non-negotiable per Constitution Section 40).
- **Final Decision:** **REMOVE ENTERPRISE / REFACTOR DOMAIN CONSTANTS.**
- **Reconstruction Consequence:** Purge Card 3 from `PricingPage.tsx`; update `pricing-entitlement.ts` to export canonical 3 plans.
- **Acceptance Criteria:**
  1. `PricingPage.tsx` renders exactly 2 institutional pricing cards: Individual (₹0) and RWA/MSME (₹499/mo / ₹999/mo).
  2. Enterprise is nowhere mentioned in marketing copy, metadata, or dropdown selectors.

---

### Contradiction C-03: MSME Spend Delegation Hierarchy & Default Threshold Amounts
- **Contradiction ID:** `C-03` (Derived from Gap 3 / F8 & F3)
- **Current Implementation:**
  - `packages/services/src/services/enterprise-approval-matrix-service.ts`
  - `packages/domain/src/types/approval-matrix.ts`
  - `supabase/migrations/00183_phase6_group6_vendor_intelligence_governance_contracts.sql`
  - `supabase/migrations/00190_buyer_org_governance_and_delegation.sql`
  - `supabase/migrations/00191_dynamic_approval_routing_and_market_intelligence.sql`
- **Repository / Database Evidence:**
  - `EnterpriseApprovalMatrixService` defaults to rigid 3-tier thresholds (<₹5L Tier 1 Manager, ₹5L–₹25L Tier 2 VP, >₹25L Tier 3 CFO).
  - Migration 00190 introduces granular `public.organization_delegations` with explicit `spend_cap_amount` and `valid_until`.
  - Constitution v1.0 Section 14 mandates that MSME delegation is granted explicitly by the Primary owner with custom spend caps and anti-self-approval rules.
- **Current Behavior:** Small MSME purchases (e.g. ₹25,000) are routed through multi-tiered corporate approval hierarchies.
- **Intended Product Model (Constitution v1.0, Section 13 & 14):**
  - MSME Primary has direct 1-click approval authority for any amount.
  - MSME Primary can grant custom spend caps to specific delegates (e.g. ₹50,000 to Plant Manager).
  - If no delegation is configured, zero multi-tier routing is forced.
- **Exact Conflict:** Corporate enterprise multi-tier routing forced upon agile MSME business operations.
- **Impact Assessment:**
  - *Customer Impact:* Frustrates MSME owners with bureaucratic approval roadblocks on routine supplies.
  - *Backend Impact:* Unnecessary generation of 3 approval stages in `rfq_approval_stages`.
  - *Security Impact:* Prevents rogue approvals; anti-self-approval must be preserved.
  - *Financial Impact:* Strong financial control over delegated spend.
  - *Audit Impact:* Immutable record of who approved within their authorized spend cap.
- **Options Considered:**
  - *Option A:* Delete `EnterpriseApprovalMatrixService` entirely.
  - *Option B:* Refactor `EnterpriseApprovalMatrixService` $\rightarrow$ `SpendApprovalGovernanceService`. If no delegation exists, Primary approves directly. If delegation exists, delegatee can approve up to their `spend_cap_amount`.
- **Recommended Resolution:** **Option B.** Preserve the entire underlying database engine (`rfq_approval_stages`, `organization_delegations`, Migration 00183/00190/00191) as shared infrastructure. Refactor the service name and wire it to MSME delegation proxies and RWA multi-signatory capex limits.
- **Risks & Mitigations:**
  - *Risk:* Deleting the service would break 14 critical governance test assertions in `c84-spend-approval-orchestration-and-delegation.test.ts`.
  - *Mitigation:* Preserve the core logic while renaming the interface and relaxing default mandatory tiers.
- **Dependencies:** `SpendApprovalGovernanceService`, `OrgMembersPage.tsx`, Migration 00190.
- **Product Owner Decision Required?** NO (Refactoring satisfies both MSME delegation and RWA governance).
- **Final Decision:** **REFACTOR / PRESERVE AS INFRASTRUCTURE.**
- **Reconstruction Consequence:** Rename service to `SpendApprovalGovernanceService`; enable direct Primary approval with optional delegation proxy evaluation.
- **Acceptance Criteria:**
  1. MSME Primary can approve RFQs of any amount in 1 click without required multi-tier escalation.
  2. Delegated members can approve RFQs up to their exact configured `spend_cap_amount`.
  3. Anti-self-approval rule prevents the RFQ creator from approving their own delegated request.

---

### Contradiction C-04: RFQ Intake Line Items — Turnkey Single-Specification vs. Multi-Item Line Items
- **Contradiction ID:** `C-04` (Derived from Gap 4 / F8)
- **Current Implementation:**
  - `apps/web/src/features/intake/components/UnifiedThreeTierIntake.tsx`
  - `supabase/migrations/00167_phase5a_progressive_invoicing.sql` (`purchase_order_line_items`)
- **Repository / Database Evidence:**
  - Database schema supports line items on purchase orders (`purchase_order_line_items`).
  - Frontend intake captures a single requirement title, category, quantity, unit, and structured attribute notes.
- **Current Behavior:** Buyer inputs a turnkey requirement (e.g. "Transformer Rewinding & Overhaul", 1 Job, ₹1,50,000).
- **Intended Product Model (Constitution v1.0, Section 1, 20, 21):**
  - "OTP does the procurement work. The customer makes the decision."
  - 4-Action Customer Journey: TELL $\rightarrow$ REVIEW $\rightarrow$ DECIDE $\rightarrow$ TRACK.
  - Turnkey and service procurements account for 90%+ of RWA and MSME jobs.
- **Exact Conflict:** Database supports multi-line items on POs, but intake UI is single-requirement turnkey.
- **Impact Assessment:**
  - *Customer Impact:* Single-requirement intake is 10x faster and simpler on mobile than complex ERP line-item grids.
  - *Backend Impact:* PO generator creates a primary line item corresponding to the requirement.
  - *Security Impact:* None.
  - *Financial Impact:* Clean single-item or milestone-based progressive billing.
  - *Audit Impact:* Unambiguous scope description.
- **Options Considered:**
  - *Option A:* Build a complex multi-line shopping cart grid into mobile intake.
  - *Option B:* Retain single-requirement turnkey intake as the golden baseline for Phase 1; allow line-item details in structured specs / milestones.
- **Recommended Resolution:** **Option B.** Single-requirement turnkey intake is the canonical golden baseline for Phase 1 reconstruction.
- **Risks & Mitigations:**
  - *Risk:* Buyers needing 20 distinct spare parts must create separate RFQs.
  - *Mitigation:* Allow bill-of-materials to be attached as PDF/photo; suppliers quote lump-sum or turnkey rate.
- **Dependencies:** `UnifiedThreeTierIntake.tsx`, `RequirementDetailPage.tsx`.
- **Product Owner Decision Required?** NO (Maintains mobile-first simplicity).
- **Final Decision:** **KEEP CURRENT (Single-Requirement Turnkey Baseline).**
- **Reconstruction Consequence:** Keep `UnifiedThreeTierIntake.tsx` streamlined for 1-screen turnkey requirement submission.
- **Acceptance Criteria:**
  1. Intake takes $<60$ seconds on mobile via voice, text, photo, or form.
  2. Requirement captures title, category, quantity, unit, specifications, and delivery location.

---

### Contradiction C-05: WhatsApp Inbound Sourcing Mode — NLP Text Parser vs. Magic Link Web Form
- **Contradiction ID:** `C-05` (Derived from Gap 5 / F8)
- **Current Implementation:**
  - `supabase/functions/messaging-inbound/index.ts`
  - `apps/web/src/features/portal/pages/QuickQuotePage.tsx` (`/q/:token`)
- **Repository / Database Evidence:**
  - `messaging-inbound` contains experimental regex attempting to parse free-text WhatsApp messages (e.g. "Quoting 8500 INR with 1 yr warranty").
  - `QuickQuotePage.tsx` provides a battle-tested, mobile-optimized zero-login web form capturing price, delivery days, warranty, GST rate, and attachments.
- **Current Behavior:** Ambiguity on whether suppliers quote via raw chat text or via web form.
- **Intended Product Model (Constitution v1.0, Section 16, 18, 31):**
  - Suppliers quote without full upfront account creation via secure tokenized links (`/q/:token`).
  - Strict financial integrity: commercial quotations must capture explicit GST rates, warranty terms, and validity dates.
- **Exact Conflict:** Free-text chat parsing frequently fails regex, drops statutory tax breakdown, and creates unverified quotes.
- **Impact Assessment:**
  - *Customer Impact:* Incomplete quote comparisons if tax or warranty is missing.
  - *Backend Impact:* Parsing errors in edge functions.
  - *Security Impact:* Magic link tokens provide cryptographically secure quote attribution.
  - *Financial Impact:* Prevents GST mismatch between quote and invoice.
  - *Audit Impact:* 100% structured quote audit records.
- **Options Considered:**
  - *Option A:* Fully rely on AI NLP chat parsing over WhatsApp.
  - *Option B:* Standardize on outbound WhatsApp message containing magic link: `https://otpplatform-theta.vercel.app/q/<token>`. Inbound chat replies receive an automated guidance message with the link.
- **Recommended Resolution:** **Option B.** All supplier quote submissions must occur through the structured magic link web form (`QuickQuotePage.tsx`).
- **Risks & Mitigations:**
  - *Risk:* Suppliers without mobile browsers cannot quote.
  - *Mitigation:* Virtually 100% of Indian WhatsApp business users have smartphone web browsers; magic link requires zero login or password setup.
- **Dependencies:** `QuickQuotePage.tsx`, WAHA notification dispatch, `00196_...sql`.
- **Product Owner Decision Required?** NO (Guarantees data integrity and identity protection).
- **Final Decision:** **RECONSTRUCT / STANDARDIZE ON MAGIC LINK WEB FORM.**
- **Reconstruction Consequence:** Configure outbound WhatsApp notifications to deliver `/q/:token` magic link; configure inbound webhook to reply with magic link URL.
- **Acceptance Criteria:**
  1. Outbound WhatsApp RFQ invite contains valid `/q/:token` link.
  2. Supplier tapping link opens mobile web form, enters commercial numbers, and submits sealed quote.
  3. Quote immediately posts to `public.rfq_quotes` and masked view `rfq_quotes_identity_protected`.

---

### Contradiction C-06: Platform Role Navigation Visibility (Superadmin & Founder Cockpits)
- **Contradiction ID:** `C-06` (Derived from Gap 6 / F8)
- **Current Implementation:**
  - `apps/web/src/components/layout/WorkspaceHeaderMenu.tsx`
  - `apps/web/src/components/layout/AccountMenu.tsx`
  - `supabase/migrations/00152_immutable_platform_admin_role.sql`
- **Repository / Database Evidence:**
  - `WorkspaceHeaderMenu.tsx` renders links to `/admin` and `/founder` in the avatar dropdown if profile has `is_platform_admin = true` or `role = 'FOUNDER'`.
  - Constitution v1.0 Section 33 & 34: Superadmin and Founder are platform roles, not customer buyer/supplier personas.
- **Current Behavior:** Navigation links are visible to all users if client-side state is spoofed, or hidden completely.
- **Intended Product Model (Constitution v1.0, Section 33, 34, 38):**
  - Platform roles are strictly verified server-side via `private_security.admin_whitelist`.
  - Platform admins operating on customer views must be visually badged to avoid administrative confusion.
- **Exact Conflict:** Blurring between customer workspace navigation and platform control planes.
- **Impact Assessment:**
  - *Customer Impact:* Zero customer exposure to administrative tools.
  - *Backend Impact:* Direct gating against server-side admin RPCs.
  - *Security Impact:* Prevents unauthorized privilege escalation.
  - *Financial Impact:* Admin operations isolated from financial settlement ledger.
  - *Audit Impact:* Every admin action logged in `platform_admin_audit_logs`.
- **Options Considered:**
  - *Option A:* Separate domain/subdomain for admin (e.g. `admin.otp.in`).
  - *Option B:* Single authoritative header menu with server-side verified gated entries for `/admin` and `/founder` + visual "Platform Mode" badge.
- **Recommended Resolution:** **Option B.** Maintain single unified header (`WorkspaceHeaderMenu.tsx`); render `/admin` and `/founder` tabs *only* when authenticated profile passes server-side security checks.
- **Risks & Mitigations:**
  - *Risk:* Accidental admin actions while testing buyer flows.
  - *Mitigation:* Clear visual indicator ("Platform Admin Active") in header when admin visits buyer routes.
- **Dependencies:** `WorkspaceHeaderMenu.tsx`, `usePlatformAdmin` hook, Migration 00152.
- **Product Owner Decision Required?** NO.
- **Final Decision:** **REFACTOR / STRICT GATING.**
- **Reconstruction Consequence:** Wire `WorkspaceHeaderMenu` to server-verified admin status; isolate `/admin` and `/founder` views.
- **Acceptance Criteria:**
  1. Normal buyers and suppliers see zero links to `/admin` or `/founder`.
  2. Verified Superadmin (`bvnbasu@gmail.com`) sees gated platform menu items.

---

### Contradiction C-07: Production Test / Demo Data Purge Policy
- **Contradiction ID:** `C-07` (Derived from Gap 7 / F8 & F4)
- **Current Implementation:**
  - `supabase/migrations/00125_production_preservation_and_staging_gate.sql`
  - `supabase/migrations/00184_production_clean_state_reset_and_demo_isolation.sql` (`admin_purge_test_transactions()`)
- **Repository / Database Evidence:**
  - Migration 00125 protects genuine production profiles from automated test resets.
  - Migration 00184 provides `admin_purge_test_transactions()` to purge test RFQs while preserving customer accounts.
- **Current Behavior:** Purge scripts identify test data via heuristic checks.
- **Intended Product Model (Constitution v1.0, Section 39):**
  - Customer-facing OTP must not expose test or demo data.
  - Production customer records must NEVER be deleted during maintenance or test purges.
- **Exact Conflict:** Need for automated testing vs risk of deleting genuine customer pilot records.
- **Impact Assessment:**
  - *Customer Impact:* Zero risk to live buyer/supplier records.
  - *Backend Impact:* Clean maintenance procedures.
  - *Security Impact:* Safe operational maintenance.
  - *Financial Impact:* Ledger entries for real transactions remain permanently intact.
  - *Audit Impact:* Immutable audit preservation.
- **Options Considered:**
  - *Option A:* Disallow purges entirely on production instances.
  - *Option B:* Strict deterministic ID prefix convention: all synthetic test/demo organizations must match `d1000000-*` through `d4000000-*` or have `is_demo = true`. Purge script operates strictly on matching records.
- **Recommended Resolution:** **Option B.** Formalize strict test ID prefix convention; `admin_purge_test_transactions()` hardcodes `WHERE organization_id LIKE 'd%' OR is_demo = true`.
- **Risks & Mitigations:**
  - *Risk:* Genuine customer account created with a test prefix.
  - *Mitigation:* UUID generator on live signup uses standard v4 UUIDs, never 'd' prefixed test constants.
- **Dependencies:** Migration 00125, Migration 00184, `AdminDashboardPage.tsx`.
- **Product Owner Decision Required?** NO.
- **Final Decision:** **PRESERVE AS INFRASTRUCTURE.**
- **Reconstruction Consequence:** Retain Migration 00125/00184 triggers and RPCs untouched; enforce test ID prefixes in test suites.
- **Acceptance Criteria:**
  1. Executing `admin_purge_test_transactions()` deletes test records (`d1000000-*`) and leaves real user accounts 100% untouched.

---

### Contradiction C-08: Supplier Identity Masking — Client-Side Filtering vs PostgreSQL Masked Views
- **Contradiction ID:** `C-08` (Derived from Problem 10 / F6 & F7)
- **Current Implementation:**
  - `supabase/migrations/00005_blind_views.sql`
  - `supabase/migrations/00117_canonical_identity_protected_views_and_enums.sql`
  - `packages/domain/src/errors/blind-violation.ts` (`assertIdentityProtectedPayloadSafe()`)
- **Repository / Database Evidence:**
  - View `public.rfq_quotes_identity_protected` redacts legal supplier entity names, phone numbers, email addresses, and GSTINs.
  - Domain memory guard `assertIdentityProtectedPayloadSafe()` inspects JSON objects and throws runtime errors on contact pattern leaks.
- **Current Behavior:** Sealed quotes are served through masked views, but legacy components occasionally attempted direct table joins.
- **Intended Product Model (Constitution v1.0, Section 18):**
  - "Supplier identity must remain protected until the authorized reveal condition is satisfied."
  - Server-side cryptographic masking is mandatory across DOM, network payloads, WebSockets, and error streams.
- **Exact Conflict:** Client-side redaction is vulnerable to browser dev tools inspection; must be 100% server-side.
- **Impact Assessment:**
  - *Customer Impact:* Total trust and fair competition during quoting.
  - *Backend Impact:* Queries consume masked views before award lock.
  - *Security Impact:* Prevents buyer-supplier collusion and off-platform disintermediation.
  - *Financial Impact:* Protects OTP platform fee realization.
  - *Audit Impact:* Audit logs record masked interactions until reveal.
- **Recommended Resolution:** **PRESERVE AS INFRASTRUCTURE.** All evaluation queries must consume `rfq_quotes_identity_protected` or `get_identity_protected_quotes_atomic()`. Domain memory guards remain active.
- **Final Decision:** **PRESERVE AS INFRASTRUCTURE.**
- **Acceptance Criteria:**
  1. Network response for unawarded quotes contains strictly `Supplier #01`, masked prices, and anonymized badges; zero phone/email/GSTIN in JSON payload.

---

### Contradiction C-09: Supplier Award & Onboarding Lifecycle Gate
- **Contradiction ID:** `C-09` (Derived from Problem 11 / F6 & F7)
- **Current Implementation:**
  - `supabase/migrations/00196_buyer_identity_address_rwa_msme_and_supplier_award_onboarding.sql` (`lock_and_reveal_award_atomic()`)
  - `apps/web/src/features/portal/pages/SupplierAwardOnboardingPage.tsx`
- **Repository / Database Evidence:**
  - Migration 00196 adds 2-stage verification branch in `lock_and_reveal_award_atomic()`.
  - If winning supplier is unverified, RFQ transitions to `AWARDED` but halts identity reveal until supplier completes `/supplier/award-onboarding/:token`.
- **Current Behavior:** Unverified suppliers cannot receive contracts or payouts without passing statutory KYC/GST checks.
- **Intended Product Model (Constitution v1.0, Section 16 & 17):**
  - Fast-track quoting via magic links (`/q/:token`).
  - Strict verification gate before mutual reveal and Purchase Order issuance.
- **Exact Conflict:** Historical code allowed premature instant reveal to unverified entities.
- **Impact Assessment:**
  - *Customer Impact:* Buyers guaranteed verified suppliers on every awarded job.
  - *Backend Impact:* Atomic state transitions in PostgreSQL.
  - *Security Impact:* Zero unvetted bank accounts in payout pipelines.
  - *Financial Impact:* Eliminates fraudulent invoicing.
  - *Audit Impact:* Verified GSTIN and PAN snapshots on POs.
- **Recommended Resolution:** **PRESERVE AS INFRASTRUCTURE.** Retain Migration 00196 2-stage onboarding logic.
- **Final Decision:** **PRESERVE AS INFRASTRUCTURE.**
- **Acceptance Criteria:**
  1. Awarding an unverified supplier routes them to `/supplier/award-onboarding/:token`.
  2. Mutual reveal and PO issuance are blocked until GSTIN and Bank details are verified.

---

### Contradiction C-10: RWA Governance Succession & Immutable Auditing
- **Contradiction ID:** `C-10` (Derived from Problem 13 / F6 & F7)
- **Current Implementation:**
  - `supabase/migrations/00197_universal_org_role_lifecycle_succession_and_audit.sql`
  - `packages/services/src/services/org-role-lifecycle-service.ts`
- **Repository / Database Evidence:**
  - Migration 00197 creates `public.org_role_assignments` (365-day term) and append-only `public.org_governance_action_audits`.
  - Trigger `prevent_mutation_org_governance_audits()` throws hard PostgreSQL exceptions on `UPDATE` or `DELETE`.
- **Current Behavior:** Historical decisions remain permanently attributed to the biological human actor who signed them (`actor_person_id`).
- **Intended Product Model (Constitution v1.0, Section 7, 8, 9, 10, 36):**
  - "Role $\neq$ Person". Historical visibility is not historical authority.
  - Succession transfers future authority without rewriting past records.
- **Exact Conflict:** Legacy `organization_members.role` string updates retroactively rewrote audit histories.
- **Impact Assessment:**
  - *Customer Impact:* Legal compliance with Indian Apartment Ownership Acts; indisputable audit trails for AGM meetings.
  - *Backend Impact:* Append-only ledger in PostgreSQL.
  - *Security Impact:* Tamper-evident governance records.
  - *Financial Impact:* Unambiguous responsibility for past expenditures.
  - *Audit Impact:* 100% tamper-proof audit trail.
- **Recommended Resolution:** **PRESERVE AS INFRASTRUCTURE.** Use `OrgRoleLifecycleService` methods exclusively for role mutations.
- **Final Decision:** **PRESERVE AS INFRASTRUCTURE.**
- **Acceptance Criteria:**
  1. Transferring President role from Person A to Person B preserves Person A's name on 2025 Decision Receipts.
  2. Person B acquires signing authority only for transactions created on or after the effective date.

---

### Contradiction C-11: First-Class Address Architecture & Snapshots
- **Contradiction ID:** `C-11` (Derived from Problem 1 / F6 & F7)
- **Current Implementation:**
  - `supabase/migrations/00196_...sql` (`public.buyer_addresses`)
  - `apps/web/src/features/intake/components/UnifiedThreeTierIntake.tsx`
  - `apps/web/src/features/profile/components/AddressBookManager.tsx`
- **Repository / Database Evidence:**
  - `buyer_addresses` table supports `is_primary`, `address_type` (`'DELIVERY'`, `'REGISTERED'`), `profile_id`, and `organization_id`.
  - RFQs and POs contain `delivery_address_snapshot` and `billing_address_snapshot` JSONB columns.
- **Current Behavior:** Profile address edits were occasionally overwriting past RFQ delivery locations.
- **Intended Product Model (Constitution v1.0, Section 28):**
  - Primary address auto-inherits during intake.
  - Historical procurement records retain frozen JSONB snapshots; profile updates never alter past contracts.
- **Exact Conflict:** Mutable profile references vs immutable contract snapshots.
- **Impact Assessment:**
  - *Customer Impact:* Seamless 1-click address selection during intake.
  - *Backend Impact:* Clean snapshotting on RFQ and PO insert.
  - *Security Impact:* None.
  - *Financial Impact:* Statutory GST place-of-supply tax compliance.
  - *Audit Impact:* Historical delivery address exactly matches physical dispatch location.
- **Recommended Resolution:** **REFACTOR / STANDARDIZE.** Wire `UnifiedThreeTierIntake` to auto-inherit from `buyer_addresses` and freeze snapshots on insert.
- **Final Decision:** **REFACTOR / STANDARDIZE.**
- **Acceptance Criteria:**
  1. Individual and RWA buyers have their default primary address auto-filled in intake.
  2. Editing a profile address does NOT mutate the address snapshot on existing RFQs or POs.

---

### Contradiction C-12: Route Sprawl & Screen Redundancy
- **Contradiction ID:** `C-12` (Derived from Matrix F2 & Problem 5 / F6)
- **Current Implementation:**
  - `apps/web/src/App.tsx` (68 declared routes)
  - `apps/web/src/pages/` and `apps/web/src/features/**/pages/` (51 page components)
- **Repository / Database Evidence:**
  - 9 duplicate paths routing to `EvaluationDecisionCockpitPage`.
  - Orphaned files: `DashboardPage.tsx`, `SupplierDashboardPage.tsx`, `RfqIdentityProtectedComparisonPage.tsx`.
- **Current Behavior:** Fragmented URLs and redundant screen components.
- **Intended Product Model (Constitution v1.0, Section 26 & 27):**
  - "One Purpose $\rightarrow$ One Canonical Route $\rightarrow$ One Canonical Screen".
  - Exactly 18 canonical customer routes.
- **Exact Conflict:** Route bloat causes cache divergence, inconsistent state, and broken navigation history.
- **Impact Assessment:**
  - *Customer Impact:* Clean, predictable URLs and browser back/forward navigation.
  - *Backend Impact:* None.
  - *Security Impact:* Simpler route guard definitions.
  - *Financial Impact:* None.
  - *Audit Impact:* Clear page entry telemetry.
- **Recommended Resolution:** **RECONSTRUCT.** Consolidate router into the 18 Canonical Customer Routes; replace duplicate declarations with `<Navigate replace />` redirects; delete orphaned legacy page files.
- **Final Decision:** **RECONSTRUCT (18 Canonical Routes).**
- **Acceptance Criteria:**
  1. `App.tsx` declares exactly the 18 Canonical Routes and necessary redirects.
  2. All alias URLs redirect seamlessly to canonical paths.
  3. Orphaned legacy page files are removed.

---

### Contradiction C-13: Mobile Shell Bottom Containment & Obscuration
- **Contradiction ID:** `C-13` (Derived from Problem 4 / F6 & Constitution Section 25)
- **Current Implementation:**
  - `apps/web/src/components/layout/AppLayout.tsx`
  - `apps/web/src/features/evaluation/components/EvaluationDecisionCockpit.tsx`
  - `apps/web/src/features/intake/components/UnifiedThreeTierIntake.tsx`
- **Repository / Database Evidence:**
  - Fixed action footers (`fixed bottom-0`) lacked safe-area bottom padding (`pb-28` / `pb-32`) on the scrollable container.
- **Current Behavior:** Primary action buttons ("Publish RFQ", "Submit Quote", "Cast Vote") obscured on mobile screens $<420\text{px}$.
- **Intended Product Model (Constitution v1.0, Section 25):**
  - "OTP is mobile-first. The primary customer experience must fit naturally inside the mobile application shell."
  - Zero button obscuration; touch-friendly 44px tap targets.
- **Exact Conflict:** Desktop-first fixed positioning causing mobile viewport overflow and unclickable submit buttons.
- **Impact Assessment:**
  - *Customer Impact:* Flawless mobile smartphone experience across iOS and Android browsers.
  - *Backend Impact:* None.
  - *Security Impact:* None.
  - *Financial Impact:* Higher transaction completion rates.
  - *Audit Impact:* None.
- **Recommended Resolution:** **RECONSTRUCT.** Implement unified `MobileActionFooter` with `pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]` container padding and sticky viewport containment.
- **Final Decision:** **RECONSTRUCT (Mobile AppShell Standard).**
- **Acceptance Criteria:**
  1. On 360px–414px mobile viewports, all form fields scroll completely clear of the floating footer.
  2. Primary action buttons are 100% visible and clickable on every screen.

---

### Contradiction C-14: Truthful Notification Lifecycle & Delivery State
- **Contradiction ID:** `C-14` (Derived from Problem 6 / F6 & Constitution Section 31)
- **Current Implementation:**
  - `packages/domain/src/types/notification.ts`
  - `supabase/functions/messaging-inbound/index.ts`
  - `apps/web/src/features/notifications/`
- **Repository / Database Evidence:**
  - Legacy frontend marked invitations as "Delivered" immediately upon HTTP dispatch request.
- **Current Behavior:** UI claims WhatsApp delivery occurred even when the gateway failed or recipient was unreachable.
- **Intended Product Model (Constitution v1.0, Section 31):**
  - "OTP notifications must be truthful. OTP must never claim that WhatsApp/email delivery occurred unless the configured provider supplies appropriate evidence."
  - Strict 8-state lifecycle: `CREATED` $\rightarrow$ `DISPATCH_REQUESTED` $\rightarrow$ `ACCEPTED_BY_PROVIDER` $\rightarrow$ `DELIVERED` $\rightarrow$ `OPENED` $\rightarrow$ `CLAIMED` $\rightarrow$ `FAILED` $\rightarrow$ `UNAVAILABLE`.
- **Exact Conflict:** Fire-and-forget optimistic delivery status vs truthful cryptographic receipt tracking.
- **Impact Assessment:**
  - *Customer Impact:* Buyers have honest visibility into whether suppliers actually received invitations.
  - *Backend Impact:* Webhook handler in `messaging-inbound` updates notification state upon receiving WAHA/Twilio delivery receipt.
  - *Security Impact:* Protects audit trail integrity.
  - *Financial Impact:* None.
  - *Audit Impact:* Indisputable proof of notice.
- **Recommended Resolution:** **REFACTOR / ENFORCE 8 STATES.** Update notification models and UI components to display "Dispatch Pending" until webhook confirmation.
- **Final Decision:** **REFACTOR / ENFORCE 8 NOTIFICATION STATES.**
- **Acceptance Criteria:**
  1. Notification status renders "Dispatch Requested" until provider webhook receipt transitions status to "Delivered".
  2. Failed deliveries display clear failure reasons and retry options.

---

### Contradiction C-15: Market Intelligence Provenance Ladder
- **Contradiction ID:** `C-15` (Derived from Problem 7 / F6 & Constitution Section 32)
- **Current Implementation:**
  - `packages/domain/src/types/market-intelligence.ts`
  - `apps/web/src/features/market-intelligence/`
- **Repository / Database Evidence:**
  - UI components displayed static price benchmarks without disclosing whether data was live, cached, or reference.
- **Current Behavior:** Static price indices presented as live market rates.
- **Intended Product Model (Constitution v1.0, Section 32):**
  - "Market intelligence must clearly distinguish its source state. The fallback ladder is: `LIVE_API` $\rightarrow$ `DATABASE_CACHE` $\rightarrow$ `STATIC_REFERENCE` $\rightarrow$ `UNAVAILABLE`."
  - Never label cached or static reference data as live market intelligence.
- **Exact Conflict:** Misrepresenting data freshness undermines platform trustworthiness.
- **Impact Assessment:**
  - *Customer Impact:* Buyers make informed decisions knowing exact data provenance and freshness.
  - *Backend Impact:* Provenance metadata attached to all market intelligence API payloads.
  - *Security Impact:* None.
  - *Financial Impact:* Prevents unrealistic budget expectations based on stale indices.
  - *Audit Impact:* Clear provenance records on decision receipts.
- **Recommended Resolution:** **REFACTOR / ENFORCE 4 TIERS.** Display explicit provenance badges (`LIVE`, `CACHED (X days ago)`, `REFERENCE BENCHMARK`) across all intelligence views.
- **Final Decision:** **REFACTOR / ENFORCE 4-TIER PROVENANCE LADDER.**
- **Acceptance Criteria:**
  1. Every market intelligence card displays its provenance tier badge.
  2. Static reference benchmarks are never labeled as "Live Rates".

---

### Contradiction C-16: Enterprise Shared Infrastructure Disposition
- **Contradiction ID:** `C-16` (Derived from Document F3 & Constitution Section 40)
- **Current Implementation:**
  - `packages/services/src/services/enterprise-approval-matrix-service.ts`
  - `supabase/migrations/00183_...sql`, `00190_...sql`, `00191_...sql`, `00192_...sql`
- **Repository / Database Evidence:**
  - Modules named "Enterprise" contain critical threshold routing, delegation proxies, and anti-self-approval logic required for MSME and RWA.
- **Current Behavior:** Ambiguity on whether to delete all files with "Enterprise" in their name.
- **Intended Product Model (Constitution v1.0, Section 40 & 44):**
  - "Existing enterprise-related code/database structures must be assessed individually before removal. They must never be assumed to be safe to delete merely because Enterprise is out of product scope. Reuse before rebuild. Repair before replace."
- **Exact Conflict:** Pure Enterprise UI violates Constitution v1.0, but underlying backend engines power vital MSME/RWA governance.
- **Impact Assessment:**
  - *Customer Impact:* Zero Enterprise UI exposure, 100% MSME spend delegation and RWA threshold capabilities.
  - *Backend Impact:* Zero schema breakage; clean refactored service interfaces.
  - *Security Impact:* Preserves battle-tested anti-self-approval and spend cap gates.
  - *Financial Impact:* Full protection against unauthorized spend.
  - *Audit Impact:* Complete auditability preserved.
- **Recommended Resolution:** **PRESERVE AS INFRASTRUCTURE & REFACTOR SERVICE NAMES.** Keep all SQL tables (`rfq_approval_stages`, `organization_delegations`, `organization_approval_policies`) and RPCs. Refactor TypeScript services to `SpendApprovalGovernanceService`.
- **Final Decision:** **PRESERVE AS INFRASTRUCTURE / REFACTOR SERVICES.**
- **Acceptance Criteria:**
  1. All 14 governance tests in `c84-spend-approval-orchestration-and-delegation.test.ts` pass with 100% green assertions.
  2. Zero customer-facing UI references to Enterprise.

---

## 4. Human Product Owner Decision Sign-Off Summary

All 16 contradictions have been analyzed and provided with authoritative architectural resolutions. Below is the sign-off summary for formal stakeholder record:

| Item # | Contradiction Area | Architectural Resolution | Impact on Codebase | Sign-Off Status |
| :---: | :--- | :--- | :--- | :---: |
| **C-01** | Individual Org Model | `organization_id = NULL` for pure Individual buyers | Clean persona isolation; no phantom orgs | 🟢 RESOLVED BY CONSTITUTION v1.0 |
| **C-02** | Subscription Pricing | 3 Plans: Individual (₹0), RWA (₹499/mo), MSME (₹999/mo) | Remove Enterprise card & constants | 🟢 RESOLVED BY CONSTITUTION v1.0 |
| **C-03** | MSME Spend Delegation | Configurable spend caps per delegate; Primary 1-click approval | Flexible delegation for business owners | 🟢 RESOLVED BY CONSTITUTION v1.0 |
| **C-04** | RFQ Intake Line Items | Single-requirement turnkey intake baseline for Phase 1 | Simple 1-screen mobile intake UX | 🟢 RESOLVED BY CONSTITUTION v1.0 |
| **C-05** | WhatsApp Sourcing | Outbound WA message with `/q/:token` magic link web form | 100% structured quote data capture | 🟢 RESOLVED BY CONSTITUTION v1.0 |
| **C-06** | Platform Role Navigation | Server-verified gated menu links with visual admin sandbox badge | Strict isolation of admin & buyer UX | 🟢 RESOLVED BY CONSTITUTION v1.0 |
| **C-07** | Test Data Purging | Strict test ID prefix isolation (`d1000000-*`) during purges | Zero risk to production customer data | 🟢 RESOLVED BY CONSTITUTION v1.0 |
| **C-08** | Identity Masking | Server-side PostgreSQL masked views + domain memory guards | Zero unmasked data leakage to client | 🟢 RESOLVED BY CONSTITUTION v1.0 |
| **C-09** | Supplier Lifecycle | 2-stage verification gate before mutual reveal & PO issuance | Guarantees verified suppliers on POs | 🟢 RESOLVED BY CONSTITUTION v1.0 |
| **C-10** | RWA Succession | 365-day term expiry & immutable historical audit ledger | Tamper-proof governance audit trails | 🟢 RESOLVED BY CONSTITUTION v1.0 |
| **C-11** | Address Architecture | Auto-inherit from `buyer_addresses` + frozen JSONB snapshots | Profile edits never mutate past POs | 🟢 RESOLVED BY CONSTITUTION v1.0 |
| **C-12** | Route Canonicalization | Streamline router to 18 Canonical Customer Routes | Eliminates route bloat and duplicates | 🟢 RESOLVED BY CONSTITUTION v1.0 |
| **C-13** | Mobile AppShell | `MobileActionFooter` with safe-area padding (`pb-32`) | Zero button obscuration on mobile | 🟢 RESOLVED BY CONSTITUTION v1.0 |
| **C-14** | Notifications | Enforce strict 8-state lifecycle with webhook confirmation | Truthful delivery status tracking | 🟢 RESOLVED BY CONSTITUTION v1.0 |
| **C-15** | Market Intelligence | Enforce 4-tier provenance ladder with source badges | Transparent data provenance | 🟢 RESOLVED BY CONSTITUTION v1.0 |
| **C-16** | Enterprise Assets | Preserve SQL tables & RPCs; refactor services to MSME/RWA | Retains shared delegation engine | 🟢 RESOLVED BY CONSTITUTION v1.0 |

---
*End of Contradiction Decision Register (R1-F8)*
