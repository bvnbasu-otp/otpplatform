# OTP UX Reconstruction & Canonical Screen Matrix (R2)
**Document Identifier:** `OTP-RECON-R2-UX-RECONSTRUCTION-MATRIX`  
**Version:** 1.0 (Authoritative R2 UX Specification)  
**Status:** SUPREME UX ARCHITECTURE & SCREEN RECONSTRUCTION BLUEPRINT  
**Working Root:** `G:/My Drive/otp`  
**Design System Baseline:** Tailwind CSS 3.4 + React 19 + Lucide Icons + Mobile-First PWA Shell  
**Operating Invariant:** *ONE CAPABILITY $\rightarrow$ ONE CANONICAL ROUTE $\rightarrow$ ONE SCREEN. ZERO ENTERPRISE UI CLUTTER. ZERO BUTTON OBSCURATION.*

---

## 1. Executive Summary & Mobile-First AppShell Standards

The **OTP User Experience** is engineered around the fundamental north star:
> **"OTP does the procurement work. The customer makes the decision."** *(Constitution v1.0, Section 1 & 42)*

The presentation layer eliminates cognitive overhead, complex ERP grids, and bloated status badges, consolidating the customer experience into **18 Canonical Routes** and the **4-Action Golden Customer Journey**:

```text
  [1. TELL]   ──> Speak, type, or snap requirement (<60s Intake)
  [2. REVIEW] ──> Compare sealed, identity-protected quotes across 4 pillars
  [3. DECIDE] ──> 1-Click Approve (Individual/MSME) or Democratic Vote (RWA Quorum >= 2)
  [4. TRACK]  ──> Verify 5-point site delivery & settle milestone invoices
```

### 1.1 AppShell Mobile-First Standards & Viewport Invariants:
1. **Smartphone Containment:** Layout container enforces `max-w-md mx-auto` on viewports $<640\text{px}$ ($360\text{px}-414\text{px}$), expanding gracefully for desktop.
2. **Safe-Area Inset Handling:** Container enforces bottom padding to accommodate floating action footers and mobile browser UI:
   $$\text{padding-bottom} = \text{calc}(6.5\text{rem} + \text{env}(\text{safe-area-inset-bottom}, 0\text{px}))$$
3. **Zero Button Obscuration:** Primary CTA buttons are housed in a sticky, elevated `MobileActionFooter` with backdrop blur, guaranteed $\ge 44\text{px} \times 44\text{px}$ touch targets, and zero overlap with page content.
4. **Zero Horizontal Scroll:** All comparison tables, scorecard dimensions, and forms wrap cleanly without causing horizontal viewport scrolling.

---

## 2. The 18 Canonical Customer Routes Specification Matrix

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        THE 18 CANONICAL CUSTOMER ROUTES MATRIX                         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

