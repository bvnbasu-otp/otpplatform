# OTP Implementation Sequence & Execution Plan (R2)
**Document Identifier:** `OTP-RECON-R2-IMPLEMENTATION-SEQUENCE`  
**Version:** 1.0 (Authoritative R2 Execution Plan)  
**Status:** SUPREME EXECUTION SEQUENCE SPECIFICATION  
**Working Root:** `G:/My Drive/otp`  
**Stack Baseline:** React 19 + TypeScript + Vite + Tailwind CSS + Supabase PostgreSQL (Migration Ceiling: `00197`)  
**Operating Invariant:** *MODE: PLANNING & SPECIFICATION ONLY. ZERO SOURCE CODE MUTATION DURING R2.*

---

## 1. Executive Overview & Sequence Topology

This document specifies the authoritative, chronological **22-Stage Implementation Sequence (R2-01 through R2-22)** for the **OTP Golden Reconstruction v1**.

Every stage defines strict entry criteria, physical deliverables, database and security bindings, validation commands, git commit boundaries, and rollback runbooks. The sequence is engineered to guarantee zero regression on the **1,514+ passing tests**, strict preservation of **Protected Assets PA-01 through PA-10**, and zero invention of unapproved product behavior.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        22-STAGE IMPLEMENTATION TOPOLOGY                                │
└────────────────────────────────────────────────────────────────────────────────────────┘

 [FOUNDATION & SHELL]
  ├── R2-01: Repository & Architecture Baseline Preparation
  ├── R2-02: Global AppShell, Mobile Inset & Route Canonicalization
  └── R2-03: 13-Stage Identity, Multi-Context & Authorization Engine

 [BUYER PERSONAS & GOVERNANCE]
  ├── R2-04: Individual Buyer Experience (Self-Contained / NULL Org)
  ├── R2-05: RWA Governance Engine (7 Roles, Succession, Quorum & COI)
  └── R2-06: MSME Spend Delegation & Proxy Approvals

 [SUPPLIER NETWORK & VERIFICATION]
  ├── R2-07: Unified Supplier Network Sourcing Engine
  └── R2-08: Supplier 2-Stage Lifecycle & Zero-Leakage Onboarding Gate

 [THE 4-ACTION CUSTOMER JOURNEY]
  ├── R2-09: Action 1 — TELL: Multimodal Fast-Track Requirement Intake
  ├── R2-10: Action 2 — REVIEW: Identity-Protected Evaluation Cockpit
  ├── R2-11: Action 3 — DECIDE: Democratic Voting & Award Lock
  └── R2-12: Action 4 — TRACK: Purchase Orders, Milestones & Fulfillment

 [CORE PLATFORM ENGINES]
  ├── R2-13: Canonical Sourcing Taxonomy & Rule-Based NLP Parser
  ├── R2-14: First-Class Address Architecture & Immutable Snapshots
  ├── R2-15: Truthful 8-State Notification Engine & Webhooks
  ├── R2-16: 4-Tier Market Price & Quality Intelligence Engine
  └── R2-17: GAAP Double-Entry Financial & Settlement Controls

 [CONTROL PLANES & OBSERVABILITY]
  ├── R2-18: Superadmin Operational Console (/admin)
  ├── R2-19: CEO / Founder Oversight Cockpit (/founder)
  └── R2-20: 3-Domain Telemetry Model & Partitioned Sinks

 [CLEANUP & CERTIFICATION]
  ├── R2-21: Enterprise, Demo & Test Data Isolation Cleanup
  └── R2-22: Full Regression, Red-Team Audit & 3-Tier Certification
