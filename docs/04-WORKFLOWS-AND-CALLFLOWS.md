# 04. End-to-End Workflows & Interaction Sequences (Callflows)

## 1. Dual-Track Procurement Workflows

The OTP Platform provides two distinct intake and procurement workflows tailored to transaction complexity and governance requirements:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                DUAL-TRACK WORKFLOWS                                    │
│                                                                                        │
│  TRACK A: FAST TRACK SOURCING (2-Step Intake)                                          │
│  Target: Individuals, Small MSMEs, Emergency Facilities Repairs                        │
│  Time to Complete: 3 to 5 minutes                                                      │
│  ┌──────────────────────┐        ┌───────────────────────┐        ┌─────────────────┐  │
│  │ Step 1: Core Specs   │───────▶│ Step 2: Commercials   │───────▶│ Auto-Dispatch   │  │
│  │ Category & Quantity  │        │ Budget & Delivery Date│        │ WhatsApp Invites│  │
│  └──────────────────────┘        └───────────────────────┘        └─────────────────┘  │
│                                                                                        │
│  ────────────────────────────────────────────────────────────────────────────────────  │
│                                                                                        │
│  TRACK B: FULL GOVERNANCE SOURCING (4-Step Intake)                                     │
│  Target: RWAs, Cooperative Housing, Educational Trusts, Corporate Capex                │
│  Time to Complete: 12 to 15 minutes                                                    │
│  ┌──────────────────────┐        ┌───────────────────────┐        ┌─────────────────┐  │
│  │ Step 1: Specs & NLP  │───────▶│ Step 2: Compliance    │───────▶│ Step 3: Weights │  │
│  │ Indian Standards BIS │        │ GST/Tender Documents  │        │ 60/30/10 Split  │  │
│  └──────────────────────┘        └───────────────────────┘        └────────┬────────┘  │
│                                                                            │           │
│                                  ┌───────────────────────┐                 │           │
│                                  │ Step 4: Committee     │◀────────────────┘           │
│                                  │ Quorum & Assignment   │                             │
│                                  └───────────┬───────────┘                             │
│                                              ▼                                         │
│                                  ┌───────────────────────┐                             │
│                                  │ Conflict Declaration  │                             │
│                                  │ & Quorum Tally Room   │                             │
│                                  └───────────────────────┘                             │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Interaction Sequence (Callflow) Diagrams

### 2.1 RFQ Sourcing & Inbound Quotation Callflow
Demonstrates how suppliers receive inquiries, submit sealed quotations, and clarify specifications without exposing their identity:

```
Buyer Browser              OTP Platform (Backend)          WAHA WhatsApp            Supplier Mobile
    │                               │                            │                         │
    │── 1. Publish RFQ ────────────▶│                            │                         │
    │   (Fast Track or Gov)         │── 2. Create Salt & RFQ ───▶│                         │
    │                               │   Invites (Supplier 7X4M)  │── 3. Template Notice ──▶│
    │                               │                            │   "New RFQ in Solar"    │
    │                               │                            │                         │
    │                               │◀── 5. Inbound WhatsApp ────┼── 4. Clicks Portal Link │
    │                               │    Quote Details or Web    │   or Texts Quote Price  │
    │                               │    Submission Form         │                         │
    │                               │                            │                         │
    │                               │── 6. Sanitize EXIF & PDF ──│                         │
    │                               │   Mask identity columns    │                         │
    │                               │   Expose via quotes_identity_protected    │                         │
    │                               │                            │                         │
    │◀── 7. Realtime Quote Arrived ─│                            │                         │
    │    "Supplier 7X4M: ₹4,80,000" │                            │                         │
```

---

### 2.2 Committee Voting & Conflict of Interest Callflow
Demonstrates how multiple committee members independently review and vote on quotes:

```
Committee Member A          Committee Member B          Database (RLS)           Tally View
    │                              │                           │                      │
    │── 1. Open Comparison Room ───┼──────────────────────────▶│                      │
    │                              │                           │── 2. Check COI ─────▶│
    │                              │                           │   (No Conflict)      │
    │── 3. Vote "Supplier 7X4M" ───┼──────────────────────────▶│                      │
    │   (Technical: 9, Comm: 8)    │                           │── 4. Lock Vote ─────▶│
    │                              │                           │   (Immutable)        │
    │                              │── 5. Open Room ──────────▶│                      │
    │                              │   Declare Conflict! ─────▶│── 6. Disqualify ────▶│
    │                              │                           │   Member B from RFQ  │
    │                              │                           │                      │
    │                              │                           │── 7. Evaluate Quorum▶│
    │                              │                           │   (Quorum Met: 3/5)  │
```

---

### 2.3 Award Decision, Commercial Commitment & One-Way Reveal Callflow
Demonstrates the irreversible cryptographic unmasking of the awarded supplier:

```
Procurement Manager         Database Function (RPC)       Awarded Supplier        Losing Suppliers
    │                               │                            │                       │
    │── 1. Select Winning Quote ───▶│                            │                       │
    │   Submit Formal Justification │                            │                       │
    │   "Selected based on BIS..."  │                            │                       │
    │                               │                            │                       │
    │── 2. Sign Commitment ────────▶│── 3. Assert State Machine  │                       │
    │   (Legal Intent to Purchase)  │   Phase = 'AWARDED'        │                       │
    │                               │   Reveal = 'REVEALED'      │                       │
    │                               │                            │                       │
    │                               │── 4. Notify Winner ───────▶│                       │
    │                               │   "Awarded! PO Issued"     │                       │
    │                               │                            │                       │
    │                               │── 5. Closeout Losers ──────┼──────────────────────▶│
    │                               │   "RFQ Concluded. Thanks"  │   (Identity stays     │
    │                               │                            │    masked permanently)│
    │                               │                            │                       │
    │◀── 6. Receive Decision ───────│                            │                       │
    │    Receipt with Winner GSTIN  │                            │                       │
    │    & Direct Contact Details   │                            │                       │
```
