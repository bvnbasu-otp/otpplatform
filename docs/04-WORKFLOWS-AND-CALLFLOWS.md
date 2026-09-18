# 04. End-to-End Workflows & Interaction Sequences (Callflows)

## 1. Dual-Track Procurement Workflows & Multimodal Intake

The OTP Platform provides two distinct intake and procurement workflows tailored to transaction complexity and governance requirements, enhanced by an **Intelligent Multimodal Intake Engine**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                DUAL-TRACK WORKFLOWS                                    │
│                                                                                        │
│  TRACK A: FAST TRACK SOURCING (2-Step Intake)                                          │
│  Target: Individuals, Small MSMEs, Emergency Facilities Repairs                        │
│  Time to Complete: 3 to 5 minutes                                                      │
│  ┌──────────────────────┐        ┌───────────────────────┐        ┌─────────────────┐  │
│  │ Step 1: Core Specs   │───────▶│ Step 2: Commercials   │───────▶│ Auto-Dispatch   │  │
│  │ Multimodal Input     │        │ Budget & Delivery Date│        │ WhatsApp / WAHA │  │
│  │ (Voice/Text/Doc/Pic) │        │ Quantity & Unit Review│        │ Invites         │  │
│  └──────────────────────┘        └───────────────────────┘        └─────────────────┘  │
│                                                                                        │
│  ────────────────────────────────────────────────────────────────────────────────────  │
│                                                                                        │
│  TRACK B: FULL GOVERNANCE SOURCING (4-Step Intake)                                     │
│  Target: RWAs, Cooperative Housing, Educational Trusts, Corporate Capex                │
│  Time to Complete: 12 to 15 minutes                                                    │
│  ┌──────────────────────┐        ┌───────────────────────┐        ┌─────────────────┐  │
│  │ Step 1: Specs & NLP  │───────▶│ Step 2: Compliance    │───────▶│ Step 3: Weights │  │
│  │ Indian Standards BIS │        │ GST/Tender Documents  │        │ 50/20/15/15     │  │
│  └──────────────────────┘        └───────────────────────┘        └────────┬────────┘  │
│                                                                            │           │
│                                  ┌───────────────────────┐                 │           │
│                                  │ Step 4: Approval      │◀────────────────┘           │
│                                  │ Matrix & Committee    │                             │
│                                  └───────────┬───────────┘                             │
│                                              ▼                                         │
│                                  ┌───────────────────────┐                             │
│                                  │ Conflict Declaration  │                             │
│                                  │ & Quorum Tally Room   │                             │
│                                  └───────────────────────┘                             │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Intelligent Buyer Experience & Multimodal Intake Engine

### 2.1 Multimodal Input Channels
Buyers can specify requirements using 4 flexible modalities:
1. **Voice Dictation**: Direct in-browser microphone capture with multi-lingual Devnagari/Hindi & English speech recognition.
2. **Natural Text Description**: Free-form procurement description with automatic NLP extraction of units (`L`, `KG`, `M`, `SQFT`, `HP`, `NOS`) and quantities.
3. **Document Upload**: PDF/DOCX specification sheets with automatic metadata scrubbing.
4. **Site Photo Capture**: Mobile camera or gallery upload with automated EXIF GPS coordinate stripping.

### 2.2 Buyer Confirmation Authority Boundary
- **Core Principle**: AI and rule-based extractors *assist* but *never unilaterally publish*.
- The extraction engine proposes categories, quantities, delivery timeframes, and estimated budgets, but the **Buyer retains absolute confirmation authority** to review, adjust quantities, toggle units, or override defaults before publishing the RFQ.

### 2.3 Templates vs. Examples vs. Actual Requirements
- **Starter Templates**: Pre-configured procurement structures (e.g., *Centralized Commercial RO Plant*, *Rooftop Solar EPC*, *CCTV Surveillance System*) providing standard BIS specification fields.
- **Inspirational Examples**: Reference samples showcasing compliant specification descriptions.
- **Actual Requirements**: Unique, binding organizational procurement records authored, confirmed, and owned by the buyer.

---

## 3. Interaction Sequence (Callflow) Diagrams

### 3.1 RFQ Sourcing & Inbound Quotation Callflow
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

### 3.2 Committee Voting, Conflict of Interest & Enterprise Approval Callflow
Demonstrates how committee members independently review and vote on quotes within enterprise approval limits:

