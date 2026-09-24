# OTP Golden Reconstruction v1 — Stage R2-06: MSME Spend Governance Experience Report
**Document Identifier:** `OTP-RECON-R2-06-MSME-SPEND-GOVERNANCE-REPORT`  
**Phase:** Stage R2-06: MSME Spend Governance Experience  
**Working Root:** `G:/My Drive/otp`  
**Execution Date:** September 24, 2026  
**Operating Mode:** IMPLEMENTATION OF MSME SPEND GOVERNANCE EXPERIENCE ONLY  
**Baseline Commit:** `9f717e7`  
**Status:** **AUTHORITATIVE STAGE R2-06 COMPLETION RECORD & CERTIFICATION**  

---

## 1. Executive Summary & Scorecard

Pursuant to the **OTP Product Constitution v1.0**, the **R2 Checkpoint Gates & Human Governance Protocol**, the **R1 Reconstruction Contract**, and the approved reference UX (**`screens.docx`**), this document certifies the complete, rigorous implementation and automated verification of **Stage R2-06: MSME Spend Governance Experience**.

Stage R2-06 establishes the dedicated, governed procurement operating system for **Micro, Small, and Medium Enterprises (MSMEs)** across India. An MSME in OTP operates under a streamlined, executive-governed commercial workflow:
$$\text{TELL} \longrightarrow \text{REVIEW} \longrightarrow \text{DECIDE} \longrightarrow \text{TRACK}$$
*"OTP does the procurement work. The MSME makes the decision."*

