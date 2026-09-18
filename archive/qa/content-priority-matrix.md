# OTP PLATFORM — CONTENT PRIORITY MATRIX & ELEMENT CLASSIFICATION (PASS 1)
**Document:** `/qa/content-priority-matrix.md`  
**Classification Standards:**
- **A = MUST SEE NOW** (Essential for primary action, orientation, or decision)
- **B = USEFUL BUT SECONDARY** (Available in secondary visual tier, scannable table, or tab)
- **C = HELP / INFO / TOOLTIP** (Behind `ℹ️` icon, modal, or progressive disclosure trigger)
- **D = REMOVE** (Redundant, repetitive, developer jargon, or clutter)

---

## 1. COMPREHENSIVE ELEMENT CLASSIFICATION MATRIX

### 1.1 Landing Page (`/`)

| Element / Copy Block | Current Location | Classification (A/B/C/D) | Action & Recommendation |
|---|---|---|---|
| **Product H1:** *"Procure Smarter. Compare Without Bias. Award with Confidence."* | Hero Top | **A** | **KEEP (Streamline):** Simplify to *"Get Best-Price Quotes from Verified Suppliers — Without Bias."* |
| **Eyebrow:** *"OTP — Open Trade & Procurement"* | Hero Eyebrow | **B** | **KEEP:** Small brand context. |
| **Subtitle Tagline:** *"The identity-protected sourcing platform for Indian MSMEs..."* | Hero | **A** | **KEEP (Shorten):** 1 clear supporting sentence. |
| **Hero Body Paragraph:** *"A transparent procurement platform where buyers and suppliers..."* | Hero | **D** | **REMOVE:** Redundant with subtitle. |
| **Interactive Prompt Input:** *"What do you need to procure today?"* | Hero Center | **A** | **KEEP:** Primary entry vector for buyers. |
| **Prompt Example Text:** *"e.g. 10 HP borewell motor winding in Coimbatore within 3 days"* | Hero Input | **B** | **KEEP:** Placeholder in input box. |
| **CTA Link:** *"Start Free"* | Hero Bottom | **A** | **KEEP:** Primary CTA. |
| **CTA Link:** *"Quote as a Supplier"* | Hero Bottom | **B** | **KEEP:** Secondary supplier onboarding CTA. |
| **Links:** *"See How It Works"*, *"Log In"* | Hero Bottom | **B** | **KEEP:** Navigational links. |
| **Value Ribbon:** 5-step process badges | Below Hero | **B** | **KEEP (Compact):** Single-row visual anchor. |
| **Principle Section:** *"Don't choose a supplier. Let competition help you choose."* | Section 2 | **B** | **KEEP:** Good positioning statement. |
| **Principle Caveat:** *"The lowest quote isn't necessarily the best quote..."* | Section 2 | **D** | **REMOVE (Move to FAQ):** Defensive boilerplate. |
| **Audiences Section:** 4 audience cards (Individual, MSME, RWA, Enterprise) | Section 3 | **C** | **COLLAPSE:** Move to a compact 4-tab switcher. |
| **How It Works:** 5 visual step cards | Section 4 | **A** | **KEEP:** Core explanation of product value. |
| **Lifecycle Groups:** 3 cards (Source, Decide, Deliver) with 12 bullet points | Section 4 (Mid) | **D** | **REMOVE:** Repetitive duplicate of the 5 steps above it. |
| **Phase Clocks:** 4 cards (*"Four of Those Stages Run to a Clock"*) | Section 4 (Bot) | **C** | **COLLAPSE:** Move clock explanation to tooltip or FAQ. |
| **Pillars Section:** 4 cards (Identity Protection, Sealed Quotes, Weighted Evaluation, Direct Settlement) | Section 5 | **B** | **KEEP (Compact):** Key trust differentiators. |
| **Supplier Reach Section:** 6 provider cards (Local, Regional, ONDC, GeM, MSME, B2B) | Section 6 | **C** | **COLLAPSE:** Replace with single badge: *"Connected to ONDC & 50,000+ Verified Suppliers"*. |
| **Why OTP / Contrasts:** Traditional vs OTP matrix table | Section 7 | **B** | **KEEP:** High-conversion comparison chart. |
| **Closing CTA Block:** Secondary prompt + buttons | Section 8 | **A** | **KEEP:** Standard bottom conversion funnel. |
| **Footer:** 4-column link matrix | Page Bottom | **B** | **KEEP:** Standard sitemap & legal. |

