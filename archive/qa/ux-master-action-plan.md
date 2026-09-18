# OTP PLATFORM — UX MASTER CONSOLIDATION & ACTION PLAN

**Document ID:** `/qa/ux-master-action-plan.md`  
**Date:** September 13, 2026  
**Audience:** Product Leadership, Engineering, UX & UI Architecture  
**Scope:** Synthesis of Passes 1–5 (IA Audit, Simplification, Mobile Human Review, Visual Transformation, Information Diet)  
**Status:** UX MASTER PLAN READY FOR EXECUTION (ZERO BREAKING CHANGES TO ENGINES/RLS)

---

## 1. Executive UX Audit Synthesis (Passes 1–5 Cross-Analysis)

Across the 5 iterative UX passes, all diagnostic findings, user tests, and visual transformations have converged on one core architectural principle:  
👉 **"Complexity in the Engine. Simplicity in the Cockpit."**

### Cross-Pass Audit Comparison Matrix:

| UX Dimension | Pass 1: Initial State | Pass 2: Simplification | Pass 3: Mobile Human UX | Pass 4: Visual UI Shift | Pass 5: Final Diet | Status in Action Plan |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Landing Hero** | 5 text layers (1,850w) | 3-element rule (420w) | < 2s 5-sec test pass | High-impact CTA + Prompt | Score: 9.4/10 | **Implemented / Baseline** |
| **Lifecycle Model** | 3 competing models | 1 unified 5-step flow | 1 heading + 1 sentence | Scannable visual cards | Clean mental model | **Implemented / Baseline** |
| **Buyer Dashboard** | Marketing wall + 8 tabs | Action alert + Live feed | Zero horizontal scroll | High-contrast chips & cards | 3-tab glance bar | **Implemented / Baseline** |
| **Intake Scoring** | 5 mandatory sliders | Default badges + toggle | Touch-friendly pills | Weight pill badges | Progressive accordion | **Implemented / Baseline** |
| **Quote Comparison** | 11-column wide table | Responsive vertical stack | No side scroll on 390px | 4-pillar metric grid | 1-sec scannability | **Implemented / Baseline** |
| **Committee Voting** | Quorum text on solo buyer | 5 preset justification pills | 1-tap mobile submit | Score pill + Candidate card | Frictionless quorum | **Partially Implemented (Adaptive solo bypass pending)** |
| **Award / Reveal** | 2 separate URLs (`/award`, `/reveal`) | Consolidated intent copy | Single-intent gate | Streamlined unmasking | 1-step confirmation | **Partially Implemented (Single modal merge pending)** |

---

## A. Executive UX Diagnosis: The 5 Biggest UX Problems

1. **Mental Model Collision (Taxonomy Overload):**
   - *Issue:* The user was previously subjected to four competing abstractions simultaneously: 5-step flow, 12-stage lifecycle, 4 phase timers, and a 15-step linear breadcrumb (`Step 1/15` through `Step 15/15`).
   - *Impact:* Made an otherwise 2-minute procurement task feel like a 15-stage government bureaucratic marathon.
2. **Capability-Centric vs. Job-Centric UX:**
   - *Issue:* The platform repeatedly explained *how* it works (ONDC adapters, cryptographic salts, append-only logs, GST ITC rules, multi-criteria normalization) directly on primary action screens.
   - *Impact:* Created severe cognitive clutter and decision paralysis instead of focusing on *"What do you need to buy?"*.
3. **Competing Calls-to-Action (CTAs) & Dual Entry Paths:**
   - *Issue:* The dashboard featured two competing ways to start (`+ New Requirement` vs `What do you need? 1-Box Search`), and quote matrices presented multiple buttons of identical visual weight.
   - *Impact:* First-time users hesitated on which action was safe and canonical.
4. **Desktop Table Overflow on Small Viewports (390×844):**
   - *Issue:* Wide 11-column comparison tables and dense horizontal tab bars broke mobile viewport ergonomics.
   - *Impact:* Caused disorienting horizontal scrolling and clipped critical action buttons.
5. **Two-Stage Award Friction (`/award` $\rightarrow$ `/reveal`):**
   - *Issue:* Forcing buyers to lock awards on `/award` and then navigate to `/reveal` for a second legal confirmation created unnecessary drop-off at the most exciting moment: finding out who won.
   - *Impact:* Unneeded friction right before issuing the Purchase Order.

---

## B. KEEP (High-Value Elements to Retain)

