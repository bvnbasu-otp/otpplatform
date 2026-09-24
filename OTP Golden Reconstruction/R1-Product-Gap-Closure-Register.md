# OTP Product Gap Closure Register (R1)
**Document Identifier:** `OTP-RECON-R1-GAP-CLOSURE-REGISTER`  
**Version:** 1.0 (Authoritative R1 Release)  
**Status:** ARCHITECTURAL SPECIFICATION & MANDATORY REGISTER  
**Working Root:** `G:/My Drive/otp`  
**Ceiling Migration:** `00197` (Universal Org Role Lifecycle, Succession & Audit)  
**Authoritative Basis:** OTP Product Constitution v1.0, Forensic Audits F1 through F9  
**Core Invariant:** *MODE: DOCUMENTATION / ARCHITECTURE DECISION ONLY. ZERO CODE/SCHEMA MUTATION DURING R1.*

---

## 1. Executive Summary & Purpose

The **Product Gap Closure Register** establishes the definitive architectural specifications, migration pathways, and verifiable acceptance criteria for all **22 foundational product and architectural gaps (GAP-01 through GAP-22)** identified across the OTP codebase and documentation.

In addition, it provides the **Master Capability Classification**, categorizing every capability of the platform into one of seven strict operational tiers: `CUSTOMER-FACING`, `INTERNAL WORKFLOW`, `PLATFORM INFRASTRUCTURE`, `SECURITY CONTROL`, `FINANCIAL CONTROL`, `ADMIN-ONLY`, or `RETIRED`.

---

## 2. Master Gap Closure Matrix (GAP-01 through GAP-22)