---

### 1.2 Sign In & Onboarding (`/login` & `/signup`)

| Element / Copy Block | Current Location | Classification (A/B/C/D) | Action & Recommendation |
|---|---|---|---|
| **Page Title:** *"Log In"* | Header | **A** | **KEEP:** Clear orientation. |
| **Subtitle:** *"Buyers and suppliers use the same door. We will take you to the right workspace."* | Subtitle | **B** | **KEEP:** Helpful routing assurance. |
| **Phone / Email OTP vs Password Tabs** | Form Top | **A** | **KEEP:** Essential multi-credential support. |
| **Form Inputs (Email, Phone, Password, OTP)** | Form Body | **A** | **KEEP:** Required credentials. |
| **Sign In Action Button:** *"Sign In →"* | Form Bottom | **A** | **KEEP:** Primary CTA. |
| **Staging/Demo Persona Ribbon:** 25+ demo persona buttons across 6 categories | Below Form | **C** | **COLLAPSE (Behind Toggle/Drawer):** Overwhelms real users in demo mode. |
| **Admin Emergency Maintenance Banner** | Top Banner | **B** | **KEEP:** Only shows during maintenance. |
| **Register Link:** *"Not registered yet? Register as a Buyer / Supplier"* | Footer | **A** | **KEEP:** Secondary onboarding route. |

---

### 1.3 Buyer Dashboard (`/dashboard`)

| Element / Copy Block | Current Location | Classification (A/B/C/D) | Action & Recommendation |
|---|---|---|---|
| **Workspace Header & Org Name** | Header Left | **A** | **KEEP:** Context & orientation. |
| **Org Type Pill Badge** (e.g. `MSME`) | Header Left | **B** | **KEEP:** Small metadata. |
| **Subscription Expiry Pill:** `⚡ 30d left Renew` | Header Left | **B** | **KEEP:** Clickable modal trigger. |
| **Primary Header Button:** `+ New Requirement` | Header Right | **A** | **KEEP:** Primary buyer action. |
| **Hero 1-Box Search:** *"What do you need? Instant plain-English sourcing..."* | Main Top | **B** | **COLLAPSE / CONSOLIDATE:** Merge with `+ New Requirement` to avoid competing CTAs. |
| **FAST-TRACK AI Pill Badge** | Hero Top Right | **B** | **KEEP:** Subdued feature indicator. |
| **Pipeline Filter Tabs:** 8 states (`All`, `⚡ Action`, `Quoting`, `Vote`, `Awarded`, `PO`, `Settled`, `⚠️ Stalled`) | Table Top | **B** | **SIMPLIFY:** Reduce to 3 main tabs (`Action Required`, `Active Orders`, `Completed`). |
| **Order Table Rows:** Ref, Title, Quotes Count, Date, Action Button | Table Body | **A** | **KEEP:** Core transaction ledger. |
| **Row Button:** `ℹ️ Details` | Table Row | **B** | **KEEP:** Opens side drawer. |
| **Row Button:** `Matrix` | Table Row | **B** | **KEEP:** Quick link to comparison. |
| **Row Primary Action Button:** (e.g. `Vote →`, `Issue PO →`) | Table Row Right | **A** | **KEEP:** Distinct primary action. |
| **Right Card 1: Sourcing Health Stats** | Right Column | **B** | **KEEP:** Quick KPI metrics. |
| **Right Card 2: Governance Profile Explanation** | Right Column | **D** | **REMOVE / TOOLTIP:** Static text that repeats every session. |
| **Right Card 3: Zero-Fee Direct Settlement Explanation** | Right Column | **D** | **REMOVE:** Marketing copy that does not belong in active dashboard. |
| **Slide-Over Drawer:** Full 20-field specification | On Click `ℹ️` | **B** | **KEEP:** Clean progressive disclosure. |

---

### 1.4 Supplier Dashboard (`/dashboard`)

