# 03. Domain Model, Indian Standards & State Machines

## 1. Domain Entities Architecture

The OTP Platform domain model is partitioned into distinct entity tiers enforcing clean architectural boundaries:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CORE ENTITIES                                         │
│                                                                                         │
│   ┌────────────────────────┐         1:N         ┌────────────────────────┐             │
│   │     Organization       │────────────────────▶│   OrganizationMember   │             │
│   │ (RWA, Enterprise, MSME)│                     │ (Owner, Manager, Buyer)│             │
│   └───────────┬────────────┘                     └───────────┬────────────┘             │
│               │                                              │                          │
│               │ 1:N                                          │ creates                  │
│               ▼                                              ▼                          │
│   ┌────────────────────────┐         1:1         ┌────────────────────────┐             │
│   │      Requirement       │────────────────────▶│          RFQ           │             │
│   │ (Indian Standards NLP) │                     │  (Sourcing Window)     │             │
│   └────────────────────────┘                     └───────────┬────────────┘             │
│                                                              │                          │
│                                ┌─────────────────────────────┼────────────────────────┐ │
│                                │ 1:N                         │ 1:N                    │ │
│                                ▼                             ▼                        ▼ │
│                   ┌─────────────────────────┐   ┌───────────────────────┐  ┌──────────┴┐│
│                   │      RFQInvitation      │   │     CommitteeVote     │  │   Award   ││
│                   │ (Supplier [Code] Alias) │   │ (Conflict Dec + Tally)│  │ (Decision)││
│                   └────────────┬────────────┘   └───────────────────────┘  └─────┬─────┘│
│                                │ 1:1                                             │ 1:1  │
│                                ▼                                                 ▼      │
│                   ┌─────────────────────────┐                       ┌────────────┴─────┐│
│                   │          Quote          │                       │ ContractAgreement││
│                   │  (Sealed Commercials)   │                       │ (SHA-256 MD Gate)││
│                   └─────────────────────────┘                       └────────────┬─────┘│
│                                                                                  │ 1:1  │
│                                                                                  ▼      │
│   ┌────────────────────────┐         1:N         ┌────────────────────────┐ ┌────┴─────┐│
│   │  OrganizationWallet    │◀───────────────────-│  DoubleEntryLedger     │ │Purchase  ││
│   │(Rewards, Balance, Disc)│                     │ (Paise Exact Journal)  │ │Order (PO)││
│   └────────────────────────┘                     └────────────────────────┘ └──────────┘│
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Indian Standards Taxonomy & Attribute Schemas

OTP natively integrates the **Bureau of Indian Standards (BIS)**, **FSSAI Quality Grades**, and **GST HSN/SAC Codes** into its parsing and validation engine:

### 2.1 Standardized Measurement Units (`IndianStandardsUnits`)
- **Length & Area**: `running_meter`, `sq_ft`, `sq_meter`, `brass` (aggregate/earthwork).
- **Weight & Volume**: `kg`, `quintal` (100 kg), `metric_ton`, `liter`, `kiloliter`.
- **Commercial Counts**: `nos` (pieces), `pairs`, `sets`, `bundles`, `packets`, `lots`.
- **Engineering Capacities**: `hp` (motors), `kw` / `kva` (generators/transformers), `tr` (HVAC tons), `ah` (batteries).

### 2.2 Domain Category Specifications
The engine supports dynamic structured specification attributes for major procurement categories:
1. **Solar & Power Systems**: System capacity (kW), Panel efficiency (IS 14286), Inverter type (On-grid/Hybrid), Net-metering approval requirement.
2. **CCTV & Electronic Security**: Camera resolution (MP), NVR channels, Storage retention (BIS compliant 30/60/90 days), Cabling grade (Cat6/Fiber).
3. **Water Treatment & RO Plants**: Flow rate (LPH), Membrane type (Dow/Hydranautics), TDS reduction capacity, Raw water hardness tolerance.
4. **Gas Piping & Reticulation**: Pipe schedule (ASTM A53/IS 1239), Pressure testing certification (Hydrotest at 5x working pressure), Gas detector points.
5. **Furniture & Interior Fitouts**: Material grade (IS 303 MR/BWR Plywood, IS 2202 Flush doors), Edge banding thickness, Ergonomic certification (BIFMA).

