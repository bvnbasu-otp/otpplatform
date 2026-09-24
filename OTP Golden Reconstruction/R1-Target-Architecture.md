# OTP Target Architecture Specification (R1)
**Document Identifier:** `OTP-RECON-R1-TARGET-ARCHITECTURE`  
**Version:** 1.0 (Authoritative R1 Release)  
**Status:** SUPREME TARGET ARCHITECTURE BLUEPRINT  
**Working Root:** `G:/My Drive/otp`  
**Ceiling Migration:** `00197` (Universal Org Role Lifecycle, Succession & Audit)  
**Stack Baseline:** React 19 + TypeScript + Vite + Tailwind CSS + Supabase PostgreSQL + Deno Edge Functions  
**Operating Invariant:** *MODE: DOCUMENTATION / ARCHITECTURE DECISION ONLY. ZERO CODE/SCHEMA MUTATION DURING R1.*

---

## 1. Architectural Vision & System Topology

The **Target Architecture** for OTP transitions the platform from a feature-sprawled, prototype-heavy state into a robust, high-performance, mobile-first institutional procurement ecosystem.

The system topology is organized into three clean, strictly decoupled architectural tiers:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               OTP TARGET SYSTEM TOPOLOGY                               │
└────────────────────────────────────────────────────────────────────────────────────────┘

 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │                               1. PRESENTATION TIER                                   │
 │  ┌────────────────────────────────────────────────────────────────────────────────┐  │
 │  │ Responsive Mobile AppShell Container (max-w-md mx-auto / pb-safe)              │  │
 │  ├────────────────────────────────────────────────────────────────────────────────┤  │
 │  │ 18 Canonical Customer Routes (Intake, Evaluation, Committee, Orders, Profile)   │  │
 │  ├────────────────────────────────────────────────────────────────────────────────┤  │
 │  │ Platform Control Planes: Superadmin Console (/admin) & Founder Cockpit (/founder)│
 │  └────────────────────────────────────────────────────────────────────────────────┘  │
 └──────────────────────────────────────────┬───────────────────────────────────────────┘
                                            │ Typed DTOs / REST / WebSockets
 ┌──────────────────────────────────────────▼───────────────────────────────────────────┐
 │                           2. APPLICATION & DOMAIN TIER                               │
 │  ┌─────────────────────────┬──────────────────────────┬───────────────────────────┐  │
 │  │   @otp/domain           │     @otp/services        │       Memory Guards       │  │
 │  │  • 13-Stage Auth Engine │    • Spend Approval Svc  │  • assertIdentitySafe     │  │
 │  │  • Bilateral GST Engine │    • Org Role Lifecycle  │  • Anti-Self-Approval     │  │
 │  │  • TDS 194C/194Q Engine │    • Sourcing Network    │  • Quorum Evaluator       │  │
 │  │  • Double-Entry Models  │    • Accounting Svc      │  • Delivery State Guard   │  │
 │  └─────────────────────────┴──────────────────────────┴───────────────────────────┘  │
 └──────────────────────────────────────────┬───────────────────────────────────────────┘
                                            │ PostgreSQL Protocol / Service Role Key
 ┌──────────────────────────────────────────▼───────────────────────────────────────────┐
 │                               3. INFRASTRUCTURE TIER                                 │
 │  ┌────────────────────────────────────────────────────────────────────────────────┐  │
 │  │ Supabase PostgreSQL (197 Contiguous Migrations Ceiling)                         │  │
 │  │  • Security DEFINER RPCs (lock_and_reveal_award_atomic, submit_committee_vote)   │  │
 │  │  • Row-Level Security (RLS) Isolation & Tenant Boundaries                      │  │
 │  │  • Identity-Protected PostgreSQL Masked Views (rfq_quotes_identity_protected)   │  │
 │  │  • Append-Only Audit Ledgers (org_governance_action_audits)                    │  │
 │  ├────────────────────────────────────────────────────────────────────────────────┤  │
 │  │ Supabase Storage Buckets (rfq-attachments, delivery-proofs, decision-receipts) │  │
 │  ├────────────────────────────────────────────────────────────────────────────────┤  │
 │  │ Deno Edge Functions (messaging-inbound, payment-webhook, process-attachment)   │  │
 │  ├────────────────────────────────────────────────────────────────────────────────┤  │
 │  │ External Integration Layer: WAHA WhatsApp Gateway + Razorpay Payment Webhooks  │  │
 │  └────────────────────────────────────────────────────────────────────────────────┘  │
 └──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Presentation Tier Architecture

