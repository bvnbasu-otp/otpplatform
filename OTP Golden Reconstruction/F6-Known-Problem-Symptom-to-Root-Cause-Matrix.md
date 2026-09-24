# OTP Known Problem Symptom-to-Root-Cause Matrix (F6)
**Document Identifier:** `OTP-RECON-F6-ROOTCAUSE-MATRIX`  
**Version:** 1.0 (Golden Baseline)  
**Status:** AUTHORITATIVE FORENSIC AUDIT  
**Methodology:** 5-Level Deep Root Cause Analysis:  
`SYMPTOM` $\rightarrow$ `IMMEDIATE CAUSE` $\rightarrow$ `ARCHITECTURAL CAUSE` $\rightarrow$ `DOMAIN-MODEL CAUSE` $\rightarrow$ `RECOMMENDED RECONSTRUCTION ACTION`

---

## 1. Executive Summary

This forensic audit investigates the **14 known operational, structural, and UX defects** identified across previous releases of the OTP platform. Rather than applying surface-level UI patches, each problem is traced to its deepest domain-model and architectural roots to ensure permanent, regression-proof remediation during reconstruction.

---

## 2. Deep Root-Cause Forensic Investigation of All 14 Problems

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        THE 14 FORENSIC PROBLEM DOMAINS                                 │
└────────────────────────────────────────────────────────────────────────────────────────┘
 1. Address Not Saving
 2. Individual + RWA Committee Membership Conflation
 3. Uncontrolled Committee / Member / Officer Selection
 4. Floating Footer & Mobile AppShell Action Button Obscuration
 5. Route & Screen Sprawl / Duplication
 6. WhatsApp Supplier Invitation & Untruthful WAHA Delivery State
 7. Taxonomy Fragmentation & Category Divergence
 8. Enterprise Buyer Contamination
 9. Demo, Test & Pilot Leakage into Production Views