- **Natural Language Prompt Bar & Multilingual Voice Dictation:** The single most engaging entry point for Indian MSMEs and community managers.
- **Identity-Protected Shield Indicator:** `🔒 Identities Protected · Unmasks after award` builds immense institutional trust without wordiness.
- **4-Pillar Visual Quote Metric Grid:** **Price** (`₹8,800` + `⚡ Lowest`), **Delivery TAT** (`2 Days`), **Warranty** (`12 Mo`), and **Score** (`9.1/10`).
- **5 Preset Decision Justification Chips:** Eliminates the pain of typing legal justifications on mobile keyboards during committee votes.
- **Docked Stage Navigator Progress Dots:** Unobtrusive bottom status indicator that keeps users oriented without taking vertical space.
- **Slide-Over Detail Drawer (`ℹ️ Details`):** Allows expert users to inspect all 20+ technical fields without cluttering the primary dashboard ledger.
- **Direct B2B GST Verified Badge:** Clearly communicates that settlement is direct between buyer and vendor without OTP holding funds.

---

## C. REMOVE (Clutter & Boilerplate to Eliminate)

- **Redundant 12-Stage Lifecycle List:** The 3-column "Source / Decide / Deliver" 12-bullet block on the home page (duplicates the 5-step visual flow).
- **Phase Clocks Explainer Block:** "Four of Those Stages Run to a Clock" (confuses first-time users with internal timer mechanics).
- **Defensive Caveat Copy:** *"The lowest quote isn't necessarily the best quote..."* (move philosophical hedging out of primary headings).
- **Persistent Dashboard Marketing Cards:** Static cards ("Zero-Fee Direct Settlement", "Governance Profile") that repeat on every login.
- **Bulky 4-Sentence Example Prompts:** Paragraph boxes that pushed the intake form below the fold.
- **Multi-Member Quorum Meters for Solo Buyers:** Showing quorum meters (`0/1 Votes`) to individual buyers or 1-owner MSMEs.
- **Raw JSON Metadata in Audit Trail:** Technical logs shown by default instead of human-readable activity timestamps.

---

## D. SIMPLIFY (Elements to Streamline)

- **Hero Copy:** Streamline to the 3-element rule (What OTP does, Why it matters, One primary action).
- **Dashboard Pipeline Tabs:** Replace 8 technical state tabs with the 3-pill Glance Bar:
  - `🟢 3 Active`
  - `🟡 2 Need your decision`
  - `⚪ 4 Completed`
- **Tender Card Rows:** Display concise visual chips: `[REQ-7K29AB]`, `[Vote · 3 Quotes]`, `🏷️ Category`, `💬 Quotes Received / Needed`, `📅 Date`.
- **Intake Step 1 Templates:** 1-tap compact template pills: `⚡ Motor Rewind`, `⚙️ CNC Shafts`, `🧵 Cotton Yarn`, `📹 CCTV System`.
- **Intake Step 4 Weights:** Pre-configure smart defaults (40% Price, 30% Turnaround, 20% Quality, 10% Warranty) displayed as clean badges.
- **Action Button Verbs:** Single scannable verbs: `Create Requirement`, `Compare`, `Vote`, `Award`, `Track Order`.

---

## E. TRANSFORM (Paragraphs $\rightarrow$ Visual UI Components)

- **Quote Specifications $\rightarrow$ Visual Candidate Cards:** Render each sealed quote as a self-contained card with price highlight, rank badge, and TAT pill.
- **Supplier Discovery Networks $\rightarrow$ Interactive Channel Grid:** Replace integration lists with live status cards showing response counters (`💬 2 Quoted` vs `⏳ Awaiting`).
- **Linear Breadcrumb $\rightarrow$ Docked Mini-Dots:** Replace `Step 1/15` with a compact dock featuring 15 interactive color-coded status dots (`DONE` = Emerald, `CURRENT` = Primary, `PENDING` = Neutral).
- **Quorum Tallies $\rightarrow$ Visual Progress Meter:** Show clean circular member vote status instead of raw database tables.
- **Purchase Order Fulfillment $\rightarrow$ Milestone Tracker:** Visual 0% $\rightarrow$ 100% execution bar with 1-click inspection acknowledgment.

---

## F. MOVE TO PROGRESSIVE DISCLOSURE