| Element / Copy Block | Current Location | Classification (A/B/C/D) | Action & Recommendation |
|---|---|---|---|
| **Workspace Title:** *"Supplier Workspace"* | Header | **A** | **KEEP:** Orientation. |
| **Rating Badge:** `⭐ 5.0 / 5.0 Rating` | Header | **B** | **KEEP:** Trust metric. |
| **Badge:** `Neutral Anonymity Active` | Header | **B** | **KEEP:** Reassures supplier of fair evaluation. |
| **Alert Banner:** *"Action Required: N Purchase Orders Awaiting Acceptance"* | Top Alert | **A** | **KEEP:** Critical high-priority action for supplier. |
| **Quick Action Button:** `⚡ Accept PO →` | Alert Row | **A** | **KEEP:** Direct payoff action. |
| **Stat Ribbon:** 4 metric cards (Invites, Quotes, Execution, Completed) | Mid Ribbon | **B** | **KEEP:** Scannable operational overview. |
| **Invitation Cards / Table:** Title, Deadline, Category, Quote Button | Main Area | **A** | **KEEP:** Primary supplier workflow. |
| **Quote CTA Button:** `Submit Quote →` | Card Right | **A** | **KEEP:** Primary CTA. |

---

### 1.5 Requirement Intake Wizard (`/requirements/new`)

| Element / Copy Block | Current Location | Classification (A/B/C/D) | Action & Recommendation |
|---|---|---|---|
| **Wizard Stepper:** 4 steps (`Scope`, `Specifications`, `Terms`, `Review`) | Top Bar | **A** | **KEEP:** Progress indicator. |
| **Voice Dictation Button** | Step 1 Top | **B** | **KEEP:** Helpful accessibility feature. |
| **Natural Language Requirement Textarea** | Step 1 | **A** | **KEEP:** Primary user input. |
| **4 Large Example Prompt Boxes** | Step 1 | **D** | **REMOVE:** Replace with rotating placeholder in textarea. |
| **AI Parsing Status Banner & Output** | Step 1 | **B** | **KEEP:** Visual feedback. |
| **Title, Category, Subcategory Selectors** | Step 1 | **A** | **KEEP:** Core taxonomy classification. |
| **Quantity & Unit Fields** | Step 1 | **A** | **KEEP:** Essential spec. |
| **Category Attributes Form** (Step 2) | Step 2 | **A** | **KEEP:** Technical parameters. |
| **Delivery Date, Pincode, City, Address** (Step 3) | Step 3 | **A** | **KEEP:** Logistics terms. |
| **Payment Terms & Warranty Selectors** (Step 3) | Step 3 | **B** | **KEEP:** Commercial terms. |
| **Sourcing Mode Selection Cards** (Step 4: 4 verbose cards) | Step 4 | **B** | **COLLAPSE:** Pre-select *Identity-Protected* with a 1-line explainer. |
| **Evaluation Criteria 5-Slider Weight Matrix** | Step 4 | **C** | **COLLAPSE (Progressive Disclosure):** Use smart default weights (40/30/20/10) with an optional `"Customize"` button. |
| **Full Specification Summary Card** | Step 4 | **B** | **KEEP:** Final review check. |
| **Primary Action Button:** *"Publish Requirement & Discover Suppliers →"* | Step 4 Bottom | **A** | **KEEP:** Primary submission CTA. |

---

### 1.6 Supplier Discovery & Broadcast (`/requirements/:id/discover`)

| Element / Copy Block | Current Location | Classification (A/B/C/D) | Action & Recommendation |
|---|---|---|---|
| **Stage Navigator:** `Step 2 / 15: Send Enquiry` | Top Bar | **B** | **SIMPLIFY:** Change to `Stage 2 of 4: Supplier Discovery`. |
| **Main Header Banner:** Title & Subtitle | Header | **A** | **KEEP (Shorten):** *"Broadcast Requirement to Verified Suppliers"*. |
| **6 Network Provider Cards** (Local, ONDC, GeM, MSME, IndiaMART) | Body Grid | **C** | **COLLAPSE:** Replace with single status summary: *"Found 18 matching verified suppliers across your region"*. |
| **Primary CTA Button:** `⚡ Send Enquiry to 18 Suppliers →` | Main Card | **A** | **KEEP:** Primary action. |
| **Technical Integration Logs** | Bottom Card | **D** | **REMOVE / ADVANCED:** Hide technical network queue logs. |