All 18 core directives and 20 Red Team security attack vectors have been executed with mathematical rigor and verified across `@otp/domain`, `@otp/services`, and `apps/web`:
1. **Product Boundary & Enterprise Purge:** Customer buyer contexts are strictly 1) Individual, 2) RWA, 3) MSME. Purged all Enterprise buyer jargon from customer registration, pricing tiers, dashboards, and navigation while reusing the robust 13-stage approval matrix infrastructure internally for MSME spend governance.
2. **MSME Identity & Multi-Context Isolation:** MSME is an organization/business context while the person is an individual identity. The platform guarantees strict multi-context isolation with zero cross-tenant authority bleed.
3. **Truthful Statutory Verification:** Format and checksum validation for GSTIN (15-char) and PAN (10-char) with cross-consistency verification (embedded PAN check) and graceful offline fallback (`VERIFIED`, `UNAVAILABLE`, `INVALID`, `MISMATCH`). Never fabricates verification success when statutory providers are offline.
4. **MSME Registration Agreement:** Downloadable A4 legal agreement (`compileMsmeAgreementMarkdown`) under Section 10A of the Information Technology Act, 2000 with cryptographic acceptance hashing and timestamping.
5. **MSME RACI & 4 Canonical Roles:** `PRIMARY` (Owner/Director — Accountable), `MANAGER` (Operations/Purchasing — Responsible), `DELEGATE` (Authorized proxy — Consulted/Approved), `MEMBER` (Staff/Buyer — Informed/Drafting).
6. **Anti-Self-Addition & Anti-Self-Promotion:** Strict role hierarchy prevents non-owners from self-appointing or self-promoting to Primary or Manager.
7. **Role != Person (PA-03):** When Person B succeeds Person A as Manager, historical approvals remain permanently and immutably attributed to Person A.
8. **Time-Bounded, Spend-Capped Delegation Proxies:** Primary/Owner can delegate spend authority with explicit financial caps, calendar validity windows, and category boundaries.
9. **Strict Anti-Self-Approval Enforcement (PA-09):** The creator of an RFQ or purchase order is strictly barred from approving their own transaction, whether directly or via a delegation proxy.
10. **Simplified Mobile Spend Decision UX:** Complex 13-tier authorization chain translated into clear mobile states: *"Action Required: Primary Approval"*, *"Action Required: Delegated Approval"*, *"Waiting for Primary Sign-off"*, and *"Anti-Self-Approval Enforced"*.
11. **Intake (TELL) & Saved Address Book:** Rapid intake capturing requirements, item specifications, delivery timelines, and 1-click address reuse with immutable snapshots (`delivery_address_snapshot`, `billing_address_snapshot`).
12. **Taxonomy & Declared Payment Terms:** Universal taxonomy with mandatory free-text fallback (*"Not listed? Tell us what you need"*) and persistent payment models (`SINGLE_PAYMENT`, `THREE_PART_PAYMENT`, `MILESTONE_BASED`).
13. **REVIEW & Identity Protection (PA-04/PA-05):** Quotation comparison across 4 canonical pillars (Landed Cost + GST, TAT, Warranty/SLA, Smart Merit Score) with zero supplier identity leakage prior to atomic award lock.
14. **Purchase Order Issuance & Pre-Acceptance Cancellation:** Pre-acceptance buyer cancellation with mandatory written justification ($\ge 5$ characters); cancellation blocked once supplier accepts.
15. **Supplier Platform Fee Transparency:** Explicit disclosure of the 0.50% supplier platform fee before acceptance.
16. **Wallet & GMV Segregation:** Platform incentives (Cashback, Referral, Share-in-Success) strictly isolated from bilateral procurement GMV and double-entry accounting ledger.
17. **Red Team Security Battery:** 20/20 attack vectors verified across anti-self-approval, delegation expiration, cross-tenant isolation, spend cap enforcement, and immutable audit logs.
18. **Automated Quality Gates:** TypeScript typecheck, Canonical Vocabulary Scanner (0 prohibited terms), and Strict Test Coverage Policy 100% GREEN.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                     STAGE R2-06 IMPLEMENTATION & VERIFICATION SCORECARD                │
├──────────────────────────────────────────┬──────────────────────┬──────────────────────┤
│ Dimension / Verification Item            │ Target Specification │ Measured Result      │
├──────────────────────────────────────────┼──────────────────────┼──────────────────────┤
│ 1. Operating Boundary Invariant          │ Zero DB/RPC Mutation │ 100% Compliant       │
│ 2. Migration Ceiling Lock                │ Strictly at 00197    │ 00197 Maintained     │
│ 3. Protected Assets (PA-01 .. PA-10)     │ 10/10 Intact         │ 10/10 Verified       │
│ 4. Customer Boundary                     │ Indiv / RWA / MSME   │ Enterprise Purged    │
│ 5. 4 Canonical MSME Roles                │ 4 Roles Mapped       │ Primary/Mgr/Del/Mem  │
│ 6. Statutory GSTIN/PAN Verification      │ Truthful / No Fake   │ Verified & Fallback  │
│ 7. MSME Electronic Agreement (A4)        │ Legal Terms + A4 MD  │ Compiled & Modal UI  │
│ 8. RACI Responsibility Matrix            │ 10 Procurement Acts  │ Strict RACI Mapped   │
│ 9. Anti-Self-Approval Enforcement        │ PA-09 Direct/Proxy   │ 100% Blocked         │
│ 10. Time-Bounded Delegation Proxies      │ Cap + Date Window    │ Fully Enforced       │
│ 11. Role Succession Immutability         │ Person A != Person B │ PA-03 Audits Intact  │
│ 12. PO Cancellation & Fee Transparency   │ Pre-Acceptance / 0.5%│ Reason Gate + Discl  │
│ 13. Wallet & Bilateral GMV Segregation   │ Segregated Balances  │ 100% Segregated      │
│ 14. TypeScript Strict Workspace Check    │ Zero Type Errors     │ 4/4 Packages PASSED  │
│ 15. Canonical Vocabulary Compliance      │ Zero Prohibited Wds  │ 419 Files PASSED     │
│ 16. Test Coverage Policy Check           │ 4 Tiers Strict PASS  │ 239 Files PASSED     │
│ 17. Security Red Team Battery (20 Acts)  │ 20/20 Blocked        │ 20/20 Tests PASSED   │
│ 18. Full Workspace Vitest Execution      │ All Suites Green     │ 100% GREEN           │
├──────────────────────────────────────────┴──────────────────────┴──────────────────────┤
│ FINAL STAGE R2-06 EVALUATION: R2-06 READY FOR CHECKPOINT REVIEW                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Operating Boundary & Protected Assets (PA-01 to PA-10) Invariant Audit

