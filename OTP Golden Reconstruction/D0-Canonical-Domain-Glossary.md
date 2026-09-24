# OTP Canonical Domain Glossary (D0)
**Document Identifier:** `OTP-RECON-D0-GLOSSARY`  
**Version:** 1.0 (Golden Baseline)  
**Status:** AUTHORITATIVE ARCHITECTURAL REFERENCE  
**Target Market:** India Institutional & Commercial Procurement  
**Permitted Buyer Contexts:** `INDIVIDUAL`, `RWA`, `MSME`  
**Permitted Platform Roles:** `SUPERADMIN`, `FOUNDER_CEO`, `OPERATIONS_SUPPORT`  
**Supplier Participant:** `SUPPLIER`  
**Excluded Contexts:** `ENTERPRISE` (Explicitly Out of Product Scope)

---

## Executive Overview

This Canonical Domain Glossary establishes the single, unambiguous source of truth for all business, technical, authorization, and financial terminology in the **OTP (Open Trade & Procurement)** platform. 

Every domain term in this document is defined using an 8-point canonical schema:
1. **Definition:** Exact semantic meaning within OTP.
2. **What It Is NOT:** Boundaries, exclusions, and anti-patterns.
3. **Owner / Authority:** Entity or process that creates, mutates, or governs the asset.
4. **Where Used:** Frontend features, backend services, database schemas, and RPCs.
5. **Customer-Facing:** Whether the term or its attributes are visible to buyers/suppliers.
6. **Authorization-Bearing:** Whether holding or referencing this entity confers permissions.
7. **Historical / Auditable:** Whether state transitions are immutable and recorded.
8. **Related Entities:** Connected domain structures in the relational graph.

---

# 1. Identity & Account Entities

### 1.1 Person
- **Definition:** A unique biological human being participating in the platform. Represented at the identity layer by authentication credentials (email/phone/passkey) and physical identity.
- **What It Is NOT:** A Person is *not* an Organization, *not* a Role, and *not* a fixed Buyer Persona. A single Person may hold multiple distinct contexts across different organizations.
- **Owner / Authority:** The individual human user via verified authentication credentials (`auth.users`).
- **Where Used:** Core auth, `public.profiles`, `public.org_role_assignments`, `public.org_governance_action_audits`.
- **Customer-Facing:** Yes (via profile management).
- **Authorization-Bearing:** No (authority is derived from active Context + Role + Delegation, never raw Personhood).
- **Historical / Auditable:** Yes. Person UUID remains the immutable actor reference (`actor_person_id`) across all historical role rotations.
- **Related Entities:** Profile, Auth User, Organization Member, Role Assignment, Governance Audit.

### 1.2 Profile (`public.profiles`)
- **Definition:** The platform-level user account record linked 1:1 with `auth.users`, storing display name, contact information, identity verification status, and default preferences.
- **What It Is NOT:** A Profile is *not* an organization membership, *not* a company profile, and *not* a supplier profile.
- **Owner / Authority:** Created upon user registration; updated by the authenticated Person or platform admin.
- **Where Used:** Auth provider, user settings, profile header, audit logs (`profiles.id`).
- **Customer-Facing:** Yes.
- **Authorization-Bearing:** Partial (determines platform admin flag `is_platform_admin` and active persona pointer `active_portal_side`).
- **Historical / Auditable:** Yes (`created_at`, `updated_at`, audit trail).
- **Related Entities:** Person, Organization Member, Buyer Address, Supplier User.

### 1.3 Active Portal Side (`signup_side`)
- **Definition:** The current active operational interface persona selected by a dual-persona user: `BUYER` or `SUPPLIER`.
- **What It Is NOT:** An irreversible account type. A user may legitimately operate as an Individual/RWA Buyer in one session and a verified Supplier in another without account duplication.
- **Owner / Authority:** The user via `switch_portal_side()` RPC (Migration 00187); isolated from Platform Admin.
- **Where Used:** `AppLayout`, `RoleProvider`, `useRoleContext`, `private.profile_side()`.
- **Customer-Facing:** Yes (header persona toggle).
- **Authorization-Bearing:** Yes (gates access between `/rfq`, `/requirements` and `/supplier/*` routes).
- **Historical / Auditable:** Yes (session and profile updates).
- **Related Entities:** Profile, Buyer Persona, Supplier Profile.