---

### 1.7 RFQ Quote Comparison Matrix (`/rfq/:id/quotes`)

| Element / Copy Block | Current Location | Classification (A/B/C/D) | Action & Recommendation |
|---|---|---|---|
| **Top Navigator:** `Step 6 / 15` | Top Bar | **B** | **SIMPLIFY:** `Stage 3 of 4: Compare Quotes`. |
| **Highlight Chips:** Lowest Price, Fastest TAT, Top Rated | Top Ribbon | **D** | **REMOVE:** Redundant with table row rankings. |
| **Top-Ranked Quote Badge:** `Recommended Winner (Highest Score)` | Matrix Header | **A** | **KEEP / PROMOTE:** Clear visual winner signal. |
| **Anonymous Quote Columns** (`Supplier Alpha`, `Beta`, `Gamma`) | Matrix Table | **A** | **KEEP:** Core comparison UI. |
| **Data Rows:** Price, GST, Landed Cost, Delivery, Warranty, Score | Matrix Table | **A** | **KEEP:** Decisional parameters. |
| **Score Breakdown Accordion** | Table Bottom | **C** | **KEEP:** Progressive disclosure on click. |
| **Primary Action Button:** `Proceed to Committee Vote →` or `Award Winner →` | Bottom Bar | **A** | **KEEP:** Single unambiguous primary CTA. |
| **Secondary Action Buttons:** `Close Quoting Early`, `Waive Min Quotes` | Bottom Bar | **B** | **KEEP (Subdued):** Secondary utility controls. |

---

### 1.8 Committee Governance & Quorum Voting (`/rfq/:id/vote`)

| Element / Copy Block | Current Location | Classification (A/B/C/D) | Action & Recommendation |
|---|---|---|---|
| **Governance Profile Notice Box** | Top Notice | **C** | **COLLAPSE (Hide for Solo Buyers):** Auto-bypass for 1-person MSMEs. |
| **Conflict of Interest (COI) Checkbox & Legal Text** | Form Top | **B** | **SIMPLIFY:** 1-line checkbox: *"✓ I confirm no conflict of interest with quoting vendors"*. |
| **Candidate Radio List:** Anonymous suppliers with score & price | Form Center | **A** | **KEEP:** Primary selection mechanism. |
| **5 Justification Preset Checklist Pills** | Form Center | **B** | **SIMPLIFY:** 3 compact chips (`Best Price/Quality`, `Fastest Delivery`, `Top Warranty`). |
| **Custom Justification Comment Textarea** | Form Center | **B** | **KEEP:** Optional notes. |
| **Live Quorum Progress Meter & Tally Table** | Right Column | **B** | **KEEP (Multi-Member Only):** Shows vote count & quorum. |
| **Primary Action Button:** `Cast Committee Vote` | Form Bottom | **A** | **KEEP:** Primary submission CTA. |

---

### 1.9 Award Lock & Winner Reveal Gate (`/rfq/:id/award` & `/reveal`)

| Element / Copy Block | Current Location | Classification (A/B/C/D) | Action & Recommendation |
|---|---|---|---|
| **Award Route (`/award`) vs Reveal Route (`/reveal`)** | Route Structure | **D** | **MERGE:** Combine into 1 unified screen: `/rfq/:id/award`. |
| **Winning Quote Summary Card** | Page Top | **A** | **KEEP:** Final confirmation context. |
| **Consensus Rationale Text** | Card Body | **B** | **KEEP:** Summarizes evaluation rationale. |
| **Commitment Agreement Notice** | Checkbox Box | **B** | **SIMPLIFY:** 1 clean checkbox: *"✓ Confirm on-platform PO issuance on reveal"*. |
| **Primary Action Button:** `⚡ Unmask Winner & Generate PO →` | Center Bottom | **A** | **KEEP:** Single payoff CTA. |
| **Unmasked Winner Profile Card:** Legal Name, GSTIN, Address, Phone | Post-Reveal | **A** | **KEEP:** Core unmasked data. |
| **Decision Receipt PDF Download Button** | Post-Reveal | **B** | **KEEP:** Exportable compliance artifact. |
| **Generate PO Action Button** | Post-Reveal | **A** | **KEEP:** Direct continuation into fulfillment. |
| **Transfer to Runner-Up Button** | Post-Reveal | **C** | **KEEP (Subdued):** Fallback exception tool. |