| Gap ID | Subject & Scope | Current State | Target State | Decision | Disposition | Phase | Acceptance Criteria |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **GAP-01** | Domain Complexity vs. UX Simplicity | Complex ERP workflows exposed to buyers; 15-step linear status badges; heavy admin forms. | **4-Action Golden Journey:** TELL $\rightarrow$ REVIEW $\rightarrow$ DECIDE $\rightarrow$ TRACK. Backend handles orchestration. | Consolidate buyer screens into 4 intuitive, mobile-first steps. | `RECONSTRUCT` | Phase 1 & 2 | Mobile buyer completes requirement creation in $<60$s and decision in 1 click. |
| **GAP-02** | Enterprise Removal & Shared Infra | Public pricing & signup expose Enterprise tier; `EnterpriseApprovalMatrixService` tightly coupled. | Enterprise removed from customer scope; underlying threshold/delegation engine preserved for MSME/RWA. | Purge Enterprise UI; refactor service to `SpendApprovalGovernanceService`. | `REFACTOR` / `PRESERVE` | Phase 1 & 3 | Zero Enterprise references in UI; 100% of delegation tests passing. |
| **GAP-03** | 13-Stage Authorization Chain | Fragmented authorization checks; persona conflation; user auto-provisioned into dummy org. | **13-Stage Canonical Model:** Person + Context + Org + Eligibility + Membership + Role + Responsibility + Delegation + Authority + Transaction + Scope + Cap + Date. | Strict context evaluation at server/API/RLS layers. | `REFACTOR` / `PRESERVE` | Phase 2 & 3 | RWA Treasurer cannot act as MSME Primary; Individual has $0$ committee UI. |
| **GAP-04** | RWA Governance as First-Class | Roles stored as static strings on members; succession rewrote historical audit records. | 7 canonical roles; "Role $\neq$ Person"; 365-day term expiry; append-only audit ledger (`org_governance_action_audits`). | Universal role lifecycle via Migration 00197 RPCs and immutable audit trigger. | `PRESERVE AS INFRASTRUCTURE` | Phase 2 | Historical Decision Receipts permanently preserve original signers. |
| **GAP-05** | RWA Manager vs. Committee Voting | Facility Manager role could potentially access voting screens or bypass quorum. | RWA Manager is strictly operational (site visits, inspection checklists); zero committee voting rights. | Backend & database enforce: Manager cannot cast committee votes or trigger award lock. | `PRESERVE AS INFRASTRUCTURE` | Phase 2 | Attempt by Manager to call `submit_committee_vote_atomic` throws hard RLS/DB exception. |
| **GAP-06** | MSME Spend Delegation & Proxies | Coarse permissions (Owner vs Member); no time bounds or monetary spend limits. | Granular delegation proxies (`public.organization_delegations`) with spend caps, validity dates, anti-self-approval. | MSME Primary configures custom spend caps; Primary has 1-click approval for any amount. | `PRESERVE AS INFRASTRUCTURE` | Phase 3 | Delegate cannot approve RFQs exceeding their spend cap; self-approval rejected. |
| **GAP-07** | Supplier Identity Protection | Masked views existed, but prone to leaks via direct table joins or client props. | **Cryptographic Zero-Leakage Boundary:** Server-side masked views + DOM/WebSocket seals + memory guards. | Block raw `rfq_quotes` queries; enforce `rfq_quotes_identity_protected` & memory guards. | `PRESERVE AS INFRASTRUCTURE` | Phase 1 & 2 | Browser network inspect reveals zero supplier names/contacts/GSTINs before award lock. |
| **GAP-08** | Supplier 2-Stage Lifecycle & Gate | Unverified suppliers could receive instant awards and PO payouts without verification. | **2-Stage Lifecycle:** Zero-login quote via `/q/:token` $\rightarrow$ Verification gate `/supplier/award-onboarding` $\rightarrow$ Reveal & PO. | Enforce fail-closed gate in `lock_and_reveal_award_atomic` (Migration 00196). | `PRESERVE AS INFRASTRUCTURE` | Phase 2 & 3 | Unverified supplier award halts identity reveal and PO creation until KYC/GST verified. |
| **GAP-09** | Supplier Network Engine | Sourcing matching scattered across edge functions; lack of structured deduplication. | Unified Supplier Network Engine: Discovery, Sources (VMI/Direct/ONDC/BNI), Matching, Deduplication. | Centralize matching algorithm; preserve Superadmin Sourcing Console. | `REFACTOR` | Phase 2 & 3 | Matched supplier pool correctly filters by category code, radius, and capacity. |
| **GAP-10** | Canonical Taxonomy Layer | Intake used free-text strings diverging from database taxonomy tables. | Canonical 3-level taxonomy (`category` $\rightarrow$ `subcategory` $\rightarrow$ `attributes`) synced from database. | Bind `UnifiedThreeTierIntake` directly to `taxonomy_categories` Supabase API. | `REFACTOR` | Phase 1 & 2 | Zero free-text category divergence; 100% taxonomy match across RFQ and suppliers. |
| **GAP-11** | First-Class Address Architecture | Delivery location stored in ad-hoc strings; profile edits mutated historical RFQs. | `public.buyer_addresses` as single source; Primary auto-inheritance; frozen JSONB snapshots on RFQ/PO. | Auto-inherit primary address during intake; freeze immutable snapshot on RFQ/PO insert. | `REFACTOR` | Phase 1 & 2 | Editing profile address does not mutate delivery location on historical POs. |
| **GAP-12** | Golden Procurement State Machine | Complex 15-state progression exposed to buyers causing confusion. | **7 Canonical States:** `DRAFT` $\rightarrow$ `QUOTING` $\rightarrow$ `EVALUATING` $\rightarrow$ `AWARDED` $\rightarrow$ `PO ISSUED` $\rightarrow$ `INVOICED` $\rightarrow$ `SETTLED` (+ `STALLED`). | Present simple 7-state progression to customer; handle internal events in backend. | `RECONSTRUCT` | Phase 2 | Buyer progress bar renders exactly the 7 canonical lifecycle stages. |
| **GAP-13** | Duplicate Routes & Screen Sprawl | 68 declared routes in `App.tsx`; 9 duplicate URLs pointing to evaluation cockpit; dead page files. | **Strict 1:1:1 Rule:** One Capability $\rightarrow$ One Canonical Route $\rightarrow$ One Canonical Screen (18 Canonical Routes). | Streamline router in `App.tsx`; replace aliases with 301 redirects; delete dead page files. | `RECONSTRUCT` | Phase 1 | Total active customer routes reduced to 18; zero broken redirects or dead pages. |
| **GAP-14** | Mobile Shell & Footer Containment | Floating action bars lacked bottom safe-area insets (`pb-32`), obscuring primary buttons on mobile. | Responsive Mobile AppShell (`max-w-md mx-auto`), unified `MobileActionFooter`, safe-area insets. | Add `pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]` to AppLayout container. | `RECONSTRUCT` | Phase 1 & 2 | 100% of action buttons visible and clickable across all smartphone screen sizes. |
| **GAP-15** | Demo / Pilot Complexity Leakage | `<DemoModeProvider>` mounted globally; hardcoded pilot titles ("10 HP Motor") on live RFQs. | **4-Tier Demo Isolation:** Demo components mounted strictly under `/demo`; zero pilot fallbacks in live views. | Unmount demo providers from root `App.tsx`; move "Simulate Quotes" to Superadmin console. | `RECONSTRUCT` | Phase 1 | Live buyer dashboard contains zero demo banners, pilot fallbacks, or test buttons. |
| **GAP-16** | Truthful Notification Lifecycle | Invitations optimistically marked "Delivered" upon HTTP request creation without proof. | **8-State Truthful Lifecycle:** `CREATED` $\rightarrow$ `DISPATCH_REQUESTED` $\rightarrow$ `ACCEPTED` $\rightarrow$ `DELIVERED` $\rightarrow$ `OPENED` $\rightarrow$ `CLAIMED` $\rightarrow$ `FAILED` $\rightarrow$ `UNAVAILABLE`. | Display "Dispatch Pending" until webhook confirmation receipt from WAHA/Twilio. | `REFACTOR` | Phase 2 & 3 | UI never claims delivery occurred without verifiable webhook receipt evidence. |
| **GAP-17** | Market Intelligence Provenance | Static reference benchmarks displayed without disclosing data freshness or source. | **4-Tier Provenance Ladder:** `LIVE_API` $\rightarrow$ `DATABASE_CACHE` $\rightarrow$ `STATIC_REFERENCE` $\rightarrow$ `UNAVAILABLE`. | Attach explicit provenance badges (`LIVE`, `CACHED`, `REFERENCE`) to all intelligence cards. | `REFACTOR` | Phase 2 | Static indices are transparently badged and never labeled as live rates. |
| **GAP-18** | Financial Architecture Separation | Blurring between GMV, OTP revenue, and buyer rewards; basic single-entry logging. | **Triple Financial Separation:** Procurement GMV vs. OTP 0.50% Fee vs. 0.10% Buyer Rewards, double-entry ledger. | Preserve `financial_ledger_entries` (Migration 00176) and bilateral GST/TDS calculators. | `PRESERVE AS INFRASTRUCTURE` | Phase 2 & 3 | Double-entry journal exports balance to ₹0.00 ($\sum \text{Debits} = \sum \text{Credits}$). |
| **GAP-19** | Protected Backend Assets Catalog | Lack of explicit documentation on which backend assets are cryptographically protected. | Authoritative Catalog of PA-01 through PA-10 with strict preservation and invariant rules. | Lock Migration 00197 ceiling; enforce zero mutation of protected RPCs. | `PRESERVE AS INFRASTRUCTURE` | All Phases | 1,514+ automated regression tests remain 100% green. |
| **GAP-20** | Superadmin Operational Scope | Superadmin tools mixed into user navigation; risk of accidental customer data mutation. | Dedicated Superadmin Control Plane (`/admin`) for whitelist management, ops troubleshooting, and taxonomy. | Gate `/admin` behind `private_security.admin_whitelist`; log all actions in admin audit log. | `REFACTOR` | Phase 2 | Admin actions are strictly audited; admins cannot silently rewrite business transactions. |
| **GAP-21** | CEO / Founder Oversight Cockpit | Founder cockpit conflated with operational management; lack of executive telemetry. | Dedicated Executive Cockpit (`/founder`) providing holistic business, UX, and security telemetry. | Maintain `/founder` as read-only oversight cockpit isolated from customer authority. | `REFACTOR` | Phase 2 | Founder cockpit provides high-level visibility without customer transaction signing authority. |
| **GAP-22** | Telemetry Domain Separation | UX analytics, business funnel metrics, and security audit logs dumped into single streams. | **3-Domain Telemetry Separation:** UX Telemetry vs. Business Telemetry vs. Security/Audit Telemetry. | Partition telemetry events into distinct domain topics and storage sinks. | `REFACTOR` | Phase 2 & 3 | Security audits are immutable and tamper-evident; UX telemetry carries zero PII. |