---

# 2. Buyer Contexts & Personas

### 2.1 Buyer
- **Definition:** Any party that initiates a procurement requirement, evaluates identity-protected quotes, conducts governance voting, and issues purchase orders on OTP.
- **What It Is NOT:** A Supplier, a Vendor, or a Platform Administrator.
- **Owner / Authority:** The authenticated buyer user or institutional organization.
- **Where Used:** Intake, RFQ comparison, Governance voting, Orders ledger, Address book.
- **Customer-Facing:** Yes.
- **Authorization-Bearing:** Yes (initiates transactions and commits funds).
- **Historical / Auditable:** Yes.
- **Related Entities:** Individual Buyer, RWA Buyer, MSME Buyer, Requirement, RFQ, Purchase Order.

### 2.2 Individual Buyer (`BUYER_INDIVIDUAL`)
- **Definition:** A natural person purchasing goods, services, or turnkey projects for personal, residential, or household use.
- **What It Is NOT:** An organization, a committee, a corporate entity, or a multi-tiered approval hierarchy.
- **Owner / Authority:** The individual user exclusively.
- **Where Used:** Fast-track intake (`/intake`), personal address book, personal orders ledger (`/purchase-orders`).
- **Customer-Facing:** Yes.
- **Authorization-Bearing:** Yes (direct 1-click self-approval and PO issuance; no committee quorum or multi-tier sign-off required).
- **Historical / Auditable:** Yes.
- **Related Entities:** Person, Profile, Buyer Address, Requirement, RFQ, Purchase Order.

### 2.3 RWA (Resident Welfare Association) Buyer (`BUYER_RWA`)
- **Definition:** A registered residential community, apartment owners association, or housing society procuring shared infrastructure, maintenance, capital assets, or facilities services.
- **What It Is NOT:** A commercial business, a single individual, or an enterprise corporation.
- **Owner / Authority:** The RWA Managing Committee / Board of Governors.
- **Where Used:** 4-Step Governed Intake, Committee Voting Room (`/rfq/:id/committee`), Role Succession (`/org/members`), Address Book (`REGISTERED` vs `DELIVERY`).
- **Customer-Facing:** Yes.
- **Authorization-Bearing:** Yes (governance voting, quorum enforcement, statutory multi-signatory approval).
- **Historical / Auditable:** Yes (full decision receipts and immutable governance logs).
- **Related Entities:** Organization, Resident Owner, Committee Member, Role Assignment, Committee Vote, Decision Receipt.

### 2.4 MSME Buyer (`BUYER_MSME`)
- **Definition:** A Micro, Small, or Medium Enterprise (registered under Udyam / GSTIN or operating as a commercial enterprise) procuring industrial, commercial, or operational goods/services.
- **What It Is NOT:** An RWA, a personal consumer, or an Enterprise conglomerate with multi-branch corporate approval hierarchies.
- **Owner / Authority:** The MSME Primary / Business Owner.
- **Where Used:** MSME Intake, Spend Delegation (`organization_delegations`), Business Profile (`GSTIN`, `Udyam`), Orders & TDS ledger.
- **Customer-Facing:** Yes.
- **Authorization-Bearing:** Yes (Primary authority with explicit, revocable spend delegation to team members).
- **Historical / Auditable:** Yes.
- **Related Entities:** Organization, MSME Primary, MSME Delegate, Delegation Proxy, TDS Withholding.

---

# 3. RWA Governance & Institutional Role Entities

### 3.1 Resident Owner
- **Definition:** A legitimate property owner or resident within an RWA community eligible to be nominated, invited, and appointed to an RWA committee role.
- **What It Is NOT:** An automatic committee member. A resident owner *cannot* self-appoint or vote on committee decisions without explicit organizational appointment.
- **Owner / Authority:** Verified by RWA Association records / Tokenized Invitation.
- **Where Used:** RWA member onboarding (`/invite/:token`), `public.organization_invitations`.
- **Customer-Facing:** Yes.
- **Authorization-Bearing:** No (eligibility prerequisite, not direct authority).
- **Historical / Auditable:** Yes.
- **Related Entities:** Person, Organization, Committee Member, Role Assignment.