| # | Canonical Route Path | Primary Screen Component | Target Personas | Core Purpose & User Action | Primary Floating CTA | Mobile Containment Spec |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `/` | `LandingPage.tsx` | Public Visitors, Buyers | Public homepage communicating value prop; routes authenticated users to `/dashboard`. | "Start Free Procurement" $\rightarrow$ `/intake` | `w-full max-w-5xl mx-auto` (Hero section responsive) |
| **2** | `/pricing` | `PricingPage.tsx` | Public Visitors, Buyers | Pricing transparency: Individual (₹0), RWA (₹499/mo), MSME (₹999/mo). (Enterprise card purged). | "Select Plan" $\rightarrow$ `/signup` | `max-w-md mx-auto` (Cards stacked on mobile) |
| **3** | `/faqs` | `FaqPage.tsx` | Public Visitors | Searchable FAQ repository; 4-pillar evaluation and escrow settlement explanation. | "Ask Support" $\rightarrow$ Help Modal | `max-w-md mx-auto` (Accordion cards) |
| **4** | `/about-us` | `AboutPage.tsx` | Public Visitors | Company mission, institutional governance philosophy, and platform security standards. | "Join Network" $\rightarrow$ `/signup` | `max-w-md mx-auto` |
| **5** | `/login` | `LoginPage.tsx` | All Personas | Single sign-in door (OTP SMS / Email Magic Link / Password); redirects to active context. | "Sign In" | `max-w-sm mx-auto` |
| **6** | `/signup` | `SignupPage.tsx` | Prospective Buyers & Suppliers | Dual-door registration (`?side=buyer` or `?side=supplier`); persona selector (Individual, RWA, MSME). | "Create Account" | `max-w-md mx-auto` |
| **7** | `/q/:token` | `QuickQuotePage.tsx` | Prospective Suppliers | Zero-login magic link quotation submission form with real-time tax breakdown. | "Submit Sealed Quote" | `max-w-md mx-auto pb-32` |
| **8** | `/invite/:token` | `InviteAcceptancePage.tsx` | Invited Committee / Team | Tokenized RWA committee or MSME delegation acceptance screen. | "Accept & Join Organization" | `max-w-sm mx-auto` |
| **9** | `/dashboard` | `HomePage.tsx` | Individual, RWA, MSME, Supplier | Unified role-aware cockpit routing user to next actionable task. | "Tell OTP What You Need" $\rightarrow$ `/intake` | `max-w-md mx-auto pb-24` |
| **10** | `/intake` | `RequirementIntakePage.tsx` | Individual, RWA, MSME | **ACTION 1 (TELL):** Multimodal requirement input (Voice, Text prompt, Photo, Structured form) $<60$s. | "Review & Publish RFQ" | `max-w-md mx-auto pb-32` |
| **11** | `/requirements/:id/discover` | `DiscoverSuppliersPage.tsx` | Individual, RWA, MSME | Sourcing radar matching suppliers across VMI, Direct, ONDC, and BNI pools. | "Invite Matched Suppliers" | `max-w-md mx-auto pb-32` |
| **12** | `/requirements/:id/review-publish` | `RfqReviewPublishPage.tsx` | Individual, RWA, MSME | Commercial parameters, delivery deadline, evaluation weights, and publication lock. | "Publish Sealed RFQ" | `max-w-md mx-auto pb-32` |
| **13** | `/rfq/:id/evaluation` | `EvaluationDecisionCockpitPage.tsx` | Individual, RWA, MSME | **ACTION 2 (REVIEW):** Sealed quote decision room; 4-pillar matrix (Price, Delivery, Quality, SLA). | "Proceed to Decision" | `max-w-md mx-auto pb-32` (Zero horizontal scroll) |
| **14** | `/rfq/:id/committee` | `CommitteeVotePage.tsx` | RWA Committee Members | **ACTION 3 (DECIDE):** RWA democratic voting room; mandatory COI recusal; live quorum tracker ($\ge 2$). | "Cast Committee Vote" | `max-w-md mx-auto pb-32` |
| **15** | `/purchase-orders` | `PurchaseOrdersPage.tsx` | Buyers & Suppliers | Commercial orders ledger; milestone progress indicators and invoice statuses. | "View PO Detail" | `max-w-md mx-auto pb-24` |
| **16** | `/purchase-orders/:id` | `PurchaseOrderDetailPage.tsx` | Buyers & Suppliers | **ACTION 4 (TRACK):** 5-point milestone inspection checklists, progressive invoices, proof uploads. | "Verify & Approve Milestone" | `max-w-md mx-auto pb-32` |
| **17** | `/org/members` | `OrgMembersPage.tsx` | RWA Officers, MSME Primary | Team management; RWA 365-day succession timeline; MSME spend delegation proxies. | "Invite Team Member" | `max-w-md mx-auto pb-24` |
| **18** | `/profile` | `ProfilePage.tsx` | All Authenticated Users | Profile details, persona switcher, address book management (`buyer_addresses`), and GST credentials. | "Save Address" | `max-w-md mx-auto pb-24` |

---

## 3. Breakdown of the 4 Core Customer Actions (TELL $\rightarrow$ REVIEW $\rightarrow$ DECIDE $\rightarrow$ TRACK)

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        THE 4-ACTION CUSTOMER JOURNEY TOPOLOGY                          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Action 1: TELL (Fast-Track Multimodal Requirement Intake)
- **Canonical Route:** `/intake` (`RequirementIntakePage.tsx` & `UnifiedThreeTierIntake.tsx`)
- **Customer Goal:** Tell OTP what needs to be procured in $<60$ seconds with zero procurement training.
- **Multimodal Intake Modes:**
  1. **Voice Dictation:** Tap microphone, speak in Indian English/Hindi/Tamil/Kannada; NLP extractor populates fields.
  2. **Text Prompt:** Natural language sentence (e.g. *"Need 10 HP submersible pump overhaul at Whitefield"*); auto-populates category, quantity, unit, and pincode.
  3. **Photo / PDF Upload:** Upload equipment nameplate or specification drawing; system parses OCR text.
  4. **Structured Form:** 1-screen clean inputs (Category, Title, Quantity, Delivery Pincode, Deadline).
- **Mobile-First UX Controls:**
  - Auto-inherits Primary Delivery Address from `buyer_addresses`.
  - Category selection binds dynamically to database taxonomy API (`use-taxonomy.ts`).
  - Sticky bottom CTA: "Review & Publish RFQ" with instant validation feedback.

---