---

## 3. Procurement Lifecycle Models: 6-Stage Commercial vs 15-Step Linear Engine

OTP employs a dual-tiered lifecycle model:
1. **6-Stage Commercial Procurement Lifecycle**: The authoritative, user-facing mental model across all public, buyer, and supplier touchpoints.
2. **15-Step Strict Monotonic State Machine**: The granular, low-level transaction engine implemented in `packages/domain/src/enums/linear-pipeline.ts` and gated strictly behind administrative capability (`role === 'admin'`).

### 3.1 The 6-Stage Commercial Procurement Lifecycle (Public & User Views)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              6-STAGE COMMERCIAL PROCUREMENT LIFECYCLE                                  │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Specification     2. Quoting & Sourcing  3. Evaluation & Vote   4. Award & Contract                 │
│    (Drafting)     ──►   (Supplier Desk)  ──►   (Masked Analysis)──►   (Digital Sign-Off)              │
│                                                                              │                         │
│ 6. Settlement & Audit 5. Milestone Inspection                                │                         │
│    (Ledger & VMI) ◀──   (Progress Tracking) ◀────────────────────────────────┘                         │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Stage 1 (`DRAFT`)**: Requirement specification authoring, BIS standards unit definition, multimodal intake (Voice, Text, Photo, Doc).
- **Stage 2 (`QUOTING`)**: Sealed RFQ window, verified supplier dispatch, fair market intelligence benchmarks.
- **Stage 3 (`EVALUATING`)**: Identity-protected proposal comparison, committee deliberation, weighted ballots, COI signoffs.
- **Stage 4 (`AWARDED`)**: Award decision lock, Step 11 SHA-256 legal contract gate, controlled mutual supplier reveal.
- **Stage 5 (`PO_ISSUED`)**: Purchase order issuance, milestone progression, 5-point physical inspections with photographic evidence.
- **Stage 6 (`SETTLED`)**: Tax invoicing, double-entry financial ledger accounting, non-custodial settlement, VMI scorecards, closeout audit.

---

### 3.2 The 15-Step Strict Monotonic State Machine Engine (Admin Engine)

Implemented in `packages/domain/src/enums/linear-pipeline.ts`, every procurement requirement advances strictly through 15 sequential steps. Out-of-order forward jumps are blocked by transition guards; backward navigation is strictly read-only for historical inspection.

```
Step 1:  STEP_1_SPEC_SUBMITTED              (Once Spec is Submitted)
Step 2:  STEP_2_SEND_ENQUIRY                (Send Enquiry to Verified Suppliers)
Step 3:  STEP_3_MARKET_INTELLIGENCE         (Real-World Market Intelligence Details)
Step 4:  STEP_4_START_NEGOTIATION_QA        (Review Received Quotes, Start Negotiation & QA)
Step 5:  STEP_5_CLOSE_NEGOTIATION_QA        (Close Negotiation & QA, Seal Quotes)
Step 6:  STEP_6_COMPARE_QUOTES              (Identity-Protected Evaluation)
Step 7:  STEP_7_VOTING_ROOM                 (Committee Voting Room & Quorum)
Step 8:  STEP_8_CAST_VOTE                   (Cast Weighted Ballots & COI Declarations)
Step 9:  STEP_9_AWARD_JUSTIFICATION         (Proceed with Award Justification)
Step 10: STEP_10_LOCK_AWARD_DECISION        (Lock Award Decision & Multi-Signature Freeze)
Step 11: STEP_11_CONTRACT_GATE              (Contract Gate: SHA-256 Markdown Agreement)
Step 12: STEP_12_REVEAL_WINNING_SUPPLIER    (Winner Contact & GST Reveal; Losers Masked)
Step 13: STEP_13_VIEW_PO                    (View & Accept Purchase Order)
Step 14: STEP_14_MARK_PROGRESS              (Mark Progress: 0% -> 100% Milestones & Inspections)
Step 15: STEP_15_STAR_RATING_JUSTIFICATION  (Star Rating with Physical Justification & Closeout)
```

### 3.3 Mapping 15 Linear Steps to the 6 Commercial Stages & 8 Core States