---

## 3. Exhaustive Architectural Specifications for All 22 Gaps

---

### GAP-01: Domain Complexity vs. Customer UX Simplicity
- **Current State:** The buyer user interface exposes internal procurement orchestration details, such as 15-step linear status chips, raw RPC parameter errors, and ERP-style configuration matrices.
- **Target State:** The customer experiences the **4-Action Golden Journey**:
  1. **TELL:** Buyer speaks, types, uploads a photo, or fills a 1-screen requirement form.
  2. **REVIEW:** Buyer compares sealed, identity-protected quotes across the 4 core pillars (Price, Delivery, Quality, Service SLA).
  3. **DECIDE:** Individual buyers click "Accept"; MSME delegates sign off within spend caps; RWA committees cast democratic votes to achieve quorum ($\ge 2$).
  4. **TRACK:** Buyer monitors milestone execution, verifies site inspection photos, and settles non-custodial milestone invoices.
- **Decision & Disposition:** `RECONSTRUCT`. Consolidate all buyer screens into the mobile-first 4-action paradigm. Backend carries 100% of the orchestration complexity.
- **Implementation Phase:** Phase 1 (Route Consolidation) & Phase 2 (Component Simplification).
- **Acceptance Criteria:**
  - Fast-track intake takes $<60$ seconds on mobile smartphones.
  - Review cockpit displays clear comparison cards without exposed backend state IDs.

---

### GAP-02: Enterprise Removal & Preservation of Shared Infrastructure
- **Current State:** Public marketing pages display "Card 3: Enterprise & Multi-Branch Institutions (₹4,999/mo)", signup dropdowns include "Enterprise", and services are prefixed with `Enterprise*`.
- **Target State:** Enterprise buyer persona is completely purged from customer scope (Constitution v1.0, Section 2 & 40). Underlying multi-tier threshold evaluation, time/spend delegation proxies, and anti-self-approval engines are preserved and refactored to serve **MSME Spend Delegation** and **RWA Capex Signatory Thresholds**.
- **Decision & Disposition:** `REFACTOR` / `PRESERVE AS INFRASTRUCTURE`. Purge Enterprise UI; rename `EnterpriseApprovalMatrixService` $\rightarrow$ `SpendApprovalGovernanceService`.
- **Implementation Phase:** Phase 1 (UI Purge) & Phase 3 (Service Refactoring).
- **Acceptance Criteria:**
  - Zero occurrences of "Enterprise" in customer-facing UI, marketing copy, or registration forms.
  - All 14 test assertions in `c84-spend-approval-orchestration-and-delegation.test.ts` pass with 100% green status.

---

### GAP-03: 13-Stage Authorization Chain & Multi-Context Independence
- **Current State:** Authorization checks were fragmented across frontend props and inconsistent RPCs; users were auto-provisioned into dummy organizations.
- **Target State:** Enforcement of the **13-Stage Canonical Authorization Model**:
  $$\text{Person} \rightarrow \text{Context} \rightarrow \text{Org} \rightarrow \text{Eligibility} \rightarrow \text{Membership} \rightarrow \text{Role} \rightarrow \text{Responsibility} \rightarrow \text{Delegation} \rightarrow \text{Authority} \rightarrow \text{Transaction} \rightarrow \text{Scope} \rightarrow \text{Cap} \rightarrow \text{Date}$$
  Contexts are strictly independent: an RWA Treasurer's authority never confers MSME or Individual authority.
