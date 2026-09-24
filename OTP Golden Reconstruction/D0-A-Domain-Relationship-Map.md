# OTP Domain Relationship Map & Authorization Transitions (D0-A)
**Document Identifier:** `OTP-RECON-D0-A-RELATIONSHIP-MAP`  
**Version:** 1.0 (Golden Baseline)  
**Status:** AUTHORITATIVE ARCHITECTURAL REFERENCE  
**Working Root:** `G:/My Drive/otp`  
**Ceiling Migrations:** `00196` (Buyer Identity & Onboarding), `00197` (Universal Org Role Lifecycle & Succession)

---

## 1. Universal Structural Relationship Pipeline

The OTP authorization model is strictly decomposed into 13 discrete structural stages. Authority is never derived directly from raw identity or client session tokens; it is computed deterministically through this unbroken chain:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          THE 13-STAGE STRUCTURAL CHAIN                                │
└────────────────────────────────────────────────────────────────────────────────────────┘

 1. Person ──────────> Biological human with verified auth credentials (auth.users)
        │
 2. Identity ────────> Platform Profile record (public.profiles)
        │
 3. Context ─────────> Active Persona Selection: INDIVIDUAL | RWA | MSME | SUPPLIER
        │
 4. Organization ────> Legal / Community Institution entity (public.organizations)
        │
 5. Eligibility ─────> Verification Prerequisite (e.g., RWA Resident Owner, MSME Directorship)
        │
 6. Membership ──────> Association link (public.organization_members)
        │
 7. Role ────────────> Organizational Office (e.g., PRESIDENT, TREASURER, PRIMARY, MANAGER)
        │
 8. Responsibility ──> Functional Domain Scope (e.g., CIVIL_MAINTENANCE, ELECTRICAL, GENERAL)
        │
 9. Delegation ──────> Explicit Time-Bounded Spend Proxy (public.organization_delegations)
        │
10. Authority ───────> Effective Permitted Action Set (VOTE, APPROVE_TIER_1, ISSUE_PO)
        │
11. Transaction ─────> Active Procurement Event (public.rfqs, public.purchase_orders)
        │
12. Effective Date ──> Strict Temporal Validity Window (now() >= starts_at AND now() <= expires_at)
        │
13. Audit Attribution> Immutable Historical Action Ledger (public.org_governance_action_audits)
```

---

## 2. Multi-Context Independence Architecture

A single biological Person may hold multiple distinct procurement contexts across different institutions. These contexts are completely isolated: **authority granted in Context A never creates authority in Context B**.

```text
                                  ┌───────────────────────────┐
                                  │      Person A (User)      │
                                  │   auth.users / profiles   │
                                  └─────────────┬─────────────┘
                                                │
         ┌──────────────────────────────────────┼──────────────────────────────────────┐
         │                                      │                                      │
         ▼                                      ▼                                      ▼
┌──────────────────┐                  ┌──────────────────┐                  ┌──────────────────┐
│  Context 1:      │                  │  Context 2:      │                  │  Context 3:      │
│  INDIVIDUAL      │                  │  RWA BUYER       │                  │  MSME BUYER      │
├──────────────────┤                  ├──────────────────┤                  ├──────────────────┤
│ Scope: Personal  │                  │ Org: Greenview   │                  │ Org: Apex Tools  │
│ Role: Self       │                  │ Role: Treasurer  │                  │ Role: Primary    │
│ Delegation: NONE │                  │ Term: 2026-2027  │                  │ Delegations: Yes │
│ Quorum: 1 (Self) │                  │ Quorum: ≥2 Votes │                  │ Limit: ₹5,00,000 │
│ Address: Home    │                  │ Address: Society │                  │ Address: Factory │
└────────┬─────────┘                  └────────┬─────────┘                  └────────┬─────────┘
         │                                     │                                     │
         ▼                                     ▼                                     ▼
┌──────────────────┐                  ┌──────────────────┐                  ┌──────────────────┐
│ Personal PO      │                  │ RWA Committee PO │                  │ MSME Business PO │
│ Self-Commitment  │                  │ Quorum Sign-off  │                  │ Delegated Comm.  │
└──────────────────┘                  └──────────────────┘                  └──────────────────┘
```

### Context Boundary Rules:
1. **RWA Treasurer authority $\neq$ MSME authority:** A user who is Treasurer of Greenview RWA cannot approve purchase orders for Apex Tools MSME.
2. **MSME Primary authority $\neq$ Individual authority:** Business purchase orders cannot be charged to personal credit accounts or delivered to personal home addresses unless explicitly configured.
3. **Buyer authority $\neq$ Supplier authority:** Dual-persona users must switch `active_portal_side` via `switch_portal_side()`. When acting as a Buyer, the user cannot bid on their own RFQs. When acting as a Supplier, the user cannot view other suppliers' sealed quotes.

---

## 3. Persona-Specific Domain Relationship Maps

### 3.1 Individual Buyer Flow
```text
Person 
  └── Profile (active_portal_side = 'BUYER')
        └── Buyer Address Book (is_primary = true, address_type = 'DELIVERY')
              └── Requirement Intake (Fast Track, 2-Step)
                    └── RFQ Publication (Direct Publish)
                          └── Sealed Quote Reception (Masked View)
                                └── Direct Self-Award (No Quorum Required)
                                      └── Purchase Order Issuance
                                            └── Milestone Delivery & Settlement