---

### 1.10 Purchase Order & Execution (`/purchase-orders/:id`)

| Element / Copy Block | Current Location | Classification (A/B/C/D) | Action & Recommendation |
|---|---|---|---|
| **PO Header:** PO Number, Status Pill, Buyer & Supplier Names | Header | **A** | **KEEP:** Contract header. |
| **Amount Card:** Total Value, GST Breakdown, Currency | Top Metric | **A** | **KEEP:** Financial summary. |
| **Active Milestone Action Button** (e.g. `Accept PO`, `Mark Delivered`) | Top Right | **A** | **KEEP:** Primary state transition. |
| **Delivery Inspection Panel** (Milestones, Proof Upload, Acceptance) | Mid Section | **A** | **KEEP:** Active during execution. |
| **GST Tax Invoicing & Direct Payment Panel** | Mid Section | **A** | **KEEP:** Active during billing stage. |
| **Static Escrow Policy Disclaimer:** *"OTP does not touch trade funds..."* | Invoicing | **C** | **TOOLTIP:** Move behind `ℹ️ Direct Settlement Policy` tooltip. |
| **Completed Lifecycle Panels** | Body | **B** | **COLLAPSE (Accordion):** Auto-collapse finished milestones. |
| **Full Audit Trail Timeline** | Bottom | **B** | **KEEP (Collapsed by Default):** Expandable on click. |

---

## 2. BEFORE → AFTER CONTENT HIERARCHY COMPARISON

### 2.1 Landing Page Hero

```
BEFORE:
├── Eyebrow: "OTP — Open Trade & Procurement"
├── H1: "Procure Smarter. Compare Without Bias. Award with Confidence."
├── Subtitle: "The identity-protected sourcing platform for Indian MSMEs, Communities & Enterprises."
├── Body: "A transparent procurement platform where buyers and suppliers can compete fairly while identities remain protected until award."
├── Textarea: "What do you need to procure today? e.g. 10 HP borewell motor winding in Coimbatore within 3 days"
├── Links: "Start Free" · "See How It Works" · "Quote as a Supplier" · "Log In"
└── Full 15-cell comparison table preview widget

AFTER:
├── H1: "Get Best-Price Quotes from Verified Suppliers — Without Bias."
├── Subtitle: "Anonymous competitive bidding on price, turnaround, and warranty. Unmask the winner and issue direct POs."
├── Fast-Track Input: [ What do you need? e.g., 200 ergonomic chairs in Pune... ] [ Get Free Quotes → ]
└── Secondary Link: Are you a vendor? [ Quote as a Supplier → ]
```

---

### 2.2 Buyer Dashboard

```
BEFORE:
├── Header: Org Name + Org Type Badge + Subscription Expiry Pill + [+ New Requirement]
├── Hero Section: "What do you need?" 1-box search with "FAST-TRACK AI" badge & search input
├── Pipeline Bar: 8 state filter buttons (All, Action, Quoting, Vote, Awarded, PO, Settled, Stalled)
├── Table: 10 columns with Reference, Tag, Title, Type, Quote Counts, Date, [Details], [Matrix], [Action]
└── Right Sidebar: 3 static cards (Sourcing Health, Governance Rules description, Zero-Fee Escrow marketing)

AFTER:
├── Attention Banner (Conditional): "⚡ 2 Requirements ready for your vote | ⚠️ 1 Stalled Order"
├── Quick Action Bar: [ + New Requirement ]    Search input...
├── Pipeline Tabs: [ Active (4) ]   [ Completed (12) ]   [ All (16) ]
├── Table: Clean scannable rows with 1 primary action per row
└── Right Sidebar: Live Activity Feed (Incoming quotes, PO acceptances) instead of static marketing copy
```

---

### 2.3 Requirement Intake Step 4 (Sourcing & Evaluation)