- **Decision & Disposition:** `REFACTOR` / `PRESERVE AS INFRASTRUCTURE`. Standardize `organization_id = NULL` for Individual buyers; evaluate authorization server-side using full context tuple.
- **Implementation Phase:** Phase 2 & Phase 3.
- **Acceptance Criteria:**
  - A user holding multiple roles (e.g. Individual Buyer + RWA Treasurer) switches contexts cleanly via header toggle; personal purchases are invisible to RWA committee.
  - Backend API rejects any transaction where the actor lacks active authority in the specific organizational context.

---

### GAP-04: RWA Governance as First-Class (7 Roles, Term Expiry, Rotation)
- **Current State:** Roles were represented as static string columns on `organization_members.role`. Changing officers retroactively altered historical audit logs.
- **Target State:** RWA governance is a first-class citizen supporting the 7 canonical roles (`PRESIDENT`, `VICE_PRESIDENT`, `SECRETARY`, `JOINT_SECRETARY`, `TREASURER`, `COMMITTEE_MEMBER`, `MANAGER`). "Role $\neq$ Person". Roles have automatic 365-day term expiry, annual rotation support, and immutable audit logs via `public.org_governance_action_audits`.
- **Decision & Disposition:** `PRESERVE AS INFRASTRUCTURE`. Retain Migration 00197 tables and RPCs (`appoint_org_role_atomic`, `transfer_org_role_succession_atomic`).
- **Implementation Phase:** Phase 2 (Wire `OrgMembersPage.tsx` to Migration 00197 RPCs).
- **Acceptance Criteria:**
  - Succession transfers future signing authority to the new officer while leaving historical Decision Receipts immutably attributed to the previous officer.
  - Expired role assignments automatically lose voting and award authorization.

---

### GAP-05: RWA Manager Operational Role vs. Committee Voting Separation
- **Current State:** The Facility / Estate Manager role lacked strict database-level separation from voting committee members.
- **Target State:** The RWA Manager is strictly an operational non-committee role authorized to draft requirements, coordinate vendor site visits, and log delivery inspection checklists. A Manager has zero committee voting rights and cannot contribute to quorum ($\ge 2$).
- **Decision & Disposition:** `PRESERVE AS INFRASTRUCTURE`. Enforce in PostgreSQL RPC `submit_committee_vote_atomic()`: reject any vote cast by `role = 'MANAGER'`.
- **Implementation Phase:** Phase 2.
- **Acceptance Criteria:**
  - UI hides committee voting buttons from users with `role = 'MANAGER'`.
  - Direct RPC invocation by a Manager returns `P0001: Operational managers cannot cast committee votes`.

---

### GAP-06: MSME Spend Delegation & Proxy Authorization
- **Current State:** MSME buyers had basic binary permissions without monetary spend caps or validity time windows.
- **Target State:** Granular spend delegation proxies managed via `public.organization_delegations` (Migration 00190). The MSME Primary can configure custom spend caps (e.g. ₹50,000 for Operations Lead) with UTC expiry. Anti-self-approval rule prevents the creator of an RFQ from approving their own request.
- **Decision & Disposition:** `PRESERVE AS INFRASTRUCTURE`. Reconstruct MSME team management UI around `create_delegation_proxy_atomic()`.
- **Implementation Phase:** Phase 3.
- **Acceptance Criteria:**
  - MSME Primary has 1-click approval authority for any amount.
  - Delegated members can approve RFQs $\le \text{spend\_cap\_amount}$; amounts exceeding spend cap automatically route to Primary.
  - Anti-self-approval triggers database exception if creator attempts self-approval.

---

### GAP-07: Supplier Identity Protection & Side-Channel Leak Prevention
- **Current State:** Identity protection views were implemented, but unredacted data could leak through accidental direct table joins, error messages, or client-side props.
- **Target State:** **Cryptographic Zero-Leakage Boundary:**
  1. PostgreSQL masked view `public.rfq_quotes_identity_protected` redacts legal names, phone numbers, email addresses, and GSTINs.
  2. Domain memory guard `assertIdentityProtectedPayloadSafe()` inspects JSON payloads and throws runtime errors on contact pattern leaks.
  3. Zero unmasked supplier attributes in DOM, network payloads, WebSockets, or logs prior to post-award reveal.
- **Decision & Disposition:** `PRESERVE AS INFRASTRUCTURE`. Restrict client access strictly to masked views and RPCs.
- **Implementation Phase:** Phase 1 & Phase 2.
- **Acceptance Criteria:**
  - Browser network inspector inspecting `/rfq/:id/evaluation` displays strictly `Supplier #01`, masked prices, and anonymized badges; zero contact details in response JSON.

---

### GAP-08: Supplier 2-Stage Lifecycle & Fail-Closed Execution Gate
- **Current State:** Winning suppliers could receive instantaneous awards and PO payouts without prior KYC/GST verification.
- **Target State:** **2-Stage Supplier Lifecycle:**
  1. **Stage 1 (Prospective Quoting):** Suppliers submit sealed quotations via unauthenticated magic links (`/q/:token`) with zero upfront account friction.
  2. **Stage 2 (Award Onboarding Gate):** Upon winning quote selection, `lock_and_reveal_award_atomic` halts identity reveal and routes supplier to `/supplier/award-onboarding/:token` for mandatory GSTIN, PAN, and Bank Account verification.
  Mutual reveal and PO issuance execute *only* after verification is confirmed.
