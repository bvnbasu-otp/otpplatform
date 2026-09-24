# OTP Reconstruction Contract (R1)
**Document Identifier:** `OTP-RECON-R1-CONTRACT`  
**Version:** 1.0 (Authoritative R1 Release)  
**Status:** SUPREME ARCHITECTURAL CONTRACT & IMPLEMENTATION SPECIFICATION  
**Working Root:** `G:/My Drive/otp`  
**Ceiling Migration:** `00197` (Universal Org Role Lifecycle, Succession & Audit)  
**Authoritative Hierarchy:** OTP Product Constitution v1.0 (Supreme) $\rightarrow$ R1 Reconstruction Contract (Operational Binding) $\rightarrow$ Domain Specifications  
**Operating Invariant:** *MODE: DOCUMENTATION / ARCHITECTURE DECISION ONLY. An implementation agent must NEVER silently invent product behavior to resolve documentation gaps or code contradictions (Constitution v1.0, Section 43).*

---

## 1. Preamble & Constitutional Binding

This **Reconstruction Contract** is the binding architectural specification governing the reconstruction and long-term maintenance of the **OTP (Open Trade & Procurement)** platform. Every engineering implementation, refactoring step, test assertion, and deployment procedure in subsequent phases MUST strictly adhere to the 20 contractual areas defined herein.

No implementation agent, engineer, or automated system is permitted to introduce behaviors, routes, database mutations, or UI components that violate the terms of this contract.

---

## 2. The 20 Authoritative Contractual Areas

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        MASTER RECONSTRUCTION CONTRACT TOPOLOGY                         │
└────────────────────────────────────────────────────────────────────────────────────────┘

  1. Product Identity & Non-Negotiable North Star
  2. Exact Product Scope (3 Buyer Contexts + 1 Participant + 2 Platform Roles)
  3. Explicit Enterprise Exclusion Contract
  4. The 13-Stage Canonical Authorization Model
  5. The 4-Action Customer Journey (TELL -> REVIEW -> DECIDE -> TRACK)
  6. The 7-Stage Procurement State Machine
  7. Governance, Quorum & Voting Rules
  8. 2-Stage Supplier Lifecycle & Fail-Closed Gate
  9. Unified Supplier Network Engine
 10. Canonical Taxonomy Layer & Reference Data
 11. First-Class Address Architecture & Snapshotting
 12. Truthful Notifications & Provenance
 13. Financial Architecture & Platform Fee Mechanics
 14. Cryptographic Supplier Identity Protection
 15. UX, AppShell & Mobile Containment Standards
 16. Platform Operational & Oversight Roles
 17. 3-Domain Telemetry Model
 18. 4-Tier Environment & Demo Isolation
 19. Preservation of Protected Backend Assets (PA-01 through PA-10)
 20. Reconstruction Execution Sequence & Rules