### Action 2: REVIEW (Identity-Protected Evaluation Cockpit)
- **Canonical Route:** `/rfq/:id/evaluation` (`EvaluationDecisionCockpitPage.tsx` & `EvaluationDecisionCockpit.tsx`)
- **Customer Goal:** Evaluate sealed, competitive quotations with 100% identity protection and zero vendor bias.
- **The 4-Pillar Evaluation Matrix:**
  1. **Commercial Price:** Masked quote price, unit rates, statutory GST breakdown, and payment milestones.
  2. **Delivery Timeline:** Committed completion days and warranty period.
  3. **Quality & Standard:** Compliance with BIS/CPWD standards and materials specification.
  4. **Service SLA:** Vendor VMI performance rating (Platinum/Gold/Silver) and verified capacity.
- **Anti-Leakage & Mobile UX Controls:**
  - Zero supplier legal names, contacts, or GSTINs displayed; cards render pseudonyms (`Supplier #01`).
  - Purged `getPilotByRfqId()` fallback and synthetic test buttons.
  - Sticky bottom CTA: "Proceed to Award / Vote".

---

### Action 3: DECIDE (Quorum Voting & Award Lock)
- **Canonical Route:** `/rfq/:id/committee` (`CommitteeVotePage.tsx`) or 1-Click Award on `/rfq/:id/evaluation`
- **Customer Goal:** Democratic, auditable decision sign-off.
- **Persona-Tailored Decision Modes:**
  1. **Individual Buyer:** 1-click "Accept Winning Quote"; instant award lock.
  2. **MSME Business:** Primary Owner 1-click approval; Delegated Lead approves within configured spend cap ($\le \text{spend\_cap\_amount}$); anti-self-approval enforced.
  3. **RWA Housing Society:** Democratic committee voting room (`CommitteeVotePage.tsx`):
     - Each authorized officer casts 1 vote.
     - Mandatory Conflict of Interest declaration modal.
     - Live Quorum Progress Bar: updates dynamically towards quorum threshold ($\ge 2$).
- **Cryptographic Award Lock:** Invokes `lock_and_reveal_award_atomic()`; generates immutable SHA-256 `DecisionReceipt`.

---

### Action 4: TRACK (Purchase Orders, Milestones & Non-Custodial Settlement)
- **Canonical Route:** `/purchase-orders` & `/purchase-orders/:id` (`PurchaseOrdersPage.tsx` & `PurchaseOrderDetailPage.tsx`)
- **Customer Goal:** Monitor fulfillment, verify physical site deliverables, and authorize milestone releases.
- **Fulfillment & Settlement UX Controls:**
  - **PO Header & Frozen Snapshots:** Displays immutable delivery address and statutory tax breakdown frozen on PO creation.
  - **Milestone Stepper:** Clear visual tracker (e.g. Milestone 1: Mobilization 20% $\rightarrow$ Milestone 2: Delivery 50% $\rightarrow$ Milestone 3: Commissioning 30%).
  - **5-Point Inspection Checklist:** Site manager checks off delivery criteria and uploads inspection photos.
  - **Dispute Initiation:** 1-click "Raise Fulfillment Issue" halts milestone release pending dispute resolution.
  - **Invoice Generation & Settlement:** Generates GST tax invoice and non-custodial payment link.

---

## 4. Header Navigation & Context Switching Framework

### Authoritative Header (`WorkspaceHeaderMenu.tsx`)
```text
┌────────────────────────────────────────────────────────────────────────────┐
│ [OTP Logo]   [Persona Badge: RWA / Greenview]   [Bell (3)]   [Account Menu]│
└────────────────────────────────────────────────────────────────────────────┘
```
1. **Persona Badge:** Displays active context (`INDIVIDUAL`, `RWA: <Society Name>`, `MSME: <Company Name>`, `SUPPLIER: <Trading Name>`).
2. **Dual-Persona Switcher:** 1-click toggle to switch between **Buyer Workspace** and **Supplier Workspace** via `switch_portal_side()`.
3. **Platform Role Isolation:** Server-verified menu links for `/admin` (Superadmin) and `/founder` (Founder) rendered *only* if user's JWT/database record satisfies whitelist.

---

## 5. Mobile Layout Breakpoints & Accessibility Standards

- **Viewport Standards:**
  - Target Small Viewport: $360\text{px} \times 640\text{px}$ (Android standard / Samsung Galaxy).
  - Target Medium Viewport: $375\text{px} \times 667\text{px}$ / $390\text{px} \times 844\text{px}$ (iPhone SE / iPhone 13/14).
  - Target Large Viewport: $414\text{px} \times 896\text{px}$ (iPhone Pro Max).
- **Accessibility & Contrast:**
  - Minimum WCAG 2.1 AA contrast ratio ($4.5:1$ for normal text, $3:1$ for large text/icons).
  - Minimum touch target: $44\text{px} \times 44\text{px}$ for all buttons, inputs, and toggle switches.
  - Focus indicators: High-contrast focus rings for keyboard and screen-reader accessibility.

---
*End of OTP UX Reconstruction & Canonical Screen Matrix (R2)*