10. Supplier Identity Protection & Unmasked Payload Leaks
11. Premature Supplier Award / Missing Onboarding Verification Gate
12. Coarse-Grained Authorization & Missing Spend Delegation Controls
13. Historical Role Succession & Audit Actor Overwriting
14. Mobile Viewport Overflow & Horizontal Scroll Violations
```

---

### Problem 1: Address Not Saving & Inconsistent Delivery Locations
- **Symptom:** When a buyer enters or edits a delivery address during requirement intake or in their profile address book, the address fails to persist, defaults to empty strings on subsequent reloads, or causes database RPC errors.
- **Immediate Cause:** Frontend components (`UnifiedThreeTierIntake.tsx` and `AddressBookManager.tsx`) had multiple competing fallback branches. When an Individual buyer had no `organization_id`, SQL queries on `buyer_addresses` evaluated `organization_id = null` incorrectly or failed RLS checks expecting an organization membership.
- **Architectural Cause:** Migration of address data from legacy columns (`profiles.address`, `requirements.delivery_location`, `rfqs.delivery_city`) to the normalized `buyer_addresses` table (Migration 00196) was incomplete; frontend forms were reading from one table and writing to another.
- **Domain-Model Cause:** Lack of first-class distinction between **Personal Address (Individual)**, **Registered Society Address (RWA)**, **Factory / Site Address (MSME)**, and **Frozen Address Snapshots** on RFQs and POs.
- **Recommended Reconstruction Action:**
  1. Standardize on `public.buyer_addresses` as the sole address source of truth.
  2. Implement automatic primary address inheritance in `UnifiedThreeTierIntake.tsx`.
  3. Enforce frozen JSONB snapshots (`delivery_address_snapshot`, `billing_address_snapshot`) on `rfqs` and `purchase_orders` so profile edits never alter historical contracts.

---

### Problem 2: Individual + RWA Committee Membership Conflation
- **Symptom:** An individual buyer creating a personal requirement is unexpectedly prompted to configure committee members, or an RWA committee member finds their personal purchases visible to the entire housing society committee.
- **Immediate Cause:** `requirements.ts` contained auto-provisioning logic (`ensure_buyer_organization()`) that automatically bound every user to an organization, eliminating pure individual accounts.
- **Architectural Cause:** Lack of persona-scoped database queries; backend APIs assumed a 1:1 relationship between User and Organization.
- **Domain-Model Cause:** Violation of Constitution v1.0 Section 3 & 4: "Person $\neq$ Organization". An Individual is self-contained and has zero committee members or quorum. Multi-context independence was not enforced at the query layer.
- **Recommended Reconstruction Action:**
  1. Allow `requirements.organization_id` to be `NULL` for Individual buyers.
  2. In `HomePage.tsx` and `RequirementIntakePage.tsx`, detect active persona: if `INDIVIDUAL`, suppress all committee, delegation, and quorum UI.
  3. Isolate RWA committee governance strictly to requirements where `organization_id` is an RWA organization.

---

### Problem 3: Uncontrolled Committee / Member / Officer Selection
- **Symptom:** Users registering on the platform could select "PRESIDENT", "TREASURER", or "OWNER" from a public dropdown, or existing users could add themselves to an RWA committee without authorization.
- **Immediate Cause:** Client-side role selection forms in `BuyerRegisterForm.tsx` and profile pages that directly mutated `profiles.active_role_code` or `organization_members.role`.
- **Architectural Cause:** Absence of server-side invitation token verification and governance appointment gates in earlier migrations (00039–00040).
- **Domain-Model Cause:** Violation of the **RWA Resident-Owner Principle**: "Resident Owner $\neq$ Automatic Committee Member". A user cannot self-appoint to an RWA committee.
- **Recommended Reconstruction Action:**
  1. Restrict public registration to basic persona declaration (`INDIVIDUAL`, `RWA`, `MSME`).
  2. Require all institutional committee additions to go through tokenized, cryptographically hashed invitations (`public.organization_invitations`, Migration 00190).
  3. Require RWA officer appointments to be executed via `appoint_org_role_atomic()` or `transfer_org_role_succession_atomic()` (Migration 00197).

---

### Problem 4: Floating Footer & Mobile AppShell Action Button Obscuration
- **Symptom:** On mobile smartphone screens (viewport width 360px–414px), floating action footers (e.g., "Submit Quote", "Publish RFQ", "Vote in Committee") overlapped bottom content or obscured the primary submit button, making forms impossible to complete without desktop scrolling.
- **Immediate Cause:** CSS layout bug where fixed bottom bars (`fixed bottom-0 left-0 right-0`) lacked corresponding `padding-bottom` (e.g., `pb-28`) on the parent scrollable container, compounded by walkthrough panels and announcement banners sharing identical z-indexes.
- **Architectural Cause:** Lack of a centralized, responsive mobile AppShell layout container managing vertical stacking contexts and iOS safe-area insets (`env(safe-area-inset-bottom)`).
- **Domain-Model Cause:** Desktop-first design legacy that treated mobile as a downscaled desktop view rather than designing for primary mobile-first containment.
- **Recommended Reconstruction Action:**
  1. Implement a unified `MobileActionFooter` component with built-in safe-area padding and sticky positioning.
  2. Wrap all buyer and supplier workflows in `<AppLayout>` with responsive `max-w-md mx-auto` constraints on mobile and proper container padding (`pb-32`).

---

### Problem 5: Route & Screen Sprawl / Duplication
- **Symptom:** Inconsistent user navigation where clicking on an RFQ opens different screens depending on entry point (e.g., `/rfq/:id/evaluation` vs `/rfq/:id/cockpit` vs `/rfq/:id/identity-protected-comparison`), leading to confusion, state divergence, and cache mismatches.
- **Immediate Cause:** 68 route declarations in `App.tsx` and 51 page components created across different development phases without deprecating older variants.
- **Architectural Cause:** Absence of a canonical routing matrix; alias routes were added as duplicate components rather than HTTP redirects.
- **Domain-Model Cause:** Violation of the **Canonical Screen Principle**: "One Capability $\rightarrow$ One Canonical Route $\rightarrow$ One Canonical Screen".
- **Recommended Reconstruction Action:**
  1. Enforce the 18 Canonical Customer Routes defined in Matrix F2.
  2. Replace duplicate route definitions in `App.tsx` with immediate `<Navigate to="..." replace />` redirects.
  3. Delete superseded legacy files (`DashboardPage.tsx`, `SupplierDashboardPage.tsx`, `RfqIdentityProtectedComparisonPage.tsx`).

---

### Problem 6: WhatsApp Supplier Invitation & Untruthful WAHA Delivery State
- **Symptom:** The platform UI displayed "WhatsApp Invitation Delivered" even when the WAHA container was offline, the recipient number was unformatted, or the gateway failed.
- **Immediate Cause:** Frontend and database triggers updated invitation status to `'DELIVERED'` immediately upon outbound HTTP request creation rather than waiting for an asynchronous delivery webhook receipt.
- **Architectural Cause:** Fire-and-forget outbound notification dispatch without stateful delivery receipt processing.
- **Domain-Model Cause:** Violation of the **Truthful Notification Principle** (Constitution v1.0, Section 31): OTP must never claim delivery occurred without cryptographic provider evidence.
- **Recommended Reconstruction Action:**
  1. Enforce strict 8-state notification lifecycle: `CREATED` $\rightarrow$ `DISPATCH_REQUESTED` $\rightarrow$ `ACCEPTED_BY_PROVIDER` $\rightarrow$ `DELIVERED` $\rightarrow$ `OPENED` $\rightarrow$ `CLAIMED` $\rightarrow$ `FAILED` $\rightarrow$ `UNAVAILABLE`.
  2. Display "Delivery Pending" until `messaging-inbound` receives genuine WAHA/Twilio delivery webhook confirmation.

---

### Problem 7: Taxonomy Fragmentation & Category Divergence
- **Symptom:** Sourcing matching failed to find qualified suppliers because the buyer selected a free-text category while suppliers were registered under structured taxonomy codes (or vice versa), resulting in empty supplier pools.
- **Immediate Cause:** Intake forms allowed free-text category strings (`category: "Pumps & Motors"`) that did not match database taxonomy keys (`category_code: "industrial_electrical"`).
- **Architectural Cause:** Hardcoded static fixtures in domain packages diverged from database migrations (00013, 00019, 00020, 00027).
- **Domain-Model Cause:** Violation of the **Canonical Taxonomy Principle** (Constitution v1.0, Section 30): Taxonomy must be unified across intake, RFQ, matching, and intelligence.
- **Recommended Reconstruction Action:**
  1. Bind `UnifiedThreeTierIntake.tsx` strictly to database `taxonomy_categories` and `taxonomy_subcategories` via Supabase API.
  2. Enforce taxonomy code validation in `RequirementService` before RFQ creation.

---

### Problem 8: Enterprise Buyer Contamination
- **Symptom:** Public pricing showed "Enterprise (₹4,999/mo)", signup dropdown included "Enterprise with Procurement Committee", and theme selectors featured "Enterprise Corporate Standard", contradicting OTP's core customer scope.
- **Immediate Cause:** Phase 6.6 code additions introduced corporate features into public marketing, signup, and navigation components.
- **Architectural Cause:** Features were built directly into public views without gating behind product scope boundaries.
- **Domain-Model Cause:** Direct violation of Constitution v1.0 Section 2 & 40: "Enterprise is explicitly out of product scope".
- **Recommended Reconstruction Action:**
  1. Execute the remediation plan in Document F3: remove Enterprise pricing cards and signup options.
  2. Refactor `EnterpriseApprovalMatrixService` into `SpendApprovalGovernanceService` to serve MSME delegation and RWA thresholds.

---

### Problem 9: Demo, Test & Pilot Leakage into Production Views
- **Symptom:** Genuine buyers saw "Demo: Simulate Quotes" buttons, "Pilot 1 · Community · Bengaluru" banners, or hardcoded "10 HP Borewell Motor Winding" titles on their live procurement requests.
- **Immediate Cause:** `<DemoModeProvider>` and `<PilotProvider>` were mounted globally in `App.tsx`, and `EvaluationDecisionCockpit.tsx` fell back to `getPilotByRfqId()` when RFQ titles were loading.
- **Architectural Cause:** Demo tooling was tightly coupled to production components instead of being strictly isolated.
- **Domain-Model Cause:** Violation of Constitution v1.0 Section 39: Customer-facing OTP must not expose engineering or demo clutter.
- **Recommended Reconstruction Action:**
  1. Implement the 4-Tier Isolation Strategy in Document F4.
  2. Unmount demo providers from root `App.tsx`; restrict demo walkthroughs strictly to `/demo`.
  3. Purge all hardcoded pilot fallbacks from `EvaluationDecisionCockpit.tsx`.

---

### Problem 10: Supplier Identity Protection & Unmasked Payload Leaks
- **Symptom:** A curious buyer inspecting browser network tools (XHR/Fetch) could view the real legal entity name, phone number, and GSTIN of quoting suppliers before award locking.
- **Immediate Cause:** Direct table queries on `public.rfq_quotes` or join queries with `public.suppliers` returned unredacted rows to the client browser.
- **Architectural Cause:** Reliance on client-side masking instead of server-side data masking.
- **Domain-Model Cause:** Violation of the **Supplier Identity Protection Principle** (Constitution v1.0, Section 18): Sealed supplier anonymity must be cryptographically enforced at the database/API layer.
- **Recommended Reconstruction Action:**
  1. Block direct client access to raw `rfq_quotes` and `suppliers` tables via hardened RLS.
  2. Require all evaluation queries to use `public.rfq_quotes_identity_protected` view or `get_identity_protected_quotes_atomic()` RPC.
  3. Execute `assertIdentityProtectedPayloadSafe()` in domain service layers before returning responses.

---

### Problem 11: Premature Supplier Award / Missing Onboarding Verification Gate
- **Symptom:** Buyers awarded contracts to unregistered or unverified suppliers who subsequently could not issue GST invoices or receive bank payouts, resulting in stalled purchase orders.
- **Immediate Cause:** The award action immediately disclosed supplier details and generated a PO without checking supplier KYC/GST status.
- **Architectural Cause:** Missing intermediate onboarding state between Award Lock and PO Issuance.
- **Domain-Model Cause:** Violation of the **2-Stage Supplier Lifecycle** (Constitution v1.0, Section 17): "RFQ Participant $\neq$ Verified OTP Supplier".
- **Recommended Reconstruction Action:**
  1. Enforce the 2-stage lifecycle in `lock_and_reveal_award_atomic` (Migration 00196).
  2. If the awarded supplier is unverified, hold the transaction in `AWARDED` status and direct the supplier to `/supplier/award-onboarding/:token`.
  3. Unlock mutual identity reveal and PO issuance only upon successful onboarding completion via `complete_supplier_award_onboarding_atomic`.

---

### Problem 12: Coarse-Grained Authorization & Missing Spend Delegation Controls
- **Symptom:** Any team member added to an organization had full authority to issue unlimited purchase orders, or delegating approval required sharing owner login credentials.
- **Immediate Cause:** Binary authorization model where `role = 'MEMBER'` had either zero permissions or full manager authority.
- **Architectural Cause:** Lack of time-bounded, spend-capped delegation entities in early schema.
- **Domain-Model Cause:** Violation of **MSME Delegation Principles** (Constitution v1.0, Section 14): Delegation must be explicitly granted, spend-capped, time-bounded, and auditable.
- **Recommended Reconstruction Action:**
  1. Enforce `public.organization_delegations` (Migration 00190) for all MSME transactions.
  2. Validate spend caps (`p_amount <= spend_cap_amount`) and active date ranges in PO creation RPCs.
  3. Enforce anti-self-approval database triggers.

---

### Problem 13: Historical Role Succession & Audit Actor Overwriting
- **Symptom:** When a new RWA Treasurer took office in 2026, all historical 2025 purchase orders and votes displayed the new Treasurer's name, corrupting historical audit compliance.
- **Immediate Cause:** Database records stored role names dynamically resolved via `JOIN organization_members` using current profile IDs.
- **Architectural Cause:** Mutable role associations without historical snapshotting.
- **Domain-Model Cause:** Violation of **RWA Role Succession & Historical Continuity** (Constitution v1.0, Section 8, 10, 36): "Current Role Holder $\neq$ Historical Role Holder". Historical visibility is not historical authority.
- **Recommended Reconstruction Action:**
  1. Implement `public.org_role_assignments` and immutable `public.org_governance_action_audits` (Migration 00197).
  2. Snapshot `actor_person_id`, `role_at_time`, and `authority_at_time` upon every transaction.
  3. Protect audit ledgers with PostgreSQL trigger `prevent_mutation_org_governance_audits()`.

---

### Problem 14: Mobile Viewport Overflow & Horizontal Scroll Violations
- **Symptom:** On mobile browsers, tables (`CriterionBreakdownTable`, `AdminTransactionsTable`) and wide comparison cards extended beyond the screen edge, causing horizontal scrolling and broken touch navigation.
- **Immediate Cause:** Use of fixed pixel widths (`w-[600px]`, `min-w-[700px]`) and multi-column grid layouts (`grid-cols-4`) without responsive collapse on small viewports.
- **Architectural Cause:** Lack of mobile-first UI components designed specifically for narrow viewports.
- **Domain-Model Cause:** Violation of the **Mobile-First Product Principle** (Constitution v1.0, Section 25).
- **Recommended Reconstruction Action:**
  1. Replace desktop comparison tables on mobile with vertical `QuoteCard4Pillar` swipeable cards.
  2. Enforce `overflow-x-hidden` on application root and use `MobileMetricGrid` for compact data display.

---

## 3. Summary Action Matrix for Reconstruction Phase

| Problem # | Domain Area | Target Reconstruction Action | Verified By Automated Test |
| :---: | :--- | :--- | :--- |
| **1** | Address Persistence | Standardize on `buyer_addresses` + frozen snapshots | `profile/address-book-and-persona.test.ts` |
| **2** | Persona Independence | Allow null org for Individual; isolate RWA committee | `roles/role-aware-home-dispatch.test.ts` |
| **3** | Officer Appointment | Enforce tokenized invitations & atomic appointment RPCs | `org/org.test.ts` |
| **4** | Mobile Footer | Implement `MobileActionFooter` with safe-area padding | `navigation/mobile-viewport-containment.test.ts` |
| **5** | Route Sprawl | Consolidate to 18 canonical routes; add 301 redirects | `unit/web-routes.test.ts` |
| **6** | Notification Proof | Stateful webhook delivery verification for WAHA/Email | `integration/messaging-compliance.test.ts` |
| **7** | Taxonomy Sync | Bind intake dynamically to database taxonomy schema | `intake/__tests__/unified-three-tier-intake.test.ts` |
| **8** | Enterprise Exclusion | Purge enterprise marketing/signup; refactor shared engine | `subscription/subscription.test.ts` |
| **9** | Demo Isolation | Unmount demo providers from root; isolate to `/demo` | `unit/env-guard.test.ts` |
| **10**| Identity Protection | Server-side masked views + `assertIdentityProtectedSafe` | `security/blind-rfq-engine.test.ts` |
| **11**| Supplier Onboarding | Enforce 2-stage award onboarding gate before PO | `security/award-closeout.test.ts` |
| **12**| Spend Delegation | Enforce spend caps & anti-self-approval via RPCs | `c84-spend-approval-orchestration.test.ts` |
| **13**| Role Succession | Effective-dated role terms + immutable audit ledger | `org/components/OrgRoleSuccessionTimeline.test.tsx`|
| **14**| Mobile Overflow | Vertical responsive card collapse + zero horizontal scroll | `home/responsive-cockpit.test.ts` |

---
*End of Known Problem Symptom-to-Root-Cause Matrix (F6)*