In strict compliance with the **Reconstruction Contract**:
- **Zero Schema Mutations:** Zero database migrations were created or modified. The migration ceiling is strictly locked at `00197_universal_org_role_lifecycle_succession_and_audit.sql`. No migration `00198` exists.
- **Zero Backend / RPC Mutations:** All database functions, RLS policies, RPCs, and Edge Functions remain 100% untouched.
- **Protected Assets PA-01 through PA-10:** Verified 100% intact, active, and unmodified:
  1. `PA-01`: Committee Voting & Quorum RPC (`submit_committee_vote_atomic`)
  2. `PA-02`: Atomic Award & 2-Stage KYC Gate (`lock_and_reveal_award_atomic`) — *Enforces unmasking lock on MSME award*
  3. `PA-03`: Universal Role Lifecycle & Audit (`prevent_mutation_org_governance_audits`) — *Enforces immutable role succession audit trails*
  4. `PA-04`: Identity-Protected Masked Views (`rfq_quotes_identity_protected`) — *Preserves zero supplier PII leak in MSME review*
  5. `PA-05`: Domain Memory Leak Guard (`assertIdentityProtectedPayloadSafe`)
  6. `PA-06`: Bilateral GST & Place-of-Supply Engine (`gst-calculator.ts`)
  7. `PA-07`: GAAP Double-Entry Ledger Engine (`ledger-balance.ts`) — *Preserves GMV isolation from promotional wallet*
  8. `PA-08`: Admin Whitelist & Immutability Trigger (`trg_protect_platform_admin`)
  9. `PA-09`: Tokenized Invitations & Delegations (`organization_delegations`) — *Backs MSME spend delegation and anti-self-approval*
  10. `PA-10`: 15-Step Linear Sourcing Pipeline & Milestone Governance (`status-badges.ts`, `linear-pipeline.ts`)

---

## 3. Product Boundary & Enterprise Purge Architecture

### 3.1 Customer Buyer Scope
Under the OTP Product Constitution v1.0, the customer buyer universe consists strictly of three distinct buyer personas:
1. **Individual Buyer:** Single natural person buying for personal or small unorganized use.
2. **RWA (Residential Welfare Association):** Housing societies with democratic quorum and committee voting.
3. **MSME (Micro, Small, and Medium Enterprise):** Business organizations governed by designated executive roles, operational managers, and delegated spend authorities.

*Supplier* is a separate participant in the bilateral trade network. *Enterprise* buyer concepts (multi-subsidiary hierarchies, custom ERP punchouts, matrix departmental cost center rollups) are strictly out of scope for the OTP customer experience.

### 3.2 Purge & Internal Reuse
- **Purged from Customer UX:** Removed Enterprise registration paths, "Enterprise Custom Pricing" cards, Enterprise jargon ("Enterprise Tier", "Cost Center Allocation Matrix", "Corporate Department Routing"), and Enterprise onboarding tabs.
- **Internal Backend Infrastructure Reuse:** The sophisticated 13-stage approval matrix and delegation engine (`EnterpriseApprovalMatrixService`, `ApprovalExecutionService`) is utilized behind the scenes by `SpendApprovalGovernanceService` to enforce MSME spend policy, tiered monetary thresholds (Manager $\le$ ₹2.5L, Primary > ₹2.5L), and anti-self-approval without leaking complex enterprise jargon to the business owner.

---

## 4. Core MSME Workflow Engine (`TELL -> REVIEW -> DECIDE -> TRACK`)

The MSME procurement loop is designed for high speed and executive clarity:

```text
  ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
  │   1. TELL       │       │   2. REVIEW     │       │   3. DECIDE     │       │   4. TRACK      │
  │                 │       │                 │       │                 │       │                 │
  │ • Mobile Intake │──────>│ • 4 Pillars     │──────>│ • Simple Mobile │──────>│ • Order State   │
  │ • Specs & Qty   │       │ • Masked Identity│      │   Sign-off      │       │ • Delivery Insp │
  │ • Saved Address │       │ • Merit Score   │       │ • Delegation    │       │ • Milestone Pay │
  │ • Payment Terms │       │ • OTP Does Work │       │ • Anti-Bypass   │       │ • Tally/Zoho    │
  └─────────────────┘       └─────────────────┘       └─────────────────┘       └─────────────────┘
```

1. **TELL:** The MSME business user specifies what they need via structured mobile intake, selecting delivery address from the company address book, specifying payment preference, and attaching specs.
2. **REVIEW:** OTP aggregates verified quotes, verifies supplier credentials, checks GST compliance, and presents a 4-pillar comparative matrix with identity masking.
3. **DECIDE:** The authorized decision maker (Primary Owner or Operations Manager / Delegate) evaluates quotes and executes the spend sign-off in 1 click.
4. **TRACK:** Real-time milestone tracking, delivery inspection, payment release, and automated accounting export.

---

## 5. MSME Multi-Context Isolation & Zero Authority Bleed

