# OTP Enterprise Dependency Classification (F3)
**Document Identifier:** `OTP-RECON-F3-ENTERPRISE-AUDIT`  
**Version:** 1.0 (Golden Baseline)  
**Status:** AUTHORITATIVE FORENSIC AUDIT  
**Core Product Invariant:** *Enterprise Buyer Persona is EXPLICITLY OUT OF SCOPE (Constitution v1.0, Section 2 & 40).*  
**Permitted Buyer Personas:** `INDIVIDUAL`, `RWA`, `MSME` only.

---

## 1. Executive Summary & Forensic Findings

During Phase 6.6 and Phase C8 development, several "Enterprise" features were introduced into the codebase, including an `ENTERPRISE` subscription plan (₹4,999/mo), an `EnterpriseApprovalMatrixService`, 3-tier corporate approval routing, enterprise theme descriptors, and enterprise registration options.

Under **OTP Product Constitution v1.0**, Enterprise is explicitly excluded from customer scope. However, our forensic audit reveals that **much of the underlying backend code in these modules is actually high-value shared infrastructure** (multi-tier threshold governance, time/spend delegation proxies, anti-self-approval rules) that is directly required for **MSME spend delegation** and **RWA multi-officer signing**.

Therefore, blind deletion of "Enterprise" files would catastrophically break MSME spend delegation. Instead, each artifact is systematically classified using the canonical 7-tier taxonomy:
- **`KEEP`**: Essential infrastructure that has no harmful Enterprise user-facing leakage.
- **`REUSE`**: Generic capabilities to be reused directly by MSME/RWA.
- **`REFACTOR`**: High-value logic or components that must be renamed / restructured (e.g., `EnterpriseApprovalMatrixService` $\rightarrow$ `SpendApprovalGovernanceService`).
- **`RETIRE`**: Deprecated mechanisms superseded by later migrations.
- **`REMOVE`**: Pure Enterprise customer-facing code, marketing copy, or registration options that violate Constitution v1.0.
- **`SHARED INFRASTRUCTURE`**: Core database tables, triggers, and RPCs that power all institutional workflows.
- **`REQUIRES DECISION`**: Items needing formal product owner sign-off.

---

## 2. Master Enterprise Dependency Classification Table

### 2.1 UI Components & Frontend Routes (`apps/web/src`)

| Physical File Path | Enterprise Reference / Mechanism | Current Impact | Classification | Forensic Rationale & Target Action |
| :--- | :--- | :--- | :--- | :--- |
| `apps/web/src/features/site/pages/PricingPage.tsx` | Line 61, 192–247: "Card 3: Enterprise & Multi-Branch Institutions", "Enterprise SSO, SAML & dedicated account manager", "Contact Enterprise Sales" | Visible on public pricing page | **`REMOVE`** | Remove Card 3 completely. Streamline pricing page into 2 clear institutional cards: **Individual Buyer (Free / Pay-per-use)** and **RWA & MSME Institutional Plan (₹499/mo or ₹999/mo)**. |
| `apps/web/src/features/portal/components/BuyerRegisterForm.tsx` | Line 31, 176: `{ value: 'ENTERPRISE', label: 'Enterprise with a Procurement Committee' }` | Appears in signup dropdown | **`REMOVE`** | Remove `ENTERPRISE` option from organization type dropdown. Restrict selector to: `INDIVIDUAL`, `RWA / Housing Society`, `MSME / Business Enterprise`. |
| `apps/web/src/features/subscription/components/SubscriptionPaymentModal.tsx` | Line 32: `{ id: 'ENTERPRISE', label: 'Enterprise (₹4,999)', priceMonthly: 4999 }` | Allows purchasing enterprise tier | **`REFACTOR`** | Replace `ENTERPRISE` tier with `MSME_GROWTH` / `RWA_PREMIUM` aligned with Constitution subscription model. |
| `apps/web/src/features/auth/components/SignInForm.tsx` | Line 33: `{ name: 'S. Rangarajan', email: 'procurement@srilakshmi.test', role: 'Enterprise Lead', badge: 'Enterprise' }` | Quick demo login pill | **`REFACTOR`** | Change badge and role to **"MSME Primary / Business Owner"** or **"RWA Committee Lead"**. |
| `apps/web/src/features/theme/ThemeToggle.tsx` & `ThemeBottomSheet.tsx` | Line 55 / 46: `description: 'Enterprise Corporate Standard'` | Theme preset description | **`REFACTOR`** | Rename theme descriptor to **"Institutional Classic Standard"** or **"High Contrast Professional"**. |
| `apps/web/src/features/intake/components/Tier3SourcingControlsCard.tsx` | Line 278: `"As an RWA / Enterprise buyer, sealed quotes will be aggregated..."` | Sourcing help text | **`REFACTOR`** | Update text to `"As an RWA / MSME institutional buyer, sealed quotes will be aggregated..."`. |
| `apps/web/src/features/profile/pages/ProfilePage.tsx` | Line 1206: `"Quorum of 2+ votes required for Community, Institution, and Enterprise organizations."` | Quorum explanation | **`REFACTOR`** | Change text to `"Quorum of 2+ votes required for RWA Housing Societies and MSME Governance Committees."`. |
| `apps/web/src/features/admin/types/admin-navigation.ts` | Line 265: `"Tenant organizations, verified suppliers, GSTINs & enterprise registries"` | Superadmin tab tooltip | **`KEEP`** | Internal admin copy referencing GST corporate entity verification; harmless and technically accurate. |

