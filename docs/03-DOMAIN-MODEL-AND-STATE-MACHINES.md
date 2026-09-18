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

## 3. The 15-Step Strict Monotonic Procurement Engine

Implemented in `packages/domain/src/enums/linear-pipeline.ts`, every procurement requirement strictly advances through 15 sequential steps. Out-of-order forward jumps are blocked by transition guards; backward navigation is strictly read-only for historical inspection.

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

### 3.1 Mapping 15 Linear Steps to the 8 Core Procurement Lifecycle States

| 15-Step Linear Code | Core Procurement State | Key Actions & Invariants |
| :--- | :--- | :--- |
| `STEP_1_SPEC_SUBMITTED` | `DRAFT` | NLP specification authoring, budget estimate, BIS unit selection. |
| `STEP_2_SEND_ENQUIRY` | `QUOTING` | Multi-channel dispatch to verified domain supplier registry (ONDC/Direct). |
| `STEP_3_MARKET_INTELLIGENCE` | `QUOTING` | Fair market pricing benchmarks, historical TAT, and reliability scores. |
| `STEP_4_START_NEGOTIATION_QA` | `QUOTING` | Masked bi-directional clarification threads; zero contact leakage. |
| `STEP_5_CLOSE_NEGOTIATION_QA` | `QUOTING` / `EVALUATING` | Quoting deadline closes; cryptographic quote seals frozen. |
| `STEP_6_COMPARE_QUOTES` | `EVALUATING` | Normalized evaluation matrix (Commercial, Specs, SLA, VMI Scorecard). |
| `STEP_7_VOTING_ROOM` | `EVALUATING` | Committee quorum activation; mandatory Conflict of Interest signoffs. |
| `STEP_8_CAST_VOTE` | `EVALUATING` | Immutable weighted ballots cast; justification required for non-L1 votes. |
| `STEP_9_AWARD_JUSTIFICATION` | `EVALUATING` | Majority decision receipt formulated with institutional sentence starters. |
| `STEP_10_LOCK_AWARD_DECISION`| `AWARDED` | Multi-signature decision lock; winner quote frozen irrevocably. |
| `STEP_11_CONTRACT_GATE` | `AWARDED` | Deterministic markdown legal contract compiled; SHA-256 hash signed. |
| `STEP_12_REVEAL_WINNING_SUPPLIER` | `AWARDED` | Bilateral mutual unmasking of Winner & Buyer GSTIN; losing quotes stay masked. |
| `STEP_13_VIEW_PO` | `PO_ISSUED` | Binding Purchase Order issued; supplier accepts commercial terms. |
| `STEP_14_MARK_PROGRESS` | `PO_ISSUED` / `INVOICED` | Milestone execution, 5-point inspection checklists, progressive invoices. |
| `STEP_15_STAR_RATING_JUSTIFICATION` | `SETTLED` | 1-5 star performance rating recorded, VMI metrics updated, audit closed. |

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