### 3.2 Committee Member (`COMMITTEE_MEMBER`)
- **Definition:** An authorized resident owner appointed to the RWA Managing Committee with the right to participate in deliberations, declare conflicts of interest, and cast democratic votes.
- **What It Is NOT:** An unconstrained executive purchaser. A committee member votes within a collective quorum; single-member bypass is forbidden.
- **Owner / Authority:** Appointed via `appoint_org_role_atomic()` or accepted invitation.
- **Where Used:** Committee Voting Room, Decision Cockpit, `public.committee_votes`.
- **Customer-Facing:** Yes.
- **Authorization-Bearing:** Yes (voting weight: 1 vote; quorum count contribution).
- **Historical / Auditable:** Yes.
- **Related Entities:** RWA Organization, Role Assignment, Committee Vote, Conflict of Interest Declaration.

### 3.3 Executive RWA Officers (`PRESIDENT`, `TREASURER`, `SECRETARY`)
- **Definition:** Specific statutory governance roles within an RWA committee:
  - **President / Chairman:** Presiding officer authorized to convene voting, ratify committee awards, and sign official procurement contracts.
  - **Treasurer / Financial Officer:** Financial custodian authorized to approve budget allocation, release milestone payments, and verify TDS/GST compliance.
  - **Secretary / General Secretary:** Administrative officer responsible for procurement specifications, meeting minutes, and supplier notices.
- **What It Is NOT:** Permanent attributes of a Person. Roles are time-bound organizational assignments that rotate annually.
- **Owner / Authority:** Elected by RWA General Body / Committee and recorded in `org_role_assignments`.
- **Where Used:** RFQ award signing, PO issuance, Payment release, Role succession timeline.
- **Customer-Facing:** Yes.
- **Authorization-Bearing:** Yes (role-specific statutory approval gates).
- **Historical / Auditable:** Yes (effective-dated historical succession preserved).
- **Related Entities:** Role Assignment, Decision Receipt, Purchase Order, Payment Voucher.

### 3.4 Estate / Facility Manager (`MANAGER`)
- **Definition:** An operational, non-committee role (often professional staff or facility agency) authorized to draft specifications, coordinate site visits, and log delivery inspection checklists.
- **What It Is NOT:** A voting committee member. A manager *cannot* cast committee votes, establish quorum, or approve financial disbursements unless explicitly delegated.
- **Owner / Authority:** Employed/appointed by RWA Committee or MSME Primary.
- **Where Used:** Intake drafting, Site inspection, Milestone progress tracking (`DeliveryInspectionPanel`).
- **Customer-Facing:** Yes.
- **Authorization-Bearing:** Operational authority only (no governance voting).
- **Historical / Auditable:** Yes.
- **Related Entities:** Organization Member, Milestone Inspection, Delivery Inspection Checklist.

### 3.5 Committee Quorum & Voting
- **Definition:** The statutory minimum number of affirmative, non-conflicted committee votes (default: 2 votes for standard RWA procurement) required to unlock an RFQ award.
- **What It Is NOT:** A simple majority of unvetted users. Quorum requires active, non-expired role holders.
- **Owner / Authority:** Enforced cryptographically by PostgreSQL RPC `submit_committee_vote_atomic` and `lock_and_reveal_award_atomic`.
- **Where Used:** Governance voting room, Decision cockpit, Migration 00024 / 00190 / 00197.
- **Customer-Facing:** Yes (progress bar and voter badges).
- **Authorization-Bearing:** Yes (hard prerequisite for award state transition).
- **Historical / Auditable:** Yes (`public.committee_votes` immutable table).
- **Related Entities:** Committee Vote, Conflict of Interest, Decision Receipt, RFQ.

### 3.6 Conflict of Interest (COI) Declaration
- **Definition:** A mandatory statutory declaration made by an RWA committee member or MSME officer prior to voting, stating whether they have personal, commercial, or familial ties to any quoting supplier.
- **What It Is NOT:** An optional survey question. An affirmative COI automatically recuses the member and neutralizes their voting weight.
- **Owner / Authority:** Declared by the individual voting member; enforced by backend rules.
- **Where Used:** Committee vote modal (`apps/web/src/features/governance/components/CommitteeVoteModal.tsx`), `committee_votes.has_conflict`.
- **Customer-Facing:** Yes.
- **Authorization-Bearing:** Yes (recuses member from voting calculations).
- **Historical / Auditable:** Yes (stored permanently in decision receipt).
- **Related Entities:** Committee Vote, Decision Receipt, Governance Audit.