- **Decision & Disposition:** `PRESERVE AS INFRASTRUCTURE`. Enforce fail-closed gate in Migration 00196 RPC.
- **Implementation Phase:** Phase 2 & Phase 3.
- **Acceptance Criteria:**
  - Awarding an unverified supplier creates an onboarding token and sets RFQ status to `AWARDED` with `identity_revealed = false`.
  - PO issuance is locked until supplier completes verification at `/supplier/award-onboarding`.

---

### GAP-09: Detailed Supplier Network Engine
- **Current State:** Sourcing matching logic was distributed across disparate edge functions and client helpers.
- **Target State:** Centralized **Supplier Network Engine** managing:
  - **Discovery:** Geo-radius matching, pincode mapping, and category code indexing.
  - **Sources:** Verified Marketplace Suppliers (VMI), Direct Network Suppliers, ONDC Network Providers, and BNI Partner Networks.
  - **Matching:** Dynamic matching scoring based on category competence, distance, past performance rating, and active capacity.
  - **Identity & Tokenization:** SHA-256 single-use quote tokens (`/q/:token`).
  - **Deduplication:** Automatic GSTIN/phone deduplication to prevent duplicate supplier profiles.
  - **Superadmin Ops Console:** Sourcing control room at `/admin?tab=supplier_network`.
- **Decision & Disposition:** `REFACTOR`. Unify matching services under `@otp/services`; maintain Superadmin Sourcing Console.
- **Implementation Phase:** Phase 2 & Phase 3.
- **Acceptance Criteria:**
  - Sourcing engine returns prioritized supplier pool ranked by distance, rating, and verified capacity.
  - Deduplication prevents duplicate supplier profiles across multiple onboarding channels.

---

### GAP-10: Canonical Taxonomy Layer & Reference Data Lifecycle
- **Current State:** Free-text category inputs in intake occasionally diverged from database taxonomy codes, resulting in empty supplier pools.
- **Target State:** Canonical 3-Level Procurement Taxonomy (`taxonomy_categories` $\rightarrow$ `taxonomy_subcategories` $\rightarrow$ `attributes`) synced from database tables. Rule-based parser maps natural language prompts directly to verified category codes. Changes to taxonomy are versioned, auditable, and restricted to Superadmin.
- **Decision & Disposition:** `REFACTOR`. Bind `UnifiedThreeTierIntake.tsx` strictly to database taxonomy APIs.
- **Implementation Phase:** Phase 1 & Phase 2.
- **Acceptance Criteria:**
  - Intake category dropdowns are 100% database-driven.
  - Requirement creation validates `category_code` against `taxonomy_categories` before database insert.

---

### GAP-11: First-Class Address Architecture & Snapshots
- **Current State:** Address records were stored in inconsistent string fields; editing profile addresses modified delivery addresses on past RFQs.
- **Target State:** First-class address management via `public.buyer_addresses` (Migration 00196):
  - Supports `is_primary`, `address_type` (`'DELIVERY'`, `'REGISTERED'`), `profile_id` (Individual), and `organization_id` (RWA/MSME).
  - Primary address auto-inherits on intake.
  - RFQs and POs capture **frozen JSONB snapshots** (`delivery_address_snapshot`, `billing_address_snapshot`) at creation time.
- **Decision & Disposition:** `REFACTOR` / `PRESERVE AS INFRASTRUCTURE`. Standardize frontend intake on `buyer_addresses`.
- **Implementation Phase:** Phase 1 & Phase 2.
- **Acceptance Criteria:**
  - Primary address auto-populates in intake.
  - Updating or deleting an address in `/profile` does not alter historical address data on existing RFQs or POs.

---

### GAP-12: Golden Procurement Journey & State Machine
- **Current State:** 15 granular backend states exposed to buyers, leading to UI clutter and confusion.
- **Target State:** Customer-facing procurement progress is presented via the **7 Canonical States**:
  $$\text{DRAFT} \rightarrow \text{QUOTING} \rightarrow \text{EVALUATING} \rightarrow \text{AWARDED} \rightarrow \text{PO ISSUED} \rightarrow \text{INVOICED} \rightarrow \text{SETTLED}$$
  with `STALLED` as the explicit exception state. Internal granular events remain in the backend.
- **Decision & Disposition:** `RECONSTRUCT`. Consolidate buyer progress steppers to reflect the 7 canonical states.
- **Implementation Phase:** Phase 2.
- **Acceptance Criteria:**
  - Buyer progress bar displays clean 7-stage lifecycle.
  - Exception states (e.g. quote expiry or vendor dispute) render clear `STALLED` banner with remediation CTA.

---