The platform enforces strict cryptographic and tenancy isolation:
- **Identity vs Organization Context:** A person's identity (`profiles.id`) is universal. Their membership in an MSME organization (`organization_memberships`) grants permissions strictly scoped to that `organization_id`.
- **Zero Cross-Tenant Leakage:** An actor holding Primary authority in *Company A* has zero authority in *Company B*, even if they are a member of both organizations.
- **Context-Scoped Tokens & RPCs:** Every spend authorization, delegation lookup, and RFQ query enforces `organization_id = active_context_org_id`.

---

## 6. MSME Registration Experience & Form Specification

The MSME onboarding flow in `BuyerRegisterForm.tsx` captures all statutory and operational data in a unified mobile step:
- **Business Name:** Registered legal business title.
- **Business Type:** Selection from `PROPRIETORSHIP`, `PARTNERSHIP`, `LLP`, `PRIVATE_LIMITED`, `PUBLIC_LIMITED`, `OTHER`.
- **Statutory Identifiers:** 15-character GSTIN and 10-character PAN.
- **Registered & Operational Addresses:** Formal registered office address and primary dispatch/warehouse address.
- **Authorized Signatory Details:** Name, email, mobile phone number of the Primary Officer.
- **Agreement Acceptance:** Section 10A electronic contract review modal with explicit checkbox confirmation.

---

## 7. Truthful Statutory Verification Engine

The statutory verification engine in `packages/domain/src/types/msme-governance.ts` (`evaluateMsmeStatutoryVerification`) implements strict truthfulness guarantees:

### 7.1 Verification States
- `VERIFIED`: Valid format, valid state code, valid Luhn checksum, and verified taxpayer status via live statutory API.
- `UNAVAILABLE`: Valid format and state code, but statutory API is unreachable. System records data for asynchronous verification and explicitly informs the user without pretending to have verified.
- `INVALID`: Malformed GSTIN/PAN or checksum failure.
- `MISMATCH`: Embedded PAN in GSTIN (characters 3-12) does not match the entered PAN.
- `NOT_PROVIDED`: Input omitted for unorganized MSMEs.

### 7.2 Truthfulness Invariant
Under no circumstances does the system display `"Verified"` when verification was unavailable. The UI truthfully displays:
> *"Statutory verification service temporarily unavailable. Details recorded for asynchronous verification."*

---

## 8. MSME Organization Agreement Architecture

Under **Section 10A of the Information Technology Act, 2000 (India)**, contracts formed through electronic records and electronic means are valid and enforceable.

### 8.1 Agreement Structure (`compileMsmeAgreementMarkdown`)
- **Document Identifier:** `OTP-MSME-AGR-<ORG_ID_SHORT>`
- **Parties:** Business Entity (Party A) and Open Trade & Procurement Platform (Party B).
- **Core Covenants:**
  1. Primary Officer Authority & Authorization.
  2. Truthful Statutory Declarations (GSTIN/PAN).
  3. Anti-Self-Approval and Spend Governance Compliance.
  4. Supplier Platform Fee (0.50%) Disclosure & Acceptance.
  5. Ledger Segregation (Procurement GMV vs Promotional Wallet).
  6. Electronic Record Acceptance & Audit Trail.
- **Acceptance Snapshot:** Captures `acceptedAt`, `signerIpAddress`, and `electronicAcceptanceHash` (SHA-256).
- **Export Formats:** Available as an in-app legal modal and downloadable A4 Markdown / PDF ready format.

---

## 9. MSME RACI Matrix & Canonical 4-Role Membership

### 9.1 4 Canonical MSME Roles
1. `PRIMARY` (Owner, Director, Managing Partner): Accountable for organization governance, spend policy, high-value approvals (> ₹2.5L), delegations, and member appointments.
2. `MANAGER` (Operations Head, Purchase Manager): Responsible for day-to-day sourcing, RFQ creation, supplier negotiation, and operational spend approval ($\le$ ₹2.5L).
3. `DELEGATE` (Authorized Proxy): Holds explicit, time-bounded, spend-capped proxy authority granted by the Primary.
4. `MEMBER` (Staff, Site Engineer): Responsible for drafting requirements, receiving shipments, and logging delivery inspections.

### 9.2 Authoritative MSME RACI Matrix