### 3.7 Decision Receipt (`DecisionReceipt`)
- **Definition:** A cryptographically signed, immutable snapshot generated upon award lock, recording winning quote details, evaluation scores, all committee votes, COI declarations, and buyer justification notes.
- **What It Is NOT:** An editable report. It is a permanent legal record of institutional decision-making.
- **Owner / Authority:** Generated atomically by `lock_and_reveal_award_atomic()`.
- **Where Used:** Award confirmation page, RFQ detail, Audit exports, PDF Generator.
- **Customer-Facing:** Yes (downloadable / printable audit certificate).
- **Authorization-Bearing:** No (proof artifact of prior authorization).
- **Historical / Auditable:** Yes (permanent, append-only).
- **Related Entities:** RFQ, Awarded Quote, Committee Vote, Purchase Order.

---

# 4. MSME Organization & Delegation Entities

### 4.1 MSME Primary (`OWNER`)
- **Definition:** The founding business owner or authorized director registered as the ultimate administrative and commercial authority for an MSME account.
- **What It Is NOT:** A transient delegate. The Primary holds root authority and cannot be removed by subordinate delegates.
- **Owner / Authority:** Established upon business verification and registration.
- **Where Used:** Member management, Delegation configuration, Spend limit authorization.
- **Customer-Facing:** Yes.
- **Authorization-Bearing:** Yes (unlimited organizational authority).
- **Historical / Auditable:** Yes.
- **Related Entities:** Organization, Delegation Proxy, Purchase Order, Bank Settlement.

### 4.2 Delegation Proxy (`public.organization_delegations`)
- **Definition:** An explicit, time-bounded, spend-capped, and permission-scoped authorization grant issued by an MSME Primary to a specific team member.
- **What It Is NOT:** An open-ended blanket permission or a self-assigned privilege.
- **Owner / Authority:** Created by MSME Primary via `create_delegation_proxy_atomic()`; revocable instantly.
- **Where Used:** Migration 00190, `EnterpriseApprovalMatrixService` (refactored for MSME), PO issuance checks.
- **Customer-Facing:** Yes (delegation badges and audit notices).
- **Authorization-Bearing:** Yes (validates `p_amount <= spend_cap_amount` and `now() < expires_at`).
- **Historical / Auditable:** Yes (full audit trail of grants, usages, and revocations).
- **Related Entities:** Organization Member, Spend Cap, Purchase Order.

### 4.3 Anti-Self-Approval Guard
- **Definition:** An architectural governance rule prohibiting the creator or drafter of an RFQ from approving their own spend delegation tier or executing single-signatory awards above delegated thresholds.
- **What It Is NOT:** A soft UI warning. Enforced strictly at database RPC level (`RAISE EXCEPTION 'Anti-self-approval violation'`).
- **Owner / Authority:** PostgreSQL RPC triggers and domain policies.
- **Where Used:** RFQ award validation, PO issuance RPCs.
- **Customer-Facing:** Yes (clear explanation when approval requires second signatory).
- **Authorization-Bearing:** Yes (blocks illegal self-authorizations).
- **Historical / Auditable:** Yes (logs attempted violations to security telemetry).
- **Related Entities:** Delegation Proxy, Committee Vote, Award Gate.

---

# 5. Role Lifecycle, Term Expiry & Annual Succession

### 5.1 Role Assignment (`public.org_role_assignments`)
- **Definition:** An effective-dated, term-limited association linking a specific Person (`person_id`) to an Organization Role (`role_id`, e.g., 'PRESIDENT', 'TREASURER', 'SECRETARY') for a specified period (default: 365 days).
- **What It Is NOT:** A static column on the user profile. "Role ≠ Person".
- **Owner / Authority:** Managed via Migration 00197 atomic RPCs (`appoint_org_role_atomic`, `renew_or_rotate_org_role_atomic`).
- **Where Used:** RWA Team Management (`/org/members`), Governance authorization checks, Audit timeline.
- **Customer-Facing:** Yes.
- **Authorization-Bearing:** Yes (active status + valid date range confers authority).
- **Historical / Auditable:** Yes (full history of predecessor/successor pointers).
- **Related Entities:** Person, Organization, Governance Action Audit, Decision Receipt.