| 15-Step Linear Code | Commercial Stage | Core State | Key Actions & Invariants |
| :--- | :--- | :--- | :--- |
| `STEP_1_SPEC_SUBMITTED` | Stage 1: Draft | `DRAFT` | NLP specification authoring, budget estimate, BIS unit selection. |
| `STEP_2_SEND_ENQUIRY` | Stage 2: Quoting | `QUOTING` | Multi-channel dispatch to verified domain supplier registry (ONDC/Direct). |
| `STEP_3_MARKET_INTELLIGENCE` | Stage 2: Quoting | `QUOTING` | Fair market pricing benchmarks, historical TAT, and reliability scores. |
| `STEP_4_START_NEGOTIATION_QA` | Stage 2: Quoting | `QUOTING` | Masked bi-directional clarification threads; zero contact leakage. |
| `STEP_5_CLOSE_NEGOTIATION_QA` | Stage 2 / 3 | `QUOTING` / `EVALUATING` | Quoting deadline closes; cryptographic quote seals frozen. |
| `STEP_6_COMPARE_QUOTES` | Stage 3: Evaluation | `EVALUATING` | Normalized evaluation matrix (Commercial, Specs, SLA, VMI Scorecard). |
| `STEP_7_VOTING_ROOM` | Stage 3: Evaluation | `EVALUATING` | Committee quorum activation; mandatory Conflict of Interest signoffs. |
| `STEP_8_CAST_VOTE` | Stage 3: Evaluation | `EVALUATING` | Immutable weighted ballots cast; justification required for non-L1 votes. |
| `STEP_9_AWARD_JUSTIFICATION` | Stage 3: Evaluation | `EVALUATING` | Majority decision receipt formulated with institutional sentence starters. |
| `STEP_10_LOCK_AWARD_DECISION`| Stage 4: Award | `AWARDED` | Multi-signature decision lock; winner quote frozen irrevocably. |
| `STEP_11_CONTRACT_GATE` | Stage 4: Award | `AWARDED` | Deterministic markdown legal contract compiled; SHA-256 hash signed. |
| `STEP_12_REVEAL_WINNING_SUPPLIER` | Stage 4: Award | `AWARDED` | Bilateral mutual unmasking of Winner & Buyer GSTIN; losing quotes stay masked. |
| `STEP_13_VIEW_PO` | Stage 5: Fulfillment | `PO_ISSUED` | Binding Purchase Order issued; supplier accepts commercial terms. |
| `STEP_14_MARK_PROGRESS` | Stage 5: Fulfillment | `PO_ISSUED` / `INVOICED` | Milestone execution, 5-point inspection checklists, progressive invoices. |
| `STEP_15_STAR_RATING_JUSTIFICATION` | Stage 6: Settlement | `SETTLED` | 1-5 star performance rating recorded, VMI metrics updated, audit closed. |

---

## 4. Vendor Master Intelligence (VMI) Performance Scorecard

Implemented in `packages/domain/src/types/vendor-intelligence.ts`, OTP evaluates suppliers across a **35/30/20/15 dimensional model**:

1. **Quality Score (35% Weight)**: Step 15 closeout star ratings, 5-point milestone inspection pass rate, and rework penalty.
2. **Delivery & On-Time Performance (30% Weight)**: Adherence to agreed work order milestone delivery dates.
3. **SLA & Dispute Adherence (20% Weight)**: Frequency of disputes, critical escalations, and resolution cycle times.
4. **Commercial & Price Consistency (15% Weight)**: Quote-to-invoice variance, change order frequency, and price stability.

### 4.1 Performance Tiers & Privacy-Preserving Scorecard Badges
- **PLATINUM**: Score $\ge 90$ (`EXEMPLARY` badge, `4.8 - 5.0 ★`, `95%+ On-Time`, `50+ Orders`).
- **GOLD**: Score $80 - 89$ (`COMMENDED` badge, `4.5 - 4.7 ★`, `85-94% On-Time`, `25-49 Orders`).
- **SILVER**: Score $70 - 79$ (`STANDARD` badge, `4.0 - 4.4 ★`, `75-84% On-Time`, `10-24 Orders`).
- **BRONZE**: Score $60 - 69$ (`EMERGING` badge, `3.5 - 3.9 ★`, `5-9 Orders`).
- **PROBATIONARY**: Score $< 60$ (`UNDER_OBSERVATION` badge).