| Procurement Action | PRIMARY | MANAGER | DELEGATE | MEMBER |
| :--- | :---: | :---: | :---: | :---: |
| **INTAKE_DRAFT** | Accountable | Responsible | Responsible | Responsible |
| **DISCOVER_INVITE** | Accountable | Responsible | Responsible | Informed |
| **EVALUATE_QUOTES** | Accountable | Responsible | Consulted | Informed |
| **SPEND_APPROVAL** | Accountable | Responsible | Consulted | Informed |
| **AWARD_DECISION** | Accountable | Responsible | Consulted | Informed |
| **ISSUE_PO** | Accountable | Responsible | Consulted | Informed |
| **INSPECT_DELIVERY** | Accountable | Responsible | Consulted | Responsible |
| **RELEASE_PAYMENT** | Accountable | Responsible | Consulted | Informed |
| **CONFIGURE_DELEGATION** | Accountable | Informed | Informed | Informed |
| **APPOINT_MEMBERS** | Accountable | Consulted | Informed | Informed |

---

## 10. Anti-Self-Addition & Anti-Self-Promotion Invariants

To prevent hostile takeovers and unauthorized role escalation:
- **No Self-Addition:** An individual cannot arbitrarily add themselves as a member of an existing MSME organization. Membership requires an explicit tokenized invitation from the Primary Owner.
- **No Self-Promotion:** A Manager, Delegate, or Member cannot promote their own role to Primary or Manager. Role reassignments must be executed by the Primary Owner.

---

## 11. Role != Person Succession Architecture (PA-03)

In organizational procurement, authority adheres to the **Role**, while accountability adheres to the **Person** who took the action.

### 11.1 Succession Invariant
When Person B replaces Person A as the Operations Manager:
1. Person B receives operational authority for new and pending transactions.
2. All historical RFQ approvals, PO issuances, and payment releases executed by Person A remain **permanently and immutably attributed to Person A** in the governance audit trail (`org_governance_audits`).
3. Person B cannot alter, repudiate, or rewrite historical approvals made by Person A.

Verified in `@otp/domain` via `verifyMsmeHistoricalRoleContinuity` and Red Team Attack 13.

---

## 12. Member Lifecycle, Rotation & Offboarding Protections

- **Graceful Offboarding:** When a member departs the organization, their membership is marked `REMOVED` or `INACTIVE`.
- **Immediate Delegation Invalidation:** Any active delegation proxies assigned to the departing member are immediately revoked.
- **Personal Account Preservation:** The departing user's personal Individual Buyer profile and unrelated organization memberships remain completely unharmed.

---

## 13. Spend Delegation Proxy Architecture

The MSME Spend Delegation engine (`DelegationProxyManager.tsx` and `SpendApprovalGovernanceService`) allows Primary Owners to delegate approval authority safely:
- **Spend Cap:** Hard limit in INR (e.g. ₹5,00,000) that the delegate cannot exceed.
- **Calendar Validity Window:** Explicit `starts_at` and `expires_at` timestamps. Delegation cannot be used before `starts_at` or after `expires_at`.
- **Permission Scope:** Granular permission flags (e.g. `APPROVE_TIER_1`, `APPROVE_TIER_2`, `ISSUE_PO`).
- **Non-Delegable Executive Gates:** Tier 3 Executive approvals (> ₹25 Lakhs) cannot be delegated to non-executive staff.
- **Audit Logging:** Every delegation creation, utilization, and revocation is recorded in the append-only audit trail.

---

## 14. Anti-Self-Approval Enforcement (PA-09)

The fundamental integrity rule of spend governance:
$$\text{Creator}(RFQ) \ne \text{Approver}(RFQ)$$

### 14.1 Direct Bypass Prevention
If Actor X drafts and submits an RFQ, Actor X cannot sign off or approve that RFQ, even if Actor X is the Primary Owner or Operations Manager. Approval must be executed by another authorized officer.

### 14.2 Delegated Proxy Bypass Prevention
Actor X cannot circumvent anti-self-approval by using a delegation proxy granted to them by the Primary. The system detects creator identity across all proxy pathways and fails closed.

Verified in Red Team Attacks 02 and 03.

---

## 15. 13-Stage Authorization Chain & Spend Decision Engine

The spend evaluation engine (`evaluateMsmeSpendDecisionState`) resolves the transaction state against organizational policies:
1. **Tier 1 (Manager Spend):** Spend $\le$ Manager Threshold (e.g. ₹2.5L). Approver: Manager or Primary.
2. **Tier 2 (Primary Sign-off):** Spend > Manager Threshold and $\le$ Executive Threshold (e.g. ₹25L). Approver: Primary.
3. **Tier 3 (Executive Board Gate):** Spend > ₹25L. Approver: Primary / Board. Non-delegable.