```

---

## 2. Detailed Execution Specifications for Stages R2-01 through R2-22

---

### Stage R2-01: Repository & Architecture Baseline Preparation
- **Stage ID:** `R2-01`
- **Architectural Objective:** Establish an immutable workspace baseline, lock the migration ceiling at `00197`, verify PNPM workspace configuration, validate TypeScript compiler options, and record green baseline test metrics.
- **Prerequisites:** R1 documentation artifacts approved (`R1-Reconstruction-Contract.md`, `R1-Target-Architecture.md`, `R1-Product-Rule-Traceability-Matrix.md`).
- **Physical Deliverables:**
  - `pnpm-lock.yaml`, `package.json`, `pnpm-workspace.yaml` validation.
  - Verification of `tsconfig.json` across packages (`@otp/domain`, `@otp/database`, `@otp/services`, `apps/web`).
  - Baseline test verification script execution.
- **Database & Security Invariants:**
  - Verify migration directory contains exactly 197 migrations (`00001` through `00197`).
  - Enforce zero alteration of historical migrations (`PA-01` through `PA-10`).
- **Validation Commands:**
  ```powershell
  pnpm install --frozen-lockfile
  pnpm -r run build
  pnpm test
  ```
- **Git Commit Boundary:**
  `chore(recon): baseline repository and workspace lock for R2 execution`
- **Rollback Strategy:** `git checkout main` and purge local cache (`pnpm store prune`).

---

### Stage R2-02: Global AppShell, Mobile Inset & Route Canonicalization
- **Stage ID:** `R2-02`
- **Architectural Objective:** Reconstruct `AppLayout.tsx` with smartphone containment (`max-w-md mx-auto`), apply universal safe-area bottom padding (`pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]`), deploy `MobileActionFooter.tsx`, and consolidate `apps/web/src/App.tsx` into the **18 Canonical Customer Routes** with 301 redirects for all legacy aliases.
- **Prerequisites:** Stage `R2-01` complete.
- **Physical Deliverables:**
  - `apps/web/src/App.tsx`: Streamline router to 18 Canonical Routes (F2 Matrix); replace 50+ aliases with `<Navigate replace />`.
  - `apps/web/src/components/layout/AppLayout.tsx`: Implement mobile container & safe-area classes.
  - `apps/web/src/components/layout/MobileActionFooter.tsx`: Universal floating CTA bar with touch target validation ($\ge 44\text{px}$).
  - `apps/web/src/components/layout/WorkspaceHeaderMenu.tsx`: Standardized dual-persona toggle and server-gated platform navigation.
- **Database & Security Invariants:** Gating routes `/admin` and `/founder` behind server-side authorization checks.
- **Validation Commands:**
  ```powershell
  pnpm --filter @otp/web test tests/unit/web-routes.test.ts
  pnpm --filter @otp/web build
  ```
- **Git Commit Boundary:**
  `feat(web): consolidate router to 18 canonical routes and deploy mobile appshell`
- **Rollback Strategy:** Revert commit; restore previous `App.tsx` and layout wrappers.

---

### Stage R2-03: 13-Stage Identity, Multi-Context & Authorization Engine
- **Stage ID:** `R2-03`
- **Architectural Objective:** Implement and bind the **13-Stage Canonical Authorization Model** across frontend `RoleProvider.tsx`, `@otp/domain`, and `@otp/services`. Enforce complete independence between Individual, RWA, and MSME contexts held by the same biological person.
- **Prerequisites:** Stage `R2-02` complete.
- **Physical Deliverables:**
  - `packages/domain/src/types/buyer-persona.ts`: Persona definitions and context transition rules.
  - `packages/services/src/types/actor-context.ts`: 13-stage deterministic context evaluator.
  - `apps/web/src/features/roles/RoleProvider.tsx`: Context switching and active organization resolution.
  - `apps/web/src/features/roles/RequireRole.tsx`: Route-level context authorization wrapper.
- **Database & Security Invariants:**
  - Server-side RLS enforcement; client permission states are purely cosmetic.
  - Binding to Migration 00187 RPC `switch_portal_side()`.
- **Validation Commands:**
  ```powershell
  pnpm test tests/integration/role-access.test.ts
  pnpm test tests/security/cross-organization.test.ts
  ```
- **Git Commit Boundary:**
  `feat(auth): enforce 13-stage authorization chain and multi-context independence`
- **Rollback Strategy:** Revert commit; restore previous role context resolution logic.

---

### Stage R2-04: Individual Buyer Experience (Self-Contained / NULL Org)
- **Stage ID:** `R2-04`
- **Architectural Objective:** Deliver the pure Individual Buyer procurement workflow: `requirements.organization_id = NULL`, `rfqs.organization_id = NULL`, 1-click self-approval, personal delivery address book, and zero exposure to committee, delegation, or quorum interfaces.
- **Prerequisites:** Stage `R2-03` complete.
- **Physical Deliverables:**
  - `packages/services/src/services/requirement-service.ts`: Handle `organization_id = null` for Individual buyers.
  - `apps/web/src/features/home/HomePage.tsx`: Render streamlined Individual buyer dashboard.
  - `apps/web/src/features/profile/ProfilePage.tsx`: Personal profile and address management without org containers.
- **Database & Security Invariants:**
  - Preserves Migration 00196 RLS policies permitting `profile_id IS NOT NULL` where `organization_id IS NULL`.
- **Validation Commands:**
  ```powershell
  pnpm test packages/services/src/services/buyer-identity-address-and-supplier-onboarding.test.ts
  ```
- **Git Commit Boundary:**
  `feat(buyer): deliver self-contained individual buyer procurement flow`
- **Rollback Strategy:** Revert commit; restore auto-provisioning fallback if tests fail.

---

### Stage R2-05: RWA Governance Engine (7 Roles, Succession, Quorum & COI)
- **Stage ID:** `R2-05`
- **Architectural Objective:** Reconstruct the RWA Housing Society governance cockpit around the 7 canonical roles, 365-day term expiry, annual officer succession (`transfer_org_role_succession_atomic`), immutable audit logging (`org_governance_action_audits`), democratic voting (`submit_committee_vote_atomic`), mandatory COI recusal, and quorum verification ($\ge 2$).
- **Prerequisites:** Stage `R2-03` and `R2-04` complete; Protected Asset `PA-01` and `PA-03` active.
- **Physical Deliverables:**
  - `apps/web/src/features/governance/pages/CommitteeVotePage.tsx`: Live quorum progress and COI modal.
  - `apps/web/src/features/org/pages/OrgMembersPage.tsx`: 365-day succession timeline and role assignment UI.
  - `packages/services/src/services/org-role-lifecycle-service.ts`: Wire to Migration 00197 RPCs.
  - `packages/services/src/services/approval-service.ts`: RWA committee voting integration.
- **Database & Security Invariants:**
  - `PA-01`: Quorum enforcement and Manager role vote rejection in `submit_committee_vote_atomic`.
  - `PA-03`: Append-only trigger `prevent_mutation_org_governance_audits()`.
- **Validation Commands:**
  ```powershell
  pnpm test packages/services/src/services/org-role-lifecycle-service.test.ts
  pnpm test apps/web/src/features/governance/failure-paths-regression.test.ts
  ```
- **Git Commit Boundary:**
  `feat(rwa): reconstruct rwa governance succession voting and immutable audit`
- **Rollback Strategy:** Revert commit; restore previous committee vote dispatchers.

---

### Stage R2-06: MSME Spend Delegation & Proxy Approvals
- **Stage ID:** `R2-06`
- **Architectural Objective:** Refactor `EnterpriseApprovalMatrixService` $\rightarrow$ `SpendApprovalGovernanceService` to orchestrate MSME spend delegation proxies (`public.organization_delegations`), enforce monetary spend caps with UTC expiry, implement anti-self-approval rules, and provide 1-click approval for MSME Primary owners.
- **Prerequisites:** Stage `R2-03` complete; Protected Asset `PA-09` active.
- **Physical Deliverables:**
  - `packages/services/src/services/spend-approval-governance-service.ts`: Refactored delegation and threshold service.
  - `packages/domain/src/types/approval-execution.ts`: Anti-self-approval and cap evaluation logic.
  - `apps/web/src/features/org/components/DelegationProxyManager.tsx`: MSME spend cap configuration UI.
  - `apps/web/src/features/award/components/SpendApprovalModal.tsx`: MSME approval interface.
- **Database & Security Invariants:**
  - `PA-09`: Anti-self-approval trigger and spend cap validation in `submit_rfq_tier_approval_atomic`.
- **Validation Commands:**
  ```powershell
  pnpm test packages/services/src/services/c84-spend-approval-orchestration-and-delegation.test.ts
  ```
- **Git Commit Boundary:**
  `feat(msme): implement msme spend delegation proxies and anti-self-approval guards`
- **Rollback Strategy:** Revert service renaming and delegation bindings.

---

### Stage R2-07: Unified Supplier Network Sourcing Engine
- **Stage ID:** `R2-07`
- **Architectural Objective:** Unify multi-source supplier ingestion (Verified Marketplace Index, Direct Network, ONDC Beckn, BNI), execute multi-parameter matching (category code, geo-radius $\le 25\text{km}$, rating, capacity), perform GSTIN/phone deduplication, and power `/requirements/:id/discover`.
- **Prerequisites:** Stage `R2-02` and `R2-03` complete.
- **Physical Deliverables:**
  - `packages/services/src/discovery/supplier-network-engine.ts`: Core ranking and pool matching algorithm.
  - `packages/services/src/discovery/composite-discovery-service.ts`: Multi-source adapter aggregator.
  - `apps/web/src/features/requirement/pages/DiscoverSuppliersPage.tsx`: Mobile-first supplier discovery cockpit.
- **Database & Security Invariants:**
  - Tokenized single-use quote invitation generation (`/q/:token`).
  - Masked supplier previews prior to invitation dispatch.
- **Validation Commands:**
  ```powershell
  pnpm test packages/services/src/discovery/supplier-network-engine.test.ts
  pnpm test packages/services/src/discovery/supplier-network-redteam.test.ts
  ```
- **Git Commit Boundary:**
  `feat(sourcing): deploy unified supplier network discovery and matching engine`
- **Rollback Strategy:** Revert discovery engine aggregation changes.

---

### Stage R2-08: Supplier 2-Stage Lifecycle & Zero-Leakage Onboarding Gate
- **Stage ID:** `R2-08`
- **Architectural Objective:** Implement the complete 2-stage supplier lifecycle: Stage 1 unauthenticated magic-link quoting (`/q/:token`), identity-protected sealed bids, Stage 2 fail-closed award onboarding gate (`/supplier/award-onboarding/:token`), statutory KYC/GST verification, and post-verification mutual identity reveal.
- **Prerequisites:** Stage `R2-07` complete; Protected Assets `PA-02`, `PA-04`, `PA-05` active.
- **Physical Deliverables:**
  - `apps/web/src/features/quick-quote/pages/QuickQuotePage.tsx`: Zero-login quote submission interface.
  - `apps/web/src/features/supplier/pages/SupplierAwardOnboardingPage.tsx`: Statutory onboarding verification gate.
  - `apps/web/src/features/reveal/pages/SupplierRevealPage.tsx`: Mutual contact unmasking screen.
  - `packages/services/src/services/supplier-award-onboarding-service.ts`: Onboarding workflow orchestration.
- **Database & Security Invariants:**
  - `PA-02`: Fail-closed gate in `lock_and_reveal_award_atomic` (Migration 00196).
  - `PA-04` & `PA-05`: Masked view `rfq_quotes_identity_protected` and `assertIdentityProtectedPayloadSafe()`.
- **Validation Commands:**
  ```powershell
  pnpm test tests/security/blind-rfq-engine.test.ts
  pnpm test packages/domain/src/types/supplier-award-onboarding.test.ts
  ```
- **Git Commit Boundary:**
  `feat(supplier): deliver 2-stage supplier lifecycle and zero-leakage onboarding gate`
- **Rollback Strategy:** Revert onboarding routes and service gate integrations.

---

### Stage R2-09: Action 1 — TELL: Multimodal Fast-Track Requirement Intake
- **Stage ID:** `R2-09`
- **Architectural Objective:** Deliver the first core customer action **TELL** (`/intake`): multimodal input (Voice note, Text prompt, Photo upload, Structured form), $<60$ second mobile completion, direct database taxonomy binding, and primary address auto-inheritance.
- **Prerequisites:** Stage `R2-02`, `R2-04`, and `R2-08` complete.
- **Physical Deliverables:**
  - `apps/web/src/features/intake/pages/RequirementIntakePage.tsx`: Canonical intake page.
  - `apps/web/src/features/intake/components/UnifiedThreeTierIntake.tsx`: Consolidated multimodal intake component.
  - `apps/web/src/features/intake/hooks/use-taxonomy.ts`: Direct Supabase taxonomy API hook.
  - `packages/services/src/parser/rule-based-requirement-parser.ts`: Natural language NLP parser.
- **Database & Security Invariants:**
  - Validation against `public.taxonomy_categories` and `public.taxonomy_subcategories`.
  - Auto-inherit `buyer_addresses.is_primary = true`.
- **Validation Commands:**
  ```powershell
  pnpm test apps/web/src/features/intake/api/fast-track-intake.test.ts
  pnpm test packages/domain/src/parser/rule-based-requirement-parser.test.ts
  ```
- **Git Commit Boundary:**
  `feat(intake): implement multimodal tell intake with database taxonomy and address inheritance`
- **Rollback Strategy:** Revert intake component consolidation.

---

### Stage R2-10: Action 2 — REVIEW: Identity-Protected Evaluation Cockpit
- **Stage ID:** `R2-10`
- **Architectural Objective:** Deliver the second core customer action **REVIEW** (`/rfq/:id/evaluation`): identity-protected quote decision room, 4-pillar evaluation matrix (Price, Delivery, Quality, Service SLA), anonymized performance scorecards, complete removal of `getPilotByRfqId()` fallback, and relocation of "Simulate Quotes" button to Superadmin.
- **Prerequisites:** Stage `R2-08` and `R2-09` complete; Protected Asset `PA-04` active.
- **Physical Deliverables:**
  - `apps/web/src/features/evaluation/pages/EvaluationDecisionCockpitPage.tsx`: Canonical decision room.
  - `apps/web/src/features/evaluation/components/EvaluationDecisionCockpit.tsx`: Masked comparison table.
  - `apps/web/src/features/rfq/components/QuoteCard4Pillar.tsx`: 4-pillar quote evaluation card.
  - `packages/services/src/services/quote-evaluation-service.ts`: Evaluation service orchestration.
- **Database & Security Invariants:**
  - Consume exclusively `public.rfq_quotes_identity_protected` view.
  - Enforce `assertIdentityProtectedPayloadSafe()` memory guard.
- **Validation Commands:**
  ```powershell
  pnpm test apps/web/src/features/rfq/quote-comparison-mobile.test.ts
  pnpm test packages/domain/src/evaluation/smart-scoring.test.ts
  ```
- **Git Commit Boundary:**
  `feat(evaluation): deliver identity-protected review cockpit and 4-pillar quote comparison`
- **Rollback Strategy:** Revert evaluation cockpit refactoring.

---

### Stage R2-11: Action 3 — DECIDE: Democratic Voting & Award Lock
- **Stage ID:** `R2-11`
- **Architectural Objective:** Deliver the third core customer action **DECIDE**: 1-click approval for Individuals and MSME Primaries, delegated spend authorization within caps, RWA democratic committee voting with quorum ($\ge 2$) and COI recusal, atomic award locking via `lock_and_reveal_award_atomic`, and immutable `DecisionReceipt` artifact generation.
- **Prerequisites:** Stage `R2-05`, `R2-06`, and `R2-10` complete; Protected Assets `PA-01`, `PA-02`, and `PA-03` active.
- **Physical Deliverables:**
  - `apps/web/src/features/award/pages/AwardPage.tsx`: Award confirmation and lock interface.
  - `apps/web/src/features/reveal/components/DecisionReceiptCard.tsx`: Cryptographically signed receipt.
  - `packages/services/src/services/award-service.ts`: Award execution orchestration.
- **Database & Security Invariants:**
  - `PA-01` & `PA-02`: Atomic execution of `lock_and_reveal_award_atomic()` and `submit_committee_vote_atomic()`.
- **Validation Commands:**
  ```powershell
  pnpm test tests/security/award-closeout.test.ts
  pnpm test tests/unit/governance-immutability.test.ts
  ```
- **Git Commit Boundary:**
  `feat(decide): implement award locking democratic quorum voting and decision receipts`
- **Rollback Strategy:** Revert award service bindings.

---

### Stage R2-12: Action 4 — TRACK: Purchase Orders, Milestones & Fulfillment
- **Stage ID:** `R2-12`
- **Architectural Objective:** Deliver the fourth core customer action **TRACK** (`/purchase-orders` and `/purchase-orders/:id`): PO contract view, frozen address/tax snapshots, 5-point milestone inspection checklists, progressive invoicing, site proof photo uploads, non-custodial settlement, and dispute resolution.
- **Prerequisites:** Stage `R2-11` complete; Protected Assets `PA-06` and `PA-07` active.
- **Physical Deliverables:**
  - `apps/web/src/features/fulfillment/pages/PurchaseOrdersPage.tsx`: Canonical orders ledger.
  - `apps/web/src/features/fulfillment/pages/PurchaseOrderDetailPage.tsx`: PO milestone tracker.
  - `apps/web/src/features/fulfillment/components/DeliveryInspectionPanel.tsx`: 5-point inspection checklist.
  - `packages/services/src/services/purchase-order-service.ts`: PO lifecycle orchestration.
  - `packages/services/src/services/milestone-inspection-service.ts`: Inspection checklist service.
- **Database & Security Invariants:**
  - Read delivery address and tax amounts strictly from frozen JSONB snapshots (`delivery_address_snapshot`, `tax_breakdown_snapshot`).
- **Validation Commands:**
  ```powershell
  pnpm test packages/domain/src/types/milestone-inspection.test.ts
  pnpm test packages/domain/src/types/progressive-invoicing.test.ts
  ```
- **Git Commit Boundary:**
  `feat(track): deliver purchase order milestone tracking inspection and progressive invoicing`
- **Rollback Strategy:** Revert PO fulfillment component updates.

---

### Stage R2-13: Canonical Sourcing Taxonomy & Rule-Based NLP Parser
- **Stage ID:** `R2-13`
- **Architectural Objective:** Enforce the 3-level canonical procurement taxonomy (`category` $\rightarrow$ `subcategory` $\rightarrow$ `attributes`) synced from database tables (`taxonomy_categories`, `taxonomy_subcategories`), activate the rule-based NLP prompt extractor, and deploy Superadmin taxonomy management tools.
- **Prerequisites:** Stage `R2-09` complete.
- **Physical Deliverables:**
  - `packages/domain/src/taxonomy/taxonomy-cache.ts`: Taxonomy reference cache.
  - `packages/domain/src/parser/extractors.ts`: Domain regex extractors (quantity, units, dimensions, warranty).
  - `apps/web/src/features/admin/components/AdminTaxonomyManager.tsx`: Superadmin taxonomy editor.
- **Database & Security Invariants:**
  - Enforce zero free-text category divergence on RFQ publish.
- **Validation Commands:**
  ```powershell
  pnpm test packages/domain/src/taxonomy/taxonomy-cache.test.ts
  pnpm test packages/domain/src/parser/extractors.test.ts
  ```
- **Git Commit Boundary:**
  `feat(taxonomy): bind canonical 3-level procurement taxonomy and nlp extractors`
- **Rollback Strategy:** Revert taxonomy cache updates.

---

### Stage R2-14: First-Class Address Architecture & Immutable Snapshots
- **Stage ID:** `R2-14`
- **Architectural Objective:** Standardize address management on normalized `public.buyer_addresses` (Migration 00196), enforce primary address inheritance during intake, generate frozen JSONB snapshots on RFQ publication and PO issuance, and verify that profile address mutations never alter historical contracts.
- **Prerequisites:** Stage `R2-04`, `R2-09`, and `R2-12` complete.
- **Physical Deliverables:**
  - `packages/services/src/services/buyer-address-service.ts`: Address book management service.
  - `packages/domain/src/types/buyer-address.ts`: Address schema and snapshot builders.
  - `apps/web/src/features/profile/components/AddressBookManager.tsx`: Address CRUD component.
- **Database & Security Invariants:**
  - Wire to Migration 00196 RPC `upsert_buyer_address_atomic()`.
- **Validation Commands:**
  ```powershell
  pnpm test packages/domain/src/types/buyer-address.test.ts
  pnpm test apps/web/src/features/profile/address-book-and-persona.test.ts
  ```
- **Git Commit Boundary:**
  `feat(address): enforce normalized address book and immutable transaction snapshots`
- **Rollback Strategy:** Revert address service bindings.

---

### Stage R2-15: Truthful 8-State Notification Engine & Webhooks
- **Stage ID:** `R2-15`
- **Architectural Objective:** Implement the **8-State Truthful Notification Lifecycle** (`CREATED` $\rightarrow$ `DISPATCH_REQUESTED` $\rightarrow$ `ACCEPTED_BY_PROVIDER` $\rightarrow$ `DELIVERED` $\rightarrow$ `OPENED` $\rightarrow$ `CLAIMED` $\rightarrow$ `FAILED` $\rightarrow$ `UNAVAILABLE`). Connect WAHA WhatsApp and SMTP adapters; update delivery states strictly upon cryptographic webhook receipts.
- **Prerequisites:** Stage `R2-08` and `R2-11` complete.
- **Physical Deliverables:**
  - `packages/domain/src/types/procurement-communications.ts`: 8-state notification lifecycle definitions.
  - `packages/services/src/services/omnichannel-notification-service.ts`: Notification dispatcher.
  - `supabase/functions/messaging-inbound/index.ts`: Webhook receipt handler with HMAC verification.
  - `apps/web/src/features/notifications/pages/NotificationsPage.tsx`: Realtime notification center.
- **Database & Security Invariants:**
  - Display "Dispatch Pending" until webhook returns delivery receipt; zero optimistic delivery claims.
- **Validation Commands:**
  ```powershell
  pnpm test packages/services/src/notifications/notification-queue-worker.test.ts
  pnpm test tests/security/messaging-rls.test.ts
  ```
- **Git Commit Boundary:**
  `feat(notifications): enforce 8-state truthful notification lifecycle and webhook verification`
- **Rollback Strategy:** Revert notification service updates.

---

### Stage R2-16: 4-Tier Market Price & Quality Intelligence Engine
- **Stage ID:** `R2-16`
- **Architectural Objective:** Implement the **4-Tier Provenance Ladder** for market intelligence (`LIVE_API` $\rightarrow$ `DATABASE_CACHE` $\rightarrow$ `STATIC_REFERENCE` $\rightarrow$ `UNAVAILABLE`). Attach explicit provenance badges and freshness timestamps to CPWD/BIS benchmark cards; ensure static data is never labeled "Live".
- **Prerequisites:** Stage `R2-09` and `R2-10` complete.
- **Physical Deliverables:**
  - `packages/domain/src/types/market-intelligence.ts`: Provenance ladder models and freshness calculators.
  - `packages/services/src/services/market-intelligence-service.ts`: Tiered benchmark provider.
  - `apps/web/src/features/procurement-os/pages/MarketIntelligenceStepPage.tsx`: Intelligence cockpit.
- **Database & Security Invariants:**
  - Read benchmark data from `public.market_intelligence_cache` or static baselines with hash verification.
- **Validation Commands:**
  ```powershell
  pnpm test packages/domain/src/types/market-intelligence.test.ts
  pnpm test tests/integration/market-intelligence-intake.test.ts
  ```
- **Git Commit Boundary:**
  `feat(intelligence): deploy 4-tier market intelligence provenance engine and freshness badges`
- **Rollback Strategy:** Revert market intelligence service changes.

---

### Stage R2-17: GAAP Double-Entry Financial & Settlement Controls
- **Stage ID:** `R2-17`
- **Architectural Objective:** Implement triple financial segregation (Procurement GMV vs OTP 0.50% Platform Fee vs 0.10% Buyer Reward), bilateral GST place-of-supply tax calculations (CGST/SGST vs IGST), statutory TDS withholdings (194C / 194Q), GAAP double-entry ledger postings (`financial_ledger_entries`), and Tally ERP XML export.
- **Prerequisites:** Stage `R2-12` complete; Protected Assets `PA-06` and `PA-07` active.
- **Physical Deliverables:**
  - `packages/domain/src/tax/place-of-supply.ts`: Bilateral GST calculation engine.
  - `packages/domain/src/tax/tds-calculator.ts`: TDS withholding engine.
  - `packages/services/src/services/accounting-service.ts`: Double-entry ledger poster.
  - `apps/web/src/features/fulfillment/pages/FinancialControlDashboardPage.tsx`: Financial cockpit.
- **Database & Security Invariants:**
  - `PA-06` & `PA-07`: Balanced double-entry journal postings ($\sum \text{Debits} = \sum \text{Credits}$).
- **Validation Commands:**
  ```powershell
  pnpm test packages/domain/src/accounting/double-entry-ledger.test.ts
  pnpm test packages/domain/src/tax/tax-engine.test.ts
  pnpm test packages/domain/src/tax/tds-calculator.test.ts
  ```
- **Git Commit Boundary:**
  `feat(finance): deploy double-entry financial ledger bilateral gst and tds tax engines`
- **Rollback Strategy:** Revert financial ledger integration calls.

---

### Stage R2-18: Superadmin Operational Console (`/admin`)
- **Stage ID:** `R2-18`
- **Architectural Objective:** Reconstruct the dedicated Superadmin Operations Console (`/admin`), strictly gated behind `private_security.admin_whitelist`, providing supplier KYC verification, taxonomy management, diagnostic test suite runner, and data troubleshooter, with zero signing authority on customer transactions.
- **Prerequisites:** Stage `R2-03`, `R2-08`, and `R2-13` complete; Protected Asset `PA-08` active.
- **Physical Deliverables:**
  - `apps/web/src/features/admin/pages/AdminDashboardPage.tsx`: Authoritative Superadmin console.
  - `apps/web/src/features/admin/components/AdminUsersActivityPanel.tsx`: Activity monitor.
  - `apps/web/src/features/admin/components/AdminBuyerTroubleshooter.tsx`: Diagnostic panel.
- **Database & Security Invariants:**
  - `PA-08`: Database trigger `trg_protect_platform_admin` and whitelist check.
- **Validation Commands:**
  ```powershell
  pnpm test apps/web/src/features/admin/admin.test.ts
  ```
- **Git Commit Boundary:**
  `feat(admin): deploy secure superadmin operations console with whitelist gating`
- **Rollback Strategy:** Revert admin console component changes.

---

### Stage R2-19: CEO / Founder Oversight Cockpit (`/founder`)
- **Stage ID:** `R2-19`
- **Architectural Objective:** Reconstruct the CEO / Founder Executive Cockpit (`/founder`), providing read-only executive observability across platform GMV, user adoption, procurement funnel velocity, and system health, completely decoupled from customer transactional authority.
- **Prerequisites:** Stage `R2-03` and `R2-17` complete.
- **Physical Deliverables:**
  - `apps/web/src/features/founder/pages/FounderDashboardPage.tsx`: Authoritative Founder cockpit.
  - `apps/web/src/features/founder/components/FounderMetricCard.tsx`: Executive metric widgets.
  - `apps/web/src/features/founder/components/FunnelVelocityChart.tsx`: Funnel velocity analytics.
- **Database & Security Invariants:**
  - Read-only database views; zero transactional signing RPC access.
- **Validation Commands:**
  ```powershell
  pnpm --filter @otp/web test apps/web/src/features/founder
  ```
- **Git Commit Boundary:**
  `feat(founder): deploy ceo founder executive telemetry and observability cockpit`
- **Rollback Strategy:** Revert founder cockpit component changes.

---

### Stage R2-20: 3-Domain Telemetry Model & Partitioned Sinks
- **Stage ID:** `R2-20`
- **Architectural Objective:** Implement the **3-Domain Telemetry Model**, partitioning events into UX Telemetry (client interaction, zero PII), Business Telemetry (GMV, conversion funnels), and Security/Audit Telemetry (append-only PostgreSQL ledger).
- **Prerequisites:** Stage `R2-03`, `R2-18`, and `R2-19` complete.
- **Physical Deliverables:**
  - `packages/services/src/telemetry/telemetry-dispatcher.ts`: Partitioned telemetry router.
  - `apps/web/src/features/lifecycle/__tests__/ux-telemetry-abstraction.test.ts`: Telemetry tests.
- **Database & Security Invariants:**
  - Security audit events routed to `public.org_governance_action_audits` (append-only).
- **Validation Commands:**
  ```powershell
  pnpm test apps/web/src/features/lifecycle/__tests__/ux-telemetry-abstraction.test.ts
  ```
- **Git Commit Boundary:**
  `feat(telemetry): partition 3-domain telemetry model and enforce zero pii logging`
- **Rollback Strategy:** Revert telemetry dispatcher updates.

---

### Stage R2-21: Enterprise, Demo & Test Data Isolation Cleanup
- **Stage ID:** `R2-21`
- **Architectural Objective:** Execute the final cleanup: purge Card 3 (Enterprise ₹4,999) from `PricingPage.tsx`, remove Enterprise option from `BuyerRegisterForm.tsx`, unmount `<DemoModeProvider>` and `<PilotProvider>` from root `App.tsx`, isolate demo walkthroughs under `/demo`, delete dead page files (`DashboardPage.tsx`, `SupplierDashboardPage.tsx`, `RfqIdentityProtectedComparisonPage.tsx`), and verify test isolation.
- **Prerequisites:** Stages `R2-02` through `R2-20` complete.
- **Physical Deliverables:**
  - `apps/web/src/features/site/pages/PricingPage.tsx`: Render canonical 3 plans (Individual, RWA, MSME).
  - `apps/web/src/features/portal/components/BuyerRegisterForm.tsx`: Clean buyer registration form.
  - `apps/web/src/features/demo/pages/DemoDashboardPage.tsx`: Isolated sandbox container.
  - Permanent deletion of orphaned legacy files.
- **Database & Security Invariants:**
  - Ensure zero demo/test records pollute live customer GMV analytics.
- **Validation Commands:**
  ```powershell
  pnpm test tests/security/pricing-entitlement-redteam.test.ts
  pnpm test tests/demo/demo-scenario.test.ts
  ```
- **Git Commit Boundary:**
  `refactor(cleanup): purge enterprise ui isolate demo providers and remove dead pages`
- **Rollback Strategy:** Restore deleted files from git history if regression occurs.

---

### Stage R2-22: Full Regression, Red-Team Audit & 3-Tier Certification
- **Stage ID:** `R2-22`
- **Architectural Objective:** Execute the complete multi-tier test battery (>1,514 automated assertions), run the 22 Formal Failure Paths regression suite (`failure-paths-regression.test.ts`), verify mobile visual rendering ($360\text{px}-414\text{px}$), pass the staging deployment gate (`scripts/verify-staging-gate.ts`), and issue the 3-tier authoritative certification.
- **Prerequisites:** All Stages `R2-01` through `R2-21` complete.
- **Physical Deliverables:**
  - Master test execution log (`test-results.json`).
  - Staging gate certification output.
  - Signed R2 Golden Reconstruction Certification Statement.
- **Database & Security Invariants:**
  - 100% green test assertions across all 12 test tiers.
  - Protected Assets `PA-01` through `PA-10` verified intact.
- **Validation Commands:**
  ```powershell
  pnpm test
  npx tsx scripts/run-master-regression.ts
  npx tsx scripts/verify-staging-gate.ts
  ```
- **Git Commit Boundary:**
  `chore(release): certify otp golden reconstruction v1 complete and ready for deployment`
- **Rollback Strategy:** Halt release pipeline; inspect failed assertion logs.

---

## 3. Master 22-Stage Execution Roadmap Summary

| Stage ID | Stage Title | Core Focus Area | Protected Assets Touched | Primary Validation Suite |
| :---: | :--- | :--- | :---: | :--- |
| **R2-01** | Repo & Arch Baseline Prep | Monorepo & Migration Lock | PA-01 to PA-10 | `pnpm -r run build && pnpm test` |
| **R2-02** | Global AppShell & Routes | Mobile Shell & 18 Routes | — | `web-routes.test.ts` |
| **R2-03** | 13-Stage Auth Engine | Persona & Multi-Context | — | `role-access.test.ts`, `cross-organization.test.ts` |
| **R2-04** | Individual Buyer Flow | Self-Contained Procurement | — | `buyer-identity-address-and-supplier-onboarding.test.ts` |
| **R2-05** | RWA Governance Engine | 7 Roles, Succession, Quorum | PA-01, PA-03 | `org-role-lifecycle-service.test.ts`, `failure-paths.test.ts` |
| **R2-06** | MSME Spend Delegation | Spend Caps & Anti-Self-Approval | PA-09 | `c84-spend-approval-orchestration-and-delegation.test.ts` |
| **R2-07** | Supplier Network Engine | Discovery, Matching, Dedup | — | `supplier-network-engine.test.ts`, `redteam.test.ts` |
| **R2-08** | Supplier 2-Stage Lifecycle | Zero-Login Quote & KYC Gate | PA-02, PA-04, PA-05 | `blind-rfq-engine.test.ts`, `supplier-award-onboarding.test.ts` |
| **R2-09** | Action 1 — TELL | Multimodal Intake (<60s) | — | `fast-track-intake.test.ts`, `rule-based-parser.test.ts` |
| **R2-10** | Action 2 — REVIEW | Masked Quotes & 4 Pillars | PA-04, PA-05 | `quote-comparison-mobile.test.ts`, `smart-scoring.test.ts` |
| **R2-11** | Action 3 — DECIDE | Quorum Voting & Award Lock | PA-01, PA-02, PA-03 | `award-closeout.test.ts`, `governance-immutability.test.ts` |
| **R2-12** | Action 4 — TRACK | Orders, Milestones, Invoices | PA-06, PA-07 | `milestone-inspection.test.ts`, `progressive-invoicing.test.ts` |
| **R2-13** | Taxonomy & NLP Parser | 3-Level Hierarchy & NLP | — | `taxonomy-cache.test.ts`, `extractors.test.ts` |
| **R2-14** | Address Architecture | Normalized Book & Snapshots | — | `buyer-address.test.ts`, `address-book-and-persona.test.ts` |
| **R2-15** | Truthful Notifications | 8-State Engine & Webhooks | — | `notification-queue-worker.test.ts`, `messaging-rls.test.ts` |
| **R2-16** | Market Intelligence | 4-Tier Provenance Ladder | — | `market-intelligence.test.ts`, `market-intelligence-intake.test.ts` |
| **R2-17** | Financial Controls | Double-Entry, GST, TDS | PA-06, PA-07 | `double-entry-ledger.test.ts`, `tax-engine.test.ts`, `tds.test.ts` |
| **R2-18** | Superadmin Console | Operations, KYC & Whitelist | PA-08 | `admin.test.ts` |
| **R2-19** | CEO / Founder Cockpit | Executive Telemetry | — | `founder-metrics.test.ts` |
| **R2-20** | 3-Domain Telemetry | UX, Business & Security Sinks | PA-03 | `ux-telemetry-abstraction.test.ts` |
| **R2-21** | Enterprise/Demo Cleanup | Clean Pricing, Delete Dead Pages | — | `pricing-entitlement-redteam.test.ts`, `demo-scenario.test.ts` |
| **R2-22** | Full Regression & Cert | 1,514+ Tests & Staging Gate | PA-01 to PA-10 | `run-master-regression.ts`, `verify-staging-gate.ts` |

---
*End of OTP Implementation Sequence & Execution Plan (R2)*