```

---

### Area 1: Product Identity & Non-Negotiable North Star
- **Core Principle:**
  > **"OTP does the procurement work. The customer makes the decision."** *(Constitution v1.0, Section 1 & 42)*
- **Architectural Rules:**
  1. The platform carries 100% of the procurement complexity (orchestration, supplier sourcing, sealed bidding, compliance verification, tax calculation, and double-entry reconciliation).
  2. The customer is presented with simple, outcome-driven interfaces requiring zero procurement expertise.
  3. Complexity MUST reside in backend services, domain models, and PostgreSQL RPCs—never exposed as cognitive overhead in the UI.

---

### Area 2: Exact Product Scope
OTP supports exactly **three customer buyer contexts**, **one marketplace participant**, and **two platform governance roles**:

```text
  ┌────────────────────────────────────────────────────────────────────────────┐
  │                            PERMITTED PERSONAS                              │
  ├────────────────────────┬─────────────────────────┬─────────────────────────┤
  │ 1. Individual Buyer    │ 2. RWA Buyer            │ 3. MSME Buyer           │
  ├────────────────────────┼─────────────────────────┼─────────────────────────┤
  │ 4. Supplier Participant│ 5. Superadmin (Platform)│ 6. CEO/Founder (Platform│
  └────────────────────────┴─────────────────────────┴─────────────────────────┘
```

1. **Individual Buyer:** Natural person purchasing for personal use. Self-contained, zero committee members, zero delegates, 1-click self-approval.
2. **RWA Buyer:** Residential community / housing society procuring shared assets. Governed by 7 canonical committee roles, 365-day term succession, democratic voting, and quorum ($\ge 2$).
3. **MSME Buyer:** Commercial business entity. Primary owner authority with granular, time-bound spend delegation proxies and anti-self-approval rules.
4. **Supplier Participant:** Commercial vendor submitting sealed quotes via zero-login magic links (`/q/:token`) and passing 2-stage verification before PO issuance.
5. **Superadmin:** Platform operational administrator (`/admin`) managing supplier verification, taxonomy, and system health behind immutable security whitelist.
6. **CEO / Founder:** Platform oversight executive (`/founder`) viewing business and system telemetry without customer transaction signing authority.

---

### Area 3: Explicit Enterprise Exclusion Contract
- **Contractual Invariant:** Enterprise buyer persona is **EXPLICITLY OUT OF PRODUCT SCOPE** *(Constitution v1.0, Section 2 & 40)*.
- **Rules of Exclusion:**
  1. No Enterprise registration options, onboarding flows, buyer dashboards, or pricing tiers (₹4,999/mo tier is permanently purged).
  2. No corporate SAML/SSO or multi-branch hierarchy configurations in customer UI.
  3. **Shared Infrastructure Preservation Rule:** Multi-tier threshold routing and delegation proxy engines originally labeled "Enterprise" are critical shared infrastructure. They MUST NOT be deleted; they are refactored to `SpendApprovalGovernanceService` to serve MSME delegation and RWA thresholds.

---

### Area 4: The 13-Stage Canonical Authorization Model
Authorization in OTP is computed across a **13-stage deterministic context chain**:

$$\text{Person} \rightarrow \text{Context} \rightarrow \text{Org} \rightarrow \text{Eligibility} \rightarrow \text{Membership} \rightarrow \text{Role} \rightarrow \text{Responsibility} \rightarrow \text{Delegation} \rightarrow \text{Authority} \rightarrow \text{Transaction} \rightarrow \text{Scope} \rightarrow \text{Cap} \rightarrow \text{Effective Date}$$

- **Multi-Context Independence:** A biological Person may hold multiple distinct contexts (e.g. Individual Buyer + RWA Secretary + MSME Primary). Authority held in one context NEVER confers authority in another context.
- **Server-Side Enforcement:** Authorization is enforced at the database (RLS/RPC) and service layers; client-side UI permissions are purely cosmetic and non-authoritative.

---

### Area 5: The 4-Action Customer Journey
The end-to-end buyer procurement lifecycle is structured into four intuitive, outcome-oriented customer actions:

```text
  [1. TELL]   ──> Customer speaks, types, or uploads requirement (Intake <60s)
  [2. REVIEW] ──> Customer evaluates sealed, identity-protected quotes across 4 pillars
  [3. DECIDE] ──> Customer votes (RWA Quorum >= 2) or approves spend (MSME / Individual)
  [4. TRACK]  ──> Customer tracks milestones, verifies site delivery & settles PO
```

---

### Area 6: The 7-Stage Procurement State Machine
The golden procurement lifecycle progresses through exactly **7 canonical stages** plus one explicit exception state:

```text
  ┌────────┐     ┌─────────┐     ┌────────────┐     ┌─────────┐
  │ DRAFT  │ ──> │ QUOTING │ ──> │ EVALUATING │ ──> │ AWARDED │
  └────────┘     └─────────┘     └────────────┘     └─────────┘
                                                         │
  ┌─────────┐     ┌──────────┐     ┌───────────┐         │
  │ SETTLED │ <── │ INVOICED │ <── │ PO ISSUED │ <───────┘
  └─────────┘     └──────────┘     └───────────┘

  [EXCEPTION STATE]
  └── STALLED (Triggered by quote expiry, non-responsive supplier, or governance dispute)
```

Granular backend sub-events (e.g. `CLARIFICATION_OPEN`, `ONBOARDING_PENDING`, `DISPATCHED`) are encapsulated within these 7 primary milestones.

---

### Area 7: Governance, Quorum & Voting Rules
- **Democratic RWA Voting:**
  1. Each authorized committee member casts exactly 1 vote per RFQ via `submit_committee_vote_atomic()`.
  2. Conflict of Interest (COI) declaration is mandatory before vote submission. Affirmative COI recuses the voter and zeros out their voting weight.
  3. Quorum ($\ge 2$ unconflicted votes) is mathematically verified before award lock.
- **MSME Spend Governance:**
  1. Primary owner has 1-click approval authority for any transaction value.
  2. Delegated members can approve transactions up to their configured `spend_cap_amount`.
  3. Anti-self-approval rule prevents the creator of an RFQ from approving their own delegated request.
- **Decision Receipts:** Every approved award generates a cryptographically signed, immutable `DecisionReceipt` containing voter names, timestamps, and award rationale.

---

### Area 8: 2-Stage Supplier Lifecycle & Fail-Closed Gate
- **Stage 1 — Prospective Quoting:** Prospective suppliers receive tokenized invitations and submit sealed quotations via zero-login magic links (`/q/:token`) without upfront account creation friction.
- **Stage 2 — Award Onboarding Gate:** When a buyer selects a winning quote, `lock_and_reveal_award_atomic` checks verification status:
  - If **Verified:** Immediate mutual identity reveal and PO generation.
  - If **Unverified:** Locks award, halts identity reveal, and routes supplier to `/supplier/award-onboarding/:token` for mandatory GSTIN, PAN, and Bank verification.
- **Fail-Closed Rule:** Mutual reveal and PO issuance are blocked until verification is confirmed.

---

### Area 9: Unified Supplier Network Engine
The Supplier Network Engine centrally manages:
1. **Discovery & Sources:** Multi-source supplier ingestion from Verified Marketplace Index (VMI), Direct Network Suppliers, ONDC Network Providers, and BNI Partner Networks.
2. **Intelligent Matching:** Multi-parameter ranking algorithm considering category code match, geo-radius proximity ($\le 25\text{km}$ default), performance rating, and declared capacity.
3. **Identity & Invitation:** SHA-256 tokenized quick-quote links (`/q/:token`).
4. **Deduplication:** PAN/GSTIN and mobile number deduplication to prevent profile fragmentation.
5. **Superadmin Sourcing Console:** Operational management dashboard at `/admin?tab=supplier_network`.

---

### Area 10: Canonical Taxonomy Layer & Reference Data
1. **3-Level Hierarchical Model:** Category $\rightarrow$ Subcategory $\rightarrow$ Attributes.
2. **Database Single Source of Truth:** Intake forms and supplier capabilities bind directly to `public.taxonomy_categories` and `public.taxonomy_subcategories` via Supabase API.
3. **Zero Free-Text Divergence:** Free-text category creation is strictly prohibited; rule-based NLP parser maps natural language prompts to canonical taxonomy keys.
4. **Controlled Lifecycle:** Taxonomy additions and deprecations are restricted to Superadmin and tracked in audit logs.

---

### Area 11: First-Class Address Architecture & Snapshotting
1. **Normalized Table:** All addresses reside in `public.buyer_addresses` with `is_primary`, `address_type` (`'DELIVERY'`, `'REGISTERED'`), `profile_id`, and `organization_id`.
2. **Intake Auto-Inheritance:** Requirement intake automatically pre-selects the buyer's primary delivery address.
3. **Immutable Transaction Snapshots:** When an RFQ is published and when a PO is issued, complete address objects are frozen as immutable JSONB snapshots (`delivery_address_snapshot`, `billing_address_snapshot`).
4. **No Historical Mutation:** Subsequent edits or deletions of profile addresses NEVER alter historical contracts or tax invoices.

---

### Area 12: Truthful Notifications & Provenance
1. **8-State Notification Lifecycle:**
   $$\text{CREATED} \rightarrow \text{DISPATCH\_REQUESTED} \rightarrow \text{ACCEPTED\_BY\_PROVIDER} \rightarrow \text{DELIVERED} \rightarrow \text{OPENED} \rightarrow \text{CLAIMED} \rightarrow \text{FAILED} \rightarrow \text{UNAVAILABLE}$$
2. **Cryptographic Delivery Evidence:** The UI displays "Dispatch Pending" until the messaging gateway (WAHA / Twilio) returns an asynchronous delivery webhook receipt.
3. **Zero False Claims:** OTP never claims notification delivery occurred without verifiable provider confirmation.

---

### Area 13: Financial Architecture & Platform Fee Mechanics
1. **Financial Domain Segregation:**
   - **Procurement GMV:** Gross transaction value transacted between buyer and supplier.
   - **OTP Platform Fee:** 0.50% platform fee collected from suppliers on completed transactions.
   - **Buyer Reward Wallet:** 0.10% cashback credited to buyer wallet upon milestone settlement.
2. **Statutory Tax Engines:**
   - **Bilateral GST:** Computes CGST + SGST (intra-state) vs IGST (inter-state) based on Supplier GSTIN State vs Delivery Pincode State.
   - **TDS Withholding:** Section 194C (1% Individual, 2% Company) and Section 194Q (0.1% on transactions $>₹50\text{L}$).
3. **GAAP Double-Entry Accounting:** Every financial movement posts balanced journal entries in `public.financial_ledger_entries` ($\sum \text{Debits} = \sum \text{Credits}$).

---

### Area 14: Cryptographic Supplier Identity Protection
1. **Sealed Anonymity Boundary:** Before award lock, buyers view strictly masked pseudonyms (`Supplier #01`), masked pricing structures, and anonymized badges.
2. **Server-Side Masked Views:** All evaluation data is fetched via `public.rfq_quotes_identity_protected` or `get_identity_protected_quotes_atomic()`. Direct queries on raw `rfq_quotes` and `suppliers` tables are blocked via RLS.
3. **In-Memory Domain Memory Guards:** `assertIdentityProtectedPayloadSafe()` inspects JSON payloads at the service layer and throws hard runtime errors on any detected phone, email, or GSTIN patterns.
4. **Mutual Reveal:** Full legal identities and contact information are disclosed mutually and simultaneously *only* after award locking and verification gate clearance.

---

### Area 15: UX, AppShell & Mobile Containment Standards
1. **Mobile-First Invariant:** All customer-facing screens must render flawlessly on mobile viewports ($360\text{px} - 414\text{px}$).
2. **Container Constraints:** Main content area constrained to `max-w-md mx-auto` on mobile, expanding fluidly on desktop.
3. **Safe-Area Insets:** Layout container enforces bottom safe-area padding:
   ```css
   padding-bottom: calc(6.5rem + env(safe-area-inset-bottom, 0px));
   ```
4. **Zero Obscuration:** Floating action footers (`MobileActionFooter`) must NEVER obscure form fields or scrollable content.
5. **Touch Standards:** Minimum 44px tap targets for all interactive elements; zero horizontal scrollbars.

---

### Area 16: Platform Operational & Oversight Roles
1. **Superadmin Console (`/admin`):**
   - Platform operational role restricted to `private_security.admin_whitelist`.
   - Capabilities: supplier verification ops, taxonomy curation, integration monitoring, buyer troubleshooter.
   - All actions audited; Superadmin cannot silently rewrite customer contracts.
2. **CEO / Founder Cockpit (`/founder`):**
   - Platform oversight role providing real-time visibility into GMV velocity, conversion funnels, adoption metrics, and system health.
   - Oversight access confers zero customer signing or voting authority.

---

### Area 17: 3-Domain Telemetry Model
Telemetry collection is strictly partitioned into three independent streams:
1. **UX Telemetry:** User journey drop-offs, screen performance, and mobile viewport metrics. Strictly sanitized; contains zero PII.
2. **Business Telemetry:** RFQ publication rates, quote response times, award conversion velocity, and GMV throughput.
3. **Security / Audit Telemetry:** Privileged role mutations, admin access, award lock executions, and delegation assignments. Stored in append-only, tamper-evident database ledgers.

---

### Area 18: 4-Tier Environment & Demo Isolation
1. **Tier 1 (Router Isolation):** Demo providers (`DemoModeProvider`, `PilotProvider`) mounted strictly under `/demo` (`DemoDashboardPage.tsx`).
2. **Tier 2 (Metadata Hygiene):** Zero hardcoded pilot fallbacks ("10 HP Borewell Motor") in customer components; missing data renders skeleton loaders.
3. **Tier 3 (Action Guards):** "Simulate Quotes" and test generators relocated to Superadmin Console; RPC guards block execution on live production organizations.
4. **Tier 4 (Data Preservation):** Migration 00125 and 00184 immutability triggers protect real customer profiles during test purges.

---

### Area 19: Preservation of Protected Backend Assets (PA-01 through PA-10)
The 10 Protected Backend Assets cataloged in Document F7 are locked against arbitrary mutation:
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

---

### Area 20: Reconstruction Execution Sequence & Rules
Reconstruction follows the constitutional mandate:
> **"Reuse before rebuild. Repair before replace. Extend before duplicate."** *(Constitution v1.0, Section 44)*

Execution proceeds strictly in 4 sequential phases:
1. **Phase 1: Canonical Boundary Enforcement:** Purge demo providers from root, establish 18 canonical routes with 301 redirects, remove Enterprise cards from pricing and signup.
2. **Phase 2: Frontend Consolidation & Mobile AppShell:** Unify intake into `UnifiedThreeTierIntake`, clean evaluation cockpit of hardcoded fallbacks, implement `MobileActionFooter` with safe-area bottom padding.
3. **Phase 3: Service Refactoring & Shared Governance:** Refactor `EnterpriseApprovalMatrixService` $\rightarrow$ `SpendApprovalGovernanceService`, connect MSME delegation and RWA succession to Migration 00197 RPCs.
4. **Phase 4: Verification & Golden Certification:** Execute 1,514+ automated tests, validate all 22 failure paths in `failure-paths-regression.test.ts`, confirm zero prohibited vocabulary violations.

---
*End of Reconstruction Contract (R1)*
