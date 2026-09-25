# OTP Stage R2-20 — Golden Path Journey Forensic Evidence

**Product:** OTP — Open Trade & Procurement  
**Stage:** R2-20 — Human Black-Box Product Audit & Golden-Path Gap Discovery  
**Audit Baseline Commit:** `32334aae872c98ddc13d326985723c560534823b`  
**Ceiling Migration:** `00197_universal_org_role_lifecycle_succession_and_audit.sql`  

---

## 1. Journey 1: Individual Buyer Golden Path

### Path: TELL $\rightarrow$ REVIEW $\rightarrow$ DECIDE $\rightarrow$ TRACK

```
[Tell: Natural Intake] ──> [Review: 4-Pillar Offers] ──> [Decide: 1-Click Award] ──> [Track: PO & Milestone Delivery]
```

### 1.1 Step 1: Tell (Requirement Creation)
* **Route:** `/intake` (`apps/web/src/features/intake/pages/RequirementIntakePage.tsx`)
* **Behavior:** 
  - Buyer enters natural language requirements via keyboard or speech-to-text dictation (`VoiceRequirementDictation.tsx`).
  - Input text is parsed by `RuleBasedRequirementParser` (`packages/domain/src/parser/rule-based-requirement-parser.ts`), extracting quantity, units, budget targets, category, and fulfillment city.
  - Individual buyer model has `organizationId = null` (`canonical-auth.ts:89`), inheriting the buyer's primary saved personal address without requiring an organizational address book.
  - Zero committee setup, zero member invitation prompts, zero spend threshold roadblocks.
* **Forensic Evidence:**
  - `apps/web/src/features/intake/api/fast-track-intake.test.ts` (10/10 PASS).
  - `apps/web/src/features/intake/create-requirement-mobile.test.ts` (PASS).
  - Draft persistence in `localStorage` under key `otp_intake_draft_null` ensures draft recovery if the browser refreshes.

### 1.2 Step 2: Review (4-Pillar Offer Evaluation)
* **Route:** `/rfq/:rfqId/quotes` (`apps/web/src/features/evaluation/components/EvaluationDecisionCockpit.tsx`)
* **Behavior:**
  - Evaluates incoming proposals across 4 objective pillars: **Price**, **Turnaround (TAT)**, **Warranty/SLA**, and **Verified Supplier Score**.
  - Supplier identities are sealed behind anonymous aliases (`Supplier Alpha`, `Supplier Beta`).
  - Market Intelligence Panel (`MarketIntelligencePanel.tsx`) displays real benchmark estimates with visible fallback tier indicators (`LIVE_API`, `DATABASE_CACHE`, or `STATIC_REFERENCE`).
* **Forensic Evidence:**
  - `apps/web/src/features/evaluation/evaluation-decision-cockpit.test.ts` (PASS).
  - `tests/security/review-masked-comparison-redteam.test.ts` (16/16 PASS).
* **Gap Identified (F-20-01):** When 0 quotes are received, the empty state displays a `"⚡ Simulate 4 Demo Quotes"` button that is visible to real production buyers due to an un-guarded prop in `EvaluationDecisionCockpit.tsx:661`.

### 1.3 Step 3: Decide (Atomic Award & PO Generation)
* **Route:** `/rfq/:rfqId/award` (`apps/web/src/features/award/pages/AwardPage.tsx`)
* **Behavior:**
  - Individual buyers possess 1-click personal purchase authority (`canApproveSpend: allowed = true`).
  - Clicking *"Confirm Award & Issue Purchase Order"* atomically locks the award, executes dual unmasking of the winner, generates a cryptographically sealed `DecisionReceipt`, and creates a digital `PurchaseOrder`.
* **Forensic Evidence:**
  - `tests/security/decide-atomic-award-redteam.test.ts` (16/16 PASS).
  - `apps/web/src/features/award/decision-receipt-card.test.tsx` (4/4 PASS).