*Privacy Invariant:* During quoting and evaluation (Steps 1–11), scores are rendered strictly as **anonymized coarse badges** (`Supplier A7K3`, `EXEMPLARY`, `4.8 - 5.0 ★`) to prevent boutique vendor fingerprinting.

---

## 5. Multi-Tier Enterprise Approval Matrix

Implemented in `packages/domain/src/types/approval-matrix.ts`, organization procurement governance enforces multi-tiered financial threshold approval chains:

- **Tier 1: Team / Procurement Manager (`< ₹5,00,000`)**: Single manager signoff for small operational purchases.
- **Tier 2: Department Head / VP (`₹5,00,000` to `₹25,00,000`)**: Departmental review and budget owner signoff.
- **Tier 3: CFO / Executive Director (`> ₹25,00,000`)**: Executive committee and financial lead signoff.

### 5.1 Anti-Bypass Governance Guards:
1. **Self-Approval Prevention**: An RFQ creator/requester cannot approve their own procurement stage if `preventSelfApproval = true`.
2. **Sequential Stage Order**: Stage $N$ cannot be approved until Stage $N-1$ is fully in `APPROVED` status.
3. **Dual-Signoff Tracking**: Configurable mandatory dual signoff for high-value contracts above enterprise thresholds (e.g., >₹50L).
4. **Digital Signature Hashing**: Every approval step records a cryptographic signoff hash with timestamp and profile metadata.

---

## 6. Tamper-Evident Contract Operations (Step 11 Contract Gate)

Implemented in `packages/domain/src/types/contract-agreement.ts`:
- **Deterministic Legal Markdown Compilation**: Generates standardized bilingual procurement agreements detailing scope, commercial milestones, GST tax breakdown, delivery sites, and warranty clauses.
- **SHA-256 Document Checksum**: The compiled contract markdown is hashed into an immutable 64-character SHA-256 fingerprint.
- **Bilateral Digital Sign-Off**: Captures HMAC-SHA256 digital signature hashes for both the Buyer Procurement Authority and Supplier Authorized Signatory.
- **Liquidated Damages Clause**: Automated tracking of daily delay penalties (e.g. `0.50%` per day overdue, capped at `10%` of contract value).

---

## 7. Double-Entry Financial Accounting Ledger & Non-Custodial Settlement

Implemented in `packages/domain/src/accounting/` and `packages/domain/src/types/`:
- **Non-Custodial Architecture**: OTP does not hold client funds or act as an escrow agent. Payments move directly between Buyer and Supplier bank accounts.
- **Supplier Platform Fee (`0.50%`)**: A transparent `0.50%` platform fee is assessed at settlement on gross transaction value.
- **Buyer Sourcing Reward (`0.10%`)**: Buyers earn a `0.10%` sourcing reward credited directly to their **Organization Wallet** (`balanceCredits`).
- **Organization Wallets**: Reward credits can be redeemed for future platform subscriptions or add-on analytical services.
- **Paise-Exact Conservation**: Enforces the invariant:
  $$\text{Adjusted Gross} = \text{TDS} + \text{Platform Fee} + \text{Supplier Net Settlement}$$
- **Statutory Tax Splits**: Native calculation of CGST, SGST, IGST, and Section 194C / 194J / 194Q TDS withholding.

---

## 8. Progressive Milestone Inspections & Dispute Escalation

### 8.1 5-Point Milestone Inspection Checklist (`milestone-inspection.ts`)
1. **Materials & Specifications**: Verification against BIS standards and agreed bill of materials.
2. **Dimensional & Quantity Compliance**: Physical measurement and unit count verification.
3. **Functional & Operational Testing**: Live testing of equipment, machinery, or systems.
4. **Safety & Regulatory Compliance**: Adherence to statutory safety, fire, and structural norms.
5. **Aesthetics & Completion Quality**: Workmanship, finishing, and site clearance.

*Inspection Gate:* Progressive tax invoices can only be generated for milestones that have achieved an **`APPROVED` inspection with `passed = true`**.