### GAP-13: Duplicate Routes & Screen Sprawl
- **Current State:** 68 declared routes in `App.tsx`; 9 duplicate URLs pointing to the evaluation cockpit; orphaned page files in `apps/web/src/pages/`.
- **Target State:** Enforcement of the **1:1:1 Rule**: One Capability $\rightarrow$ One Canonical Route $\rightarrow$ One Canonical Screen. Customer workspace streamlined into **18 Canonical Routes** (Matrix F2). All alias routes redirect via immediate 301-style client redirects.
- **Decision & Disposition:** `RECONSTRUCT`. Reconstruct `App.tsx` router; delete orphaned legacy page files.
- **Implementation Phase:** Phase 1.
- **Acceptance Criteria:**
  - Router in `App.tsx` declares exactly the 18 Canonical Routes and necessary redirects.
  - Orphaned files `DashboardPage.tsx`, `SupplierDashboardPage.tsx`, and `RfqIdentityProtectedComparisonPage.tsx` are removed.

---

### GAP-14: Global AppShell & Floating Footer Mobile Containment
- **Current State:** Fixed bottom action footers lacked safe-area bottom padding (`pb-32`) on scrollable containers, obscuring primary submit buttons on screens $<420\text{px}$.
- **Target State:** Mobile-First AppShell Container:
  - Responsive container (`max-w-md mx-auto` on mobile, fluid on desktop).
  - Unified `MobileActionFooter` with built-in `pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]`.
  - Zero button obscuration; minimum 44px touch targets; zero horizontal overflow.
- **Decision & Disposition:** `RECONSTRUCT`. Implement unified mobile AppShell layout.
- **Implementation Phase:** Phase 1 & Phase 2.
- **Acceptance Criteria:**
  - All form inputs and buttons scroll 100% clear of floating action footers on 360px–414px mobile viewports.
  - Zero horizontal scrollbars across all buyer and supplier routes.

---

### GAP-15: Engineering & Demo / Pilot Complexity Leakage Isolation
- **Current State:** `<DemoModeProvider>` and `<PilotProvider>` wrapped around root `App.tsx`; hardcoded pilot titles ("10 HP Borewell Motor") rendered on live buyer RFQs.
- **Target State:** **4-Tier Demo Isolation:**
  1. Demo providers mounted strictly under `/demo` (`DemoDashboardPage.tsx`).
  2. Zero hardcoded pilot fallbacks in customer components.
  3. "Simulate Quotes" button relocated to Superadmin Console (`/admin?tab=buyer_troubleshooter`).
  4. Migration 00125 and 00184 triggers protect real customer accounts from test resets.
- **Decision & Disposition:** `RECONSTRUCT`. Unmount demo providers from root `App.tsx`; purge demo hooks from production components.
- **Implementation Phase:** Phase 1.
- **Acceptance Criteria:**
  - Root `App.tsx` has zero demo/pilot context providers.
  - Live RFQs derive titles strictly from database tables.

---

### GAP-16: Truthful Notification Lifecycle & Delivery States
- **Current State:** Frontend marked invitations as "Delivered" upon HTTP request creation without waiting for gateway webhook evidence.
- **Target State:** Strict enforcement of the **8-State Truthful Notification Lifecycle**:
  $$\text{CREATED} \rightarrow \text{DISPATCH\_REQUESTED} \rightarrow \text{ACCEPTED\_BY\_PROVIDER} \rightarrow \text{DELIVERED} \rightarrow \text{OPENED} \rightarrow \text{CLAIMED} \rightarrow \text{FAILED} \rightarrow \text{UNAVAILABLE}$$
  OTP UI never claims delivery occurred without cryptographic provider evidence.
- **Decision & Disposition:** `REFACTOR`. Wire `messaging-inbound` webhook handler to update notification state upon receipt confirmation.
- **Implementation Phase:** Phase 2 & Phase 3.
- **Acceptance Criteria:**
  - Outbound invitation displays "Dispatch Requested" until webhook confirmation transitions status to "Delivered".
  - Failed deliveries display clear failure reasons and retry options.

---

### GAP-17: Market Intelligence Provenance Ladder
- **Current State:** Static benchmark prices were rendered without disclosing source freshness, presenting reference numbers as live market rates.
- **Target State:** Strict enforcement of the **4-Tier Market Intelligence Provenance Ladder**:
  $$\text{LIVE\_API} \rightarrow \text{DATABASE\_CACHE} \rightarrow \text{STATIC\_REFERENCE} \rightarrow \text{UNAVAILABLE}$$
  Every intelligence card displays an explicit provenance badge (`LIVE`, `CACHED (X days ago)`, `REFERENCE BENCHMARK`).
- **Decision & Disposition:** `REFACTOR`. Attach provenance metadata to all market intelligence API payloads and cards.
- **Implementation Phase:** Phase 2.
- **Acceptance Criteria:**
  - All market intelligence components display explicit provenance badges.
  - Static reference benchmarks are never labeled as "Live Rates".

---

### GAP-18: Financial Architecture Separation (GMV vs OTP Fee vs Buyer Reward)
- **Current State:** Basic transaction logging without complete segregation of procurement funds, platform revenues, and incentive wallets.
- **Target State:** GAAP / IndAS Double-Entry Financial Architecture:
  - **Procurement GMV:** Total commercial transaction value passing from buyer to supplier.
  - **OTP Platform Fee:** 0.50% supplier platform fee collected on completed orders.
  - **Buyer Reward Wallet:** 0.10% cashback credited to buyer wallet upon settlement.
  - **Tax Engine:** Bilateral GST (CGST/SGST vs IGST) and statutory TDS withholding (Section 194C / 194Q).
  - **Double-Entry Ledger:** Managed via `public.financial_ledger_entries` (Migration 00176).