### 1.4 Step 4: Track (Fulfillment, Inspection & Settlement)
* **Route:** `/purchase-orders/:poId` (`apps/web/src/features/fulfillment/pages/PurchaseOrderDetailPage.tsx`)
* **Behavior:**
  - Visual 5-Point Milestone Stepper: `Requirement -> Offers -> Decision -> Purchase -> Delivery & Settlement`.
  - Delivery Inspection: Buyer verifies 5 inspection categories and submits star rating & review.
  - Progressive Invoicing: Supplier submits invoice; buyer approves and records payment via UPI or Bank Transfer.
  - Double-Entry Ledger: Records balanced journal entries (PA-07) and disburses net settlement minus 0.50% OTP platform fee.
* **Forensic Evidence:**
  - `tests/security/track-milestone-settlement-redteam.test.ts` (16/16 PASS).
  - `tests/security/financial-settlement-controls-redteam.test.ts` (16/16 PASS).

---

## 2. Journey 2: RWA Governance Golden Path

### Path: OPERATIONAL SOURCING $\rightarrow$ COMMITTEE DELIBERATION $\rightarrow$ QUORUM VOTING $\rightarrow$ REVEAL $\rightarrow$ ON-SITE INSPECTION

```
[Estate Manager Sourcing] ──> [Committee Ballot] ──> [Weighted Quorum] ──> [Atomic Award] ──> [Premises Inspection]
```

### 2.1 Role & Separation of Powers
* **Canonical Roles:** 7 Authoritative Roles defined in `packages/domain/src/identity/authorization-chain.ts`:
  1. `PRESIDENT` (Executive voting member)
  2. `VICE_PRESIDENT` (Executive voting member)
  3. `SECRETARY` (Administrative voting member)
  4. `JOINT_SECRETARY` (Administrative voting member)
  5. `TREASURER` (Financial release & voting member)
  6. `COMMITTEE_MEMBER` (General voting member)
  7. `ESTATE_MANAGER` (**Operational only**; `canVote = false`, `canCreateRfq = true`, `canIssuePo = true`)
* **Forensic Invariant:** An Estate Manager can discover suppliers, manage tenders, and issue approved POs, but is strictly barred from voting on ballots (`canonical-auth.ts:119-123`).

### 2.2 Quorum & Weighted Voting
* **Route:** `/rfq/:rfqId/committee` (`apps/web/src/features/governance/pages/CommitteeVotePage.tsx`)
* **Behavior:**
  - Quorum enforcement requires a minimum of 2 committee member votes (configurable in `BUYER_PERSONA_CONFIGS.RWA.defaultQuorum = 2`).
  - Supports unit-weighted voting (e.g. votes weighted by apartment square footage or equal share).
  - Mandatory Conflict of Interest (COI) disclosure checkbox before casting ballots.
* **Forensic Evidence:**
  - `packages/domain/src/types/rwa-governance.test.ts` (13/13 PASS).
  - `apps/web/src/features/governance/rwa-governance-experience.test.ts` (8/8 PASS).

### 2.3 Physical Premises vs Legal Address Separation
* RWA registered legal address (Society Registration Certificate) is decoupled from operational delivery locations (e.g., *Clubhouse Pump Room*, *Tower C Facade*, *Basement STP*).
* Verified in `packages/domain/src/types/buyer-address.ts:66-72`.

---

## 3. Journey 3: MSME Regional Spend Governance Path

### Path: REGIONAL INTAKE $\rightarrow$ SPEND AUTHORITY CHECK $\rightarrow$ ANTI-SELF-APPROVAL $\rightarrow$ PO EXECUTION $\rightarrow$ SETTLEMENT

```
[Regional MSME Sourcing] ──> [Multi-Tier Spend Gate] ──> [Anti-Self-Approval] ──> [GSTIN Transaction Snapshot]
```