| Content / Mechanism | Default View | Progressive Disclosure Destination |
| :--- | :--- | :--- |
| **5-Slider Evaluation Weights** | Normalized weight badges | `[ ⚙️ Customize Weights ▼ ]` Expandable Accordion |
| **Cryptographic Salts & Hashes** | `🔒 Protected` Badge | `/faqs` Technical Architecture |
| **ONDC Discovery Protocols** | `🌐 Sourcing Channels` Card | Tooltip / `/faqs` |
| **Full 20-Field Tender Specs** | Title + Budget + Location Chip | `[ ℹ️ Details ]` Slide-Over Drawer |
| **Raw Audit Event Trails** | Human Activity Stream | `[ View Full Audit Log ]` Modal |
| **GST Tax Breakdown Details** | Total Landed Price | Subtext: `Base: ₹8k · GST: +₹800` |
| **Advanced Attachment Leaks Scan** | Clean File Pill | File Inspection Popover |

---

## G. Navigation Changes

1. **Top Navbar (`SiteHeader.tsx`):** Keep max 4 core links (`How it works`, `Pricing`, `FAQs`, `Log In / Dashboard`) + responsive mobile drawer (`< md`).
2. **Dashboard Navigation:** Eliminate navigation jumps; keep the user in the Cockpit with instant filter switching (`Active`, `Action Required`, `Completed`).
3. **Stage Traversal:** Standardize back navigation to always lead to the previous logical decision gate rather than a generic root URL.
4. **Breadcrumb Consolidation:** Replace verbose breadcrumb paths with a single line: `← Pipeline / REQ-7K29AB · Swimming Pool Renovation / Step 6: Compare`.

---

## H. Landing Page Changes

- **Headline:** *"Get competitive quotes without revealing identities."*
- **Supporting Sentence:** *"Tell us what you need. OTP helps you discover suppliers, compare offers and make a decision."*
- **Primary CTA:** Centered natural language prompt input + `[ Start Free → ]` with multilingual regional voice support.
- **Visual Process:** 5 numbered flow cards (01 Tell us, 02 Compete, 03 Compare, 04 Decide, 05 Award).
- **Trust Section:** Side-by-side comparison matrix (Traditional vs. OTP Institutional).
- **Footer / FAQ Link:** Single prompt for technical deep-dives into ONDC, salts, and audit trails.

---

## I. Dashboard Changes

- **The Cockpit Header:** *"What do you need to buy?"* + `[ + Create Requirement ]`.
- **The Glance Bar:** `[ 🟢 N Active ]`, `[ 🟡 N Need your decision ]`, `[ ⚪ N Completed ]`.
- **Job Cards:** Clean card layout showing Title, Category, Quote Count, Status, and 1 primary action button.
- **Side Panel 1:** Pipeline Summary Metrics (Active, Action, In Execution, Completed).
- **Side Panel 2:** Real-Time Live Activity Stream (Recent quotes & milestone events).
- **Side Panel 3:** Workspace Tools (Team Members, Sourcing Reports).

---

## J. Buyer Journey Optimization

```
Step 1: Type / Dictate Requirement on Landing or Dashboard
     ↓
Step 2: Review Pre-Populated Category & City in Intake Wizard (1-Click Template)
     ↓
Step 3: Confirm Smart Default Weights (Price 40%, TAT 30%, Warranty 30%) & Publish
     ↓
Step 4: Tap [ Broadcast to Verified Suppliers ] (WhatsApp & Registry Dispatches)
     ↓
Step 5: Compare Sealed Quotes in 4-Pillar Metric Grid
     ↓
Step 6: Cast Vote (1-Tap Preset Justification Chip) & Reveal Winner
     ↓
Step 7: Issue Official GST Purchase Order & Track Delivery Milestones
```

---

## K. Supplier Journey Optimization

```
Step 1: Receive Instant RFQ Notification (WhatsApp / SMS / Email) with Neutral Specs
     ↓
Step 2: Open One-Click Quotation Form (Zero Login Required for Fast-Track)
     ↓
Step 3: Enter Total Price, Delivery Days, Warranty & GSTIN
     ↓
Step 4: Submit Sealed Quote (Encrypted under protected alias)
     ↓
Step 5: Receive Award Notification & Accept Official Purchase Order
     ↓
Step 6: Update Delivery Milestones (0% → 100%) & Submit Invoice
```

---

## L. Committee & Enterprise Governance Journey

```
Step 1: Committee Members Receive Instant Voting Link
     ↓
Step 2: Inspect Anonymized Sealed Quote Cards (Scores, Turnaround, Pricing)
     ↓
Step 3: Check Conflict of Interest (COI) Declaration Box
     ↓
Step 4: Select Recommended Candidate & Tap 1 Preset Justification Chip
     ↓
Step 5: Live Quorum Meter Reaches 100% → Unlocks Instant Award Gate
```