```

### 3.2 RWA Institutional Governance Flow
```text
Person 
  └── Profile 
        └── Resident Owner Eligibility
              └── Tokenized Invitation Acceptance (`organization_invitations`)
                    └── RWA Managing Committee Membership (`organization_members`)
                          └── Effective-Dated Role Assignment (`org_role_assignments`)
                                ├── Role: PRESIDENT | TREASURER | SECRETARY | MEMBER
                                ├── Term: 365 Days (`effective_from` -> `effective_to`)
                                └── Annual Succession Link (`predecessor_assignment_id`)
                                      │
                                      ▼
                        Governed Procurement Action
                                ├── Multimodal Intake (Manager / Committee Draft)
                                ├── RFQ Published (Evaluation Weights: 60/30/10)
                                ├── Sealed Quotes Received (`rfq_quotes_identity_protected`)
                                ├── Conflict of Interest Declaration (Recusal if true)
                                ├── Committee Voting Room (Quorum Count $\ge 2$)
                                ├── Atomic Award Lock (`lock_and_reveal_award_atomic`)
                                ├── Immutable Decision Receipt Generated (`DecisionReceipt`)
                                ├── Supplier Award Onboarding & Reveal Gate
                                ├── Bilateral PO Contract Hashing (SHA-256)
                                ├── Milestone Delivery 5-Point Inspection Sign-off
                                └── Immutable Audit Snapshot (`org_governance_action_audits`)
```

### 3.3 MSME Business Procurement Flow
```text
Person
  └── Profile 
        └── MSME Registration & Directorship Verification
              └── MSME Primary Account (`org_type` = 'MSME', role = 'OWNER')
                    ├── Team Member Invitation (`organization_invitations`)
                    └── Delegation Proxy Configuration (`organization_delegations`)
                          ├── Delegatee Profile ID
                          ├── Permissions: ['APPROVE_TIER_1', 'ISSUE_PO']
                          ├── Monetary Spend Cap: ₹50,000 / ₹2,00,000
                          ├── UTC Validity: `starts_at` -> `expires_at`
                          └── Anti-Self-Approval Enforcement
                                │
                                ▼
                        Business Procurement Execution
                                ├── Fast Track / Threshold-Routed Intake
                                ├── RFQ Published & Supplier Pool Discovery
                                ├── Sealed Quote Comparison
                                ├── Delegated Tier Approval (Spend Cap Validated)
                                ├── Reveal Gate & GSTIN Verification (Inter vs Intra-state GST)
                                ├── PO Issuance with TDS Withholding (Section 194C / 194Q)
                                ├── Milestone Inspection & Delivery Acceptance
                                └── Double-Entry Accounting Ledger Posting
```

### 3.4 Supplier Participant & Award Onboarding Flow
```text
Prospective Supplier (Phone / WhatsApp / Email)
  └── Magic Link Invitation (`/q/:token`)
        └── Sealed Quote Submission (Price, GST, Delivery Days, Warranty)
              └── Anonymous Evaluation Room (Buyer evaluates `Supplier #01`)
                    │
                    ▼  (Buyer selects Quote for Award)
              Award Gate Triggered
                    │
                    ├── Scenario A: Supplier Already Verified
                    │     └── Instant Mutual Reveal -> PO Issuance
                    │
                    └── Scenario B: Supplier Unregistered / Verification Required
                          └── Supplier Award Onboarding Gate (`/supplier/award-onboarding/:token`)
                                ├── Step 1: GSTIN / PAN Entry & Statutory Validation
                                ├── Step 2: Commercial Bank Account & IFSC Details
                                ├── Step 3: Terms of Service & Integrity Acceptance
                                └── Atomic Verification RPC (`complete_supplier_award_onboarding_atomic`)
                                      │
                                      ▼
                                Mutual Reveal Unlocked
                                      ├── Buyer sees: Legal Name, GSTIN, Phone, Address
                                      ├── Supplier sees: Buyer Organization, Contact, Site Address
                                      └── PO Issued & Work Order Initiated