- **Decision & Disposition:** `PRESERVE AS INFRASTRUCTURE`. Maintain Migration 00176 ledger tables and domain calculators.
- **Implementation Phase:** Phase 2 & Phase 3.
- **Acceptance Criteria:**
  - Financial ledger entries post balanced debits and credits ($\sum \text{Debits} = \sum \text{Credits}$).
  - Tally ERP and Zoho XML journal exports generate mathematically balanced accounting entries.

---

### GAP-19: Protected Backend Governance & Security Assets Catalog (PA-01 through PA-10)
- **Current State:** Protected backend assets were not cataloged in a single authoritative register with explicit invariant guarantees.
- **Target State:** Master Register of Protected Assets (PA-01 through PA-10) established in Document F7 with strict preservation invariants:
  - **PA-01:** Committee Voting & Quorum RPC (`00024`, `00049`)
  - **PA-02:** Atomic Award Lock & 2-Stage Onboarding Gate (`00160`, `00196`)
  - **PA-03:** Universal Org Role Assignments & Immutable Governance Audits (`00197`)
  - **PA-04:** Identity-Protected PostgreSQL Masked Views (`00117`, `00196`)
  - **PA-05:** Domain Memory Leak Detection Guards (`assertIdentityProtectedPayloadSafe`)
  - **PA-06:** Bilateral GST & Place-of-Supply Engine (`00156`, `00168`)
  - **PA-07:** GAAP Double-Entry Financial Ledger (`00176`)
  - **PA-08:** Superadmin Whitelist Schema & Immutability Triggers (`00152`)
  - **PA-09:** Tokenized Invitations & Delegation Proxies (`00190`)
  - **PA-10:** PBKDF2/AES-256 Encrypted Database Backup Pipeline (`backup-prod-db.ps1`)
- **Decision & Disposition:** `PRESERVE AS INFRASTRUCTURE`. Migration ceiling locked at `00197`; zero modification of protected RPCs.
- **Implementation Phase:** All Phases.
- **Acceptance Criteria:**
  - 1,514+ automated tests pass with 100% green assertions.
  - Zero regressions in any protected security, financial, or governance gate.

---

### GAP-20: Superadmin Platform Scope & Operational Capabilities
- **Current State:** Superadmin tools were exposed in standard navigation dropdowns, creating confusion with customer accounts.
- **Target State:** Superadmin is strictly a **platform role** housed in `/admin` (Constitution v1.0, Section 33):
  - Whitelist-gated access (`private_security.admin_whitelist`).
  - Operational capabilities: supplier verification ops, taxonomy management, reference-data management, buyer troubleshooter, security investigation.
  - All admin actions logged to `platform_admin_audit_logs`.
  - Admins cannot silently rewrite historical business actions.
- **Decision & Disposition:** `REFACTOR`. Gate `/admin` routes strictly behind server-verified admin credentials.
- **Implementation Phase:** Phase 2.
- **Acceptance Criteria:**
  - Unauthorized users accessing `/admin` receive immediate 403 Forbidden redirect.
  - Platform admin operations are fully logged in audit tables.

---

### GAP-21: CEO / Founder Platform Oversight Cockpit
- **Current State:** Founder cockpit was conflated with operational management tools.
- **Target State:** CEO/Founder is strictly a **platform oversight role** housed in `/founder` (Constitution v1.0, Section 34):
  - Executive visibility: platform health, adoption metrics, procurement GMV, supplier network growth, financial settlement velocity, telemetry anomalies.
  - Oversight visibility confers zero customer authority (cannot sign as RWA President or MSME Primary).
- **Decision & Disposition:** `REFACTOR`. Maintain `/founder` as a read-only executive observability cockpit.
- **Implementation Phase:** Phase 2.
- **Acceptance Criteria:**
  - Founder cockpit renders real-time business and system health charts.
  - Founder role cannot execute operational buyer/supplier transactions without proper customer credentials.

---

### GAP-22: Telemetry Domain Separation (UX vs. Business vs. Security)
- **Current State:** Analytics, business metrics, and security audits were mixed into shared logging streams.
- **Target State:** Strict segregation into **3 Telemetry Domains** (Constitution v1.0, Section 35):
  1. **UX Telemetry:** Screen load times, interaction funnels, mobile viewport telemetry (Zero PII).
  2. **Business Telemetry:** RFQ publication rates, quoting velocity, award conversion, GMV throughput.
  3. **Security / Audit Telemetry:** Privileged role mutations, admin operations, award lock executions (Immutable, tamper-evident).
- **Decision & Disposition:** `REFACTOR`. Segregate telemetry collection in domain service layer.
- **Implementation Phase:** Phase 2 & Phase 3.
- **Acceptance Criteria:**
  - Security audit events are persisted to append-only database tables.
  - UX telemetry streams contain zero customer PII or confidential commercial data.

---

## 4. Master Capability Classification Register

Every capability of the OTP platform is classified into one of seven authoritative operational tiers:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        MASTER CAPABILITY CLASSIFICATION MATRIX                         │
└────────────────────────────────────────────────────────────────────────────────────────┘

 1. CUSTOMER-FACING           ──> Core capabilities used directly by Buyers & Suppliers
 2. INTERNAL WORKFLOW         ──> Organizational governance, approval routing, team mgmt
 3. PLATFORM INFRASTRUCTURE   ──> Shared database schemas, adapters, and background queues
 4. SECURITY CONTROL          ──> Cryptographic identity masking, auth gates, RLS policies
 5. FINANCIAL CONTROL         ──> Double-entry ledger, GST/TDS tax engines, fee mechanics
 6. ADMIN-ONLY                ──> Superadmin operations console & Founder oversight cockpit
 7. RETIRED                   ──> Obsolete or out-of-scope capabilities to be permanently purged