### 5.2 Role Succession & Rotation
- **Definition:** The formal governance process of transferring an organizational role from an outgoing holder (Predecessor) to an incoming holder (Successor), terminating future authority of the predecessor while immutably preserving past audit attribution.
- **What It Is NOT:** Overwriting the user ID on historical records.
- **Owner / Authority:** Executed via `transfer_org_role_succession_atomic()`.
- **Where Used:** Annual general meetings, committee handover workflows.
- **Customer-Facing:** Yes (`OrgRoleSuccessionTimeline.tsx`).
- **Authorization-Bearing:** Yes (revokes old token/authority; activates new authority from `effective_from`).
- **Historical / Auditable:** Yes (permanent linkage in `predecessor_assignment_id`).
- **Related Entities:** Role Assignment, Person, Governance Action Audit.

### 5.3 Governance Action Audit (`public.org_governance_action_audits`)
- **Definition:** An immutable, append-only audit ledger recording every privileged governance action, capturing `actor_person_id`, `role_at_time`, `responsibility_at_time`, `authority_at_time`, and full payload.
- **What It Is NOT:** An editable table. Protected by PostgreSQL trigger `prevent_mutation_org_governance_audits()`.
- **Owner / Authority:** Automatically written by system RPCs upon any governance mutation.
- **Where Used:** Migration 00197, `/audit` routes, legal compliance reviews.
- **Customer-Facing:** Yes (read-only audit views for authorized stakeholders).
- **Authorization-Bearing:** No (immutable historical evidence).
- **Historical / Auditable:** Yes (100% append-only).
- **Related Entities:** Person, Role Assignment, RFQ, Award, Purchase Order.

---

# 6. Supplier Participant & 2-Stage Lifecycle

### 6.1 Supplier (`public.suppliers`)
- **Definition:** A commercial vendor, contractor, distributor, or service professional participating on OTP to receive RFQ invitations, submit sealed quotes, and execute purchase orders.
- **What It Is NOT:** A Buyer organization member or platform admin.
- **Owner / Authority:** The supplier enterprise/proprietor; verified by OTP Operations.
- **Where Used:** Supplier portal (`/supplier/*`), Quick-quote flow (`/q/:token`), Supplier discovery.
- **Customer-Facing:** Yes.
- **Authorization-Bearing:** Yes (submits binding quotations and accepts purchase orders).
- **Historical / Auditable:** Yes.
- **Related Entities:** Supplier User, Sealed Quote, Work Order, Milestone Inspection, VMI Scorecard.

### 6.2 2-Stage Supplier Lifecycle
- **Definition:** OTP's structural supplier onboarding model:
  1. **Stage 1 (Prospective / Participant):** A supplier invited via phone/WhatsApp/email can submit a sealed quote via magic link (`/q/:token`) without upfront platform registration.
  2. **Stage 2 (Awarded / Onboarded):** Upon being selected for award by a buyer, the supplier enters the Onboarding Gate (`/supplier/award-onboarding/:token`), completes GST/PAN verification and bank account details, unlocking mutual identity reveal and PO issuance.
- **What It Is NOT:** Requiring heavy registration before quoting (which causes supplier drop-off), nor allowing unverified payouts.
- **Owner / Authority:** Migration 00196 and `SupplierAwardOnboardingService`.
- **Where Used:** Quick Quote, Award Onboarding, Reveal Gate.
- **Customer-Facing:** Yes.
- **Authorization-Bearing:** Yes (gates final identity reveal and contract execution).
- **Historical / Auditable:** Yes.
- **Related Entities:** Quick Quote Token, Supplier Award Onboarding, Reveal Gate, Purchase Order.