---

## M. Mobile-Specific Changes (390×844 Ergonomics)

- **Table-to-Card Transformation:** All quote comparison tables automatically render as vertical cards on `< sm` viewports.
- **Touch Target Standard:** All interactive controls maintain $\ge 44 \times 44\text{ px}$ height and thumb spacing.
- **Native Keypad Optimization:** Postal PIN codes and budget inputs use `inputMode="numeric"`.
- **Safe Area Padding:** Fixed bottom stage docks respect iOS Home Indicator safe area spacing (`pb-20 sm:pb-12`).
- **Single-Column Form Stacks:** Multi-column forms fold into clean single-column vertical flows on mobile.

---

## N. Priority Classification (P0 / P1 / P2 / P3)

| ID | Change Item | Area | Priority | Impact |
| :--- | :--- | :--- | :---: | :--- |
| **C-01** | Landing Hero 3-Element Rule & Word Reduction | Landing | **P0** | Eliminates 77% text clutter on entry |
| **C-02** | 5-Step Visual Lifecycle Flow | Landing | **P0** | Solves mental model collision |
| **C-03** | Dashboard Cockpit Hierarchy (`What to buy?` + Glance Bar) | Dashboard | **P0** | Transforms info wall into command center |
| **C-04** | Table-to-Card Responsive Comparison for Mobile | RFQ Matrix | **P0** | Eliminates horizontal scroll on 390px |
| **C-05** | Intake Wizard Smart Default Weights & Slider Accordion | Intake | **P0** | Removes mathematical cognitive overload |
| **C-06** | 1-Tap Preset Decision Justification Chips | Voting | **P1** | Eliminates mobile keyboard typing friction |
| **C-07** | Adaptive Governance UI (Bypass Quorum for Solo Buyers) | Voting | **P1** | Prevents confusion for individual buyers |
| **C-08** | Merge Award Lock & Winner Reveal into 1 Step | Award/Reveal| **P1** | Eliminates double-confirmation drop-off |
| **C-09** | Multi-Channel Supplier Network Live Response Cards | Discovery | **P2** | Replaces static lists with live response counts |
| **C-10** | Docked 15-Dot Progress Tracker & Workflow Map | Navigator | **P2** | Solves 15-step linear breadcrumb fatigue |
| **C-11** | City Dropdown Autocomplete for Indian Tier-1/2 Cities | Intake | **P3** | Enhances drafting speed |
| **C-12** | Mobile Camera Capture for Delivery Inspection | Fulfillment | **P3** | Speeds up sign-off on site |

---

## O. Dependency-Aware Implementation Order

```
PHASE 1: Core Cockpit & Entry Ergonomics (Zero Breaking Changes)
├── Step 1.1: Landing Page 3-Element Hero & 5-Step Flow [Done]
├── Step 1.2: Buyer Dashboard Cockpit Prompt & Glance Bar [Done]
└── Step 1.3: Intake Step 1 Template Chips & Step 4 Slider Accordion [Done]

PHASE 2: Quotation & Evaluation Transformation (Zero Breaking Changes)
├── Step 2.1: Quote Comparison 4-Pillar Mobile Card Grid [Done]
├── Step 2.2: Sourcing Discovery Interactive Channel Grid [Done]
└── Step 2.3: Committee Voting Candidate Cards & Preset Reason Chips [Done]

PHASE 3: Adaptive Governance & Flow Unification (Zero Breaking Changes)
├── Step 3.1: Adaptive UI: 1-Click Approval for Solo Buyers (INDIVIDUAL / MSME)
└── Step 3.2: Unified Award & Reveal Modal (Single-Intent Gate)

PHASE 4: Mobile Ergonomics & Visual Polish (Continuous)
├── Step 4.1: Docked 15-Dot Stage Navigator & Bottom Safe Area Insets [Done]
├── Step 4.2: Numeric Keypads (`inputMode="numeric"`) for PIN & Budget [Done]
└── Step 4.3: 1-Tap PDF Purchase Order Download Shortcut
```

---

## Final Readiness Verification

- **Database Schemas:** Untouched (100% Preserved).
- **RLS & PostgREST Views:** Untouched (100% Preserved).
- **Authentication & Role Resolution:** Untouched (100% Preserved).
- **Business Logic & State Machines:** Untouched (100% Preserved).

---

### **UX IMPLEMENTATION READY = YES ✅**
