# R2-26 — GOLDEN JOURNEY RECERTIFICATION MATRIX

**Product:** OTP — Open Trade & Procurement  
**Stage:** R2-26 — Independent Full Regression & Golden Journey Recertification  
**Baseline Commit:** `26e4054`  
**Execution Date:** Friday, September 25, 2026  
**Auditor Mode:** Independent Audit & Recertification Gate  
**Database Migration Ceiling:** Strictly Locked at `00197`  
**Primary Invariant:** *"OTP does the procurement work. The customer makes the decision."*  

---

## 1. GOLDEN JOURNEY CERTIFICATION OVERVIEW

This authoritative matrix records the step-by-step recertification of the **Canonical Golden Journeys** across all buyer personas (`INDIVIDUAL`, `RWA`, `MSME`), the supplier lifecycle (`DISCOVERED` $\rightarrow$ `VERIFIED`), and the retired `ENTERPRISE` fail-closed security boundary.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                     CANONICAL PERSONA GOLDEN JOURNEY TAXONOMY                          │
├─────────────────┬─────────────────┬──────────────────┬─────────────────────────────────┤
│ INDIVIDUAL      │ RWA             │ MSME             │ SUPPLIER                        │
├─────────────────┼─────────────────┼──────────────────┼─────────────────────────────────┤
│ • Personal      │ • Housing       │ • Industrial     │ • 2-Stage Discovery Lifecycle   │
│   Concierge     │   Society       │   Enterprise     │ • Sealed Tokenized Quotations   │
│ • Home Address  │ • Committee     │ • Multi-Facility │ • Pre-Award Masked Pseudonym    │
│   Auto-Inherit  │   Quorum (≥2)   │   Address Book   │ • Post-Award KYC & GSTIN Gate   │
│ • 1-Tap Review  │ • Mandatory COI │ • Tiered Spend   │ • 5-Point Inspection Signoff    │
│ • 1-Click PO    │   Declaration   │   Delegation     │ • Progressive Invoicing         │
│ • org_id: NULL  │ • SHA-256 Proof │ • Anti-Self-Appr │ • 0.50% Platform Fee Settlement │
└─────────────────┴─────────────────┴──────────────────┴─────────────────────────────────┘
```

---

## 2. INDIVIDUAL BUYER GOLDEN JOURNEY RECERTIFICATION

* **Persona Scope:** Single residential buyer procuring personal home improvements, solar systems, interior painting, or appliances.
* **Governing Invariant:** Zero committee overhead, zero quorum requirements, `organization_id` strictly remains `NULL`.

| Step ID | Stage | Action / Interaction | System Execution & Invariant Enforcement | Test Verification Reference | Status |
| :---: | :---: | :--- | :--- | :--- | :---: |
| **IND-01** | **TELL** | Multimodal Requirement Capture | Voice note or text intake; auto-extracts BoQ specifications and item requirements. | `create-requirement-mobile.test.ts` | **PASS** |
| **IND-02** | **TELL** | Address Selection | Automatically inherits `Home` address from Address Book; suppresses multi-facility prompts. | `address-book-and-persona.test.ts` | **PASS** |
| **IND-03** | **TELL** | RFQ Publishing | Publishes RFQ to verified regional suppliers; consumes 1 RFQ credit (out of 3 monthly allowance). | `pricing-entitlement-redteam.test.ts` | **PASS** |
| **IND-04** | **REVIEW** | 4-Pillar Masked Comparison | Compares 3+ sealed quotes across Landed Cost (with GST), TAT, Warranty, and Merit Score under masked pseudonyms (`Supplier #01`). | `quote-comparison-mobile.test.ts` | **PASS** |
| **IND-05** | **DECIDE** | 1-Tap Award Selection | Buyer selects winning quote; zero committee voting prompts or COI gates displayed. | `evaluation-decision-cockpit.test.ts` | **PASS** |
| **IND-06** | **DECIDE** | Atomic Award & Reveal Gate | Calls `award_quote_atomic` (PA-02); winning supplier contact details revealed; Decision Receipt generated. | `decide-atomic-award-redteam.test.ts` | **PASS** |
| **IND-07** | **TRACK** | Instant Purchase Order | Generates canonical Purchase Order with frozen address snapshot and bilateral statutory GST split (PA-06). | `track-milestone-settlement-redteam.test.ts` | **PASS** |
| **IND-08** | **TRACK** | Delivery & 5-Point Inspection | Buyer inspects delivered goods and signs off 5-point inspection checklist. | `accept-delivery-inspection.test.ts` | **PASS** |
| **IND-09** | **TRACK** | Settlement & Reward Accrual | Settles supplier invoice; records 0.10% buyer reward into individual loyalty wallet. | `buyer-reward.test.ts` | **PASS** |

---

## 3. RWA (HOUSING SOCIETY) GOLDEN JOURNEY RECERTIFICATION

* **Persona Scope:** Resident Welfare Associations and Gated Community Management Committees procuring common amenities (CCTV, Lifts, Diesel Generators, Security, Solar, Waterproofing).
* **Governing Invariant:** Democratic Committee Quorum ($\ge 2$ unconflicted votes), mandatory COI declarations, Estate Manager non-voting execution (`canVote: false`).