### 6.3 Anonymous Supplier Alias (`anonymous_label`)
- **Definition:** A deterministic, anonymized pseudonym (e.g., `Supplier #01`, `Supplier #02`, `Vendor Alpha`) assigned to a quoting supplier during the sourcing and evaluation phases.
- **What It Is NOT:** The supplier's real legal entity name.
- **Owner / Authority:** Generated by `public.rfq_invitations` and PostgreSQL masking views.
- **Where Used:** RFQ comparison room, Committee voting room, Active monitoring.
- **Customer-Facing:** Yes (buyers evaluate solely based on specs, price, warranty, and anonymized VMI metrics).
- **Authorization-Bearing:** No (masking label).
- **Historical / Auditable:** Yes (retained in decision receipt).
- **Related Entities:** Sealed Quote, Identity-Protected Quote, Reveal Gate.

---

# 7. Procurement Engine & Transaction Entities

### 7.1 Requirement (`public.requirements`)
- **Definition:** The initial structured expression of buyer procurement intent, capturing item title, category, quantity, unit, specifications, delivery location, budget range, and timeline.
- **What It Is NOT:** A binding contract or published RFQ. A Requirement is an intake container that matures into an RFQ.
- **Owner / Authority:** The Buyer who drafts and finalizes the intake.
- **Where Used:** `/intake`, `/requirements/:id`, `RequirementService`.
- **Customer-Facing:** Yes.
- **Authorization-Bearing:** No (pre-commercial specification).
- **Historical / Auditable:** Yes.
- **Related Entities:** Buyer, RFQ, Taxonomy Category, Buyer Address Snapshot.

### 7.2 RFQ (Request for Quotation — `public.rfqs`)
- **Definition:** A formal, published procurement event inviting qualified suppliers to submit binding, sealed commercial quotations within a defined deadline.
- **What It Is NOT:** An open unmoderated public bulletin board.
- **Owner / Authority:** Published by authorized Buyer (Individual self-approval or RWA/MSME officer).
- **Where Used:** `/rfq/:id/*`, `BlindRfqService`, `EvaluationDecisionCockpit`.
- **Customer-Facing:** Yes.
- **Authorization-Bearing:** Yes (binds procurement protocol and deadline).
- **Historical / Auditable:** Yes.
- **Related Entities:** Requirement, RFQ Invitation, Sealed Quote, Committee Vote, Award, Purchase Order.

### 7.3 Identity-Protected Sealed Quote (`public.rfq_quotes`)
- **Definition:** A cryptographically sealed commercial offer submitted by an invited supplier, containing unit pricing, GST rate, delivery timeline, warranty period, and technical compliance, masked from buyer view until evaluation.
- **What It Is NOT:** An unsealed open bid.
- **Owner / Authority:** Submitted by Supplier; masked by PostgreSQL view `rfq_quotes_identity_protected`.
- **Where Used:** Evaluation Decision Cockpit, Smart Scoring, Comparison Room.
- **Customer-Facing:** Yes (in masked format: anonymous alias, price, warranty, turnaround).
- **Authorization-Bearing:** Yes (legally binding commercial offer).
- **Historical / Auditable:** Yes.
- **Related Entities:** RFQ, Supplier, Evaluation Score, Award Gate.

### 7.4 Mutual Reveal Gate (`lock_and_reveal_award_atomic`)
- **Definition:** The server-side cryptographic and procedural checkpoint that unlocks supplier legal identities to the buyer, and buyer organization contact details to the supplier, only after award locking, quorum voting, and supplier onboarding verification are complete.
- **What It Is NOT:** A client-side UI unmasking toggle.
- **Owner / Authority:** Migration 00023 / 00160 / 00196 PostgreSQL RPCs.
- **Where Used:** `/rfq/:id/reveal`, `/supplier/award-onboarding`.
- **Customer-Facing:** Yes (celebratory unmasking and contact card disclosure).
- **Authorization-Bearing:** Yes (unlocks PO issuance).
- **Historical / Auditable:** Yes (logs reveal event with timestamp and actor).
- **Related Entities:** RFQ, Awarded Quote, Decision Receipt, Purchase Order.

### 7.5 Purchase Order (`public.purchase_orders`)
- **Definition:** The definitive legal commercial contract and financial commitment issued by the Buyer to the Awarded Supplier, specifying line items, delivery milestones, payment terms, and statutory GST/TDS provisions.
- **What It Is NOT:** An informal estimate or quotation.
- **Owner / Authority:** Issued by authorized Buyer signatory; accepted by Supplier.
- **Where Used:** `/purchase-orders/:id`, `/supplier/purchase-orders/:id`, `PurchaseOrderService`.
- **Customer-Facing:** Yes.
- **Authorization-Bearing:** Yes (creates financial obligation and locks platform fees).
- **Historical / Auditable:** Yes (SHA-256 contract hash + frozen delivery address snapshot).
- **Related Entities:** RFQ, Awarded Quote, Work Order, Milestone Inspection, Payment Voucher, Double-Entry Ledger.