```

### Detailed Capability Inventory:

| Capability Name | Operational Tier | Primary Actors | Canonical Location | Description & Retention Rule |
| :--- | :--- | :--- | :--- | :--- |
| **Multimodal Intake** | `CUSTOMER-FACING` | Individual, RWA, MSME | `/intake` | Voice, text, photo, and form requirement submission. |
| **Identity-Protected Comparison** | `CUSTOMER-FACING` | Buyer, Committee | `/rfq/:id/evaluation` | Sealed quote comparison room across 4 core pillars. |
| **Zero-Login Quick Quoting** | `CUSTOMER-FACING` | Supplier | `/q/:token` | Magic-link quote submission for prospective vendors. |
| **Supplier Award Onboarding** | `CUSTOMER-FACING` | Winning Supplier | `/supplier/award-onboarding` | 2-stage verification gate for GST, PAN, and Bank details. |
| **PO Milestone Tracking** | `CUSTOMER-FACING` | Buyer, Supplier | `/purchase-orders/:id` | 5-point milestone progress and on-site delivery inspection. |
| **Address Book Management** | `CUSTOMER-FACING` | All Buyers | `/profile` | Primary and secondary delivery/registered address book. |
| **Dual-Persona Switching** | `CUSTOMER-FACING` | Dual Buyers/Suppliers| Header Menu | Instant switching between Buyer and Supplier workspaces. |
| **RWA Democratic Voting** | `INTERNAL WORKFLOW` | RWA Committee | `/rfq/:id/committee` | Quorum calculation ($\ge 2$) and COI recusal. |
| **MSME Spend Delegation** | `INTERNAL WORKFLOW` | MSME Primary & Delegates| `/org/members` | Custom spend caps, UTC validity dates, anti-self-approval. |
| **365-Day Role Succession** | `INTERNAL WORKFLOW` | RWA President/Secretary| `/org/members` | Universal role lifecycle and annual officer handover. |
| **Tokenized Team Invitations** | `INTERNAL WORKFLOW` | Org Owners | `/invite/:token` | Single-use SHA-256 invitation acceptance tokens. |
| **Supplier Network Matching** | `PLATFORM INFRASTRUCTURE`| Background Engine | `@otp/services` | Category, distance, and capacity matching algorithm. |
| **WAHA Notification Adapter** | `PLATFORM INFRASTRUCTURE`| Messaging Engine | `messaging-inbound` | Stateful WhatsApp notification dispatch and delivery tracking. |
| **PBKDF2/AES Backup Pipeline** | `PLATFORM INFRASTRUCTURE`| System Ops | `backup-prod-db.ps1` | Encrypted automated disaster recovery database snapshots. |
| **Identity Masked Views** | `SECURITY CONTROL` | PostgreSQL Database | `rfq_quotes_identity_protected` | Server-side cryptographic masking of supplier identities. |
| **Domain Memory Guards** | `SECURITY CONTROL` | Domain Runtime | `assertIdentityProtectedSafe` | In-memory contact leak detection thrown on payload violation. |
| **Superadmin Immutability** | `SECURITY CONTROL` | Database Trigger | `trg_protect_platform_admin` | Hard database blocks against unauthorized admin escalation. |
| **Bilateral GST Tax Engine** | `FINANCIAL CONTROL` | Domain Calculator | `place-of-supply.ts` | Statutory CGST/SGST vs IGST place-of-supply tax splitting. |
| **TDS Withholding Calculator** | `FINANCIAL CONTROL` | Domain Calculator | `tds-calculator.ts` | Income Tax Section 194C / 194Q compliance. |
| **Double-Entry Financial Ledger**| `FINANCIAL CONTROL` | PostgreSQL Database | `financial_ledger_entries` | GAAP/IndAS balanced debits and credits ledger. |
| **Platform Fee & Reward Ledger**| `FINANCIAL CONTROL` | Accounting Service | `accounting-service.ts` | Reconciles 0.50% supplier fee and 0.10% buyer reward. |
| **Superadmin Ops Console** | `ADMIN-ONLY` | Superadmin | `/admin` | Supplier verification, taxonomy management, troubleshooter. |
| **CEO/Founder Cockpit** | `ADMIN-ONLY` | Founder / CEO | `/founder` | Executive platform health and business funnel telemetry. |
| **Enterprise Registration** | `RETIRED` | None | N/A | **PURGED:** Enterprise buyer signup option permanently deleted. |
| **Enterprise Pricing Card** | `RETIRED` | None | N/A | **PURGED:** ₹4,999/mo Enterprise tier removed from pricing. |
| **Hardcoded Pilot Cockpits** | `RETIRED` | None | N/A | **PURGED:** `getPilotByRfqId()` fallback removed from live views. |
| **Orphaned Page Files** | `RETIRED` | None | N/A | **DELETED:** `DashboardPage.tsx`, `SupplierDashboardPage.tsx`, etc. |

---
*End of Product Gap Closure Register (R1)*