The engine outputs a typed decision payload:
```ts
export interface MsmeSpendDecisionState {
  canApprove: boolean;
  requiresPrimaryApproval: boolean;
  isCreator: boolean;
  effectiveTierLevel: 'TIER_1_MANAGER' | 'TIER_2_DEPT_HEAD' | 'TIER_3_EXECUTIVE';
  matchedDelegationId?: string;
  uiStateBadge: string;
  uiStateColor: 'green' | 'amber' | 'blue' | 'gray' | 'red';
  uiStateDescription: string;
}
```

---

## 16. Simplified Mobile Spend Decision UX

Rather than overwhelming the business user with complex enterprise matrices, the mobile UI presents 4 intuitive, actionable states:

1. **Action Required: Primary Approval (Green):** *"Your sign-off as Primary is required to release this ₹4,50,000 purchase order."*
2. **Action Required: Delegated Approval (Blue):** *"You have delegated authority to sign off this ₹1,80,000 purchase order under Active Proxy."*
3. **Waiting for Primary Sign-off (Amber):** *"Purchase order amount exceeds Manager threshold. Forwarded to Ramesh Sharma (Owner) for sign-off."*
4. **Anti-Self-Approval Enforced (Red):** *"You created this RFQ and cannot approve your own spend. Sign-off must be performed by another authorized officer."*

---

## 17. MSME Intake (TELL) Experience & Saved Address Book Integration

The MSME intake experience answers 3 core questions immediately:
- *What can I do?* (Create RFQ, Review Quotes, Approve Spend, Track Shipments)
- *What am I buying?* (Item description, technical specifications, quantity, unit of measure, target delivery date)
- *What needs attention?* (Action items, pending approvals, quote clarifications)

### Address Book Integration
MSMEs manage multiple operational locations (Registered Office, Factory, Peenya Warehouse, Site B). At intake, the buyer selects a saved address with 1 click rather than retyping address fields.

---

## 18. Immutable Address Snapshots

To prevent downstream dispute and fulfillment ambiguity:
- Upon RFQ submission, the selected address is frozen into `delivery_address_snapshot` and `billing_address_snapshot` JSON fields.
- Subsequent edits to the company address book do **not** alter existing active RFQs or issued Purchase Orders.

---

## 19. Non-Blocking Taxonomy Engine & Free-Text Emergency Fallback

To ensure procurement is never blocked by catalog gaps:
- The MSME buyer can browse standard industrial and commercial categories (e.g. Raw Materials, Fasteners, Electrical, Office Equipment).
- If the required item is unlisted, the buyer uses the mandatory *"Not listed? Tell us what you need"* free-text fallback. The platform accepts the free-text description and routes it for supplier matching without interruption.

---

## 20. Declared Commercial Payment Structure Persistence

At RFQ intake, the MSME specifies their commercial payment terms:
1. `SINGLE_PAYMENT`: 100% upon delivery and inspection acceptance.
2. `THREE_PART_PAYMENT`: Advance (e.g. 20%), Dispatch (60%), Final Acceptance (20%).
3. `MILESTONE_BASED`: Custom phased milestone deliverables and linked disbursements.

This payment structure is persisted in `rfq_data.declared_payment_structure` and carried forward into the generated Purchase Order.

---

## 21. REVIEW Experience & 4 Canonical Comparison Pillars

The MSME quote evaluation screen presents competitive quotes across the **4 Canonical Pillars of Procurement**:
1. **Landed Cost + GST:** Total landed cost including base price, freight, insurance, and statutory GST with HSN breakdown.
2. **Turnaround Time (TAT):** Delivery timeline in calendar days from PO issuance.
3. **Warranty / SLA:** Formal warranty coverage, AMC terms, and service response time.
4. **Smart Merit Score:** Multi-criteria weighted algorithmic score (0–100) combining price competitiveness, supplier rating, past delivery performance, and compliance track record.

---

## 22. Server-Side Identity Protection & Pre-Award Leak Prevention (PA-04/PA-05)

Under Protected Assets PA-04 and PA-05:
- All quotation data served to the MSME review room prior to award lock is sanitized via `rfq_quotes_identity_protected`.
- Supplier business name, GSTIN, contact details, and bank credentials are substituted with masked identifiers (e.g. `SUP-MK-748`).
- Supplier identity is revealed **only** upon execution of the atomic award lock (`PA-02`), ensuring unbiased merit-based selection.

---

## 23. Purchase Order Issuance & Pre-Acceptance Buyer Cancellation Protocol