| Step ID | Stage | Action / Interaction | System Execution & Invariant Enforcement | Test Verification Reference | Status |
| :---: | :---: | :--- | :--- | :--- | :---: |
| **RWA-01** | **SETUP** | Committee Onboarding | Registers Society premises location; assigns committee roles (President, Secretary, Treasurer, Estate Manager). | `rwa-governance.test.ts` | **PASS** |
| **RWA-02** | **TELL** | Intake & Specification Draft | Estate Manager drafts requirement with BoQ attachment (e.g. 32-camera IP CCTV overhaul). | `requirement-intake-redteam.test.ts` | **PASS** |
| **RWA-03** | **TELL** | RFQ Publishing | Committee Officer approves requirement publication to Tamil Nadu verified supplier network. | `rfq-lifecycle.test.ts` | **PASS** |
| **RWA-04** | **REVIEW** | Committee 4-Pillar Review | Officers review masked quotes with landed GST and SLA breakdown; Estate Manager reviews non-voting notes. | `evaluation-decision-cockpit.test.ts` | **PASS** |
| **RWA-05** | **DECIDE** | Mandatory COI Declaration | Each committee officer must declare conflict of interest before ballot access is enabled. | `coi-declaration.test.ts` | **PASS** |
| **RWA-06** | **DECIDE** | Quorum Voting Execution | Officers cast weighted votes; Estate Manager ballot attempt fails closed with hard exception (PA-01). | `quorum-voting.test.ts` | **PASS** |
| **RWA-07** | **DECIDE** | Quorum Reached & Award Lock | Upon reaching $\ge 2$ unconflicted affirmative votes, `award_quote_atomic` locks the winning supplier. | `decide-atomic-award-redteam.test.ts` | **PASS** |
| **RWA-08** | **DECIDE** | SHA-256 Decision Receipt | Emits tamper-evident `DecisionReceipt` capturing voter identities, timestamps, and quorum audit proof. | `decision-receipt.test.ts` | **PASS** |
| **RWA-09** | **TRACK** | Milestone & Work Order Tracking | Tracks multi-stage project milestones (Installation, Cabling, NVR Configuration, Sign-off). | `track-milestone.test.ts` | **PASS** |
| **RWA-10** | **TRACK** | Double-Entry Settlement | Signs off 5-point inspection; posts balanced debits/credits to double-entry ledger (PA-07). | `financial-settlement-controls-redteam.test.ts` | **PASS** |

---

## 4. MSME (ENTERPRISE / MANUFACTURING) GOLDEN JOURNEY RECERTIFICATION

* **Persona Scope:** Micro, Small & Medium Enterprises operating across manufacturing clusters (Erode, Bhavani, Tiruppur, Coimbatore, Hosur).
* **Governing Invariant:** Multi-facility address mapping, Tiered spend delegation matrix, Anti-Self-Approval guard (PA-09), statutory bilateral GST calculation (PA-06).

| Step ID | Stage | Action / Interaction | System Execution & Invariant Enforcement | Test Verification Reference | Status |
| :---: | :---: | :--- | :--- | :--- | :---: |
| **MSM-01** | **SETUP** | Multi-Facility Mapping | Registers enterprise HQ, Erode spinning mill, and Hosur assembly unit in Address Book (R2-14). | `address-book-and-persona.test.ts` | **PASS** |
| **MSM-02** | **TELL** | Cluster-Specific Requirement | Procurement officer creates RFQ for industrial pumps specifying delivery to Coimbatore plant. | `canonical-taxonomy.test.ts` | **PASS** |
| **MSM-03** | **TELL** | RFQ Publication & Dispatch | System routes RFQ to verified engineering suppliers in Coimbatore/Salem industrial belts. | `supplier-network-production-truth-redteam.test.ts` | **PASS** |
| **MSM-04** | **REVIEW** | Bilateral GST & Cost Breakdown | 4-Pillar review displays intra-state CGST+SGST (9%+9%) vs inter-state IGST (18%) based on plant state. | `gst-calculator.test.ts` | **PASS** |
| **MSM-05** | **DECIDE** | Tiered Spend Delegation Check | Requisition value (e.g. ₹4,50,000) evaluated against Spend Delegation Matrix: routes to Plant Head / VP. | `msme-spend-governance-redteam.test.ts` | **PASS** |
| **MSM-06** | **DECIDE** | Anti-Self-Approval Guard (PA-09) | Requisition creator attempts to approve spend; system throws hard anti-self-approval exception (PA-09). | `approval-matrix.test.ts` | **PASS** |
| **MSM-07** | **DECIDE** | Authorized Tier 2 Sign-off | Designated Plant Head approves spend; triggers atomic award lock and Decision Receipt generation. | `decide-atomic-award-redteam.test.ts` | **PASS** |
| **MSM-08** | **TRACK** | Progressive Invoicing (30/40/30) | Milestones linked to progressive invoices; verified by 3-way match before authorization. | `invoicing.test.ts` | **PASS** |
| **MSM-09** | **TRACK** | Double-Entry & ERP Export | Posts balanced debits/credits; exports Tally / Zoho XML journal entries with accurate HSN/SAC codes. | `ledger-balance.test.ts` | **PASS** |