### 7.6 Milestone & Delivery Inspection (`public.delivery_inspections`)
- **Definition:** Structured progress stages (e.g., Advance, Dispatch, Site Delivery, Installation, Final Handover) governed by a 5-point verification checklist, photographic evidence, and buyer sign-off.
- **What It Is NOT:** Unverified invoice claiming.
- **Owner / Authority:** Submitted by Supplier; verified and approved by Buyer.
- **Where Used:** `DeliveryInspectionPanel`, `MilestoneInspectionChecklist`, Migration 00193 / 00195.
- **Customer-Facing:** Yes.
- **Authorization-Bearing:** Yes (approval triggers payment milestone release).
- **Historical / Auditable:** Yes (photographic proof and inspection timestamps).
- **Related Entities:** Purchase Order, Work Order, Payment Release.

---

# 8. Financial, Ledger & Tax Entities

### 8.1 Double-Entry Financial Ledger (`public.financial_ledger_entries`)
- **Definition:** An immutable, GAAP/IndAS-compliant double-entry accounting ledger recording all debits and credits across platform asset, liability, equity, revenue, and expense accounts.
- **What It Is NOT:** A single-column transaction list or cached wallet balance.
- **Owner / Authority:** Migration 00176 and `AccountingService`.
- **Where Used:** Financial control dashboard, Payment settlement, Tally/Zoho export.
- **Customer-Facing:** Yes (via invoice statements and wallet ledgers).
- **Authorization-Bearing:** No (accounting source of truth).
- **Historical / Auditable:** Yes (100% immutable and reconciled).
- **Related Entities:** Purchase Order, Payment Voucher, Platform Fee, Buyer Sourcing Reward.

### 8.2 Platform Fee & Sourcing Reward
- **Definition:**
  - **Supplier Platform Fee:** Standard 0.50% fee charged to the supplier upon successful transaction settlement for marketplace matching and verification services.
  - **Buyer Sourcing Reward:** 0.10% cashback incentive credited to the buyer's organization wallet upon verified timely settlement.
- **What It Is NOT:** Arbitrary hidden surcharges. Transparently disclosed in the procurement contract.
- **Owner / Authority:** Calculated by `AccountingService` and locked in PostgreSQL ledger.
- **Where Used:** PO commercial summary, Wallet ledger, Invoicing.
- **Customer-Facing:** Yes.
- **Authorization-Bearing:** No.
- **Historical / Auditable:** Yes.
- **Related Entities:** Purchase Order, Ledger Balance, Wallet.

### 8.3 Statutory Tax Architecture (GST & TDS)
- **Definition:**
  - **Bilateral GST (Goods & Services Tax):** Indian tax engine computing CGST + SGST (intra-state) or IGST (inter-state) based on Supplier GSTIN Place of Supply vs Buyer Delivery Address Pincode.
  - **TDS (Tax Deducted at Source — Section 194C/194Q):** Statutory tax withholding calculated for eligible commercial buyers.
- **What It Is NOT:** Hardcoded flat tax multipliers.
- **Owner / Authority:** `packages/domain/src/tax/` and `TdsCalculator`.
- **Where Used:** PO creation, Invoicing, `TdsWithholdingPanel.tsx`, Tally XML exporter.
- **Customer-Facing:** Yes.
- **Authorization-Bearing:** Yes (statutory deduction compliance).
- **Historical / Auditable:** Yes (frozen in `tax_snapshots`).
- **Related Entities:** Purchase Order, GSTIN Validator, Buyer Address, Supplier Profile.

---

# 9. Reference Data, Taxonomy & Standards