```

---

## 4. State Machine Transition Lifecycles

### 4.1 Procurement Lifecycle State Machine (Commercial Golden 6-Stage)

```text
 ┌─────────┐
 │  DRAFT  │ <── Initial Requirement Creation & Specification Intake
 └────┬────┘
      │ publish_rfq()
      ▼
 ┌─────────┐
 │ QUOTING │ <── Supplier Pool Invited; Sealed Quotes Ingested
 └────┬────┘
      │ quote_deadline_passed() OR manual_close()
      ▼
 ┌────────────┐
 │ EVALUATING │ <── Identity-Protected Decision Cockpit; Committee Voting; Quorum
 └────┬───────┘
      │ lock_and_reveal_award_atomic()
      ▼
 ┌─────────┐
 │ AWARDED │ <── Winning Quote Locked; Supplier Award Onboarding Gate
 └────┬────┘
      │ complete_onboarding() -> issue_purchase_order()
      ▼
 ┌───────────┐
 │ PO_ISSUED │ <── Bilateral Contract Signed; Milestone Deliveries Active
 └────┬──────┘
      │ all_milestones_inspected() -> release_final_payment()
      ▼
 ┌─────────┐
 │ SETTLED │ <── Double-Entry Ledger Reconciled; Platform Fee & Reward Settled
 └─────────┘

 ── Exception State:
 ┌─────────┐
 │ STALLED │ <── Zero quotes, expired deadline, or active dispute deadlock
 └─────────┘
```

### 4.2 Role Lifecycle & Succession State Machine (`org_role_assignments`)

```text
  ┌─────────────────────────────────────────────────────────────┐
  │                      ROLE LIFECYCLE                         │
  └─────────────────────────────────────────────────────────────┘

       appoint_org_role_atomic()
                  │
                  ▼
            ┌───────────┐
            │  ACTIVE   │ <── Full Voting & Transaction Authority Active
            └─────┬─────┘
                  │
     ┌────────────┼────────────┬────────────────────────┐
     │            │            │                        │
     │ Term Ends  │ Succession │ Resignation / Removal  │ Manual Rotation
     │ (365 Days) │ Transfer   │                        │
     ▼            ▼            ▼                        ▼
┌─────────┐  ┌────────────┐ ┌─────────┐            ┌─────────┐
│ EXPIRED │  │ SUPERSEDED │ │ REVOKED │            │ ROTATED │
└─────────┘  └────────────┘ └─────────┘            └─────────┘
     │            │              │                      │
     └────────────┴──────────────┴──────────────────────┘
                  │
                  ▼
      Authority Instantly Terminated
      Historical Actions Immutably Preserved in `org_governance_action_audits`
```

### 4.3 Delegation Proxy State Machine (`organization_delegations`)

```text
  ┌─────────────────────────────────────────────────────────────┐
  │                    DELEGATION LIFECYCLE                     │
  └─────────────────────────────────────────────────────────────┘

       create_delegation_proxy_atomic()
                  │
                  ▼
            ┌───────────┐
            │  ACTIVE   │ <── Delegatee can approve up to spend_cap_amount
            └─────┬─────┘
                  │
         ┌────────┴────────┐
         │                 │
         │ Expiry (UTC)    │ Primary Revocation (`revoke_delegation_proxy_atomic`)
         ▼                 ▼
   ┌───────────┐     ┌───────────┐
   │  EXPIRED  │     │  REVOKED  │
   └───────────┘     └───────────┘
         │                 │
         └────────┬────────┘
                  │
                  ▼
      Delegated Authority Revoked
      Anti-Self-Approval Checks Enforced
```

---

## 5. Relational Entity-Relationship Graph

```text
┌─────────────────┐       1:1       ┌──────────────────┐
│   auth.users    ├─────────────────┤ public.profiles  │
└─────────────────┘                 └────────┬─────────┘
                                             │
                       ┌─────────────────────┼─────────────────────┐
                       │ 1:N                 │ 1:N                 │ 1:N
                       ▼                     ▼                     ▼
             ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
             │ buyer_addresses  │  │organization_mems │  │  supplier_users  │
             └──────────────────┘  └────────┬─────────┘  └────────┬─────────┘
                                            │                     │
                                            │ N:1                 │ N:1
                                            ▼                     ▼
                                   ┌──────────────────┐  ┌──────────────────┐
                                   │  organizations   │  │    suppliers     │
                                   └────────┬─────────┘  └────────┬─────────┘
                                            │                     │
                       ┌────────────────────┼────────────┐        │
                       │ 1:N                │ 1:N        │ 1:N    │
                       ▼                    ▼            ▼        │
             ┌──────────────────┐ ┌────────────────┐ ┌────────┐  │
             │org_role_assigns  │ │org_delegations │ │requirements│
             └────────┬─────────┘ └────────────────┘ └────┬───┘  │
                      │ 1:N                               │ 1:1   │
                      ▼                                   ▼       │
             ┌──────────────────┐                    ┌────────┐   │
             │org_action_audits │                    │  rfqs  │   │
             └──────────────────┘                    └────┬───┘   │
                                                          │ 1:N   │
                                                          ▼       │
                                                     ┌────────┐   │
                                                     │ quotes ◄───┘
                                                     └────┬───┘
                                                          │ 1:1 (Winning)
                                                          ▼
                                                     ┌────────┐
                                                     │   po   │
                                                     └────┬───┘
                                                          │ 1:N
                                                          ▼
                                                     ┌────────┐
                                                     │inspections/ledger│
                                                     └────────┘
```

---
*End of Domain Relationship Map & Authorization Transitions (D0-A)*