---

## 5. SUPPLIER 2-STAGE LIFECYCLE GOLDEN JOURNEY RECERTIFICATION

* **Persona Scope:** Discovered and Verified suppliers quoting on buyer procurement requisitions.
* **Governing Invariant:** 2-Stage Lifecycle (`Discovered` vs `Verified`), pre-award pseudonym masking, post-award statutory KYC/GST reveal gate, 0.50% frozen platform fee.

| Step ID | Stage | Action / Interaction | System Execution & Invariant Enforcement | Test Verification Reference | Status |
| :---: | :---: | :--- | :--- | :--- | :---: |
| **SUP-01** | **DISCOVERY** | Automated Supplier Discovery | Scraped / directory supplier registered at `DISCOVERED` tier with verified Indian mobile number. | `supplier-network-engine.test.ts` | **PASS** |
| **SUP-02** | **INTAKE** | Tokenized Quotation Invitation | Supplier receives single-use tokenized link (`/q/:token`) via WhatsApp / SMS. | `portal-mobile-auth.test.ts` | **PASS** |
| **SUP-03** | **QUOTING** | Sealed Quote Submission | Supplier enters commercial price, GST rate, delivery days, warranty, and BoQ compliance sheet. | `supplier-lifecycle-redteam.test.ts` | **PASS** |
| **SUP-04** | **MASKING** | Pre-Award Pseudonym Masking | System assigns pseudonym (`Supplier #01 (Alpha)`); strips all legal names and contacts (PA-04/PA-05). | `review-masked-comparison-redteam.test.ts` | **PASS** |
| **SUP-05** | **AWARD** | Award Notification Received | Supplier notified of selection; winner onboarding gate halts unmasking until KYC completion (PA-02). | `award-closeout.test.ts` | **PASS** |
| **SUP-06** | **KYC** | Statutory Verification (Stage 2) | Supplier provides GSTIN, PAN, and bank details; verified against GST portal API. | `supplier-lifecycle-tier.test.ts` | **PASS** |
| **SUP-07** | **CONTRACT** | PO Acceptance & Milestone Feed | Supplier accepts PO; updates dispatch and shipment tracking details. | `track-milestone-settlement-redteam.test.ts` | **PASS** |
| **SUP-08** | **INVOICING**| Progressive Tax Invoice Upload | Submits statutory GST invoice matching PO line items; triggers 3-way match. | `invoicing.test.ts` | **PASS** |
| **SUP-09** | **SETTLE**  | Settlement Disbursement | Platform disburses net payable minus 0.50% frozen OTP platform fee; posts double-entry journal. | `financial-settlement-controls-redteam.test.ts` | **PASS** |

---

## 6. RETIRED ENTERPRISE PERSONA FAIL-CLOSED RECERTIFICATION

The legacy "Enterprise" persona has been permanently retired. All input variants fail closed:

| Test Input Variant | Normalized Value | System Reaction | Invariant Guarantee | Status |
| :--- | :--- | :--- | :--- | :---: |
| `"ENTERPRISE"` | `ENTERPRISE` | Throws `UnsupportedPersonaError` | Zero silent conversion to MSME | **PASS** |
| `"enterprise"` | `ENTERPRISE` | Throws `UnsupportedPersonaError` | Case-insensitive fail-closed | **PASS** |
| `" Enterprise "` | `ENTERPRISE` | Throws `UnsupportedPersonaError` | Whitespace-trimmed fail-closed | **PASS** |
| `"ent"` | `ENT` | Throws `UnsupportedPersonaError` | Shorthand alias rejected | **PASS** |
| `undefined` / `null` | `INDIVIDUAL` | Defaults to `INDIVIDUAL` | Safe non-destructive consumer fallback | **PASS** |

---

## 7. GOLDEN JOURNEY AUDIT SUMMARY & RECERTIFICATION METRICS

```text
====================================================================================================
  🛡️  OTP PLATFORM — GOLDEN JOURNEY RECERTIFICATION AUDIT SUMMARY
====================================================================================================
1. Individual Buyer Journey   : 9/9 Steps Certified (100% Pass • Zero Committee Overhead)
2. RWA Society Journey        : 10/10 Steps Certified (100% Pass • Quorum & Voting Enforced)
3. MSME Enterprise Journey    : 9/9 Steps Certified (100% Pass • Anti-Self-Approval Active)
4. Supplier Lifecycle Journey : 9/9 Steps Certified (100% Pass • 2-Stage KYC Gate Intact)
5. Enterprise Fail-Closed     : 5/5 Edge Probes Blocked (UnsupportedPersonaError)
====================================================================================================
OVERALL GOLDEN JOURNEY AUDIT VERDICT: ✅ 100% RECERTIFIED (42/42 STEPS GREEN)
====================================================================================================
```

---
*End of Authoritative R2-26 Golden Journey Recertification Matrix*