### 9.1 Taxonomy Hierarchy (`taxonomy_categories`, `taxonomy_subcategories`)
- **Definition:** Standardized classification catalog organizing procurement into 5 core verticals (Facility & Maintenance, Industrial & Electrical, Raw Materials, Construction & Renovation, Services & Turnkey Projects).
- **What It Is NOT:** Free-text tagging. Taxonomy enforces structured attribute schemas and evaluation criteria.
- **Owner / Authority:** Managed by Superadmin; stored in database migrations and `packages/domain/src/taxonomy/`.
- **Where Used:** Intake category picker, Supplier matching algorithm, Market intelligence.
- **Customer-Facing:** Yes.
- **Authorization-Bearing:** No.
- **Historical / Auditable:** Yes.
- **Related Entities:** Requirement, Supplier Capability, Attribute Schema, Market Intel.

### 9.2 Indian Statutory Standards (BIS, FSSAI, CPWD, HSN/SAC)
- **Definition:** Domain reference standards integrated into specification templates and quality criteria:
  - **BIS (Bureau of Indian Standards):** IS specifications for electrical, cement, steel, safety gear.
  - **HSN / SAC Codes:** 6-to-8 digit harmonization codes for goods and service taxation.
  - **CPWD Specifications:** Public works benchmarks for civil, painting, and waterproofing works.
- **What It Is NOT:** Generic international boilerplate.
- **Owner / Authority:** Domain catalog (`packages/domain/src/tax/hsn-sac-catalog.ts`).
- **Where Used:** Dynamic intake attribute fields, Quality criteria cards, Quote submissions.
- **Customer-Facing:** Yes.
- **Authorization-Bearing:** No.
- **Historical / Auditable:** Yes.
- **Related Entities:** Requirement Intake, Supplier Quote, Tax Snapshot.

---

# 10. Platform Administration & System Roles

### 10.1 Superadmin (`SUPERADMIN`)
- **Definition:** The platform infrastructure administrator (restricted to `private_security.admin_whitelist`, primary: `bvnbasu@gmail.com`) responsible for system health, tenant troubleshooting, migration verification, and taxonomy management.
- **What It Is NOT:** A Buyer or Supplier participant. A Superadmin *never* acts as an RWA President or MSME Primary in normal customer transactions.
- **Owner / Authority:** Platform Owner; protected by PostgreSQL triggers.
- **Where Used:** Super Admin Console (`/admin`), Test Suite Runner, System Diagnostics.
- **Customer-Facing:** No (internal platform operations only).
- **Authorization-Bearing:** Yes (platform-wide administrative authority).
- **Historical / Auditable:** Yes (all admin mutations audited).
- **Related Entities:** Admin Whitelist, Audit Event, System Diagnostics.

### 10.2 Founder / CEO (`FOUNDER_CEO`)
- **Definition:** The executive governance oversight role providing read-only observability into platform health, GMV volume, conversion funnel velocity, and customer adoption metrics.
- **What It Is NOT:** An operational superadmin or customer buyer actor.
- **Owner / Authority:** Assigned to platform leadership (`/founder`, `/ceo`).
- **Where Used:** Founder Dashboard (`FounderDashboardPage.tsx`).
- **Customer-Facing:** No (internal governance cockpit).
- **Authorization-Bearing:** Observability only (no mutation authority).
- **Historical / Auditable:** Yes.
- **Related Entities:** Telemetry, Analytics, GMV Funnel.

---

## Summary Matrix of Canonical Personas & Contexts

| Context / Persona | Customer Facing | Can Vote in Committee? | Can Issue PO? | Has Delegates? | Has Multi-Signatory Quorum? | Delivery Address Model |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Individual Buyer** | Yes | No | Yes (Self) | No | No | Primary + Secondary personal addresses |
| **RWA Buyer** | Yes | Yes (Elected Members) | Yes (President/Treasurer) | No | Yes (Quorum $\ge 2$) | Registered Society Address + Delivery/Site Address |
| **MSME Buyer** | Yes | No | Yes (Primary / Delegate) | Yes (Spend Capped) | No (Tier Delegation) | Registered Business Office + Factory/Site Address |
| **Supplier** | Yes | No | No (Accepts PO) | No | No | Factory/Dispatch Warehouse Address |
| **Superadmin** | No | No | No | No | No | Platform Operational Console |
| **Founder / CEO** | No | No | No | No | No | Platform Executive Cockpit |

---
*End of Canonical Domain Glossary (D0)*