### 2.1 The Mobile-First AppShell Container
The presentation layer is engineered around a unified, responsive AppShell (`AppLayout.tsx` & `MobileActionFooter.tsx`):
- **Viewport Constraints:** Fixed `max-w-md mx-auto` container for smartphones ($360\text{px} - 414\text{px}$), expanding gracefully for tablet and desktop viewports.
- **Safe-Area Inset Handling:** Container enforces bottom padding to accommodate floating action footers and mobile browser UI:
  $$\text{padding-bottom} = \text{calc}(6.5\text{rem} + \text{env}(\text{safe-area-inset-bottom}, 0\text{px}))$$
- **Touch-First Accessibility:** All interactive elements maintain a minimum $44\text{px} \times 44\text{px}$ touch target; zero horizontal scrollbars across all tables and cards.
- **Unified Header Menu:** Single authoritative navigation component (`WorkspaceHeaderMenu.tsx`) supporting dual-persona switching (`BUYER` $\leftrightarrow$ `SUPPLIER`) and server-verified platform role access.

### 2.2 The 18 Canonical Customer Routes (Strict 1:1:1 Rule)
The customer-facing router in `apps/web/src/App.tsx` is streamlined into exactly **18 Canonical Routes**:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        THE 18 CANONICAL CUSTOMER ROUTES                                │
├─────┬──────────────────────────────────────────┬───────────────────────────────────────┤
│  #  │ Canonical URL Path                       │ Primary Screen Component              │
├─────┼──────────────────────────────────────────┼───────────────────────────────────────┤
│  1  │ /                                        │ LandingPage                           │
│  2  │ /pricing                                 │ PricingPage (Individual, RWA, MSME)   │
│  3  │ /faqs                                    │ FaqPage                               │
│  4  │ /about-us                                │ AboutPage                             │
│  5  │ /login                                   │ LoginPage                             │
│  6  │ /signup                                  │ SignupPage (?side=buyer|supplier)     │
│  7  │ /q/:token                                │ QuickQuotePage (Magic Link Quoting)   │
│  8  │ /invite/:token                           │ InviteAcceptancePage                  │
│  9  │ /dashboard                               │ HomePage (Unified Role-Aware Cockpit) │
│ 10  │ /intake                                  │ RequirementIntakePage (Multimodal)    │
│ 11  │ /requirements/:id/discover               │ DiscoverSuppliersPage                 │
│ 12  │ /requirements/:id/review-publish         │ RfqReviewPublishPage                  │
│ 13  │ /rfq/:id/evaluation                      │ EvaluationDecisionCockpitPage         │
│ 14  │ /rfq/:id/committee                       │ CommitteeVotePage (Quorum Voting)     │
│ 15  │ /purchase-orders                         │ PurchaseOrdersPage (Orders Ledger)    │
│ 16  │ /purchase-orders/:id                     │ PurchaseOrderDetailPage (Milestones)  │
│ 17  │ /org/members                             │ OrgMembersPage (Team & Succession)    │
│ 18  │ /profile                                 │ ProfilePage (Addresses & Settings)    │
├─────┴──────────────────────────────────────────┴───────────────────────────────────────┤
│ [AUTHENTICATED SUPPLIER WORKSPACE]                                                     │
│  •  /supplier/quotes                           │ SupplierQuotesPage                    │
│  •  /supplier/rfq/:id                          │ SupplierRfqPage                       │
│  •  /supplier/rfq/:id/quote                    │ SupplierQuoteSubmitPage               │
│  •  /supplier/award-onboarding/:token          │ SupplierAwardOnboardingPage           │
│  •  /supplier/purchase-orders                  │ PurchaseOrdersPage (role=supplier)    │
│  •  /supplier/purchase-orders/:id              │ PurchaseOrderDetailPage (role=supplier│
│  •  /supplier/capabilities                     │ SupplierCapabilitiesPage              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [PLATFORM CONTROL PLANES - SERVER GATED]                                               │
│  •  /admin                                     │ AdminDashboardPage (Superadmin Ops)   │
│  •  /founder                                   │ FounderDashboardPage (Executive Cock) │
│  •  /demo                                      │ DemoDashboardPage (Sandbox Only)      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

All 50+ legacy, duplicate, and alias route declarations (e.g. `/rfq/:id/cockpit`, `/rfq/:id/decision`, `/requirements/new`) redirect immediately via `<Navigate to="..." replace />`.

---

## 3. Application & Domain Tier Architecture

### 3.1 `@otp/domain` (Core Business Rules & Models)
The domain layer contains pure, framework-agnostic business logic, validation algorithms, and tax engines:
1. **13-Stage Authorization Engine:** Evaluates user context tuples against transaction policies.
2. **Bilateral GST Place-of-Supply Engine:** Computes statutory CGST/SGST vs IGST based on Supplier GSTIN State vs Delivery Pincode State.
3. **TDS Withholding Calculator:** Computes Section 194C (1% individual, 2% company) and Section 194Q (0.1% $>₹50\text{L}$) withholdings.
4. **GAAP Double-Entry Financial Models:** Defines balanced debits and credits journal entries for procurement GMV, 0.50% platform fee, and 0.10% buyer reward.
5. **Canonical Taxonomy Definitions:** Hierarchical category and subcategory models with rule-based NLP parser.
6. **Domain Memory Leak Guards:** `assertIdentityProtectedPayloadSafe()` inspects JSON payloads and throws hard exceptions if contact patterns leak before award reveal.

### 3.2 `@otp/services` (Business Service Orchestration)
The service layer encapsulates business transactions, coordinating database repositories and external integrations:
1. **`SpendApprovalGovernanceService`:** Refactored from `EnterpriseApprovalMatrixService`; orchestrates MSME spend delegation proxies, spend cap validations, and RWA multi-signatory capex thresholds.
2. **`OrgRoleLifecycleService`:** Manages universal 365-day role assignments, annual succession handovers, and immutable governance action audits via Migration 00197 RPCs.
3. **`SupplierNetworkService`:** Ingests supplier pools across VMI, Direct, ONDC, and BNI sources; executes multi-parameter ranking and deduplication.
4. **`AccountingService`:** Orchestrates double-entry ledger postings and reconciles wallet rewards.
5. **`TruthfulNotificationService`:** Dispatches multichannel notifications and updates delivery states based on verifiable provider webhook receipts.

---

## 4. Infrastructure & Database Tier Architecture

### 4.1 Supabase PostgreSQL Database (Ceiling: Migration 00197)
The database tier enforces security, tenant isolation, and cryptographic data integrity at the lowest level:
- **Migration Invariant:** All 197 migrations (`00001` through `00197`) are contiguous, idempotent, and locked against historical modification.
- **Row-Level Security (RLS):** 100% of public tables enforce strict RLS policies isolating customer organizations, profiles, and supplier quotations.
- **Identity Protection Views:** `public.rfq_quotes_identity_protected` redacts supplier identities from unauthorized consumers.
- **Immutable Audit Ledgers:** `public.org_governance_action_audits` enforces append-only retention via database triggers throwing exceptions on `UPDATE` or `DELETE`.

### 4.2 Hardened PostgreSQL Security DEFINER RPCs
Critical state transitions and financial commitments execute exclusively through atomic, cryptographically hardened PostgreSQL functions:
1. `public.lock_and_reveal_award_atomic()`: Atomically transitions RFQ to `AWARDED`, locks winning quote, freezes delivery specs, and evaluates 2-stage verification gate.
2. `public.submit_committee_vote_atomic()`: Validates voter appointment, records mandatory COI declaration, computes quorum ($\ge 2$), and logs governance audit.
3. `public.appoint_org_role_atomic()`: Assigns effective-dated 365-day roles in `org_role_assignments`.
4. `public.transfer_org_role_succession_atomic()`: Executes annual officer succession without altering historical audit actor references.
5. `public.create_delegation_proxy_atomic()`: Creates MSME spend delegation proxies with spend caps and anti-self-approval enforcement.
6. `public.upsert_buyer_address_atomic()`: Manages normalized buyer addresses and primary flags.

### 4.3 Deno Edge Functions & Integration Layer
- **`messaging-inbound`:** Handles inbound webhook receipts from WAHA WhatsApp gateway; verifies HMAC signatures and updates notification delivery states.
- **`payment-webhook`:** Ingests Razorpay payment notifications with HMAC-SHA256 verification and triggers double-entry ledger postings.
- **`process-attachment`:** Scans and sanitizes uploaded RFQ drawings and delivery inspection photos.

---

## 5. Master Component Architectural Disposition Matrix

Every physical file, component, service, and database object in the repository is assigned an authoritative architectural disposition:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        MASTER COMPONENT DISPOSITION MATRIX                             │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

| Component / Physical File Path | Current Role / Responsibility | Architectural Disposition | Reconstruction Action & Rationale |
| :--- | :--- | :--- | :--- |
| `apps/web/src/App.tsx` | Root application router and layout wrapper | **`RECONSTRUCT`** | Purge `<DemoModeProvider>` and `<PilotProvider>` from root; consolidate router to the 18 Canonical Routes with 301 redirects. |
| `apps/web/src/components/layout/AppLayout.tsx` | Main application shell container | **`RECONSTRUCT`** | Implement `max-w-md mx-auto` mobile containment and safe-area bottom padding (`pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]`). |
| `apps/web/src/components/layout/WorkspaceHeaderMenu.tsx` | Header navigation and persona menu | **`REFACTOR`** | Single authoritative header supporting dual-persona toggle and server-verified gated `/admin` and `/founder` access. |
| `apps/web/src/components/layout/MobileActionFooter.tsx` | Floating mobile CTA action footer | **`REBUILD`** | New unified mobile footer with built-in safe-area insets, sticky containment, and zero content obscuration. |
| `apps/web/src/features/intake/components/UnifiedThreeTierIntake.tsx` | Multimodal requirement intake form | **`REFACTOR`** | Auto-inherit primary address from `public.buyer_addresses`; bind categories directly to database taxonomy API. |
| `apps/web/src/features/evaluation/components/EvaluationDecisionCockpit.tsx` | Identity-protected quote decision room | **`REFACTOR`** | Purge `getPilotByRfqId()` fallback and "Simulate Quotes" button; derive metadata strictly from database `rfqs` table. |
| `apps/web/src/features/site/pages/PricingPage.tsx` | Public marketing pricing page | **`REFACTOR`** | Remove Card 3 (Enterprise ₹4,999); present canonical Individual (₹0) and RWA/MSME (₹499/mo / ₹999/mo) plans. |
| `apps/web/src/features/portal/components/BuyerRegisterForm.tsx` | Buyer registration modal form | **`REFACTOR`** | Remove `ENTERPRISE` option from organization type dropdown; restrict to `INDIVIDUAL`, `RWA`, `MSME`. |
| `apps/web/src/features/governance/pages/CommitteeVotePage.tsx` | RWA democratic voting room | **`REFACTOR`** | Wire directly to `submit_committee_vote_atomic()` with mandatory COI declaration and live quorum progress indicator. |
| `apps/web/src/features/org/pages/OrgMembersPage.tsx` | Organization member and team management | **`REFACTOR`** | Connect to Migration 00197 role succession RPCs and Migration 00190 spend delegation proxies. |
| `apps/web/src/pages/DashboardPage.tsx` | Orphaned legacy dashboard page | **`REMOVE`** | Delete file; superseded by canonical `HomePage.tsx` (`/dashboard`). |
| `apps/web/src/pages/SupplierDashboardPage.tsx` | Orphaned legacy supplier dashboard | **`REMOVE`** | Delete file; superseded by canonical role-aware `HomePage.tsx`. |
| `apps/web/src/features/rfq/pages/RfqIdentityProtectedComparisonPage.tsx` | Duplicate legacy comparison page | **`REMOVE`** | Delete file; superseded by canonical `EvaluationDecisionCockpitPage.tsx`. |
| `apps/web/src/features/demo/` (All Demo Providers & Panels) | Synthetic walkthroughs & demo tooling | **`REFACTOR`** | Isolate strictly under `/demo` route tree (`DemoDashboardPage.tsx`); zero presence in root layout. |
| `packages/services/src/services/enterprise-approval-matrix-service.ts` | Multi-tier threshold & delegation service | **`REFACTOR`** | Rename to `SpendApprovalGovernanceService`; repurpose dynamic stage evaluation for MSME spend caps and RWA thresholds. |
| `packages/services/src/services/org-role-lifecycle-service.ts` | Universal role lifecycle service | **`KEEP`** | Preserves Migration 00197 365-day term expiry, annual succession, and immutable governance audit logging. |
| `packages/services/src/services/accounting-service.ts` | Double-entry financial accounting service | **`KEEP`** | Preserves balanced debits/credits journal entries and ERP/Tally XML export formatting. |
| `packages/domain/src/tax/place-of-supply.ts` | Bilateral GST tax calculation engine | **`KEEP`** | Preserves statutory CGST/SGST vs IGST place-of-supply tax calculations. |
| `packages/domain/src/tax/tds-calculator.ts` | Statutory TDS withholding calculator | **`KEEP`** | Preserves Income Tax Section 194C / 194Q withholding compliance. |
| `packages/domain/src/errors/blind-violation.ts` (`assertIdentityProtectedPayloadSafe`) | In-memory domain leak detection guard | **`KEEP`** | Preserves runtime payload inspection to prevent accidental contact leaks. |
| `supabase/migrations/00001` through `00197` | 197 Contiguous PostgreSQL Migrations | **`PRESERVE AS INFRASTRUCTURE`** | **LOCKED CEILING:** Complete relational schema, RLS policies, views, triggers, and RPCs preserved intact. |
| `supabase/functions/messaging-inbound/` | Inbound WhatsApp webhook handler | **`REFACTOR`** | Update to process stateful WAHA delivery webhooks; reply to inbound chats with `/q/:token` magic link. |
| `scripts/backup-prod-db.ps1` | PBKDF2/AES-256 encrypted database backup | **`KEEP`** | Critical disaster recovery automated backup pipeline. |

---

## 6. Architecture Evolution & Verification Lifecycle

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        ARCHITECTURAL TRANSFORMATION LIFECYCLE                          │
└────────────────────────────────────────────────────────────────────────────────────────┘

 [PHASE 1: BOUNDARY ENFORCEMENT & ROUTE CONSOLIDATION]
  ├── Purge demo providers from root App.tsx -> Isolate to /demo
  ├── Consolidate 68 routes down to 18 Canonical Routes with 301 redirects
  └── Purge Enterprise tier from PricingPage.tsx and BuyerRegisterForm.tsx

 [PHASE 2: FRONTEND APP-SHELL & COMPONENT SIMPLIFICATION]
  ├── Unify intake in UnifiedThreeTierIntake with address auto-inheritance
  ├── Clean EvaluationDecisionCockpit of hardcoded pilot fallbacks
  └── Implement MobileActionFooter with safe-area bottom containment (pb-32)

 [PHASE 3: SERVICE REFACTORING & SHARED GOVERNANCE]
  ├── Rename EnterpriseApprovalMatrixService -> SpendApprovalGovernanceService
  ├── Connect MSME spend delegation and RWA succession to Migration 00197 RPCs
  └── Enforce 2-stage supplier award onboarding gate before PO issuance

 [PHASE 4: MASTER VERIFICATION & GOLDEN CERTIFICATION]
  ├── Run 1,514+ automated test battery across domain, database, services, and web
  ├── Validate all 22 failure paths in failure-paths-regression.test.ts
  └── Confirm zero prohibited vocabulary violations via verify-vocabulary.ts
```

---
*End of Target Architecture Specification (R1)*