```
Committee Member A          Enterprise Approver         Database (RLS)           Tally View
    │                              │                           │                      │
    │── 1. Open Comparison Room ───┼──────────────────────────▶│                      │
    │                              │                           │── 2. Check COI ─────▶│
    │                              │                           │   (No Conflict)      │
    │── 3. Vote "Supplier 7X4M" ───┼──────────────────────────▶│                      │
    │   (Technical: 9, Comm: 8)    │                           │── 4. Lock Vote ─────▶│
    │                              │                           │   (Immutable)        │
    │                              │── 5. Review Approval Tier▶│                      │
    │                              │   (Tier 2: ₹12.5L)        │── 6. Assert Invariant│
    │                              │   Signs Digital Approval─▶│   Sequential OK      │
    │                              │                           │   Signature Recorded │
    │                              │                           │                      │
    │                              │                           │── 7. Evaluate Quorum▶│
    │                              │                           │   (Quorum Met: 3/5)  │
```

---

### 3.3 Award Decision, Contract Gate (Step 11) & Mutual Reveal (Step 12)
Demonstrates the irreversible cryptographic unmasking and contract generation:

```
Procurement Manager         Database Function (RPC)       Awarded Supplier        Losing Suppliers
    │                               │                            │                       │
    │── 1. Select Winning Quote ───▶│                            │                       │
    │   Submit Formal Justification │                            │                       │
    │   "Selected based on BIS..."  │                            │                       │
    │                               │                            │                       │
    │── 2. Step 11: Contract Gate ─▶│── 3. Compile Contract ────▶│                       │
    │   Sign SHA-256 Markdown Doc   │   Assert Multi-Sig Check   │   Reviews & Signs     │
    │                               │   Phase = 'AWARDED'        │   Digital Hash        │
    │                               │                            │                       │
    │── 4. Step 12: Mutual Reveal ──▶│── 5. Bilateral Unmasking ─▶│                       │
    │   Reveals Winner GSTIN/Phone  │   Winner Contact to Buyer  │   "Awarded! PO Ready" │
    │                               │   Buyer GSTIN to Supplier  │                       │
    │                               │                            │                       │
    │                               │── 6. Closeout Losers ──────┼──────────────────────▶│
    │                               │   "RFQ Concluded. Thanks"  │   (Identity stays     │
    │                               │                            │    masked permanently)│
```

---

### 3.4 Progressive Milestone Inspection & Dispute Escalation Callflow
Demonstrates the on-site quality inspection and exception escalation process:

```
Site Inspector (Buyer)       Supplier Contractor          Platform Engine          Dispute Escalation
    │                               │                            │                         │
    │── 1. 5-Point Checklist Pass ──┼───────────────────────────▶│                         │
    │   (Material, Safety, QA)      │                            │── 2. Digital Sign-Off ──│
    │   Uploads Inspection Photos   │                            │   Hash Recorded         │
    │                               │                            │   Milestone APPROVED    │
    │                               │── 3. Submit Progressive ──▶│                         │
    │                               │   Tax Invoice for Milestone│                         │
    │                               │                            │                         │
    │── [Alternative: Defect Found] │                            │                         │
    │── 4. Raise Defect Issue ──────┼───────────────────────────▶│── 5. Open Dispute ─────▶│
    │   (Severity: HIGH, 48h SLA)   │◀── 6. SLA Timer Active ────│   Artifact: MILESTONE   │
    │                               │    Mutual Remediation      │   Escalation: Tier 1    │
```

---

## 4. Omnichannel Communication & Notification Sequence

The notification dispatch queue (`NotificationDispatchQueueItem`) handles multi-channel delivery across WhatsApp, Email, and In-App:

```mermaid
flowchart TD
    Trigger[Procurement Event Trigger] --> CheckPref{User Channel Preferences & Quiet Hours}
    CheckPref -- Blocked by Quiet Hours / Opt-Out --> Suppress[Status: SUPPRESSED]
    CheckPref -- Allowed --> Redact[Sanitize Payload: Strip Vendor PII if Pre-Award]
    Redact --> Interpolate[Interpolate Template {{variables}}]
    Interpolate --> Dispatch[Dispatch via Adapter: WAHA / SMTP / In-App]
    Dispatch -- Success --> Delivered[Status: DELIVERED]
    Dispatch -- Failure --> RetryCheck{Retry Count < 5?}
    RetryCheck -- Yes --> Backoff[Schedule Exponential Backoff: 30s * 2^attempt]
    Backoff --> Dispatch
    RetryCheck -- No --> DeadLetter[Status: DEAD_LETTER]
```