### 8.2 4-Tier Dispute Resolution Hierarchy (`dispute-escalation.ts`)
- **7 Dispute Artifacts**: `PURCHASE_ORDER`, `WORK_ORDER`, `MILESTONE`, `INVOICE`, `PAYMENT`, `SETTLEMENT`, `DELIVERY`.
- **4 Severity Levels & SLA Timers**:
  - `CRITICAL`: 24-hour SLA
  - `HIGH`: 48-hour SLA
  - `MEDIUM`: 72-hour SLA
  - `LOW`: 120-hour SLA
- **4 Escalation Levels**:
  1. `TIER_1_DIRECT_RESOLUTION`: Direct vendor-buyer clarification and mutual remediation.
  2. `TIER_2_COMMITTEE_MEDIATION`: RWA/Corporate procurement committee arbitration.
  3. `TIER_3_EXECUTIVE_ARBITRATION`: Executive board and legal lead review.
  4. `TIER_4_LEGAL_ESCALATION`: Formal institutional legal proceedings.

---

## 9. 22 Formal Failure Path Invariants (F01 to F22)

Codified in `apps/web/src/features/governance/failure-paths-regression.test.ts` (32/32 tests passing), OTP mathematically enforces 22 formal failure path guards:

| Code | Failure Path Invariant & Guard Condition | Enforcement Behavior |
| :---: | :--- | :--- |
| **F01** | Empty Justification on Award Lock | Rejects award lock with empty or whitespace justification string. |
| **F02** | Zero Quorum Deliberation Bypass | Rejects award lock when total votes cast = 0 without quorum. |
| **F03** | Premature Quoting State Award Lock | Blocks award locking while RFQ is in active `QUOTING` state. |
| **F04** | Invalid Winning Quote UUID Reference | Rejects award referencing non-existent quote UUID (`00000000-...`). |
| **F05** | Double Awarding on Already Finalized RFQ | Throws conflict exception when attempting to lock an already awarded RFQ. |
| **F06** | COI Signoff Gate in Voting Room | Blocks ballot submission without explicit Conflict of Interest signoff. |
| **F07** | Non-Existent Quote Candidate Vote | Rejects vote cast for unknown quote ID. |
| **F08** | Superseded Historical Vote Invalidation | Invalidates prior votes when an updated ballot is cast by the same member. |
| **F09** | Missing Justification on Non-L1 Deviation | Mandates physical justification when recommending higher-priced quote over L1. |
| **F10** | Unsigned Step 11 Contract Gate Advance | Rejects transition from Step 11 to Step 12 without buyer digital signature. |
| **F11** | Contract SHA-256 Checksum Tampering | Detects content mutation between compilation and signature execution. |
| **F12** | Premature Supplier Unmasking Pre-Award | Rejects identity reveal requests before RFQ reaches `AWARDED` state. |
| **F13** | Non-Winning Supplier PII Leakage | Ensures losing supplier identities remain permanently masked post-award. |
| **F14** | PO Generation on Stalled/Cancelled RFQ | Blocks PO creation on cancelled, expired, or stalled RFQs. |
| **F15** | Negative Line Item Unit Pricing | Rejects quote submission or PO with unit price $\le 0$. |
| **F16** | Uninspected Milestone Invoice Generation | Blocks invoice creation for milestones without `passed = true` inspection. |
| **F17** | Inspection Checklist Partial Completion | Rejects inspection signoff if any of the 5 criteria lack a pass/fail determination. |
| **F18** | Duplicate Gateway Payment Webhook | Deduplicates webhook idempotently via `gateway_event_id` unique constraint. |
| **F19** | Non-Custodial Paise Imbalance | Rejects settlement ledger entry where $\text{Gross} \ne \text{TDS} + \text{Fee} + \text{Net}$. |
| **F20** | Negative Wallet Reward Balance | Rejects reward debit operations exceeding available wallet credits. |
| **F21** | Self-Approval in Approval Matrix | Blocks workflow creator from approving their own tier when `preventSelfApproval = true`. |
| **F22** | Out-of-Order Approval Stage Signoff | Blocks approval of Tier $N$ before Tier $N-1$ is fully approved. |