```
BEFORE:
├── 4 Verbose Radio Cards for Sourcing Mode (Identity-Protected, Open Tender, Curated, Existing)
├── Minimum Quotes input
├── Quoting Deadline Days input
├── 5 Mathematical Slider Controls (Price, Quality, Turnaround, Warranty, Track Record)
├── Warning box if weights do not sum to 100%
└── Full 15-field review summary card

AFTER:
├── Sourcing Mode: Pre-selected as "Identity-Protected Sourcing (Anonymous Bidding)"
├── Default Balanced Weights: 40% Price · 30% Turnaround · 20% Quality · 10% Warranty
│   └── [ Customize Weights ⚙️ ] (Expands 5 sliders only if buyer clicks)
├── Timeline & Quotes: "Require at least [ 3 ] quotes within [ 7 ] days"
└── [ Publish & Discover Suppliers → ] (Primary CTA)
```

---

## 3. TERMINOLOGY CLASSIFICATION MATRIX

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  LEVEL 1: VISIBLE (Everyday Buyer & Supplier Language)                       │
│  • Blind Sourcing / Anonymous Quoting                                        │
│  • Verified Suppliers                                                        │
│  • Quote Comparison Matrix                                                   │
│  • Winner Unmasking & Purchase Order                                         │
│  • GST Tax Invoice & Direct Settlement                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│  LEVEL 2: SECONDARY (Contextual Controls / Feature Tabs)                     │
│  • Standardized Technical Scoring                                            │
│  • Quorum Committee Voting (RWA / Enterprise only)                           │
│  • Turnaround Time (TAT) & Warranty SLAs                                     │
│  • Runner-Up Award Transfer                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│  LEVEL 3: ADVANCED / TOOLTIP ONLY (Behind ℹ️ Icons & FAQ)                    │
│  • ONDC BAP Protocol Adapter                                                 │
│  • Append-Only Cryptographic Audit Hashes                                    │
│  • Multi-Criteria Linear Weight Vectors                                      │
│  • Statutory Conflict of Interest Legal Declarations                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. ACTIONABLE REMOVE / COLLAPSE / KEEP SUMMARY

### Elements to REMOVE (D):
1. **Landing Page:** Remove the duplicate 12-stage bullet list and the 4 timed phase clock cards from `/` (move strictly to `/faqs`).
2. **Landing Page:** Remove the defensive caveat paragraph (*"OTP does not promise the cheapest price..."*).
3. **Buyer Dashboard:** Remove static marketing cards (*"Zero-Fee Direct Settlement"* and *"Governance Rules"*) from the right sidebar.
4. **Intake Wizard:** Remove the 4 full-sentence example prompt boxes on Step 1.
5. **Quote Matrix:** Remove the redundant top highlight pills (Lowest Cost, Fastest Delivery, Top Rated) that duplicate table rows.
6. **Discovery Page:** Remove raw technical network logs from the user view.

### Elements to COLLAPSE / PROGRESSIVELY DISCLOSE (C):
1. **Intake Wizard Step 4:** Collapse the 5-slider evaluation weight matrix behind smart defaults (40/30/20/10) with an optional `"Customize Weights"` toggle.
2. **Login Page:** Collapse the 25+ demo persona buttons into a slide-over drawer or modal.
3. **Committee Vote:** Automatically hide committee voting and quorum rules for single-owner organizations (`INDIVIDUAL`, `MSME`).
4. **PO Execution:** Accordion-fold completed fulfillment stages; expand only the current active milestone.
5. **COI Declaration:** Collapse the full Conflict of Interest legal paragraph into a clean 1-line confirmation checkbox.

### Elements to KEEP & ENHANCE (A & B):
1. **Interactive Prompt:** Keep the 1-box natural language intake prompt as the primary hero CTA.
2. **Comparison Matrix Table:** Keep the side-by-side anonymous comparison table as the centerpiece of the evaluation phase.
3. **Recommended Winner Badge:** Promote the top-ranked merit quote with a prominent badge in the comparison matrix header.
4. **Unified Award & Reveal Screen:** Consolidate award locking, identity unmasking, and PO generation into a single streamlined screen.
5. **Command Center Pipeline:** Keep the dashboard focused on: *What needs attention?*, *What is active?*, *What happened recently?*, and *What to do next?*.

---

*This document serves as the structural reference for the Pass 2 UX and Information Architecture Refinement.*