### 3.1 Regional Sourcing Hubs
* Tested against representative regional hubs in Tamil Nadu & South India:
  - **Erode / Bhavani:** Textile processing, sizing, motor rewinding, industrial chemicals.
  - **Tiruppur:** Garment printing, knitting needles, fabric compacting, effluent treatment.
  - **Coimbatore:** Precision foundry, CNC tooling, motor pump sets, engineering plastics.
  - **Hosur:** Automotive parts, metal fabrication, industrial logistics.
* Forensic Evidence: `packages/domain/src/taxonomy/canonical-taxonomy.test.ts` and `apps/web/src/features/intake/api/fast-track-intake.ts` support regional city heuristics.

### 3.2 Tiered Spend Authority & Anti-Self-Approval (PA-09)
* **Authority Thresholds (`canonical-auth.ts:132-182`):**
  - `PRIMARY_OWNER`: 1-click universal spend approval for any transaction value.
  - `MANAGER`: Spend approval threshold capped at **₹10,00,000**. Amounts $> ₹10,00,000$ automatically escalate to Primary Owner.
  - `DELEGATE` / `APPROVER`: Delegated spend proxy capped at **₹5,00,000**.
  - **Anti-Self-Approval (Rule PA-09):** `if (creatorPersonId === context.profileId)` strictly returns `allowed: false`. The person who drafted or published the requirement cannot approve their own spend.
* **Forensic Evidence:**
  - `tests/security/msme-spend-governance-redteam.test.ts` (20/20 PASS).
  - `apps/web/src/features/org/msme-spend-governance.test.tsx` (4/4 PASS).

---

## 4. Journey 4: Supplier Journey & 5-Tier Discovery Lifecycle

### Path: RADAR DISCOVERY $\rightarrow$ OTP VERIFICATION $\rightarrow$ QUICK-QUOTE $\rightarrow$ STATUTORY GATE $\rightarrow$ PO ACCEPTANCE $\rightarrow$ SETTLEMENT

```
[Discovered in Area] ──> [Details Available] ──> [OTP Verified] ──> [GST Verified] ──> [Settlement Eligible]
```

### 4.1 Canonical 5-Tier Lifecycle Sequence
Discovered in `packages/domain/src/types/supplier-lifecycle-tier.ts`:
1. `DISCOVERED_IN_AREA`: Crawled or geocoded business. Cannot receive invitations or quote.
2. `DETAILS_AVAILABLE`: Phone or email known. Can receive invitation link.
3. `OTP_REGISTERED`: Phone verified via SMS/WhatsApp OTP.
4. `OTP_VERIFIED`: Can submit sealed quotes via QuickQuote or supplier portal.
5. `GST_VERIFIED`: Statutory PAN and GSTIN verified. Eligible for direct award reveal, PO issuance, and financial disbursement.

### 4.2 QuickQuote Experience (WhatsApp / SMS Token)
* **Route:** `/q/:token` (`apps/web/src/features/quick-quote/pages/QuickQuotePage.tsx`)
* Unauthenticated mobile-friendly entry allowing suppliers to view masked requirement specifications and submit rates, TAT, and warranty without complex registration.
* Verified in `apps/web/src/features/quick-quote/quick-quote.test.ts` (5/5 PASS).

---

## 5. Journey 5: Platform Operator Governance

### 5.1 Superadmin Operational Oversight
* **Route:** `/admin` (`apps/web/src/features/admin/pages/AdminDashboardPage.tsx`)
* Gated strictly behind `requireAdmin` (`apps/web/src/features/auth/canonical-auth.ts:59`).
* Manages taxonomy catalog, supplier network adapters, GIS quota observability, and provider health.
* Cannot alter financial transactions or mutate historic audit ledgers.

### 5.2 Founder Dashboard & KPI Isolation
* **Route:** `/founder` (`apps/web/src/features/founder/pages/FounderDashboardPage.tsx`)
* Strictly accessible only to `FOUNDER` role.
* Verified in `tests/security/superadmin-founder-oversight-redteam.test.ts` (16/16 PASS):
  - Founder KPIs derive strictly from authenticated production transactions.
  - Zero synthetic demo GMV contaminates platform revenue analytics.