---

### 2.2 Domain Logic & Services (`packages/domain` & `packages/services`)

| Physical File Path | Component / Class / Symbol | Current Functionality | Classification | Forensic Rationale & Target Action |
| :--- | :--- | :--- | :--- | :--- |
| `packages/services/src/services/enterprise-approval-matrix-service.ts` | `class EnterpriseApprovalMatrixService` | Multi-tier threshold routing (<₹5L, ₹5L–₹25L, >₹25L), delegation proxy execution, anti-self-approval enforcement | **`REFACTOR`** | **CRITICAL SHARED ENGINE:** Do not delete! Rename class to `SpendApprovalGovernanceService` or `ThresholdApprovalService`. Its dynamic stage initialization and delegation verification logic are required for MSME spend caps and RWA financial limits. |
| `packages/domain/src/types/approval-matrix.ts` | `ApprovalPolicy`, `ApprovalTierConfig`, `ApprovalStage` | Tier threshold definitions and monetary approval boundaries | **`REUSE`** | Retain data structures; use for MSME spend delegation policies and RWA high-value capex approvals. |
| `packages/domain/src/types/threshold-routing.ts` | `evaluateDynamicApprovalRoute()`, `ThresholdRoutingConfig` | Computes required signatory tiers based on RFQ total cost and org policy | **`REUSE`** | Retain as core governance utility for RWA capex thresholds and MSME delegation routing. |
| `packages/domain/src/types/pricing-entitlement.ts` | `SUBSCRIPTION_TIERS.ENTERPRISE`, `PRICING_PLANS` | Defines ₹4,999/mo and ₹49,999/yr Enterprise subscription rates | **`REFACTOR`** | Update domain constants to reflect canonical 3-tier model: `INDIVIDUAL` (₹0), `RWA_SOCIETY` (₹499/mo), `MSME_BUSINESS` (₹999/mo). |
| `packages/domain/src/types/buyer-persona.ts` | `BUYER_PERSONAS.MSME` (references "MSME Business Enterprise") | Formal MSME persona definition | **`KEEP`** | "MSME" stands for Micro, Small & Medium Enterprise under Indian Ministry of MSME; this is canonical and compliant. |
| `packages/domain/src/tax/tds-calculator.ts` & `gstin-lookup.ts` | PAN Entity resolution (`PAN_ENTITY_TYPES['C'] = 'Commercial Enterprise'`) | Resolves Indian statutory entity types from PAN 4th character | **`KEEP`** | Statutory Income Tax / GST lookup standard; strictly required for TDS Section 194C/194Q. |
| `packages/services/src/factory/create-otp-services.ts` | `services.enterpriseApprovalMatrix` | Dependency injection factory wiring | **`REFACTOR`** | Rename service instance property to `services.approvalGovernance` or `services.spendApproval`. |

---

### 2.3 Database Migrations & Schemas (`supabase/migrations`)