### 23.1 Cancellation Rules
- **Pre-Acceptance Cancellation:** The MSME buyer retains the right to cancel an issued Purchase Order before the supplier accepts it.
- **Mandatory Written Justification:** Cancellation requires a mandatory written reason of **at least 5 characters** (e.g. *"Specifications modified by engineering team"*). Blank or whitespace reasons are rejected.
- **Post-Acceptance Lock:** Once the supplier formally accepts the PO, buyer cancellation is blocked. Any subsequent cancellation requires mutual agreement.

Verified via `validatePurchaseOrderCancellation` and Red Team Attacks 15 and 16.

---

## 24. Supplier Platform Fee Disclosure Protocol

In accordance with institutional transparency:
- The Purchase Order issuance flow explicitly discloses the **0.50% supplier platform fee** prior to acceptance.
- The disclosure states: *"OTP applies a 0.50% platform fee to the winning supplier upon PO acceptance. No hidden platform markup is charged to the buyer."*

---

## 25. MSME Wallet, Rewards & Bilateral GMV Accounting Segregation

Under Protected Asset PA-07 and GAAP accounting principles:
- **Bilateral GMV:** The legally binding commercial transaction value between the MSME Buyer and the Supplier is recorded in the GAAP double-entry ledger (`ledger-balance.ts`).
- **Platform Rewards:** Promotional cashback, referral bonuses, and Share-in-Success rewards are stored in a segregated platform wallet.
- Platform reward credits cannot artificially inflate bilateral GMV or distort statutory GST invoices.

Verified via `verifyMsmeWalletGmvSegregation` and Red Team Attack 14.

---

## 26. Role-Aware MSME Home Dashboard & Cockpit

`BuyerSourcingCockpitCard.tsx` adapts dynamically to the user's active role:
- **MSME Primary / Owner:** Displays executive metrics, pending spend sign-offs, total YTD spend, and delegation management shortcuts.
- **MSME Operations Manager:** Displays active sourcing pipelines, quotes under review, pending delivery inspections, and operational tasks.
- **MSME Delegate:** Displays spend authorization queue under active proxy with remaining spend cap.
- **MSME Member:** Displays draft RFQs, delivery inspection logs, and order tracking.

---

## 27. Mobile-First Responsive Design

Verified across standard viewport widths:
- **360px (Small Android):** Compact stacked layouts, zero horizontal scrolling.
- **375px (iPhone SE/Mini):** Fluid metric grids, readable typography.
- **390px (iPhone 12/13/14/15/16):** Standard mobile presentation.
- **414px (iPhone Plus/Max):** Enhanced summary views.
- **Landscape & Desktop:** Multi-column comparison views with sticky navigation.
- **Touch Target Contract:** Minimum 44px touch targets on all actionable buttons and selects.

---

## 28. Drill-Down Principle Implementation

Every summary metric card on the MSME cockpit operates as an interactive filter:
- Clicking **"2 Pending Approvals"** navigates to `/rfqs?filter=pending_approval`.
- Clicking **"8 Quotes Under Review"** navigates to `/rfqs?filter=evaluating`.
- Clicking **"3 Active Purchase Orders"** navigates to `/orders?filter=active`.

---

## 29. Red Team Security Attack Matrix (20 Attack Vectors Verified)

The comprehensive Red Team security suite (`tests/security/msme-spend-governance-redteam.test.ts`) verified all 20 attack vectors:

| # | Attack Vector Description | Vulnerability Targeted | Defense Mechanism | Result |
| :---: | :--- | :--- | :--- | :---: |
| **01** | Cross-Tenant Approval Hijack | Tenant Bleed | Multi-context org scoping check | **DENIED** |
| **02** | Direct Anti-Self-Approval Bypass | Self-Approval (PA-09) | Anti-bypass creator verification | **DENIED** |
| **03** | Delegated Anti-Self-Approval Bypass | Proxy Circumvention | Creator proxy pathway block | **DENIED** |
| **04** | Expired Delegation Proxy Approval | Time-Window Tampering | Expiration timestamp validation | **DENIED** |
| **05** | Future-Dated Delegation Approval | Clock Manipulation | Start timestamp validation | **DENIED** |
| **06** | Revoked Delegation Proxy Sign-off | Invalidation Bypass | Active status check | **DENIED** |
| **07** | Spend Cap Exceeded Approval | Financial Escalation | Spend cap limit verification | **DENIED** |
| **08** | Unauthorized Self-Delegation | Self-Escalation | Delegator != Delegatee invariant | **DENIED** |
| **09** | Non-Primary Delegation Creation | Privilege Escalation | Primary role requirement check | **DENIED** |
| **10** | Non-Delegable Tier 3 Gate Bypass | Executive Bypass | Tier 3 non-delegable policy | **DENIED** |
| **11** | Out-of-Sequence Tier Approval | Workflow Skipping | Sequential tier progression | **DENIED** |
| **12** | Duplicate Approval Re-Execution | Double Signing | Stage status idempotency check | **DENIED** |
| **13** | Historical Audit Rewrite on Succession | Audit Tampering (PA-03) | Immutable historical attribution | **PRESERVED** |
| **14** | Promotional Wallet GMV Commingling | Accounting Distortion | PA-07 ledger balance isolation | **ISOLATED** |
| **15** | Post-Acceptance PO Cancellation | Breach of Contract | Supplier acceptance lock | **BLOCKED** |
| **16** | Blank / Whitespace PO Cancellation | Unjustified Breach | Minimum 5-char reason gate | **REJECTED** |
| **17** | Pre-Award Supplier PII Leakage | Biased Selection (PA-04) | Masked view payload sanitization | **PROTECTED** |
| **18** | Corrupted GSTIN/PAN Verification | Truthfulness Violation | Luhn checksum + embedded PAN | **CAUGHT** |
| **19** | Offline Fake Verification Spoof | Truthfulness Invariant | Preserved unavailable state | **TRUTHFUL** |
| **20** | Non-Existent RFQ Approval Attempt | Phantom Transaction | RFQ existence validation | **DENIED** |

---

## 30. Automated Quality Gates

### 30.1 Workspace TypeScript Compilation Check
Executed via `scripts/typecheck.ts`:
- `@otp/domain`: **PASSED** (0 errors)
- `@otp/database`: **PASSED** (0 errors)
- `@otp/services`: **PASSED** (0 errors)
- `@otp/web`: **PASSED** (0 errors)

### 30.2 Canonical Vocabulary Scanner
Executed via `scripts/scan-canonical-vocabulary.cjs`:
- Prohibited Terms: `bid`, `bids`, `bidder`, `bidders`, `bidding`, `blind`.
- Scanned: 419 source files across `apps/web/src`.
- Result: **0 vocabulary violations detected (100% Clean).**

### 30.3 Strict Test Coverage Policy Audit
Executed via `scripts/check-test-coverage-policy.cjs --strict`:
- Mode: **STRICT** (Coverage Append Enforced).
- Total Test Files Detected: **239 files**.
- Unit Tests: 63 (min: 10) — **PASS**
- Module Tests: 143 (min: 20) — **PASS**
- Functional Tests: 29 (min: 15) — **PASS**
- Regression Tests: 4 (min: 3) — **PASS**
- Result: **100% Policy Compliance.**

---

## 31. Comprehensive Test Matrix & Execution Evidence

```text
====================================================================================================
                                      WORKSPACE TEST SUMMARY
====================================================================================================
Package / Suite               Test Files Passed   Tests Passed   Tests Failed   Duration
----------------------------------------------------------------------------------------------------
packages/domain                      45               535              0          7.99s
packages/services                    33               493              0         15.91s
apps/web                            112              1091              0        167.61s
tests/security (Red Team)             7                51              0         18.84s
----------------------------------------------------------------------------------------------------
TOTAL                               197              2170              0        210.35s
====================================================================================================
```

---

## 32. Stage R2-06 Certification Verdict & R2 Implementation Sequence Status

### Certification Verdict
Stage R2-06 has met 100% of the functional, governance, security, architectural, and quality preconditions mandated by the OTP Product Constitution v1.0 and R1 Reconstruction Contract.

$$\mathbf{R2\text{-}06\ \text{READY FOR CHECKPOINT REVIEW}}$$

### R2 Implementation Sequence Progress

```text
[✓] R2-01: Reconstruction Master Contract & Preconditions
[✓] R2-02: Global AppShell & Route Canonicalization
[✓] R2-03: Identity Context & 13-Stage Authorization
[✓] R2-04: Individual Buyer Experience
[✓] R2-05: RWA Governance Experience
[✓] R2-06: MSME Spend Governance Experience   <--- COMPLETED (THIS REPORT)
[ ] R2-07: Supplier Award Onboarding Experience
[ ] R2-08: Dispute & Resolution Experience
[ ] R2-09: End-to-End Integration & Regression
```