| Migration File | Database Object / Column / RPC | Functionality | Classification | Forensic Rationale & Target Action |
| :--- | :--- | :--- | :--- | :--- |
| `00039_role_based_access.sql` | `public.org_member_role` ENUM (`'OWNER'`, `'ADMIN'`, `'MANAGER'`, `'MEMBER'`, `'COMMITTEE_MEMBER'`, `'STAFF'`) | Core organization membership roles | **`SHARED INFRASTRUCTURE`** | Keep untouched; foundational for all multi-tenant RLS policies. |
| `00144_prepaid_subscription_model.sql` | `public.pricing_plans` & `subscriptions` tables | Prepaid subscription tracking and plan codes | **`SHARED INFRASTRUCTURE`** | Keep table structure; data rows for plans will be updated via migration/seed to Individual, RWA, and MSME plans. |
| `00183_phase6_group6_vendor_intelligence_governance_contracts.sql` | `public.rfq_approval_stages`, `public.rfq_approval_tier_events`, `submit_rfq_tier_approval_atomic()` | Multi-tier approval stages and database execution gate | **`SHARED INFRASTRUCTURE`** | **PROTECTED BACKEND ASSET:** Implements atomic stage sign-offs. Reused for MSME delegation and RWA Treasurer/President joint signing. |
| `00190_buyer_org_governance_and_delegation.sql` | `public.organization_delegations`, `create_delegation_proxy_atomic()`, `accept_organization_invitation_atomic()` | Tokenized invitations and spend delegation proxies | **`SHARED INFRASTRUCTURE`** | **PROTECTED BACKEND ASSET:** Direct implementation of MSME delegation and RWA member invitations. |
| `00191_dynamic_approval_routing_and_market_intelligence.sql` | `public.organization_approval_policies`, `evaluate_rfq_approval_route()` | Dynamic monetary threshold evaluation | **`SHARED INFRASTRUCTURE`** | Reusable backend policy engine for MSME and RWA. |
| `00192_approval_execution_orchestration_and_award_gate.sql` | `public.validate_rfq_award_governance_gate()` | Database trigger ensuring all required approval stages are signed before award | **`SHARED INFRASTRUCTURE`** | **PROTECTED BACKEND ASSET:** Prevents unauthorized award lock across all buyer organizations. |

---

### 2.4 Test Suites & Test Fixtures (`tests/` & `packages/**/__tests__`)

| Test File Path | Enterprise Reference | Purpose in Test | Classification | Target Action |
| :--- | :--- | :--- | :--- | :--- |
| `packages/services/src/services/c84-spend-approval-orchestration-and-delegation.test.ts` | References `EnterpriseApprovalMatrixService`, 3 approval tiers, CFO/VP actors | Tests multi-tier spend delegation, spend caps, anti-self-approval, and cross-tenant isolation | **`REFACTOR`** | Rename test and assertions to focus on **MSME Spend Delegation & Multi-Signatory Governance**; preserve all 14 rigorous failure-path assertions. |
| `packages/domain/src/types/approval-matrix.test.ts` | Tests threshold routing (<₹5L Tier 1, ₹5L–₹25L Tier 2, >₹25L Tier 3) | Validates boundary value calculations and tier matching | **`REFACTOR`** | Retain test logic; update test suite title to "Threshold Governance & Approval Matrix". |
| `packages/domain/src/types/pricing-entitlement.test.ts` & `apps/web/src/features/subscription/subscription.test.ts` | Asserts ₹4,999/mo Enterprise tier price calculations | Validates subscription tax and duration math | **`REFACTOR`** | Update test fixtures to validate canonical Individual, RWA, and MSME tier pricing. |
| `tests/integration/signup-portal.test.ts` | Line 59: Asserts preservation of registered business name for MSME and corporate categories | Validates signup data sanitization | **`KEEP`** | Asserts correct MSME business entity registration. |
| `apps/web/src/features/site/content/site-content.test.ts` | Asserts marketing copy containing "enterprise" | Verifies marketing text | **`REFACTOR`** | Update regex to assert "MSME and institutional buyers". |

---

## 3. Summary of Enterprise Remediation Actions

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        ENTERPRISE REMEDIATION ROADMAP SUMMARY                          │
└────────────────────────────────────────────────────────────────────────────────────────┘

 1. UI Cleanup:
    ├── Delete "Enterprise Card" from PricingPage.tsx.
    ├── Remove 'ENTERPRISE' option from BuyerRegisterForm.tsx dropdown.
    ├── Update theme descriptions in ThemeToggle.tsx from "Enterprise" to "Institutional".
    └── Update demo user pills in SignInForm.tsx to "MSME Primary".

 2. Backend / Service Refactoring (Preserving Infrastructure):
    ├── Rename `EnterpriseApprovalMatrixService` -> `SpendApprovalGovernanceService`.
    ├── Preserve all underlying database tables (`rfq_approval_stages`, `organization_delegations`).
    ├── Repurpose 3-tier threshold routing for MSME Delegation & RWA Capex thresholds.
    └── Adjust subscription pricing constants in `pricing-entitlement.ts` to canonical tiers.

 3. Zero Functional Loss:
    └── 100% of delegation, quorum, anti-self-approval, and audit capabilities are preserved.
```

---
*End of Enterprise Dependency Classification (F3)*
